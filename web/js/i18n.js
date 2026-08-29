import { app } from "../../scripts/app.js";
import { EN_CATALOG } from "./i18n_catalog.js";

const SETTING_ID = "VividMuse.ZImagePromptBuilder.InterfaceLanguage";
const TARGET_CLASSES = new Set(Object.keys(EN_CATALOG.nodeTitles));
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

let selectedLanguage = "auto";
const knownDefinitions = new Map();

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

function englishDynamicWidgetLabel(name) {
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
    const moduleLabel = EN_CATALOG.moduleLabels[match[1]] || match[1];
    return `Apply to ${moduleLabel} Module (Current: ${translateStatus(match[2])})`;
  }

  match = /^启用自定义模块（当前：(.+)）$/u.exec(name);
  if (match) {
    return `Enable Custom Module (Current: ${translateStatus(match[1])})`;
  }
  return undefined;
}

function englishWidgetLabel(widget) {
  return EN_CATALOG.widgetLabels[widget.name]
    || EN_CATALOG.uiLabels[widget.name]
    || englishDynamicWidgetLabel(widget.name)
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
  widget.options.getOptionLabel = (value) => {
    const raw = value === null || value === undefined ? "" : String(value);
    const original = widget.__vividMuseI18nOriginalOptionLabeler;
    if (language === "en") {
      const translated = EN_CATALOG.optionLabels[widget.name]?.[raw];
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

function localizeWidget(widget, language) {
  if (!widget) return;
  remember(widget, "__vividMuseI18nOriginalTooltip", widget.tooltip);
  widget.label = language === "en" ? englishWidgetLabel(widget) : widget.name;
  if (language === "en" && EN_CATALOG.tooltips[widget.name]) {
    widget.tooltip = EN_CATALOG.tooltips[widget.name];
  } else if (language === "zh") {
    widget.tooltip = widget.__vividMuseI18nOriginalTooltip;
  }
  installOptionLabeler(widget);
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
  const className = nodeClass(node);
  const zhTitle = NODE_TITLES_ZH[className];
  const enTitle = EN_CATALOG.nodeTitles[className];

  const canonicalTitles = new Set([zhTitle, enTitle]);
  if (canonicalTitles.has(node.title)) {
    node.title = language === "en" ? enTitle : zhTitle;
  }

  for (const widget of node.widgets || []) localizeWidget(widget, language);
  for (const input of node.inputs || []) {
    input.label = language === "en"
      ? EN_CATALOG.widgetLabels[input.name] || input.name
      : input.name;
  }
  for (const output of node.outputs || []) {
    output.label = language === "en"
      ? EN_CATALOG.outputLabels[output.name] || output.name
      : output.name;
  }

  refreshNode2Widgets(node);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function allGraphNodes() {
  const roots = [app.graph, app.rootGraph].filter(Boolean);
  const nodes = [];
  const seenGraphs = new Set();
  for (const graph of roots) {
    if (seenGraphs.has(graph)) continue;
    seenGraphs.add(graph);
    for (const node of graph._nodes || graph.nodes || []) {
      nodes.push(node);
      const subgraph = node.subgraph || node.graphData;
      if (subgraph && !seenGraphs.has(subgraph)) {
        seenGraphs.add(subgraph);
        nodes.push(...(subgraph._nodes || subgraph.nodes || []));
      }
    }
  }
  return [...new Set(nodes)];
}

function localizeAllNodes() {
  for (const node of allGraphNodes()) localizeNode(node);
  for (const definition of knownDefinitions.values()) localizeDefinition(definition);
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
  remember(nodeData, "__vividMuseI18nOriginalDisplayName", nodeData.display_name);
  remember(nodeData, "__vividMuseI18nOriginalDescription", nodeData.description);
  remember(nodeData, "__vividMuseI18nOriginalCategory", nodeData.category);

  if (language === "en") {
    nodeData.display_name = EN_CATALOG.nodeTitles[nodeData.name];
    nodeData.description = EN_CATALOG.nodeDescriptions[nodeData.name]
      || nodeData.description;
    nodeData.category = EN_CATALOG.categoryLabels[nodeData.category]
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
    if (language === "en") {
      spec[1].display_name = EN_CATALOG.widgetLabels[name] || name;
      if (EN_CATALOG.tooltips[name]) spec[1].tooltip = EN_CATALOG.tooltips[name];
    } else {
      spec[1].display_name = spec[1].__vividMuseI18nOriginalDisplayName;
      spec[1].tooltip = spec[1].__vividMuseI18nOriginalTooltip;
    }
  }
}

function translateMessage(message) {
  if (activeLanguage() !== "en") return String(message);
  const text = String(message);
  const exact = {
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
          localizeAllNodes();
        },
      });
    }
  },
  beforeRegisterNodeDef(_nodeType, nodeData) {
    if (!TARGET_CLASSES.has(nodeData?.name)) return;
    knownDefinitions.set(nodeData.name, nodeData);
    localizeDefinition(nodeData);
  },
  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    localizeNode(node);
    globalThis.setTimeout?.(() => localizeNode(node), 0);
  },
  loadedGraphNode(node) {
    if (!isTargetNode(node)) return;
    localizeNode(node);
    globalThis.setTimeout?.(() => localizeNode(node), 0);
  },
});
