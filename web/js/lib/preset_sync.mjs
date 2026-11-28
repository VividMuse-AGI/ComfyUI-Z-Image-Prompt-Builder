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

const NODE_CLASS = "VividMuse_ZImageChinesePromptBuilder";
const FOLLOW_PRESET = "跟随预设";
const RANDOM_CHOICE = "随机抽取";
const EMPTY_CHOICE = "不使用";
const LOCAL_SCOPE = "局部微调（动作、表情、色彩、质感）";
const THEME_SCOPE = "同主题重拍（保留主题和人物）";
const MIX_SCOPE = "跨风格混搭（全部字段）";

const {
  FIELD_NAMES,
  MODULE_FIELD_GROUPS,
  CLOTHING_MODE_FIELDS,
  MAKEUP_CUSTOM_FIELDS,
  HAIR_ADVANCED_FIELDS,
  LEGACY_PRESET_NAMES,
  LEGACY_AGE_STAGES,
  THEME_OPTIONS_BY_CATEGORY,
  ETHNICITY_BRANCHES_BY_CATEGORY,
  SCENE_LOCATIONS_BY_CATEGORY,
  SCENE_LOCATION_VALUES,
  PRESETS,
} = PROMPT_SCHEMA;

const CLOTHING_BRANCH_FIELDS = [...new Set(Object.values(CLOTHING_MODE_FIELDS).flat())];
const LIGHT_RANDOM_FIELDS = [
  "画面瞬间", "基础姿态", "身体方向", "身体重心", "肩颈状态",
  "手部动作", "腿部动作", "头部方向", "视线", "表情",
  "光线质地", "阴影表现", "主配色", "色温倾向", "画面对比", "细节质地", "高光处理", "颗粒质感",
];
const THEME_RANDOM_EXCLUDED_FIELDS = new Set([
  "画面比例", "写真大类", "写真主题", ...MODULE_FIELD_GROUPS["人物"],
]);
const STANDARD_RANDOM_FIELDS = FIELD_NAMES.filter((name) => !THEME_RANDOM_EXCLUDED_FIELDS.has(name));

globalThis.__vividMuseZImagePromptData = {
  MODULE_FIELD_GROUPS,
  PRESETS,
  THEME_OPTIONS_BY_CATEGORY,
  ETHNICITY_BRANCHES_BY_CATEGORY,
  SCENE_LOCATIONS_BY_CATEGORY,
  SCENE_LOCATION_VALUES,
};

function setWidgetValue(node, name, value) {
  const widget = widgetByName(node, name);
  if (!widget) return;
  const allowedValues = widget.options?.values;
  if (Array.isArray(allowedValues) && !allowedValues.includes(value)) return;
  widget.value = value;
}

function installCompactWidgetConfigure(node) {
  if (node.__vividMuseCompactConfigure) return;
  const originalOnConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    node.__vividMuseClearDialog?.close();
    const result = originalOnConfigure?.apply(this, arguments);
    const layoutWidget = widgetByName(node, "输出排版");
    const serializedWidgets = (node.widgets || []).filter(widget =>
      widget.serialize !== false && widget.options?.serialize !== false);
    const layoutIndex = serializedWidgets.indexOf(layoutWidget);
    if (layoutWidget && Array.isArray(info?.widgets_values)
        && layoutIndex >= info.widgets_values.length) {
      layoutWidget.value = "连续拼接";
    }
    const presetWidget = widgetByName(node, "预设");
    const migratedPreset = LEGACY_PRESET_NAMES[presetWidget?.value];
    if (migratedPreset) presetWidget.value = migratedPreset;
    const ageWidget = widgetByName(node, "年龄阶段");
    const migratedAge = LEGACY_AGE_STAGES[ageWidget?.value];
    if (migratedAge) ageWidget.value = migratedAge;
    ensureConfiguredNode(node);
    return result;
  };
  node.__vividMuseCompactConfigure = true;
}

