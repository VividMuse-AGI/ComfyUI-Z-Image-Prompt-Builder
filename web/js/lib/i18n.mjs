import { app } from "../../../scripts/app.js";

const SETTING_ID = "VividMuse.ZImagePromptBuilder.InterfaceLanguage";
const NODE_TITLES_ZH = {
  VividMuse_ZImageChinesePromptBuilder: "Z-Image 中文提示词生成器",
  VividMuse_ZImageCanvasModule: "Z-Image 画面基础",
  VividMuse_ZImagePersonModule: "Z-Image 人物",
  VividMuse_ZImageHairModule: "Z-Image 发型",
  VividMuse_ZImageClothingModule: "Z-Image 服装",
  VividMuse_ZImagePoseModule: "Z-Image 姿态动作",
  VividMuse_ZImageSceneModule: "Z-Image 场景",
  VividMuse_ZImageCameraModule: "Z-Image 摄影",
  VividMuse_ZImageVisualModule: "Z-Image 视觉表现",
  VividMuse_ZImageTxtPromptLibrary: "Z-Image TXT提示词库",
  VividMuse_ZImageTxtModuleLibrary: "Z-Image TXT模块词库",
};
const TARGET_CLASSES = new Set(Object.keys(NODE_TITLES_ZH));

let selectedLanguage = "auto";
let catalogCache = globalThis.__vividMuseTestEnCatalog || null;
let catalogPromise = null;
const knownDefinitions = new Map();
const knownNodeTypes = new Map();
let libraryDefinitions = null;

function comfySetting(id, fallback) {
  try {
    return app.ui?.settings?.getSettingValue?.(id, fallback) ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function activeLanguage() {
  if (selectedLanguage === "zh" || selectedLanguage === "en") {
    return selectedLanguage;
  }
  const comfyLocale = String(
    comfySetting("Comfy.Locale", globalThis.navigator?.language || "en"),
  ).toLowerCase();
  return comfyLocale.startsWith("zh") ? "zh" : "en";
}

function getCatalog() {
  return catalogCache || globalThis.__vividMuseTestEnCatalog || null;
}

async function ensureCatalog() {
  const existing = getCatalog();
  if (existing) {
    catalogCache = existing;
    return existing;
  }
  if (!catalogPromise) {
    catalogPromise = (async () => {
      if (typeof globalThis.fetch !== "function") return null;
      const url = new URL("../data/i18n_catalog.json", import.meta.url);
      const response = await globalThis.fetch(url);
      if (!response?.ok) {
        throw new Error(`Failed to load i18n catalog (${response?.status})`);
      }
      catalogCache = await response.json();
      return catalogCache;
    })().catch((error) => {
      catalogPromise = null;
      console.warn("VividMuse i18n: unable to load English catalog", error);
      return null;
    });
  }
  return catalogPromise;
}

function nodeClass(node) {
  return node?.comfyClass || node?.constructor?.type || "";
}

function isTargetNode(node) {
  return TARGET_CLASSES.has(nodeClass(node));
}

function remember(object, key, value) {
  if (!object || Object.hasOwn(object, key)) return;
  try {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: false,
      writable: true,
      value,
    });
  } catch (_error) {
    object[key] = value;
  }
}

function translateStatus(status) {
  if (status === "未设置") return "Not Set";
  if (status === "已有内容") return "Has Content";
  return status;
}

function englishDynamicWidgetLabel(name, catalog) {
  let match = /^📚 TXT用户词库（(.+) · (\d+)条）$/u.exec(name);
  if (match) {
    const fileName = match[1] === "未命名" ? "Untitled" : match[1];
    return `📚 TXT Prompt Library (${fileName} · ${match[2]} entries)`;
  }

  match = /^🧩 TXT模块词库（(.+) · (\d+)条）$/u.exec(name);
  if (match) {
    const fileName = match[1] === "未命名" ? "Untitled" : match[1];
    return `🧩 TXT Module Library (${fileName} · ${match[2]} entries)`;
  }

  match = /^应用到(.+)模块（当前：(.+)）$/u.exec(name);
  if (match) {
    const moduleLabel = catalog?.moduleLabels?.[match[1]] || match[1];
    return `Apply to ${moduleLabel} Module (Current: ${translateStatus(match[2])})`;
  }

  match = /^启用自定义模块（当前：(.+)）$/u.exec(name);
  if (match) {
    return `Enable Custom Module (Current: ${translateStatus(match[1])})`;
  }
  return undefined;
}

