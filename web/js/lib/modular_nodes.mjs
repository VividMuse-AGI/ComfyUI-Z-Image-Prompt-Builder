import { app } from "../../../scripts/app.js";
import { PROMPT_SCHEMA } from "./prompt_schema_catalog.mjs";
import {
  widgetByName,
  addHelperWidget,
  installCompactWidgetSerialization,
  setWidgetVisibilityReason,
  refreshNode2Widgets,
  moveWidgetBefore,
  resizeNode,
} from "./widget_utils.mjs";

const FOLLOW_PRESET = "跟随预设";
const RANDOM_CHOICE = "随机抽取";
const EMPTY_CHOICE = "不使用";
const {
  LEGACY_AGE_STAGES,
  MODULE_NODE_FIELDS,
  MAKEUP_CUSTOM_FIELDS,
  HAIR_ADVANCED_FIELDS,
  CLOTHING_MODE_FIELDS,
} = PROMPT_SCHEMA;
const CLOTHING_BRANCH_FIELDS = [...new Set(
  Object.values(CLOTHING_MODE_FIELDS).flat(),
)];

function className(node) {
  return node.comfyClass || node.constructor?.type || "";
}

function moduleFields(node) {
  return MODULE_NODE_FIELDS[className(node)] || null;
}

function markDirty(node) {
  globalThis.__vividMusePromptDiagnostics?.install(node);
  globalThis.__vividMuseResolution?.refresh(node);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function resizeModuleNode(node) {
  globalThis.__vividMuseResolution?.refresh(node, false);
  resizeNode(node, 300);
  markDirty(node);
}

function setWidgetVisible(widget, visible) {
  return setWidgetVisibilityReason(widget, "dependency", visible);
}

function promptData() {
  return globalThis.__vividMuseZImagePromptData || {};
}

function effectiveFieldValue(node, fieldName) {
  const value = widgetByName(node, fieldName)?.value;
  if (value !== FOLLOW_PRESET) return value;
  const preset = widgetByName(node, "预设")?.value;
  return promptData().PRESETS?.[preset]?.[fieldName] ?? value;
}

function syncFilteredOptions(
  node,
  parentField,
  childField,
  mappingName,
  chooseFirst = false,
  resize = true,
) {
  const mapping = promptData()[mappingName];
  const childWidget = widgetByName(node, childField);
  if (!mapping || !childWidget) return;
  const allowed = mapping[effectiveFieldValue(node, parentField)];
  const allValues = [...new Set(Object.values(mapping).flat())];
  const values = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, ...(allowed || allValues)];
  if (childField === "场景地点" && !chooseFirst
      && (promptData().SCENE_LOCATION_VALUES || []).includes(childWidget.value)
      && !values.includes(childWidget.value)) {
    values.push(childWidget.value);
  }
  childWidget.options ??= {};
  childWidget.options.values = values;
  if (chooseFirst && allowed?.length) {
    childWidget.value = allowed[0];
  } else if (!values.includes(childWidget.value)) {
    childWidget.value = FOLLOW_PRESET;
  }
  refreshNode2Widgets(node);
  if (resize) resizeModuleNode(node);
}

function syncThemeOptions(node, chooseFirst = false, resize = true) {
  syncFilteredOptions(
    node, "写真大类", "写真主题", "THEME_OPTIONS_BY_CATEGORY", chooseFirst, resize,
  );
}

function syncEthnicityOptions(node, chooseFirst = false, resize = true) {
  syncFilteredOptions(
    node, "族裔大类", "地域族裔分支",
    "ETHNICITY_BRANCHES_BY_CATEGORY", chooseFirst, resize,
  );
}

function syncSceneOptions(node, chooseFirst = false, resize = true) {
  syncFilteredOptions(
    node, "场景大类", "场景地点",
    "SCENE_LOCATIONS_BY_CATEGORY", chooseFirst, resize,
  );
}

function syncHairVisibility(node, resize = true) {
  const mode = effectiveFieldValue(node, "发色模式");
  const visible = !["基础发色", EMPTY_CHOICE].includes(mode);
  for (const fieldName of HAIR_ADVANCED_FIELDS) {
    setWidgetVisible(widgetByName(node, fieldName), visible);
  }
  if (resize) resizeModuleNode(node);
}

function syncMakeupVisibility(node, resize = true) {
  const mode = effectiveFieldValue(node, "妆容模式");
  const special = [FOLLOW_PRESET, RANDOM_CHOICE].includes(mode);
  setWidgetVisible(
    widgetByName(node, "整体妆容预设"),
    mode === "整体预设" || special,
  );
  for (const fieldName of MAKEUP_CUSTOM_FIELDS) {
    setWidgetVisible(
      widgetByName(node, fieldName),
      mode === "分项自定义" || special,
    );
  }
  if (resize) resizeModuleNode(node);
}

function syncClothingVisibility(node, resize = true) {
  const mode = effectiveFieldValue(node, "穿搭结构");
  const visibleFields = new Set(CLOTHING_MODE_FIELDS[mode] || []);
  const showAll = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE].includes(mode);
  for (const fieldName of CLOTHING_BRANCH_FIELDS) {
    setWidgetVisible(
      widgetByName(node, fieldName),
      showAll || visibleFields.has(fieldName),
    );
  }
  if (resize) resizeModuleNode(node);
}

