import { app } from "../../scripts/app.js";

const FULL_NODE_CLASS = "VividMuse_ZImageChinesePromptBuilder";
const STANDALONE_NODE_CLASS = "VividMuse_ZImageTxtModuleLibrary";
const LIBRARY_PROPERTY = "vividMuseTxtModuleLibrary";
const EXPANDED_PROPERTY = "vividMuseTxtModuleLibraryExpanded";
const APPLIED_TITLE_PROPERTY = "vividMuseTxtModuleAppliedTitles";
const SELECTED_MODULE_PROPERTY = "vividMuseTxtModuleSelectedModule";
const STANDARD_MODULES = [
  "画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现",
];
const MODULES = [...STANDARD_MODULES, "自定义"];
const TARGET_WIDGETS = {
  "画面基础": "用户画面基础片段",
  "人物": "用户人物片段",
  "发型": "用户发型片段",
  "服装": "用户服装片段",
  "姿态动作": "用户姿态动作片段",
  "场景": "用户场景片段",
  "摄影": "用户摄影片段",
  "视觉表现": "用户视觉表现片段",
  "自定义": "用户自定义片段",
};

function isStandaloneNode(node) {
  return (node.comfyClass || node.constructor?.type) === STANDALONE_NODE_CLASS;
}

function isTargetNode(node) {
  const nodeClass = node.comfyClass || node.constructor?.type;
  return nodeClass === FULL_NODE_CLASS || nodeClass === STANDALONE_NODE_CLASS;
}

function targetWidgetName(node, moduleName) {
  return isStandaloneNode(node) ? "模块提示词" : TARGET_WIDGETS[moduleName];
}

const MODULE_ALIASES = new Map([
  ["画面基础", "画面基础"],
  ["基础画面", "画面基础"],
  ["人物", "人物"],
  ["人物设定", "人物"],
  ["角色", "人物"],
  ["发型", "发型"],
  ["头发", "发型"],
  ["服装", "服装"],
  ["穿搭", "服装"],
  ["姿态动作", "姿态动作"],
  ["姿态", "姿态动作"],
  ["动作", "姿态动作"],
  ["场景", "场景"],
  ["环境", "场景"],
  ["摄影", "摄影"],
  ["镜头", "摄影"],
  ["视觉表现", "视觉表现"],
  ["视觉", "视觉表现"],
  ["光影色彩", "视觉表现"],
  ["自定义", "自定义"],
]);
const EMPTY_VALUE = "当前模块没有词库条目";
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_CHARACTERS = 1000000;
const MAX_ENTRIES = 500;
const MAX_PROMPT_CHARACTERS = 20000;

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

function installCompactWidgetSerialization(node) {
  if (node.__vividMuseTxtModuleCompactSerialization) return;
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
  node.__vividMuseTxtModuleCompactSerialization = true;
}