function englishWidgetLabel(widget, catalog) {
  if (widget.serialize === false && typeof widget.__vividMuseDisplayText === "string") {
    const text = widget.__vividMuseDisplayText;
    return catalog?.uiLabels?.[text] || englishDynamicWidgetLabel(text, catalog) || text;
  }
  return catalog?.widgetLabels?.[widget.name]
    || catalog?.uiLabels?.[widget.name]
    || englishDynamicWidgetLabel(widget.name, catalog)
    || widget.name;
}

function installOptionLabeler(widget) {
  if (!widget?.options) return;
  if (!widget.__vividMuseI18nOptionLabeler) {
    remember(
      widget,
      "__vividMuseI18nOriginalOptionLabeler",
      widget.options.getOptionLabel,
    );
    widget.__vividMuseI18nOptionLabeler = true;
  }
  const language = activeLanguage();
  const catalog = getCatalog();
  widget.options.getOptionLabel = (value) => {
    const raw = value === null || value === undefined ? "" : String(value);
    const original = widget.__vividMuseI18nOriginalOptionLabeler;
    if (language === "en" && catalog) {
      const translated = catalog.optionLabels?.[widget.name]?.[raw];
      if (translated) return translated;
    }
    if (typeof original === "function") {
      try {
        return original(value) || raw;
      } catch (error) {
        console.warn("VividMuse i18n: option labeler failed", error);
      }
    }
    return raw;
  };
}

function localizeWidget(widget, language, catalog) {
  if (!widget) return;
  if (widget.serialize === false && typeof widget.__vividMuseLocalizedValue === "function") {
    widget.value = widget.__vividMuseLocalizedValue(language);
  }
  remember(widget, "__vividMuseI18nOriginalTooltip", widget.tooltip);
  widget.label = widget.__vividMuseDynamicLabel?.(language)
    ?? (language === "en" && catalog ? englishWidgetLabel(widget, catalog)
      : (widget.serialize === false ? widget.__vividMuseDisplayText : undefined) ?? widget.name);
  if (language === "en" && catalog?.tooltips?.[widget.name]) {
    widget.tooltip = catalog.tooltips[widget.name];
  } else if (language === "zh") {
    widget.tooltip = widget.__vividMuseI18nOriginalTooltip;
  }
  installOptionLabeler(widget);
  const inputEl = widget.inputEl;
  if (inputEl && typeof inputEl.placeholder === "string") {
    remember(inputEl, "__vividMuseI18nOriginalPlaceholder", inputEl.placeholder);
    const original = inputEl.__vividMuseI18nOriginalPlaceholder;
    const translated = catalog?.widgetLabels?.[original] || catalog?.uiLabels?.[original];
    if (translated) inputEl.placeholder = language === "en" ? translated : original;
  }
}

function refreshNode2Widgets(node) {
  if (!Array.isArray(node?.widgets)) return;
  const marker = {
    name: "__vividMuseI18nRefreshMarker",
    type: "hidden",
    hidden: true,
    options: { hidden: true, serialize: false },
  };
  node.widgets.push(marker);
  node.widgets.pop();
  for (const widget of node.widgets) widget.triggerDraw?.();
}

