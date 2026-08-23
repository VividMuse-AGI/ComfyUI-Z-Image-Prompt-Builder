import { app } from "../../scripts/app.js";

const NODE_CLASS = "VividMuse_ZImageChinesePromptBuilder";
const LIBRARY_PROPERTY = "vividMuseTxtPromptLibrary";
const EXPANDED_PROPERTY = "vividMuseTxtLibraryExpanded";
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_CHARACTERS = 1000000;
const MAX_ENTRIES = 500;
const MAX_PROMPT_CHARACTERS = 20000;
const EMPTY_VALUE = "请先导入TXT词库";
const INSERT_MODES = ["添加到后面", "添加到前面", "替换自由提示词"];

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

function setWidgetVisible(widget, visible) {
  if (!widget) return;
  if (!visible && !widget.__vividMuseTxtHidden) {
    widget.__vividMuseTxtOriginalType ??= widget.type;
    widget.__vividMuseTxtOriginalComputeSize ??= widget.computeSize;
    widget.__vividMuseTxtOriginalOptionsHidden = widget.options?.hidden;
    widget.options ??= {};
    widget.options.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
  } else if (visible && widget.__vividMuseTxtHidden) {
    widget.type = widget.__vividMuseTxtOriginalType;
    widget.computeSize = widget.__vividMuseTxtOriginalComputeSize;
    if (widget.options) {
      if (widget.__vividMuseTxtOriginalOptionsHidden === undefined) {
        delete widget.options.hidden;
      } else {
        widget.options.hidden = widget.__vividMuseTxtOriginalOptionsHidden;
      }
    }
  }
  widget.__vividMuseTxtHidden = !visible;
  widget.hidden = !visible;
}

function uniqueTitles(entries) {
  const counts = new Map();
  return entries.map((entry) => {
    const baseTitle = entry.title || "未命名提示词";
    const count = (counts.get(baseTitle) || 0) + 1;
    counts.set(baseTitle, count);
    return {
      ...entry,
      title: count === 1 ? baseTitle : `${baseTitle}（${count}）`,
    };
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
  return validateEntries(entries);
}

function libraryEntries(node) {
  const entries = node.properties?.[LIBRARY_PROPERTY]?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => (
    entry
    && typeof entry.title === "string"
    && typeof entry.prompt === "string"
    && Array.isArray(entry.tags)
  ));
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
  node.__vividMuseTxtLibraryToggle.name = entries.length
    ? `📚 TXT用户词库（${fileName || "未命名"} · ${entries.length}条）`
    : "📚 TXT用户词库";
  if (resize) resizeNode(node);
  markDirty(node);
}

function setTxtLibraryExpanded(node, expanded, resize = true) {
  node.properties ??= {};
  node.properties[EXPANDED_PROPERTY] = Boolean(expanded);
  for (const widget of node.__vividMuseTxtLibraryControls || []) {
    setWidgetVisible(widget, Boolean(expanded));
  }
  if (resize) resizeNode(node);
  markDirty(node);
}

function notifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("VividMuse TXT prompt library:", error);
  globalThis.alert?.(message);
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
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importTxtPromptFile(node, file);
    } catch (error) {
      notifyError(error);
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
  node.onConfigure = function (info) {
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

  node.__vividMuseTxtLibraryToggle = toggle;
  node.__vividMuseTxtLibraryEntryWidget = entryWidget;
  node.__vividMuseTxtLibraryModeWidget = modeWidget;
  node.__vividMuseTxtLibraryControls = [
    importButton,
    entryWidget,
    modeWidget,
    applyButton,
    clearFreePromptButton,
    clearButton,
  ];
  for (const widget of [toggle, ...node.__vividMuseTxtLibraryControls]) {
    moveWidgetBefore(node, widget, freePromptWidget);
  }
  syncTxtLibraryControls(node, false);
  setTxtLibraryExpanded(node, Boolean(node.properties?.[EXPANDED_PROPERTY]), false);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.TxtLibrary",
  nodeCreated(node) {
    const isTarget = node.comfyClass === NODE_CLASS || node.constructor?.type === NODE_CLASS;
    if (!isTarget) return;
    installTxtLibraryConfigure(node);
    installTxtLibraryWidgets(node);
  },
  loadedGraphNode(node) {
    const isTarget = node.comfyClass === NODE_CLASS || node.constructor?.type === NODE_CLASS;
    if (!isTarget || !node.__vividMuseTxtLibraryToggle) return;
    syncTxtLibraryControls(node, false);
    setTxtLibraryExpanded(node, Boolean(node.properties?.[EXPANDED_PROPERTY]));
  },
});
