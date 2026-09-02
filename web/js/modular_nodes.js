import { app } from "../../scripts/app.js";

const FOLLOW_PRESET = "跟随预设";
const RANDOM_CHOICE = "随机抽取";
const EMPTY_CHOICE = "不使用";
const LEGACY_AGE_STAGES = {
  "60–69岁": "60岁以上",
  "70岁以上": "60岁以上",
};

const MODULE_NODE_FIELDS = {
  VividMuse_ZImageCanvasModule: [
    "画面比例", "成像媒介", "写真大类", "写真主题",
  ],
  VividMuse_ZImagePersonModule: [
    "年龄阶段", "族裔大类", "地域族裔分支", "脸型", "轮廓细节",
    "眼型", "瞳色", "眼睑特征", "肤色", "肤质", "妆容模式",
    "整体妆容预设", "底妆质感", "眼影色系", "眼线造型",
    "唇妆颜色", "唇面质感", "基础身形", "身量观感", "线条重点",
  ],
  VividMuse_ZImageHairModule: [
    "发色模式", "发色", "发色色调", "染色方式", "头发长度",
    "发质与卷度", "发型造型", "刘海", "头部配饰",
  ],
  VividMuse_ZImageClothingModule: [
    "穿搭结构", "连衣裙类型", "连衣裙颜色", "连衣裙材质",
    "连衣裙图案", "连体服类型", "连体服颜色", "连体服材质",
    "连体服图案", "上装类型", "上装颜色", "上装材质", "上装图案",
    "下装类型", "下装颜色", "下装材质", "下装图案", "版型细节",
    "袜装", "鞋履", "服装配件",
  ],
  VividMuse_ZImagePoseModule: [
    "画面瞬间", "基础姿态", "身体方向", "身体重心", "肩颈状态",
    "手部动作", "腿部动作", "头部方向", "视线", "表情",
  ],
  VividMuse_ZImageSceneModule: [
    "场景大类", "场景地点", "时间切片", "天气状态", "前景框景",
    "背景环境", "环境细节", "空间材质", "空间层次",
  ],
  VividMuse_ZImageCameraModule: [
    "景别", "画面布局", "等效焦段", "拍摄距离", "机位", "景深",
    "对焦位置",
  ],
  VividMuse_ZImageVisualModule: [
    "主光来源", "光线方向", "光线质地", "照明落点", "阴影表现",
    "主配色", "色温倾向", "画面对比", "影像风格", "细节质地",
    "高光处理", "颗粒质感",
  ],
};

const MAKEUP_CUSTOM_FIELDS = [
  "底妆质感", "眼影色系", "眼线造型", "唇妆颜色", "唇面质感",
];
const HAIR_ADVANCED_FIELDS = ["发色色调", "染色方式"];
const CLOTHING_MODE_FIELDS = {
  "连衣裙": ["连衣裙类型", "连衣裙颜色", "连衣裙材质", "连衣裙图案"],
  "连体服": ["连体服类型", "连体服颜色", "连体服材质", "连体服图案"],
  "上装＋下装": [
    "上装类型", "上装颜色", "上装材质", "上装图案",
    "下装类型", "下装颜色", "下装材质", "下装图案",
  ],
  "西装套装": [
    "上装类型", "上装颜色", "上装材质", "上装图案",
    "下装类型", "下装颜色", "下装材质", "下装图案",
  ],
  "叠穿造型": [
    "上装类型", "上装颜色", "上装材质", "上装图案",
    "下装类型", "下装颜色", "下装材质", "下装图案",
  ],
};
const CLOTHING_BRANCH_FIELDS = [...new Set(
  Object.values(CLOTHING_MODE_FIELDS).flat(),
)];

function className(node) {
  return node.comfyClass || node.constructor?.type || "";
}

function moduleFields(node) {
  return MODULE_NODE_FIELDS[className(node)] || null;
}

function widgetByName(node, name) {
  return node.widgets?.find((widget) => widget.name === name);
}

function addHelperWidget(node, type, name, value, callback, options = {}) {
  const widget = node.addWidget(type, name, value, callback, {
    ...options,
    serialize: false,
  });
  widget.serialize = false;
  widget.options ??= {};
  widget.options.serialize = false;
  return widget;
}