function localizeNode(node) {
  if (!isTargetNode(node)) return;
  const language = activeLanguage();
  const catalog = getCatalog();
  if (language === "en" && !catalog) {
    ensureCatalog().then((loaded) => {
      if (loaded) localizeAllNodes();
    });
    return;
  }
  const className = nodeClass(node);
  const zhTitle = NODE_TITLES_ZH[className];
  const enTitle = catalog?.nodeTitles?.[className];

  const canonicalTitles = new Set([zhTitle, enTitle].filter(Boolean));
  if (canonicalTitles.has(node.title)) {
    node.title = language === "en" && enTitle ? enTitle : zhTitle;
  }

  for (const widget of node.widgets || []) localizeWidget(widget, language, catalog);
  let slotsChanged = false;
  for (const input of node.inputs || []) {
    const label = language === "en"
      ? catalog?.widgetLabels?.[input.name] || input.name
      : input.name;
    slotsChanged ||= input.label !== label;
    input.label = label;
  }
  for (const output of node.outputs || []) {
    const label = language === "en"
      ? catalog?.outputLabels?.[output.name] || output.name
      : output.name;
    slotsChanged ||= output.label !== label;
    output.label = label;
  }

  if (slotsChanged && node.graph && node.id != null) {
    node.graph.trigger?.("node:slot-label:changed", { nodeId: node.id });
  }
  refreshNode2Widgets(node);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function allGraphNodes() {
  const pendingGraphs = [app.graph, app.rootGraph].filter(Boolean);
  const nodes = [];
  const seenGraphs = new Set();
  while (pendingGraphs.length) {
    const graph = pendingGraphs.pop();
    if (!graph || seenGraphs.has(graph)) continue;
    seenGraphs.add(graph);
    for (const node of graph._nodes || graph.nodes || []) {
      nodes.push(node);
      const subgraph = node.subgraph || node.graphData;
      if (subgraph && !seenGraphs.has(subgraph)) pendingGraphs.push(subgraph);
    }
  }
  return [...new Set(nodes)];
}

function localizeAllNodes() {
  for (const definition of knownDefinitions.values()) localizeDefinition(definition);
  for (const [name, nodeType] of knownNodeTypes) {
    const definition = knownDefinitions.get(name);
    nodeType.title = definition.display_name;
    nodeType.category = definition.category;
  }
  if (libraryDefinitions && typeof app.updateVueAppNodeDefs === "function") {
    app.updateVueAppNodeDefs(Object.fromEntries(
      libraryDefinitions.map((definition) => [definition.name, definition]),
    ));
  }
  for (const node of allGraphNodes()) localizeNode(node);
}

function inputSpecs(nodeData) {
  return [
    ...Object.entries(nodeData?.input?.required || {}),
    ...Object.entries(nodeData?.input?.optional || {}),
  ];
}

function localizeDefinition(nodeData) {
  if (!nodeData || !TARGET_CLASSES.has(nodeData.name)) return;
  const language = activeLanguage();
  const catalog = getCatalog();
  if (language === "en" && !catalog) {
    ensureCatalog().then((loaded) => {
      if (loaded) localizeAllNodes();
    });
    return;
  }
  remember(nodeData, "__vividMuseI18nOriginalDisplayName", nodeData.display_name);
  remember(nodeData, "__vividMuseI18nOriginalDescription", nodeData.description);
  remember(nodeData, "__vividMuseI18nOriginalCategory", nodeData.category);

  if (language === "en" && catalog) {
    nodeData.display_name = catalog.nodeTitles?.[nodeData.name] || nodeData.__vividMuseI18nOriginalDisplayName;
    nodeData.description = catalog.nodeDescriptions?.[nodeData.name]
      || nodeData.description;
    nodeData.category = catalog.categoryLabels?.[nodeData.category]
      || nodeData.category;
  } else {
    nodeData.display_name = nodeData.__vividMuseI18nOriginalDisplayName;
    nodeData.description = nodeData.__vividMuseI18nOriginalDescription;
    nodeData.category = nodeData.__vividMuseI18nOriginalCategory;
  }

  for (const [name, spec] of inputSpecs(nodeData)) {
    if (!Array.isArray(spec)) continue;
    spec[1] ??= {};
    remember(spec[1], "__vividMuseI18nOriginalDisplayName", spec[1].display_name);
    remember(spec[1], "__vividMuseI18nOriginalTooltip", spec[1].tooltip);
    if (language === "en" && catalog) {
      spec[1].display_name = catalog.widgetLabels?.[name] || name;
      if (catalog.tooltips?.[name]) spec[1].tooltip = catalog.tooltips[name];
    } else {
      spec[1].display_name = spec[1].__vividMuseI18nOriginalDisplayName;
      spec[1].tooltip = spec[1].__vividMuseI18nOriginalTooltip;
    }
  }
}

function translateMessage(message) {
  if (activeLanguage() !== "en") return String(message);
  const catalog = getCatalog();
  const text = String(message);
  const catalogLabel = catalog?.widgetLabels?.[text] || catalog?.uiLabels?.[text]
    || catalog?.moduleLabels?.[text];
  if (catalogLabel) return catalogLabel;
  const exact = {
    "当前范围没有候选": "No candidates in the current scope",
    "已抽取": "Selected",
    "候选数量": "Candidate Count",
    "关闭": "Close",
    "界面种子须为0至9007199254740991的整数；更大整数请使用API。": "Editor seeds must be integers from 0 to 9007199254740991; use the API for larger integers.",
    "当前环境不支持文件选择器。": "The current environment does not support a file picker.",
    "只支持导入.txt文本文件。": "Only .txt prompt-library files are supported.",
    "TXT词库文件不能超过1MB。": "The TXT prompt library cannot exceed 1 MB.",
    "TXT词库内容必须是文本。": "TXT prompt-library content must be text.",
    "TXT词库内容超过1MB字符上限。": "TXT prompt-library content exceeds the 1 MB character limit.",
    "TXT文件中没有可用的提示词。": "The TXT file contains no usable prompts.",
    "只支持导入.txt模块词库文件。": "Only .txt module-library files are supported.",
    "TXT模块词库文件不能超过1MB。": "The TXT module library cannot exceed 1 MB.",
    "TXT模块词库内容必须是文本。": "TXT module-library content must be text.",
    "TXT模块词库内容超过1MB字符上限。": "TXT module-library content exceeds the 1 MB character limit.",
    "模块词库必须使用“## 标题”分块格式。": "A module library must use the '## Title' block format.",
    "TXT模块词库中没有可用条目。": "The TXT module library contains no usable entries.",
    "请先导入并选择一条提示词。": "Import a TXT prompt library and select an entry first.",
    "请先导入并选择当前模块的一条提示词。": "Import a TXT module library and select an entry for the current module first.",
  };
  if (exact[text]) return exact[text];
  const patterns = [
    [/^TXT词库最多支持(\d+)条提示词。$/u, "A TXT prompt library supports at most $1 entries."],
    [/^单条提示词不能超过(\d+)个字符。$/u, "A prompt cannot exceed $1 characters."],
    [/^TXT模块词库最多支持(\d+)条提示词。$/u, "A TXT module library supports at most $1 entries."],
    [/^单条模块提示词不能超过(\d+)个字符。$/u, "A module prompt cannot exceed $1 characters."],
    [/^条目“(.+)”缺少有效的“模块：模块名称”。$/u, "Entry '$1' is missing a valid 'Module: name' line."],
    [/^条目“(.+)”没有提示词正文。$/u, "Entry '$1' has no prompt body."],
  ];
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}

globalThis.__vividMuseZImageI18n = {
  activeLanguage,
  getCatalog,
  ensureCatalog,
  localizeNode,
  localizeAllNodes,
  translateMessage,
};

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.I18n",
  init() {
    const settings = app.ui?.settings;
    selectedLanguage = String(
      settings?.getSettingValue?.(SETTING_ID, "auto") || "auto",
    );
    if (settings?.addSetting && !settings.settingsLookup?.[SETTING_ID]) {
      settings.addSetting({
        id: SETTING_ID,
        name: "Z-Image Prompt Builder: Interface language / 界面语言",
        type: "combo",
        options: [
          { value: "auto", text: "Auto / 自动" },
          { value: "zh", text: "中文" },
          { value: "en", text: "English" },
        ],
        defaultValue: "auto",
        onChange(value) {
          selectedLanguage = String(value || "auto");
          if (activeLanguage() === "en" && !getCatalog()) {
            return ensureCatalog().then(() => localizeAllNodes());
          }
          localizeAllNodes();
          return undefined;
        },
      });
    }
    if (activeLanguage() === "en") {
      if (!getCatalog()) {
        return ensureCatalog().then(() => localizeAllNodes());
      }
      localizeAllNodes();
    }
    return undefined;
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (!TARGET_CLASSES.has(nodeData?.name)) return;
    knownDefinitions.set(nodeData.name, nodeData);
    knownNodeTypes.set(nodeData.name, nodeType);
    localizeDefinition(nodeData);
    if (activeLanguage() === "en" && !getCatalog()) {
      ensureCatalog().then(() => localizeAllNodes());
    }
  },
  beforeRegisterVueAppNodeDefs(definitions) {
    libraryDefinitions = definitions;
    for (const definition of definitions) localizeDefinition(definition);
  },
  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    localizeNode(node);
    if (activeLanguage() === "en" && !getCatalog()) {
      ensureCatalog().then(() => localizeAllNodes());
    }
    globalThis.setTimeout?.(() => localizeNode(node), 0);
  },
  loadedGraphNode(node) {
    if (!isTargetNode(node)) return;
    localizeNode(node);
    if (activeLanguage() === "en" && !getCatalog()) {
      ensureCatalog().then(() => localizeAllNodes());
    }
    globalThis.setTimeout?.(() => localizeNode(node), 0);
  },
});
