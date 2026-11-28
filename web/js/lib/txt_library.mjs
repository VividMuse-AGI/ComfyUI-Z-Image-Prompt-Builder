import { app } from "../../../scripts/app.js";
import {
  addHelperWidget,
  installCompactWidgetSerialization,
  moveWidgetBefore,
  notifyUserError,
  resizeNode,
  setWidgetVisibilityReason,
  widgetByName,
} from "./widget_utils.mjs";

const NODE_CLASSES = new Set([
  "VividMuse_ZImageChinesePromptBuilder",
  "VividMuse_ZImageTxtPromptLibrary",
]);
const STANDALONE_NODE_CLASS = "VividMuse_ZImageTxtPromptLibrary";

function isTargetNode(node) {
  return NODE_CLASSES.has(node.comfyClass || node.constructor?.type);
}

function isStandaloneNode(node) {
  return (node.comfyClass || node.constructor?.type) === STANDALONE_NODE_CLASS;
}

const LIBRARY_PROPERTY = "vividMuseTxtPromptLibrary";
const EXPANDED_PROPERTY = "vividMuseTxtLibraryExpanded";
const VISIBILITY_REASON = "txt-library";
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_CHARACTERS = 1000000;
const MAX_ENTRIES = 500;
const MAX_PROMPT_CHARACTERS = 20000;
const EMPTY_VALUE = "请先导入TXT词库";
const INSERT_MODES = ["添加到后面", "添加到前面", "替换自由提示词"];

function markDirty(node) {
  globalThis.__vividMusePromptDiagnostics?.refresh(node);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function uniqueTitles(entries) {
  const baseTitle = (entry) => entry.title || "未命名提示词";
  const reserved = new Set(entries.map(baseTitle));
  const used = new Set();
  const counts = new Map();
  return entries.map((entry) => {
    const base = baseTitle(entry);
    let title = base;
    let count = counts.get(base) || 1;
    if (used.has(title)) {
      do {
        title = `${base}（${++count}）`;
      } while (used.has(title) || reserved.has(title));
    }
    counts.set(base, count);
    used.add(title);
    return { ...entry, title };
  });
}

function validateEntries(entries) {
  const valid = entries.filter((entry) => entry.prompt.length > 0);
  if (!valid.length) throw new Error("TXT文件中没有可用的提示词。");
  if (valid.length > MAX_ENTRIES) {
    throw new Error(`TXT词库最多支持${MAX_ENTRIES}条提示词。`);
  }
  if (valid.some((entry) => entry.prompt.length > MAX_PROMPT_CHARACTERS)) {
    throw new Error(`单条提示词不能超过${MAX_PROMPT_CHARACTERS}个字符。`);
  }
  return uniqueTitles(valid);
}

function parseTxtPromptLibrary(text) {
  if (typeof text !== "string") throw new Error("TXT词库内容必须是文本。");
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (normalized.length > MAX_CHARACTERS) {
    throw new Error("TXT词库内容超过1MB字符上限。");
  }

  if (!/^\s*##\s+\S+/mu.test(normalized)) {
    return validateEntries(normalized
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line !== "---" && !line.startsWith("#"))
      .map((prompt) => ({
        title: prompt.length > 24 ? `${prompt.slice(0, 24)}…` : prompt,
        tags: [],
        prompt,
      })));
  }

  const entries = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    while (current.body[0]?.trim() === "") current.body.shift();
    while (current.body.at(-1)?.trim() === "") current.body.pop();
    const prompt = current.body.join("\n");
    if (prompt) entries.push({ title: current.title, tags: current.tags, prompt });
    current = null;
  };

  for (const line of normalized.split("\n")) {
    const heading = line.match(/^\s*##\s+(.+?)\s*$/u);
    if (heading) {
      flush();
      current = { title: heading[1], tags: [], body: [] };
      continue;
    }
    if (line.trim() === "---") {
      flush();
      continue;
    }
    if (!current) continue;
    const tagLine = line.match(/^\s*(?:标签|tags?)\s*[:：]\s*(.*?)\s*$/iu);
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
  return validateEntries(entries);
}

function libraryEntries(node) {
  const entries = node.properties?.[LIBRARY_PROPERTY]?.entries;
  if (!Array.isArray(entries)) return [];
  return uniqueTitles(entries.filter((entry) => (
    entry
    && typeof entry.title === "string"
    && typeof entry.prompt === "string"
    && Array.isArray(entry.tags)
  )));
}

function syncTxtLibraryControls(node, resize = true) {
  const entryWidget = node.__vividMuseTxtLibraryEntryWidget;
  if (!entryWidget) return;
  const entries = libraryEntries(node);
  const values = entries.length ? entries.map((entry) => entry.title) : [EMPTY_VALUE];
  entryWidget.options ??= {};
  entryWidget.options.values = values;
  if (!values.includes(entryWidget.value)) entryWidget.value = values[0];

  const fileName = node.properties?.[LIBRARY_PROPERTY]?.fileName;
  // Keep the identity stable: Nodes 2.0 keys widget state by name.
  node.__vividMuseTxtLibraryToggle.label = node.__vividMuseTxtLibraryToggle.__vividMuseDisplayText = entries.length
    ? `📚 TXT用户词库（${fileName || "未命名"} · ${entries.length}条）`
    : "📚 TXT用户词库";
  globalThis.__vividMuseZImageI18n?.localizeNode?.(node);
  node.__vividMuseTxtSelectionRefresh?.();
  if (resize) resizeNode(node);
  markDirty(node);
}

function setTxtLibraryExpanded(node, expanded, resize = true) {
  node.properties ??= {};
  node.properties[EXPANDED_PROPERTY] = Boolean(expanded);
  for (const widget of node.__vividMuseTxtLibraryControls || []) {
    setWidgetVisibilityReason(widget, VISIBILITY_REASON, Boolean(expanded));
  }
  node.__vividMuseTxtSelectionRefresh?.();
  if (resize) resizeNode(node);
  markDirty(node);
}

function notifyError(error) {
  console.error("VividMuse TXT prompt library:", error);
  notifyUserError(error, "VividMuse TXT Prompt Library");
}

async function importTxtPromptFile(node, file) {
  if (!file || !/\.txt$/iu.test(file.name || "")) {
    throw new Error("只支持导入.txt文本文件。");
  }
  if (Number(file.size) > MAX_FILE_BYTES) {
    throw new Error("TXT词库文件不能超过1MB。");
  }
  const entries = parseTxtPromptLibrary(await file.text());
  node.properties ??= {};
  node.properties[LIBRARY_PROPERTY] = {
    version: 1,
    fileName: String(file.name),
    entries,
  };
  syncTxtLibraryControls(node, false);
  setTxtLibraryExpanded(node, true);
  return entries;
}

function chooseTxtPromptFile(node) {
  if (!globalThis.document?.createElement) {
    notifyError(new Error("当前环境不支持文件选择器。"));
    return;
  }
  const input = globalThis.document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.multiple = false;
  input.hidden = true;
  globalThis.document.body?.append(input);
  input.oncancel = () => input.remove?.();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) {
      input.remove?.();
      return;
    }
    try {
      await importTxtPromptFile(node, file);
    } catch (error) {
      notifyError(error);
    } finally {
      input.remove?.();
    }
  };
  input.click();
}