function markDirty(node) {
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function refreshNode2Widgets(node) {
  const widgets = node.widgets;
  if (!Array.isArray(widgets)) return;
  const marker = {
    name: "__vividMuseNode2RefreshMarker",
    type: "hidden",
    hidden: true,
    options: { hidden: true, serialize: false },
  };
  widgets.push(marker);
  widgets.pop();
}

function resizeNode(node) {
  refreshNode2Widgets(node);
  const computed = node.computeSize?.();
  if (computed) node.setSize?.([Math.max(computed[0], 360), computed[1]]);
}

function moveWidgetBefore(node, widget, targetWidget) {
  if (!widget || !targetWidget) return;
  const oldIndex = node.widgets.indexOf(widget);
  if (oldIndex >= 0) node.widgets.splice(oldIndex, 1);
  const targetIndex = node.widgets.indexOf(targetWidget);
  node.widgets.splice(targetIndex, 0, widget);
}

function placeModuleLibraryBeforePromptLibrary(node) {
  const target = isStandaloneNode(node)
    ? widgetByName(node, "模块提示词")
    : node.__vividMuseTxtLibraryToggle || widgetByName(node, "自由提示词");
  if (!target) return;
  for (const widget of [
    node.__vividMuseTxtModuleToggle,
    ...(node.__vividMuseTxtModuleControls || []),
  ]) {
    moveWidgetBefore(node, widget, target);
  }
  refreshNode2Widgets(node);
}

function setWidgetVisible(widget, visible) {
  if (!widget) return;
  if (!visible && !widget.__vividMuseTxtModuleHidden) {
    widget.__vividMuseTxtModuleOriginalType ??= widget.type;
    widget.__vividMuseTxtModuleOriginalComputeSize ??= widget.computeSize;
    widget.__vividMuseTxtModuleOriginalOptionsHidden = widget.options?.hidden;
    widget.options ??= {};
    widget.options.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
  } else if (visible && widget.__vividMuseTxtModuleHidden) {
    widget.type = widget.__vividMuseTxtModuleOriginalType;
    widget.computeSize = widget.__vividMuseTxtModuleOriginalComputeSize;
    if (widget.options) {
      if (widget.__vividMuseTxtModuleOriginalOptionsHidden === undefined) {
        delete widget.options.hidden;
      } else {
        widget.options.hidden = widget.__vividMuseTxtModuleOriginalOptionsHidden;
      }
    }
  }
  widget.__vividMuseTxtModuleHidden = !visible;
  widget.hidden = !visible;
}

function normalizeModule(rawModule) {
  return MODULE_ALIASES.get(String(rawModule || "").trim()) || null;
}

function uniqueModuleTitles(entries) {
  const counts = new Map();
  return entries.map((entry) => {
    const key = `${entry.module}\u0000${entry.title}`;
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return {
      ...entry,
      title: count === 1 ? entry.title : `${entry.title}（${count}）`,
    };
  });
}

function parseTxtModuleLibrary(text) {
  if (typeof text !== "string") throw new Error("TXT模块词库内容必须是文本。");
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (normalized.length > MAX_CHARACTERS) {
    throw new Error("TXT模块词库内容超过1MB字符上限。");
  }
  if (!/^\s*##\s+\S+/mu.test(normalized)) {
    throw new Error("模块词库必须使用“## 标题”分块格式。");
  }

  const entries = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    while (current.body[0]?.trim() === "") current.body.shift();
    while (current.body.at(-1)?.trim() === "") current.body.pop();
    const prompt = current.body.join("\n");
    if (!current.module) {
      throw new Error(`条目“${current.title}”缺少有效的“模块：模块名称”。`);
    }
    if (!prompt) throw new Error(`条目“${current.title}”没有提示词正文。`);
    if (prompt.length > MAX_PROMPT_CHARACTERS) {
      throw new Error(`单条模块提示词不能超过${MAX_PROMPT_CHARACTERS}个字符。`);
    }
    entries.push({
      title: current.title,
      module: current.module,
      tags: current.tags,
      prompt,
    });
    current = null;
  };

  for (const line of normalized.split("\n")) {
    const heading = line.match(/^\s*##\s+(.+?)\s*$/u);
    if (heading) {
      flush();
      current = { title: heading[1], module: null, tags: [], body: [] };
      continue;
    }
    if (line.trim() === "---") {
      flush();
      continue;
    }
    if (!current) continue;
    const moduleLine = line.match(/^\s*模块\s*[:：]\s*(.*?)\s*$/u);
    if (moduleLine) {
      current.module = normalizeModule(moduleLine[1]);
      continue;
    }
    const tagLine = line.match(/^\s*标签\s*[:：]\s*(.*?)\s*$/u);
    if (tagLine) {
      current.tags = tagLine[1]
        .split(/[,，]/u)
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else {
      current.body.push(line);
    }
  }
  flush();
  if (!entries.length) throw new Error("TXT模块词库中没有可用条目。");
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`TXT模块词库最多支持${MAX_ENTRIES}条提示词。`);
  }
  return uniqueModuleTitles(entries);
}

function moduleEntries(node, moduleName = null) {
  const entries = node.properties?.[LIBRARY_PROPERTY]?.entries;
  if (!Array.isArray(entries)) return [];
  const valid = entries.filter((entry) => (
    entry
    && MODULES.includes(entry.module)
    && typeof entry.title === "string"
    && typeof entry.prompt === "string"
    && Array.isArray(entry.tags)
  ));
  return moduleName ? valid.filter((entry) => entry.module === moduleName) : valid;
}

function currentModule(node) {
  const value = node.__vividMuseTxtModuleModuleWidget?.value;
  return MODULES.includes(value) ? value : MODULES[0];
}

