import { app } from "../../scripts/app.js";
import { EN_CATALOG } from "./i18n_catalog.js";
import { LIBRARY_CATALOG } from "./library_catalog.js";
import { filterRecords, makeTxtRecords, LibraryPreferences } from "./library_discovery_core.js";

const FULL = "VividMuse_ZImageChinesePromptBuilder";
const MODULES = {
  VividMuse_ZImageCanvasModule: "画面基础", VividMuse_ZImagePersonModule: "人物",
  VividMuse_ZImageHairModule: "发型", VividMuse_ZImageClothingModule: "服装",
  VividMuse_ZImagePoseModule: "姿态动作", VividMuse_ZImageSceneModule: "场景",
  VividMuse_ZImageCameraModule: "摄影", VividMuse_ZImageVisualModule: "视觉表现",
};
const classOf = node => node.comfyClass || node.constructor?.type;
const widget = (node, name) => node.widgets?.find(w => w.name === name);
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;
const english = () => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en";
const moduleLabel = name => english() ? EN_CATALOG.moduleLabels[name] || name : name;
const buttonName = "🔎 素材搜索与收藏";
let preferences;
let currentDialog;
let dialogOwner;
function prefs() {
  if (!preferences) {
    let storage;
    try { storage = globalThis.localStorage; } catch (_) { /* Memory-only fallback. */ }
    preferences = new LibraryPreferences(storage);
  }
  return preferences;
}

export function builtinRecords(node) {
  const module = MODULES[classOf(node)] || node.__vividMuseModuleWidget?.value || "画面基础";
  return (LIBRARY_CATALOG.modules[module] || []).flatMap(field => {
    const w = widget(node, field);
    if (!w || w.hidden || w.options?.hidden) return [];
    return (LIBRARY_CATALOG.fields[field] || []).filter(item => w.options?.values?.includes(item.value)).map(item => ({
      ...item, id: `b:${encodeURIComponent(field)}:${encodeURIComponent(item.value)}`,
      kind: "builtin", module, moduleEn: EN_CATALOG.moduleLabels[module], field,
      fieldEn: EN_CATALOG.widgetLabels[field], title: item.value,
      titleEn: EN_CATALOG.optionLabels[field]?.[item.value] || item.en, tags: [],
    }));
  });
}

export function applyRecord(node, record) {
  if (record.kind === "builtin") {
    const w = widget(node, record.field);
    if (!w || w.hidden || !w.options?.values?.includes(record.value)) return false;
    w.value = record.value;
    w.callback?.(record.value);
    globalThis.__vividMuseZImageI18n?.localizeNode(node);
    node.setDirtyCanvas?.(true, true);
    return true;
  }
  const adapter = record.kind === "prompt" ? node.__vividMusePromptDiscovery : node.__vividMuseModuleDiscovery;
  return adapter?.apply(record.entry) === true;
}

function element(tag, content, style) {
  const el = document.createElement(tag);
  if (content != null) el.textContent = content;
  if (style) el.style.cssText = style;
  return el;
}