function joinFragments(left, right) {
  if (left === "") return right;
  if (right === "") return left;
  const separator = /[，。；;,.!?！？]$/u.test(left.trimEnd()) || /[\r\n]$/u.test(left)
    ? ""
    : "；";
  return `${left}${separator}${right}`;
}

function applySelectedTxtPrompt(node) {
  if (isStandaloneNode(node) && widgetByName(node, "选择模式")?.value === "随机抽取") return false;
  const freePromptWidget = widgetByName(node, "自由提示词");
  const entryWidget = node.__vividMuseTxtLibraryEntryWidget;
  const modeWidget = node.__vividMuseTxtLibraryModeWidget;
  if (!freePromptWidget || !entryWidget || !modeWidget) return false;
  const selected = libraryEntries(node).find((entry) => entry.title === entryWidget.value);
  if (!selected) {
    notifyError(new Error("请先导入并选择一条提示词。"));
    return false;
  }

  const current = typeof freePromptWidget.value === "string" ? freePromptWidget.value : "";
  if (modeWidget.value === "替换自由提示词") {
    freePromptWidget.value = selected.prompt;
  } else if (modeWidget.value === "添加到前面") {
    freePromptWidget.value = joinFragments(selected.prompt, current);
  } else {
    freePromptWidget.value = joinFragments(current, selected.prompt);
  }
  freePromptWidget.callback?.(freePromptWidget.value);
  markDirty(node);
  return true;
}

function clearTxtPromptLibrary(node) {
  if (node.properties) delete node.properties[LIBRARY_PROPERTY];
  syncTxtLibraryControls(node);
}

function clearFreePrompt(node) {
  if (isStandaloneNode(node) && widgetByName(node, "选择模式")?.value === "随机抽取") return false;
  const freePromptWidget = widgetByName(node, "自由提示词");
  if (!freePromptWidget) return false;
  freePromptWidget.value = "";
  freePromptWidget.callback?.(freePromptWidget.value);
  markDirty(node);
  return true;
}