function markDirty(node) {
  globalThis.__vividMusePromptDiagnostics?.install(node);
  globalThis.__vividMuseResolution?.refresh(node);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function resizeBuilderNode(node) {
  globalThis.__vividMuseResolution?.refresh(node, false);
  resizeNode(node, 360);
}

const DEFAULT_ACTIVE_MODULE = "画面基础";
const ACTIVE_MODULE_PROPERTY = "vividMuseActiveModule";
const ONLY_ENABLED_MODULE_PROPERTY = "vividMuseOnlyEnabledModule";

function normalizeModuleName(moduleName) {
  return Object.hasOwn(MODULE_FIELD_GROUPS, moduleName)
    ? moduleName
    : DEFAULT_ACTIVE_MODULE;
}

function syncModuleVisibility(node, moduleName, resize = true) {
  const normalized = normalizeModuleName(moduleName);
  const visibleFields = new Set(MODULE_FIELD_GROUPS[normalized]);
  for (const fieldName of FIELD_NAMES) {
    setWidgetVisibilityReason(
      widgetByName(node, fieldName),
      "module",
      visibleFields.has(fieldName),
    );
  }
  if (resize) resizeBuilderNode(node);
  return normalized;
}

function setActiveModule(node, moduleName) {
  const normalized = normalizeModuleName(moduleName);
  node.properties ??= {};
  node.properties[ACTIVE_MODULE_PROPERTY] = normalized;
  if (node.__vividMuseModuleWidget) node.__vividMuseModuleWidget.value = normalized;
  syncModuleVisibility(node, normalized, false);
  syncMakeupVisibility(node, false, false);
  syncHairAdvancedVisibility(node, false, false);
  syncClothingVisibility(node, false, false);
  resizeBuilderNode(node);
  markDirty(node);
  return normalized;
}

function syncConfiguredNode(node) {
  syncThemeOptions(node, false);
  syncEthnicityBranchOptions(node, false);
  syncSceneLocationOptions(node, false);
  const normalized = setActiveModule(node, node.properties?.[ACTIVE_MODULE_PROPERTY]);
  node.__vividMuseConfiguredState = configuredNodeState(node);
  return normalized;
}

function configuredNodeState(node) {
  return JSON.stringify([
    node.properties?.[ACTIVE_MODULE_PROPERTY],
    widgetByName(node, "预设")?.value,
    widgetByName(node, "写真大类")?.value,
    widgetByName(node, "族裔大类")?.value,
    widgetByName(node, "场景大类")?.value,
    widgetByName(node, "妆容模式")?.value,
    widgetByName(node, "发色模式")?.value,
    widgetByName(node, "穿搭结构")?.value,
  ]);
}

function ensureConfiguredNode(node) {
  const computed = node.computeSize?.();
  const expectedSize = computed && [Math.max(computed[0], 360), computed[1]];
  const sizeIsCurrent = !expectedSize || (
    node.size?.[0] === expectedSize[0] && node.size?.[1] === expectedSize[1]
  );
  if (node.__vividMuseConfiguredState === configuredNodeState(node) && sizeIsCurrent) {
    return normalizeModuleName(node.properties?.[ACTIVE_MODULE_PROPERTY]);
  }
  return syncConfiguredNode(node);
}

function syncHairAdvancedVisibility(node, clearWhenBasic = false, resize = true) {
  const modeWidget = widgetByName(node, "发色模式");
  const advancedWidgets = HAIR_ADVANCED_FIELDS.map(name => widgetByName(node, name));
  if (!modeWidget) return;
  const visible = ["进阶染发", RANDOM_CHOICE].includes(modeWidget.value);
  if (!visible && clearWhenBasic) {
    for (const widget of advancedWidgets) {
      if (widget) widget.value = EMPTY_CHOICE;
    }
  }
  for (const widget of advancedWidgets) setWidgetVisibilityReason(widget, "dependency", visible);
  if (resize) resizeBuilderNode(node);
  markDirty(node);
}

function syncMakeupVisibility(node, clearHidden = false, resize = true) {
  const modeWidget = widgetByName(node, "妆容模式");
  if (!modeWidget) return;
  let mode = modeWidget.value;
  if (mode === FOLLOW_PRESET) {
    const preset = widgetByName(node, "预设")?.value;
    mode = PRESETS[preset]?.["妆容模式"];
  }
  const showAll = [RANDOM_CHOICE, EMPTY_CHOICE, undefined].includes(mode);
  const visibilityByField = {
    "整体妆容预设": showAll || mode === "整体预设",
    ...Object.fromEntries(MAKEUP_CUSTOM_FIELDS.map(name => [name, showAll || mode === "分项自定义"])),
  };
  for (const [fieldName, visible] of Object.entries(visibilityByField)) {
    const widget = widgetByName(node, fieldName);
    if (!visible && clearHidden && widget) widget.value = EMPTY_CHOICE;
    setWidgetVisibilityReason(widget, "dependency", visible);
  }
  if (resize) resizeBuilderNode(node);
  markDirty(node);
}

function syncClothingVisibility(node, clearHidden = false, resize = true) {
  const modeWidget = widgetByName(node, "穿搭结构");
  if (!modeWidget) return;
  let mode = modeWidget.value;
  if (mode === FOLLOW_PRESET) {
    const preset = widgetByName(node, "预设")?.value;
    mode = PRESETS[preset]?.["穿搭结构"];
  }
  const showAll = [RANDOM_CHOICE, EMPTY_CHOICE, undefined].includes(mode);
  const visibleFields = new Set(CLOTHING_MODE_FIELDS[mode] || []);
  for (const fieldName of CLOTHING_BRANCH_FIELDS) {
    const widget = widgetByName(node, fieldName);
    const visible = showAll || visibleFields.has(fieldName);
    if (!visible && clearHidden && widget) widget.value = EMPTY_CHOICE;
    setWidgetVisibilityReason(widget, "dependency", visible);
  }
  if (resize) resizeBuilderNode(node);
  markDirty(node);
}

function applyPreset(node, presetName) {
  const values = PRESETS[presetName];
  if (!values) return;
  delete node.properties?.[ONLY_ENABLED_MODULE_PROPERTY];
  setWidgetValue(node, "写真大类", values["写真大类"]);
  syncThemeOptions(node, false);
  setWidgetValue(node, "族裔大类", values["族裔大类"]);
  syncEthnicityBranchOptions(node, false);
  setWidgetValue(node, "场景大类", values["场景大类"]);
  syncSceneLocationOptions(node, false);
  for (const [name, value] of Object.entries(values)) {
    setWidgetValue(node, name, value);
  }
  syncMakeupVisibility(node, true);
  syncHairAdvancedVisibility(node, true);
  syncClothingVisibility(node, true);
  markDirty(node);
}

function syncEthnicityBranchOptions(node, chooseFirst = false) {
  const categoryWidget = widgetByName(node, "族裔大类");
  const branchWidget = widgetByName(node, "地域族裔分支");
  if (!categoryWidget || !branchWidget) return;

  const category = categoryWidget.value;
  const allowed = ETHNICITY_BRANCHES_BY_CATEGORY[category];
  const allBranches = [...new Set(Object.values(ETHNICITY_BRANCHES_BY_CATEGORY).flat())];
  const choices = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, ...(allowed || allBranches)];
  branchWidget.options = branchWidget.options || {};
  branchWidget.options.values = choices;

  if (chooseFirst && allowed?.length) {
    branchWidget.value = allowed[0];
  } else if (!choices.includes(branchWidget.value)) {
    branchWidget.value = FOLLOW_PRESET;
  }
  refreshNode2Widgets(node);
}