export async function openDiscovery(node) {
  currentDialog?.close();
  const dialog = element("dialog", null,
    "width:min(820px,92vw);max-height:88vh;overflow:auto;background:#242424;color:#eee;border:1px solid #777;border-radius:10px;padding:18px;box-sizing:border-box");
  dialog.setAttribute("aria-label", text("素材搜索与收藏", "Search & Favorites"));
  currentDialog = dialog;
  dialogOwner = node;
  const p = prefs();
  const status = element("p", ""); status.setAttribute("role", "status");
  const warning = () => { status.textContent = p.warning ? text(
    "无法保存浏览器偏好；当前仍可选择和应用，收藏暂存于本次页面。",
    "Browser preferences cannot be saved. You can still apply entries; favorites remain in memory for this page.") : ""; };
  const top = element("div", null, "display:flex;gap:10px;align-items:center;justify-content:space-between");
  const close = element("button", text("关闭", "Close")); close.onclick = () => dialog.close();
  top.append(element("h3", text("素材搜索与收藏", "Search & Favorites")), close);
  dialog.append(top, element("p", text(
    "筛选仅用于查找，不限制随机抽取。选择条目后点击应用。",
    "Filters help you find entries; they do not limit random sampling. Select an entry, then apply it.")), status);
  const controls = element("div", null, "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px");
  const source = element("select"); source.setAttribute("aria-label", text("素材来源", "Source"));
  const sourceChoices = [];
  if (classOf(node) === FULL || MODULES[classOf(node)]) sourceChoices.push(["builtin", text("当前模块内置素材", "Built-in entries in current module")]);
  if (node.__vividMusePromptDiscovery) sourceChoices.push(["prompt", text("TXT用户词库", "TXT Prompt Library")]);
  if (node.__vividMuseModuleDiscovery) sourceChoices.push(["module", text("TXT模块词库", "TXT Module Library")]);
  for (const [value, label] of sourceChoices) { const option = element("option", label); option.value = value; source.append(option); }
  const query = element("input"); query.type = "search";
  query.placeholder = text("输入名称、短语或关键词", "Search names, phrases or keywords");
  query.setAttribute("aria-label", text("搜索词", "Search query")); query.style.cssText = "flex:1;min-width:180px";
  const view = element("select"); view.setAttribute("aria-label", text("显示范围", "View"));
  for (const [value, label] of [["all", text("全部", "All")], ["favorites", text("收藏", "Favorites")], ["recent", text("最近使用", "Recently Used")]]) {
    const option = element("option", label); option.value = value; view.append(option);
  }
  const category = element("select"); category.setAttribute("aria-label", text("字段或模块", "Field or Module"));
  controls.append(source, query, view, category); dialog.append(controls);
  const tagsBox = element("div", null, "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;max-height:100px;overflow:auto");
  dialog.append(tagsBox);
  const list = element("div", null, "max-height:32vh;overflow:auto;border:1px solid #666;border-radius:6px;padding:6px");
  list.setAttribute("aria-label", text("搜索结果", "Search results"));
  const preview = element("pre", "", "white-space:pre-wrap;overflow-wrap:anywhere;max-height:16vh;overflow:auto;font:inherit");
  const footer = element("div", null, "display:flex;gap:8px;flex-wrap:wrap");
  const apply = element("button", text("应用所选条目", "Apply Selected Entry")); apply.disabled = true;
  const reset = element("button", text("清除筛选", "Clear Filters"));
  const exportButton = element("button", text("导出收藏", "Export Favorites"));
  const importButton = element("button", text("导入收藏", "Import Favorites"));
  footer.append(apply, reset, exportButton, importButton); dialog.append(list, preview, footer);
  // Contain edit and navigation events so ComfyUI shortcuts cannot act on the canvas.
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); dialog.close();
    }
  });
  dialog.addEventListener("keyup", event => event.stopPropagation());
  // Native text clipboard actions must not reach ComfyUI's graph clipboard handler.
  for (const name of ["copy", "cut", "paste"]) dialog.addEventListener(name, event => event.stopPropagation());
  dialog.addEventListener("wheel", event => event.stopPropagation());
  dialog.onclose = () => {
    generation++; dialog.remove();
    if (currentDialog === dialog) { currentDialog = null; dialogOwner = null; }
  };
  document.body.append(dialog); dialog.showModal();
  let records = [], selected = null, selectedTags = [], untagged = false, generation = 0;
  function render() {
    const shown = filterRecords(records, {query: query.value, field: source.value === "builtin" ? category.value : "",
      module: source.value === "module" ? category.value : "", tags: selectedTags, untagged, view: view.value,
      favorites: p.favorites, recent: p.recent});
    list.replaceChildren();
    if (!shown.length) list.append(element("p", text("没有匹配条目。原选择未改变。", "No matching entries. Your existing selection is unchanged.")));
    if (selected && !shown.some(item => item.id === selected.id)) { selected = null; preview.textContent = ""; apply.disabled = true; }
    for (const record of shown) {
      const row = element("div", null, "display:flex;gap:8px;margin:4px 0");
      const label = (english() && record.kind === "builtin" ? record.titleEn : record.title) || record.title;
      const context = record.kind === "builtin" ? (english() ? record.fieldEn : record.field) : moduleLabel(record.module);
      const choose = element("button", context ? `${context} · ${label}` : label);
      choose.style.cssText = "flex:1;text-align:left;overflow-wrap:anywhere";
      choose.setAttribute("aria-pressed", String(selected?.id === record.id));
      choose.onclick = () => { selected = record; preview.textContent = record.kind === "builtin"
        ? `${record.zh}\n${record.en}` : record.zh; apply.disabled = false; render(); };
      const star = element("button", p.favorites.includes(record.id) ? "★" : "☆");
      star.setAttribute("aria-label", `${text("收藏", "Favorite")}: ${label}`);
      star.setAttribute("aria-pressed", String(p.favorites.includes(record.id)));
      star.onclick = () => { try { p.toggle(record.id); warning(); render(); } catch (_) { status.textContent = text("无法添加更多收藏。", "Cannot add more favorites."); } };
      row.append(choose, star); list.append(row);
    }
  }
  async function refresh() {
    const token = ++generation;
    selected = null; preview.textContent = ""; apply.disabled = true;
    records = []; list.replaceChildren(element("p", text("加载中…", "Loading…")));
    selectedTags = []; untagged = false; tagsBox.replaceChildren();
    const kind = source.value;
    try {
      let next;
      if (kind === "builtin") next = builtinRecords(node);
      else {
        const adapter = kind === "prompt" ? node.__vividMusePromptDiscovery : node.__vividMuseModuleDiscovery;
        next = await makeTxtRecords(kind, adapter.fileName(), adapter.entries());
      }
      if (token !== generation || !dialog.open) return;
      records = next;
      category.replaceChildren();
      const all = element("option", kind === "builtin" ? text("全部字段", "All Fields") : text("全部模块", "All Modules")); all.value = ""; category.append(all);
      const values = [...new Set(records.map(record => kind === "builtin" ? record.field : record.module).filter(Boolean))];
      for (const value of values) {
        const label = kind === "builtin" ? (english() ? EN_CATALOG.widgetLabels[value] : value) : moduleLabel(value);
        const option = element("option", label); option.value = value; category.append(option);
      }
      category.hidden = kind === "prompt";
      // Standalone TXT modules always search the current module; changing a filter must not change node inputs.
      const standaloneModule = classOf(node) === "VividMuse_ZImageTxtModuleLibrary";
      category.disabled = kind === "module" && standaloneModule;
      if (category.disabled) category.value = node.__vividMuseModuleDiscovery.module();
      const allTags = [...new Set(records.flatMap(record => record.tags || []))].sort();
      function tagToggle(label, value) {
        const wrapper = element("label", null, "display:flex;gap:4px;align-items:center");
        const input = element("input"); input.type = "checkbox";
        input.onchange = () => { if (value === null) untagged = input.checked;
          else selectedTags = input.checked ? [...selectedTags, value] : selectedTags.filter(tag => tag !== value); render(); };
        wrapper.append(input, document.createTextNode(label)); tagsBox.append(wrapper);
      }
      if (kind !== "builtin") { for (const tag of allTags) tagToggle(tag, tag); tagToggle(text("无标签", "Untagged"), null); }
      warning(); render();
    } catch (_) { if (token === generation) { list.replaceChildren(); status.textContent = text("词库加载失败，请重新打开面板。", "Could not load this library. Reopen the panel."); } }
  }
  query.oninput = render; view.onchange = render; category.onchange = render; source.onchange = refresh;
  reset.onclick = () => { query.value = ""; view.value = "all"; refresh(); };
  apply.onclick = () => {
    if (!selected) return;
    try {
      if (!applyRecord(node, selected)) { status.textContent = text(
        "条目已失效，或当前为随机模式。请更新选择；手动应用前切换为手动选择。",
        "Entry unavailable, or sampling mode is active. Refresh the selection; switch to manual mode before applying."); return; }
      p.used(selected.id); warning();
      // Refresh after dependencies change, while keeping the dialog available for further choices.
      refresh();
    } catch (_) { status.textContent = text("无法应用条目，请重新选择。", "Could not apply the entry. Select it again."); }
  };
  exportButton.onclick = () => {
    const url = URL.createObjectURL(new Blob([p.exportFavorites()], {type: "application/json"}));
    const link = element("a"); link.href = url; link.download = "vividmuse-favorites.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  importButton.onclick = () => {
    const input = element("input"); input.type = "file"; input.accept = ".json,application/json";
    input.hidden = true; dialog.append(input);
    input.oncancel = () => input.remove();
    input.onchange = async () => {
      try {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 1024 * 1024) throw new Error("Too large");
        p.importFavorites(await file.text()); warning(); render();
      } catch (_) { status.textContent = text("收藏文件无效；已有收藏未改变。", "Invalid favorites file; existing favorites are unchanged."); }
      finally { input.remove(); }
    }; input.click();
  };
  await refresh(); query.focus();
  return dialog;
}