function syncModuleLibraryControls(node, resize = true) {
  const moduleWidget = node.__vividMuseTxtModuleModuleWidget;
  const entryWidget = node.__vividMuseTxtModuleEntryWidget;
  if (!moduleWidget || !entryWidget) return;
  const moduleName = currentModule(node);
  const entries = moduleEntries(node, moduleName);
  const values = entries.length ? entries.map((entry) => entry.title) : [EMPTY_VALUE];
  entryWidget.options ??= {};
  entryWidget.options.values = values;
  if (!values.includes(entryWidget.value)) entryWidget.value = values[0];

  const allEntries = moduleEntries(node);
  const fileName = node.properties?.[LIBRARY_PROPERTY]?.fileName;
  node.__vividMuseTxtModuleToggle.name = allEntries.length
    ? `🧩 TXT模块词库（${fileName || "未命名"} · ${allEntries.length}条）`
    : "🧩 TXT模块词库（全模块）";

  const appliedTitle = node.properties?.[APPLIED_TITLE_PROPERTY]?.[moduleName];
  const targetValue = widgetByName(node, targetWidgetName(node, moduleName))?.value;
  const status = appliedTitle || (targetValue ? "已有内容" : "未设置");
  const action = moduleName === "自定义" ? "启用自定义模块" : "应用到" + moduleName + "模块";
  node.__vividMuseTxtModuleApplyButton.name = action + "（当前：" + status.slice(0, 16) + "）";
  if (resize) resizeNode(node);
  markDirty(node);
}

function setModuleLibraryExpanded(node, expanded, resize = true) {
  node.properties ??= {};
  node.properties[EXPANDED_PROPERTY] = Boolean(expanded);
  for (const widget of node.__vividMuseTxtModuleControls || []) {
    setWidgetVisible(widget, Boolean(expanded));
  }
  if (resize) resizeNode(node);
  markDirty(node);
}

function notifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("VividMuse TXT module library:", error);
  globalThis.alert?.(message);
}

async function importTxtModuleFile(node, file) {
  if (!file || !/\.txt$/iu.test(file.name || "")) {
    throw new Error("只支持导入.txt模块词库文件。");
  }
  if (Number(file.size) > MAX_FILE_BYTES) {
    throw new Error("TXT模块词库文件不能超过1MB。");
  }
  const entries = parseTxtModuleLibrary(await file.text());
  node.properties ??= {};
  node.properties[LIBRARY_PROPERTY] = {
    version: 1,
    fileName: String(file.name),
    entries,
  };
  syncModuleLibraryControls(node, false);
  setModuleLibraryExpanded(node, true);
  return entries;
}

function chooseTxtModuleFile(node) {
  if (!globalThis.document?.createElement) {
    notifyError(new Error("当前环境不支持文件选择器。"));
    return;
  }
  const input = globalThis.document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.multiple = false;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importTxtModuleFile(node, file);
    } catch (error) {
      notifyError(error);
    }
  };
  input.click();
}

function applySelectedModuleEntry(node) {
  const moduleName = currentModule(node);
  const entryWidget = node.__vividMuseTxtModuleEntryWidget;
  const selected = moduleEntries(node, moduleName)
    .find((entry) => entry.title === entryWidget?.value);
  if (!selected) {
    notifyError(new Error("请先导入并选择当前模块的一条提示词。"));
    return false;
  }
  const targetWidget = widgetByName(node, targetWidgetName(node, moduleName));
  if (!targetWidget) return false;
  targetWidget.value = selected.prompt;
  node.__vividMuseTxtModuleApplyingEntry = true;
  try {
    targetWidget.callback?.(targetWidget.value);
  } finally {
    node.__vividMuseTxtModuleApplyingEntry = false;
  }
  node.properties ??= {};
  node.properties[APPLIED_TITLE_PROPERTY] ??= {};
  node.properties[APPLIED_TITLE_PROPERTY][moduleName] = selected.title;
  syncModuleLibraryControls(node);
  return true;
}