function syncThemeOptions(node, chooseFirst = false) {
  const categoryWidget = widgetByName(node, "写真大类");
  const themeWidget = widgetByName(node, "写真主题");
  if (!categoryWidget || !themeWidget) return;

  const category = categoryWidget.value;
  const allowed = THEME_OPTIONS_BY_CATEGORY[category];
  const allThemes = Object.values(THEME_OPTIONS_BY_CATEGORY).flat();
  const choices = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, ...(allowed || allThemes)];
  themeWidget.options = themeWidget.options || {};
  themeWidget.options.values = choices;

  if (chooseFirst && allowed?.length) {
    themeWidget.value = allowed[0];
  } else if (!choices.includes(themeWidget.value)) {
    themeWidget.value = FOLLOW_PRESET;
  }
  refreshNode2Widgets(node);
}

function syncSceneLocationOptions(node, chooseFirst = false) {
  const categoryWidget = widgetByName(node, "场景大类");
  const locationWidget = widgetByName(node, "场景地点");
  if (!categoryWidget || !locationWidget) return;

  const category = categoryWidget.value;
  const allowed = SCENE_LOCATIONS_BY_CATEGORY[category];
  const allLocations = [...new Set(Object.values(SCENE_LOCATIONS_BY_CATEGORY).flat())];
  const choices = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, ...(allowed || allLocations)];
  if (!chooseFirst && SCENE_LOCATION_VALUES.includes(locationWidget.value)
      && !choices.includes(locationWidget.value)) {
    choices.push(locationWidget.value);
  }
  locationWidget.options = locationWidget.options || {};
  locationWidget.options.values = choices;

  if (chooseFirst && allowed?.length) {
    locationWidget.value = allowed[0];
  } else if (!choices.includes(locationWidget.value)) {
    locationWidget.value = FOLLOW_PRESET;
  }
  refreshNode2Widgets(node);
}