function install(node) {
  const cls = classOf(node);
  if (!Object.hasOwn(EN_CATALOG.nodeTitles, cls) || node.__vividMuseDiscoveryButton) return;
  const button = node.addWidget("button", buttonName, null, () => openDiscovery(node), {serialize: false});
  button.serialize = false; button.options ??= {}; button.options.serialize = false;
  node.__vividMuseDiscoveryButton = button;
  const onRemoved = node.onRemoved;
  node.onRemoved = function() {
    if (dialogOwner === this) currentDialog?.close();
    return onRemoved?.apply(this, arguments);
  };
  // Each target already has its own serialization guard; this covers extension load order as well.
  const onSerialize = node.onSerialize;
  node.onSerialize = function(info) {
    const result = onSerialize?.apply(this, arguments);
    if (Array.isArray(info.widgets_values) && info.widgets_values.length === node.widgets.length) {
      info.widgets_values = info.widgets_values.filter((_, index) => node.widgets[index].serialize !== false);
    }
    return result;
  };
  const position = () => {
    const anchor = node.__vividMuseModuleWidget || widget(node, "自由提示词") || widget(node, "模块提示词")
      || node.widgets.find(w => (LIBRARY_CATALOG.modules[MODULES[cls]] || []).includes(w.name));
    if (anchor) {
      node.widgets.splice(node.widgets.indexOf(button), 1);
      node.widgets.splice(node.widgets.indexOf(anchor), 0, button);
    }
    const marker = {}; node.widgets.push(marker); node.widgets.pop();
    globalThis.__vividMuseZImageI18n?.localizeNode(node);
  };
  position(); setTimeout(position, 0);
}

app.registerExtension({name: "VividMuse.ZImagePromptBuilder.LibraryDiscovery", nodeCreated: install,
  loadedGraphNode: install});