function installStandaloneTargetEditTracking(node) {
  if (!isStandaloneNode(node)) return;
  const targetWidget = widgetByName(node, "模块提示词");
  if (!targetWidget || targetWidget.__vividMuseTxtModuleEditTracking) return;
  const originalCallback = targetWidget.callback;
  targetWidget.callback = function () {
    const result = originalCallback?.apply(this, arguments);
    if (!node.__vividMuseTxtModuleApplyingEntry) {
      const moduleName = currentModule(node);
      if (node.properties?.[APPLIED_TITLE_PROPERTY]) {
        delete node.properties[APPLIED_TITLE_PROPERTY][moduleName];
      }
      syncModuleLibraryControls(node, false);
    }
    return result;
  };
  targetWidget.__vividMuseTxtModuleEditTracking = true;
}

function clearCurrentModule(node) {
  const moduleName = currentModule(node);
  const targetWidget = widgetByName(node, targetWidgetName(node, moduleName));
  if (!targetWidget) return false;
  targetWidget.value = "";
  targetWidget.callback?.(targetWidget.value);
  if (node.properties?.[APPLIED_TITLE_PROPERTY]) {
    delete node.properties[APPLIED_TITLE_PROPERTY][moduleName];
  }
  syncModuleLibraryControls(node);
  return true;
}

function clearModuleLibrary(node) {
  if (node.properties) delete node.properties[LIBRARY_PROPERTY];
  syncModuleLibraryControls(node);
}

function clearAllUserModules(node, keepModule = null) {
  for (const moduleName of MODULES) {
    if (moduleName === keepModule) continue;
    const targetWidget = widgetByName(node, targetWidgetName(node, moduleName));
    if (targetWidget) {
      targetWidget.value = "";
      targetWidget.callback?.(targetWidget.value);
    }
    if (node.properties?.[APPLIED_TITLE_PROPERTY]) {
      delete node.properties[APPLIED_TITLE_PROPERTY][moduleName];
    }
  }
  syncModuleLibraryControls(node);
}

function wrapButtonCallback(widget, marker, afterCallback) {
  if (!widget || widget[marker]) return;
  const originalCallback = widget.callback;
  widget.callback = function () {
    const result = originalCallback?.apply(this, arguments);
    afterCallback();
    return result;
  };
  widget[marker] = true;
}

function installExistingControlIntegration(node) {
  if (isStandaloneNode(node)) return;
  for (const buttonName of ["清空结构化模块", "全部清空"]) {
    wrapButtonCallback(
      widgetByName(node, buttonName),
      "__vividMuseTxtModuleClearIntegration",
      () => clearAllUserModules(node),
    );
  }
  wrapButtonCallback(
    widgetByName(node, "仅启用当前模块"),
    "__vividMuseTxtModuleOnlyIntegration",
    () => {
      const activeModule = node.__vividMuseModuleWidget?.value;
      const keepModule = STANDARD_MODULES.includes(activeModule) ? activeModule : null;
      clearAllUserModules(node, keepModule);
    },
  );
}

function installConfigure(node) {
  if (node.__vividMuseTxtModuleConfigure) return;
  const originalOnConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    const result = originalOnConfigure?.apply(this, arguments);
    const targetNames = isStandaloneNode(node)
      ? []
      : Object.values(TARGET_WIDGETS);
    for (const targetName of targetNames) {
      setWidgetVisible(widgetByName(node, targetName), false);
    }
    placeModuleLibraryBeforePromptLibrary(node);
    syncModuleLibraryControls(node, false);
    setModuleLibraryExpanded(
      node,
      Boolean(node.properties?.[EXPANDED_PROPERTY]),
      false,
    );
    return result;
  };
  node.__vividMuseTxtModuleConfigure = true;
}