function randomFieldsForScope(scope) {
  if (scope === MIX_SCOPE) return FIELD_NAMES;
  if (scope === THEME_SCOPE) return STANDARD_RANDOM_FIELDS;
  return LIGHT_RANDOM_FIELDS;
}

function exclusivelyEnabledModule(node) {
  const enabledModules = Object.entries(MODULE_FIELD_GROUPS)
    .filter(([, fieldNames]) => fieldNames.some(
      (fieldName) => widgetByName(node, fieldName)?.value !== EMPTY_CHOICE,
    ))
    .map(([moduleName]) => moduleName);
  if (enabledModules.length === 1) return enabledModules[0];
  if (enabledModules.length === 0 && Object.hasOwn(
    MODULE_FIELD_GROUPS,
    node.properties?.[ONLY_ENABLED_MODULE_PROPERTY],
  )) {
    return node.properties[ONLY_ENABLED_MODULE_PROPERTY];
  }
  return undefined;
}

function prepareRandomCombination(node) {
  const scope = widgetByName(node, "随机范围")?.value ?? LOCAL_SCOPE;
  const onlyEnabledModule = exclusivelyEnabledModule(node);
  const candidateFields = onlyEnabledModule
    ? MODULE_FIELD_GROUPS[onlyEnabledModule]
    : randomFieldsForScope(scope);
  const locks = new Set(node.properties?.vividMuseRandomLocks || []);
  const preserved = FIELD_NAMES.filter(name => locks.has(name)).map(name => [
    name, widgetByName(node, name)?.value,
  ]);
  for (const fieldName of candidateFields) {
    if (!locks.has(fieldName)) setWidgetValue(node, fieldName, RANDOM_CHOICE);
  }

  const seedWidget = widgetByName(node, "随机种子");
  if (seedWidget) {
    seedWidget.value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  }
  syncThemeOptions(node);
  syncEthnicityBranchOptions(node);
  syncMakeupVisibility(node);
  syncHairAdvancedVisibility(node);
  syncClothingVisibility(node);
  syncSceneLocationOptions(node);
  for (const [name, value] of preserved) {
    const widget = widgetByName(node, name);
    if (widget) widget.value = value;
  }
  markDirty(node);
}

function syncDependentWidgets(node) {
  syncThemeOptions(node);
  syncEthnicityBranchOptions(node);
  syncMakeupVisibility(node, true);
  syncHairAdvancedVisibility(node, true);
  syncClothingVisibility(node, true);
  syncSceneLocationOptions(node);
  markDirty(node);
}

function clearStructuredFields(node) {
  delete node.properties?.[ONLY_ENABLED_MODULE_PROPERTY];
  for (const fieldName of FIELD_NAMES) setWidgetValue(node, fieldName, EMPTY_CHOICE);
  syncDependentWidgets(node);
}