function installTxtLibraryConfigure(node) {
  if (node.__vividMuseTxtLibraryConfigure) return;
  const originalOnConfigure = node.onConfigure;
  node.onConfigure = function () {
    const result = originalOnConfigure?.apply(this, arguments);
    syncTxtLibraryControls(node, false);
    setTxtLibraryExpanded(
      node,
      Boolean(node.properties?.[EXPANDED_PROPERTY]),
      false,
    );
    return result;
  };
  node.__vividMuseTxtLibraryConfigure = true;
}

function installTxtLibraryWidgets(node) {
  if (node.__vividMuseTxtLibraryToggle) {
    syncTxtLibraryControls(node, false);
    return;
  }
  const freePromptWidget = widgetByName(node, "自由提示词");
  if (!freePromptWidget) return;

  const toggle = addHelperWidget(
    node,
    "button",
    "📚 TXT用户词库",
    null,
    () => setTxtLibraryExpanded(node, !Boolean(node.properties?.[EXPANDED_PROPERTY])),
  );
  const importButton = addHelperWidget(
    node, "button", "导入TXT词库", null, () => chooseTxtPromptFile(node),
  );
  const entryWidget = addHelperWidget(
    node,
    "combo",
    "词库条目",
    EMPTY_VALUE,
    () => markDirty(node),
    { values: [EMPTY_VALUE] },
  );
  const modeWidget = addHelperWidget(
    node,
    "combo",
    "词库加入方式",
    INSERT_MODES[0],
    () => markDirty(node),
    { values: INSERT_MODES },
  );
  const applyButton = addHelperWidget(
    node, "button", "添加到自由提示词", null, () => applySelectedTxtPrompt(node),
  );
  const clearFreePromptButton = addHelperWidget(
    node, "button", "清空自由提示词", null, () => clearFreePrompt(node),
  );
  const clearButton = addHelperWidget(
    node, "button", "清除已导入词库", null, () => clearTxtPromptLibrary(node),
  );
  clearButton.label = clearButton.__vividMuseDisplayText = "移除 TXT 用户词库";
  clearButton.tooltip = "移除导入的完整提示词条目列表；保留已写入的自由提示词。";
  clearFreePromptButton.tooltip = "仅清空自由提示词；保留结构化内容、已导入词库和前置输入。";

  node.__vividMuseTxtLibraryToggle = toggle;
  node.__vividMuseTxtLibraryEntryWidget = entryWidget;
  node.__vividMuseTxtLibraryModeWidget = modeWidget;
  node.__vividMuseTxtLibraryControls = [
    importButton,
    entryWidget,
    modeWidget,
    applyButton,
    ...(isStandaloneNode(node) ? [clearFreePromptButton] : []),
    clearButton,
  ];
  for (const widget of [toggle, ...node.__vividMuseTxtLibraryControls]) {
    moveWidgetBefore(node, widget, freePromptWidget);
  }
  if (!isStandaloneNode(node)) {
    node.widgets.splice(node.widgets.indexOf(clearFreePromptButton), 1);
    node.widgets.splice(node.widgets.indexOf(freePromptWidget) + 1, 0, clearFreePromptButton);
  }
  syncTxtLibraryControls(node, false);
  setTxtLibraryExpanded(node, Boolean(node.properties?.[EXPANDED_PROPERTY]), false);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.TxtLibrary",
  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    node.__vividMusePromptDiscovery = {
      entries: () => libraryEntries(node),
      fileName: () => node.properties?.[LIBRARY_PROPERTY]?.fileName || "",
      apply: (entry) => {
        if (isStandaloneNode(node) && widgetByName(node, "选择模式")?.value === "随机抽取") return false;
        if (!libraryEntries(node).some((item) => item.title === entry.title && item.prompt === entry.prompt)) {
          return false;
        }
        node.__vividMuseTxtLibraryEntryWidget.value = entry.title;
        return applySelectedTxtPrompt(node);
      },
    };
    if (isStandaloneNode(node)) node.__vividMuseTxtSelectionEntries = () => libraryEntries(node);
    if (isStandaloneNode(node)) installCompactWidgetSerialization(node);
    installTxtLibraryConfigure(node);
    installTxtLibraryWidgets(node);
  },
  loadedGraphNode(node) {
    if (!isTargetNode(node) || !node.__vividMuseTxtLibraryToggle) return;
    syncTxtLibraryControls(node, false);
    setTxtLibraryExpanded(node, Boolean(node.properties?.[EXPANDED_PROPERTY]));
  },
});