function installSerializationGuard(node) {
  if (node.__vividMuseModularSerialization) return;
  const originalOnSerialize = node.onSerialize;
  node.onSerialize = function (info) {
    const result = originalOnSerialize?.apply(this, arguments);
    if (Array.isArray(info.widgets_values)) {
      info.widgets_values = (node.widgets || []).flatMap((widget, index) => (
        widget.serialize === false ? [] : [info.widgets_values[index]]
      ));
    }
    return result;
  };
  node.__vividMuseModularSerialization = true;
}

function refreshNode2Widgets(node) {
  if (!Array.isArray(node.widgets)) return;
  const marker = {
    name: "__vividMuseModularRefreshMarker",
    type: "hidden",
    hidden: true,
    options: { hidden: true, serialize: false },
  };
  node.widgets.push(marker);
  node.widgets.pop();
}

function markDirty(node) {
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function resizeNode(node) {
  refreshNode2Widgets(node);
  const computed = node.computeSize?.();
  if (computed) node.setSize?.([Math.max(computed[0], 300), computed[1]]);
  markDirty(node);
}

function moveWidgetBefore(node, widget, targetWidget) {
  if (!widget || !targetWidget || !Array.isArray(node.widgets)) return;
  const oldIndex = node.widgets.indexOf(widget);
  if (oldIndex >= 0) node.widgets.splice(oldIndex, 1);
  const targetIndex = node.widgets.indexOf(targetWidget);
  node.widgets.splice(targetIndex, 0, widget);
}

function setWidgetVisible(widget, visible) {
  if (!widget) return;
  if (!visible && !widget.__vividMuseModularHidden) {
    widget.__vividMuseModularOriginalType ??= widget.type;
    widget.__vividMuseModularOriginalComputeSize ??= widget.computeSize;
    widget.__vividMuseModularOriginalOptionsHidden = widget.options?.hidden;
    widget.options ??= {};
    widget.options.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
  } else if (visible && widget.__vividMuseModularHidden) {
    widget.type = widget.__vividMuseModularOriginalType;
    widget.computeSize = widget.__vividMuseModularOriginalComputeSize;
    if (widget.options) {
      if (widget.__vividMuseModularOriginalOptionsHidden === undefined) {
        delete widget.options.hidden;
      } else {
        widget.options.hidden = widget.__vividMuseModularOriginalOptionsHidden;
      }
    }
  }
  widget.__vividMuseModularHidden = !visible;
  widget.hidden = !visible;
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
  childWidget.options ??= {};
  childWidget.options.values = values;
  if (chooseFirst && allowed?.length) {
    childWidget.value = allowed[0];
  } else if (!values.includes(childWidget.value)) {
    childWidget.value = FOLLOW_PRESET;
  }
  refreshNode2Widgets(node);
  if (resize) resizeNode(node);
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
  if (resize) resizeNode(node);
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
  if (resize) resizeNode(node);
}

function syncClothingVisibility(node, resize = true) {
  const mode = effectiveFieldValue(node, "穿搭结构");
  const visibleFields = new Set(CLOTHING_MODE_FIELDS[mode] || []);
  const showAll = [FOLLOW_PRESET, RANDOM_CHOICE].includes(mode);
  for (const fieldName of CLOTHING_BRANCH_FIELDS) {
    setWidgetVisible(
      widgetByName(node, fieldName),
      showAll || visibleFields.has(fieldName),
    );
  }
  if (resize) resizeNode(node);
}

function syncDependencies(node, resize = true) {
  syncHairVisibility(node, false);
  syncMakeupVisibility(node, false);
  syncClothingVisibility(node, false);
  syncThemeOptions(node, false, false);
  syncEthnicityOptions(node, false, false);
  syncSceneOptions(node, false, false);
  if (resize) resizeNode(node);
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
  for (const fieldName of moduleFields(node) || []) {
    const widget = widgetByName(node, fieldName);
    if (!widget) continue;
    const allowed = widget.options?.values;
    if (Array.isArray(allowed) && !allowed.includes(value)) continue;
    widget.value = value;
    widget.callback?.(value);
  }
  syncDependencies(node);
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
    globalThis.setTimeout?.(() => resizeNode(node), 0);
    return result;
  };
  node.__vividMuseModularConfigure = true;
}

function installModuleNode(node) {
  const fields = moduleFields(node);
  if (!fields || node.__vividMuseModularInstalled) return;

  installSerializationGuard(node);
  installConfigure(node);
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
  globalThis.setTimeout?.(() => resizeNode(node), 0);
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