function enableOnlyModule(node, moduleName) {
  const moduleFields = MODULE_FIELD_GROUPS[moduleName];
  if (!moduleFields) {
    console.error(`VividMuse: unknown module ${moduleName}`);
    return false;
  }
  const otherContent = FIELD_NAMES.some(name => !moduleFields.includes(name)
    && widgetByName(node, name)?.value != null && widgetByName(node, name)?.value !== EMPTY_CHOICE)
    || node.widgets?.some(w => /^用户.+片段$/u.test(w.name)
      && w.name !== `用户${moduleName}片段` && String(w.value ?? "").trim());
  if (otherContent) {
    const i18n = globalThis.__vividMuseZImageI18n;
    const message = i18n?.activeLanguage?.() === "en"
      ? `Keep only ${i18n?.translateMessage?.(moduleName) || moduleName}? Other modules' built-in selections and applied user text will be cleared. Free Prompt and imported libraries are kept.`
      : `仅保留“${moduleName}”模块？其他模块的内置选择和已应用用户文本将被清空。保留自由提示词及已导入词库。`;
    if (!globalThis.confirm?.(message)) return false;
  }
  const activeValues = new Map(moduleFields.map((fieldName) => [
    fieldName,
    widgetByName(node, fieldName)?.value,
  ]));
  for (const fieldName of FIELD_NAMES) {
    if (!moduleFields.includes(fieldName)) setWidgetValue(node, fieldName, EMPTY_CHOICE);
  }
  for (const [fieldName, value] of activeValues) setWidgetValue(node, fieldName, value);
  node.properties ??= {};
  node.properties[ONLY_ENABLED_MODULE_PROPERTY] = moduleName;
  syncThemeOptions(node);
  syncEthnicityBranchOptions(node);
  syncMakeupVisibility(node, false);
  syncHairAdvancedVisibility(node, false);
  syncClothingVisibility(node, false);
  syncSceneLocationOptions(node);
  markDirty(node);
}

function clearEverything(node) {
  clearStructuredFields(node);
  setWidgetValue(node, "自由提示词", "");
  markDirty(node);
}

function openClearContents(node) {
  node.__vividMuseClearDialog?.close();
  const english = globalThis.__vividMuseZImageI18n?.activeLanguage?.() === "en";
  const text = (zh, en) => english ? en : zh;
  const graph = node.graph;
  const root = app.graph;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", text("清空内容", "Clear Content"));
  dialog.style.cssText = "width:min(480px,90vw);max-height:85vh;overflow:auto;padding:20px;font-size:15px;line-height:1.6;color:var(--input-text,#eee);background:var(--comfy-menu-bg,#222);border:1px solid #777;border-radius:10px;";
  const title = document.createElement("h3");
  title.textContent = text("清空内容", "Clear Content");
  const label = document.createElement("label");
  label.textContent = text("清空范围", "What to clear");
  const select = document.createElement("select");
  select.style.cssText = "display:block;width:100%;font:inherit;margin:8px 0;";
  for (const [value, caption] of [
    ["structured", text("清空结构化内容", "Clear Structured Content")],
    ["all", text("清空全部提示词", "Clear All Prompt Content")],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = caption;
    select.append(option);
  }
  select.value = "structured";
  label.append(select);
  const description = document.createElement("p");
  const describe = () => {
    description.textContent = select.value === "all"
      ? text("清空内置字段、已应用用户模块文本及自由提示词。保留已导入词库、尺寸计算设置、种子和锁定配置。不会删除卡片或预设。", "Clear built-in selections, applied user module text and Free Prompt. Keep imported libraries, resolution calculation settings, seed and locks. Saved cards and presets are not deleted.")
      : text("清空内置字段及已应用用户模块文本。保留自由提示词、已导入词库、尺寸计算设置、种子和锁定配置。不会删除卡片或预设。", "Clear built-in selections and applied user module text. Keep Free Prompt, imported libraries, resolution calculation settings, seed and locks. Saved cards and presets are not deleted.");
  };
  select.addEventListener("change", describe);
  describe();
  const cancel = document.createElement("button");
  cancel.textContent = text("取消", "Cancel");
  cancel.onclick = () => dialog.close();
  const confirm = document.createElement("button");
  confirm.textContent = text("确认清空", "Confirm Clear");
  confirm.onclick = () => {
    if (!dialog.open || node.__vividMuseClearDialog !== dialog
      || node.graph !== graph || app.graph !== root) { dialog.close(); return; }
    const action = select.value === "all" ? node.__vividMuseClearEverythingButton
      : node.__vividMuseClearStructuredButton;
    dialog.close();
    action?.callback?.();
  };
  for (const button of [cancel, confirm]) button.style.cssText = "font:inherit;margin:4px;padding:6px 12px;white-space:normal;";
  let composing = false;
  dialog.addEventListener("compositionstart", () => { composing = true; });
  dialog.addEventListener("compositionend", () => { composing = false; });
  dialog.addEventListener("cancel", event => { if (composing) event.preventDefault(); });
  dialog.addEventListener("keydown", event => {
    if (composing || event.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
    if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
    event.stopPropagation();
  });
  for (const event of ["keyup", "copy", "cut", "paste", "wheel"]) dialog.addEventListener(event, e => e.stopPropagation());
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (node.__vividMuseClearDialog === dialog) node.__vividMuseClearDialog = null;
  });
  dialog.append(title, label, description, cancel, confirm);
  node.__vividMuseClearDialog = dialog;
  document.body.append(dialog);
  dialog.showModal();
  cancel.focus();
}