function syncDependencies(node, resize = true) {
  syncHairVisibility(node, false);
  syncMakeupVisibility(node, false);
  syncClothingVisibility(node, false);
  syncThemeOptions(node, false, false);
  syncEthnicityOptions(node, false, false);
  syncSceneOptions(node, false, false);
  if (resize) resizeModuleNode(node);
}

function wrapDependencyCallback(node, fieldName, sync) {
  const widget = widgetByName(node, fieldName);
  if (!widget || widget.__vividMuseModularDependency) return;
  const originalCallback = widget.callback;
  widget.callback = function () {
    const result = originalCallback?.apply(this, arguments);
    sync(node);
    return result;
  };
  widget.__vividMuseModularDependency = true;
}

function setAllModuleFields(node, value) {
  const locks = new Set(value === RANDOM_CHOICE ? node.properties?.vividMuseRandomLocks || [] : []);
  const preserved = (node.widgets || []).filter(w => locks.has(w.name)).map(w => [w, w.value]);
  for (const fieldName of moduleFields(node) || []) {
    if (locks.has(fieldName)) continue;
    const widget = widgetByName(node, fieldName);
    if (!widget) continue;
    const allowed = widget.options?.values;
    if (Array.isArray(allowed) && !allowed.includes(value)) continue;
    widget.value = value;
    widget.callback?.(value);
  }
  syncDependencies(node);
  for (const [widget, original] of preserved) widget.value = original;
}

function prepareModuleRandomCombination(node) {
  setAllModuleFields(node, RANDOM_CHOICE);
  const seedWidget = widgetByName(node, "随机种子");
  if (seedWidget) {
    let nextSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    if (nextSeed === Number(seedWidget.value)) {
      nextSeed = (nextSeed + 1) % Number.MAX_SAFE_INTEGER;
    }
    seedWidget.value = nextSeed;
    seedWidget.callback?.(seedWidget.value);
  }
  markDirty(node);
}

function installPresetCallback(node) {
  const presetWidget = widgetByName(node, "预设");
  if (!presetWidget || presetWidget.__vividMuseModularPreset) return;
  const originalCallback = presetWidget.callback;
  presetWidget.callback = function () {
    const result = originalCallback?.apply(this, arguments);
    setAllModuleFields(node, FOLLOW_PRESET);
    return result;
  };
  presetWidget.__vividMuseModularPreset = true;
}

function installConfigure(node) {
  if (node.__vividMuseModularConfigure) return;
  const originalOnConfigure = node.onConfigure;
  node.onConfigure = function () {
    const result = originalOnConfigure?.apply(this, arguments);
    const ageWidget = widgetByName(node, "年龄阶段");
    const migratedAge = LEGACY_AGE_STAGES[ageWidget?.value];
    if (migratedAge) ageWidget.value = migratedAge;
    syncDependencies(node, false);
    globalThis.setTimeout?.(() => resizeModuleNode(node), 0);
    return result;
  };
  node.__vividMuseModularConfigure = true;
}

function installModuleNode(node) {
  const fields = moduleFields(node);
  if (!fields || node.__vividMuseModularInstalled) return;

  installCompactWidgetSerialization(node);
  installConfigure(node);
  node.__vividMuseRefreshCardScope = moduleName => {
    if (moduleName === "人物") {
      syncEthnicityOptions(node);
      syncMakeupVisibility(node);
    } else if (moduleName === "服装") syncClothingVisibility(node);
    else if (moduleName === "场景") syncSceneOptions(node, false, false);
  };
  installPresetCallback(node);
  wrapDependencyCallback(node, "发色模式", syncHairVisibility);
  wrapDependencyCallback(node, "妆容模式", syncMakeupVisibility);
  wrapDependencyCallback(node, "穿搭结构", syncClothingVisibility);
  wrapDependencyCallback(
    node, "写真大类", (target) => syncThemeOptions(target, true),
  );
  wrapDependencyCallback(
    node, "族裔大类", (target) => syncEthnicityOptions(target, true),
  );
  wrapDependencyCallback(
    node, "场景大类", (target) => syncSceneOptions(target, true),
  );

  const firstField = widgetByName(node, fields[0]);
  const randomButton = addHelperWidget(
    node,
    "button",
    "🎲 生成本模块随机组合",
    null,
    () => prepareModuleRandomCombination(node),
  );
  const presetButton = addHelperWidget(
    node,
    "button",
    "全部跟随模块预设",
    null,
    () => setAllModuleFields(node, FOLLOW_PRESET),
  );
  randomButton.label = randomButton.__vividMuseDisplayText = "🎲 设置本模块随机";
  randomButton.tooltip = "准备本模块的随机字段；运行节点后查看结果。仅改变种子不会把固定内容变为随机。";
  const clearButton = addHelperWidget(
    node,
    "button",
    "清空本模块",
    null,
    () => setAllModuleFields(node, EMPTY_CHOICE),
  );
  for (const button of [randomButton, presetButton, clearButton]) {
    moveWidgetBefore(node, button, firstField);
  }

  node.__vividMuseModularRandomButton = randomButton;
  node.__vividMuseModularPresetButton = presetButton;
  node.__vividMuseModularClearButton = clearButton;
  node.__vividMuseModularInstalled = true;
  syncDependencies(node, false);
  globalThis.setTimeout?.(() => resizeModuleNode(node), 0);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.ModularNodes",
  nodeCreated(node) {
    if (!moduleFields(node)) return;
    installModuleNode(node);
  },
  loadedGraphNode(node) {
    if (!moduleFields(node)) return;
    syncDependencies(node);
  },
});