function installModuleLibraryWidgets(node) {
  if (node.__vividMuseTxtModuleToggle) {
    syncModuleLibraryControls(node, false);
    return;
  }
  const standalone = isStandaloneNode(node);
  const anchorWidget = standalone
    ? widgetByName(node, "模块提示词")
    : widgetByName(node, "自由提示词");
  const requiredTargets = standalone ? ["模块提示词"] : Object.values(TARGET_WIDGETS);
  if (!anchorWidget || requiredTargets.some((name) => !widgetByName(node, name))) {
    return;
  }
  if (!standalone) {
    for (const targetName of requiredTargets) {
      setWidgetVisible(widgetByName(node, targetName), false);
    }
  }

  const toggle = addHelperWidget(
    node,
    "button",
    "🧩 TXT模块词库（全模块）",
    null,
    () => setModuleLibraryExpanded(
      node,
      !Boolean(node.properties?.[EXPANDED_PROPERTY]),
    ),
  );
  const importButton = addHelperWidget(
    node, "button", "导入结构化模块TXT词库", null, () => chooseTxtModuleFile(node),
  );
  const moduleWidget = standalone
    ? widgetByName(node, "模块类型")
    : addHelperWidget(
      node,
      "combo",
      "词库模块",
      MODULES[0],
      () => syncModuleLibraryControls(node),
      { values: MODULES },
    );
  if (standalone && !moduleWidget.__vividMuseStandaloneModuleCallback) {
    const originalCallback = moduleWidget.callback;
    moduleWidget.callback = function (value) {
      const previous = node.properties?.[SELECTED_MODULE_PROPERTY];
      const result = originalCallback?.apply(this, arguments);
      if (previous && previous !== value) {
        const targetWidget = widgetByName(node, "模块提示词");
        if (targetWidget) {
          targetWidget.value = "";
          targetWidget.callback?.(targetWidget.value);
        }
        if (node.properties?.[APPLIED_TITLE_PROPERTY]) {
          delete node.properties[APPLIED_TITLE_PROPERTY][previous];
        }
      }
      node.properties ??= {};
      node.properties[SELECTED_MODULE_PROPERTY] = value;
      syncModuleLibraryControls(node);
      return result;
    };
    moduleWidget.__vividMuseStandaloneModuleCallback = true;
    node.properties ??= {};
    node.properties[SELECTED_MODULE_PROPERTY] ??= moduleWidget.value;
  }
  const entryWidget = addHelperWidget(
    node,
    "combo",
    "模块词库条目",
    EMPTY_VALUE,
    () => markDirty(node),
    { values: [EMPTY_VALUE] },
  );
  const applyButton = addHelperWidget(
    node, "button", "应用到画面基础模块（当前：未设置）", null,
    () => applySelectedModuleEntry(node),
  );
  const clearModuleButton = addHelperWidget(
    node, "button", "清空当前用户模块", null, () => clearCurrentModule(node),
  );
  const clearLibraryButton = addHelperWidget(
    node, "button", "清除模块词库", null, () => clearModuleLibrary(node),
  );

  node.__vividMuseTxtModuleToggle = toggle;
  node.__vividMuseTxtModuleModuleWidget = moduleWidget;
  node.__vividMuseTxtModuleEntryWidget = entryWidget;
  node.__vividMuseTxtModuleApplyButton = applyButton;
  node.__vividMuseTxtModuleControls = [
    importButton,
    moduleWidget,
    entryWidget,
    applyButton,
    clearModuleButton,
    clearLibraryButton,
  ];
  installStandaloneTargetEditTracking(node);
  placeModuleLibraryBeforePromptLibrary(node);
  syncModuleLibraryControls(node, false);
  setModuleLibraryExpanded(node, Boolean(node.properties?.[EXPANDED_PROPERTY]), false);
  installExistingControlIntegration(node);
  globalThis.setTimeout?.(() => {
    installExistingControlIntegration(node);
    placeModuleLibraryBeforePromptLibrary(node);
    setModuleLibraryExpanded(
      node,
      Boolean(node.properties?.[EXPANDED_PROPERTY]),
      false,
    );
    resizeNode(node);
  }, 0);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.TxtModuleLibrary",
  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    if (isStandaloneNode(node)) installCompactWidgetSerialization(node);
    installConfigure(node);
    installModuleLibraryWidgets(node);
  },
  loadedGraphNode(node) {
    if (!isTargetNode(node) || !node.__vividMuseTxtModuleToggle) return;
    const targetNames = isStandaloneNode(node)
      ? []
      : Object.values(TARGET_WIDGETS);
    for (const targetName of targetNames) {
      setWidgetVisible(widgetByName(node, targetName), false);
    }
    placeModuleLibraryBeforePromptLibrary(node);
    syncModuleLibraryControls(node, false);
    setModuleLibraryExpanded(node, Boolean(node.properties?.[EXPANDED_PROPERTY]));
    installExistingControlIntegration(node);
  },
});