function placeStructuredActionsBeforePromptLibraries(node) {
  const targets = [
    node.__vividMuseTxtModuleToggle,
    node.__vividMuseTxtLibraryToggle,
    node.__vividMuseFreePromptSpacer,
    widgetByName(node, "自由提示词"),
  ].filter(widget => widget && node.widgets?.includes(widget));
  const target = targets.sort(
    (left, right) => node.widgets.indexOf(left) - node.widgets.indexOf(right),
  )[0];
  if (!target) return;
  const actions = [
    node.__vividMuseRandomButton,
    node.__vividMusePromptStatusButton,
    node.__vividMuseEnableOnlyModuleButton,
    node.__vividMuseClearContentsButton,
  ];
  for (const action of actions) moveWidgetBefore(node, action, target);
  refreshNode2Widgets(node);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.PresetSync",
  async nodeCreated(node) {
    const isTarget = node.comfyClass === NODE_CLASS || node.constructor?.type === NODE_CLASS;
    if (!isTarget) return;

    installCompactWidgetSerialization(node);
    installCompactWidgetConfigure(node);
    if (!node.__vividMuseClearLifecycle) {
      const onRemoved = node.onRemoved;
      node.onRemoved = function () {
        node.__vividMuseClearDialog?.close();
        return onRemoved?.apply(this, arguments);
      };
      node.__vividMuseClearLifecycle = true;
    }
    node.__vividMuseRefreshCardScope = moduleName => {
      if (moduleName === "人物") {
        syncEthnicityBranchOptions(node);
        syncMakeupVisibility(node);
      } else if (moduleName === "服装") syncClothingVisibility(node);
      else if (moduleName === "场景") syncSceneLocationOptions(node, false);
    };

    const presetWidget = widgetByName(node, "预设");
    if (presetWidget && !presetWidget.__vividMusePresetSync) {
      const originalCallback = presetWidget.callback;
      presetWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        applyPreset(node, value);
        return result;
      };
      presetWidget.__vividMusePresetSync = true;
    }

    const categoryWidget = widgetByName(node, "写真大类");
    if (categoryWidget && !categoryWidget.__vividMuseThemeFilter) {
      const originalCallback = categoryWidget.callback;
      categoryWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncThemeOptions(node, Boolean(THEME_OPTIONS_BY_CATEGORY[value]));
        markDirty(node);
        return result;
      };
      categoryWidget.__vividMuseThemeFilter = true;
    }

    const ethnicityCategoryWidget = widgetByName(node, "族裔大类");
    if (ethnicityCategoryWidget && !ethnicityCategoryWidget.__vividMuseEthnicityFilter) {
      const originalCallback = ethnicityCategoryWidget.callback;
      ethnicityCategoryWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncEthnicityBranchOptions(node, Boolean(ETHNICITY_BRANCHES_BY_CATEGORY[value]));
        markDirty(node);
        return result;
      };
      ethnicityCategoryWidget.__vividMuseEthnicityFilter = true;
    }

    const makeupModeWidget = widgetByName(node, "妆容模式");
    if (makeupModeWidget && !makeupModeWidget.__vividMuseMakeupModeFilter) {
      const originalCallback = makeupModeWidget.callback;
      makeupModeWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncMakeupVisibility(node, ["整体预设", "分项自定义"].includes(value));
        return result;
      };
      makeupModeWidget.__vividMuseMakeupModeFilter = true;
    }

    const sceneCategoryWidget = widgetByName(node, "场景大类");
    if (sceneCategoryWidget && !sceneCategoryWidget.__vividMuseSceneFilter) {
      const originalCallback = sceneCategoryWidget.callback;
      sceneCategoryWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncSceneLocationOptions(node, Boolean(SCENE_LOCATIONS_BY_CATEGORY[value]));
        markDirty(node);
        return result;
      };
      sceneCategoryWidget.__vividMuseSceneFilter = true;
    }

    const hairModeWidget = widgetByName(node, "发色模式");
    if (hairModeWidget && !hairModeWidget.__vividMuseHairModeFilter) {
      const originalCallback = hairModeWidget.callback;
      hairModeWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncHairAdvancedVisibility(node, value === "基础发色");
        return result;
      };
      hairModeWidget.__vividMuseHairModeFilter = true;
    }

    const clothingModeWidget = widgetByName(node, "穿搭结构");
    if (clothingModeWidget && !clothingModeWidget.__vividMuseClothingModeFilter) {
      const originalCallback = clothingModeWidget.callback;
      clothingModeWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncClothingVisibility(node, ![FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE].includes(value));
        return result;
      };
      clothingModeWidget.__vividMuseClothingModeFilter = true;
    }

    if (!node.__vividMuseModuleWidget) {
      const moduleNames = Object.keys(MODULE_FIELD_GROUPS);
      const saved = normalizeModuleName(node.properties?.[ACTIVE_MODULE_PROPERTY]);
      const moduleWidget = addHelperWidget(
        node,
        "combo",
        "当前编辑模块",
        saved,
        value => setActiveModule(node, value),
        { values: moduleNames },
      );
      node.__vividMuseModuleWidget = moduleWidget;
      moveWidgetBefore(node, moduleWidget, widgetByName(node, FIELD_NAMES[0]));
    }

    if (!node.__vividMuseFreePromptSpacer) {
      const spacer = addHelperWidget(
        node, "button", "__vividMuseFreePromptSpacer", null, () => {},
      );
      spacer.type = "hidden";
      spacer.hidden = true;
      spacer.options ??= {};
      spacer.options.hidden = true;
      spacer.computeSize = () => [0, -4];
      spacer.draw = () => {};
      node.__vividMuseFreePromptSpacer = spacer;
      moveWidgetBefore(node, spacer, widgetByName(node, "自由提示词"));
    }

    if (!node.__vividMuseEnableOnlyModuleButton) {
      node.__vividMuseEnableOnlyModuleButton = addHelperWidget(
        node,
        "button",
        "仅启用当前模块",
        null,
        () => enableOnlyModule(node, node.__vividMuseModuleWidget?.value),
      );
    }

    if (!node.__vividMuseRandomButton) {
      node.__vividMuseRandomButton = addHelperWidget(
        node, "button", "🎲 生成随机组合", null, () => prepareRandomCombination(node),
      );
      node.__vividMuseRandomButton.__vividMuseDisplayText = "🎲 设置随机组合";
      node.__vividMuseRandomButton.label = "🎲 设置随机组合";
      node.__vividMuseRandomButton.tooltip = "按随机范围准备字段；运行节点后查看结果。仅改变种子不会把固定内容变为随机。";
    }

    if (!node.__vividMuseClearStructuredButton) {
      node.__vividMuseClearStructuredButton = addHelperWidget(
        node, "button", "清空结构化模块", null, () => clearStructuredFields(node),
      );
    }

    if (!node.__vividMuseClearEverythingButton) {
      node.__vividMuseClearEverythingButton = addHelperWidget(
        node, "button", "全部清空", null, () => clearEverything(node),
      );
    }

    for (const action of [node.__vividMuseClearStructuredButton, node.__vividMuseClearEverythingButton]) {
      const index = node.widgets.indexOf(action);
      if (index >= 0) node.widgets.splice(index, 1);
    }
    if (!node.__vividMuseClearContentsButton) {
      node.__vividMuseClearContentsButton = addHelperWidget(
        node, "button", "清空内容…", null, () => openClearContents(node),
      );
    }
    node.__vividMuseEnableOnlyModuleButton.tooltip = "保留当前模块，清空其他模块的内置选择及已应用用户文本；保留自由提示词和已导入词库。";

    placeStructuredActionsBeforePromptLibraries(node);
    ensureConfiguredNode(node);
  },
  loadedGraphNode(node) {
    const isTarget = node.comfyClass === NODE_CLASS || node.constructor?.type === NODE_CLASS;
    if (!isTarget || !node.__vividMuseModuleWidget) return;
    placeStructuredActionsBeforePromptLibraries(node);
    ensureConfiguredNode(node);
  },
});
