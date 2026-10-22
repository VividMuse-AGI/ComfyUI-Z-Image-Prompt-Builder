import { app } from "../../scripts/app.js";

const STORE = "vividMuseUserPresets";
const LOCKS = "vividMuseRandomLocks";
const CARDS = "vividMuseContentCards";
const CARD_MODULES = new Set(["人物", "服装"]);
const UI_KEYS = ["vividMuseActiveModule", "vividMuseOnlyEnabledModule"];
const STANDARD_MODULES = new Set(["画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现"]);
const typeOf = node => node.comfyClass || node.constructor?.type;
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;
const widgets = node => (node.widgets || []).filter(w => w.serialize !== false && w.options?.serialize !== false);
const fields = node => widgets(node).filter(w => Array.isArray(w.options?.values) && w.options.values.includes("跟随预设"));
const clone = value => JSON.parse(JSON.stringify(value));
const dirty = node => { node.setDirtyCanvas?.(true, true); app.graph?.setDirtyCanvas?.(true, true); };
const presetData = node => globalThis.__vividMuseZImagePromptData?.PRESETS?.[
  node.widgets?.find(w => w.name === "预设")?.value
] || {};

export function capturePreset(node, name) {
  name = String(name).trim();
  if (!name || name.length > 80) throw new Error(text("名称需为 1–80 个字符。", "Use a name of 1–80 characters."));
  const values = Object.fromEntries(widgets(node).filter(w =>
    typeof w.value === "string" || typeof w.value === "number" || typeof w.value === "boolean"
  ).map(w => [w.name, w.value]));
  return { version: 1, type: typeOf(node), name, values, ui: Object.fromEntries(
    UI_KEYS.filter(k => node.properties?.[k] !== undefined).map(k => [k, node.properties[k]])
  ), locks: clone(node.properties?.[LOCKS] || []) };
}

export function validatePreset(entry, node) {
  if (!entry || entry.version !== 1 || entry.type !== typeOf(node) ||
      typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 80 ||
      !entry.values || typeof entry.values !== "object" || Array.isArray(entry.values)) {
    throw new Error(text("预设格式或节点类型不匹配。", "Invalid preset format or node type."));
  }
  const known = new Map(widgets(node).map(w => [w.name, w]));
  for (const [name, value] of Object.entries(entry.values)) {
    const w = known.get(name);
    if (!w) throw new Error(text("预设包含未知字段：", "Unknown field: ") + name);
    if (typeof value !== typeof w.value || (typeof value === "number" && !Number.isFinite(value)))
      throw new Error(text("字段类型不正确：", "Invalid value type: ") + name);
    if (name === "随机种子" && !Number.isInteger(value))
      throw new Error(text("随机种子必须是整数。", "Random seed must be an integer."));
    if (name === "尺寸对齐倍数" && (!Number.isInteger(value) || value % 4))
      throw new Error(text("对齐倍数必须是 4 的整数倍。", "Alignment must be an integer multiple of 4."));
    const choices = w.options?.values;
    // Dependent dropdowns are checked against the full built-in preset catalog as well.
    if (Array.isArray(choices) && !choices.includes(value)) {
      const original = w.__vividMuseAllValues || [];
      const data = globalThis.__vividMuseZImagePromptData || {};
      const dependent = {
        "写真主题": Object.values(data.THEME_OPTIONS_BY_CATEGORY || {}).flat(),
        "地域族裔分支": Object.values(data.ETHNICITY_BRANCHES_BY_CATEGORY || {}).flat(),
        "场景地点": Object.values(data.SCENE_LOCATIONS_BY_CATEGORY || {}).flat(),
      }[name] || original;
      if (!dependent.includes(value)) throw new Error(text("字段选项已失效：", "Unavailable option: ") + name);
    }
    if (typeof value === "number" && ((w.options?.min != null && value < w.options.min) ||
        (w.options?.max != null && value > w.options.max))) throw new Error(text("数值超出范围：", "Value out of range: ") + name);
  }
  const allowed = new Set(fields(node).map(w => w.name));
  if (entry.locks && (!Array.isArray(entry.locks) || entry.locks.some(k => !allowed.has(k))))
    throw new Error(text("锁定字段不正确。", "Invalid locked fields."));
  if (entry.ui !== undefined && (
      !entry.ui || typeof entry.ui !== "object" || Array.isArray(entry.ui) ||
      Object.entries(entry.ui).some(([key, value]) =>
        !UI_KEYS.includes(key) || typeof value !== "string" || !STANDARD_MODULES.has(value)))) {
    throw new Error(text("模块状态不正确。", "Invalid module state."));
  }
  return entry;
}

export function applyUserPreset(node, entry) {
  validatePreset(entry, node); // Validate the whole entry before changing any value.
  const values = entry.values;
  // Restore parent controls before dependent fields and before onConfigure refresh.
  for (const w of widgets(node)) if (Object.hasOwn(values, w.name)) w.value = values[w.name];
  for (const [name, value] of Object.entries(globalThis.__vividMuseResolution?.defaults || {})) {
    const widget = widgets(node).find(w => w.name === name);
    if (widget && !Object.hasOwn(values, name)) widget.value = value;
  }
  const framing = widgets(node).find(w => w.name === "构图适配");
  if (framing && !Object.hasOwn(values, "构图适配")) framing.value = "保持当前规则";
  node.properties ??= {};
  for (const key of UI_KEYS) {
    delete node.properties[key];
    if (entry.ui?.[key] !== undefined) node.properties[key] = entry.ui[key];
  }
  node.properties[LOCKS] = clone(entry.locks || []);
  node.onConfigure?.({});
  globalThis.__vividMuseZImageI18n?.localizeNode(node);
  dirty(node);
}

export function lockFields(node, names) {
  const requested = new Set(names);
  if (names.some(name => /^(上装|下装|连衣裙|连体服)/.test(name))) requested.add("穿搭结构");
  for (const [parent, children] of [
    ["写真大类", ["写真主题"]],
    ["族裔大类", ["地域族裔分支"]],
    ["场景大类", ["场景地点"]],
    ["穿搭结构", ["上装类型", "下装类型", "连衣裙类型", "连体服类型"]],
    ["妆容模式", ["整体妆容预设", "底妆质感", "眼影色系", "眼线造型", "唇妆颜色", "唇面质感"]],
    ["发色模式", ["发色色调", "染色方式"]],
  ]) if (children.some(child => requested.has(child))) requested.add(parent);
  const selected = fields(node).filter(w => requested.has(w.name));
  for (const [moduleName, moduleNames] of Object.entries(moduleGroups())) {
    const affected = selected.filter(w => moduleNames.includes(w.name));
    if (affected.length) checkWritableScope(node, moduleName, affected.map(w => w.name));
  }
  const preset = presetData(node);
  for (const w of selected) {
    if (w.value === "随机抽取") throw new Error(text(
      "请先为随机字段选择具体值，再锁定：", "Choose a concrete value before locking: ") + w.name);
    if (w.value === "跟随预设" && preset[w.name] === undefined) throw new Error("Missing preset value: " + w.name);
  }
  for (const w of selected) if (w.value === "跟随预设") w.value = preset[w.name];
  node.properties ??= {};
  node.properties[LOCKS] = selected.map(w => w.name);
  dirty(node);
}

function moduleGroups() {
  return globalThis.__vividMuseZImagePromptData?.MODULE_FIELD_GROUPS || {};
}

export function availableCardModules(node) {
  const known = new Set(fields(node).map(w => w.name));
  return Object.entries(moduleGroups()).filter(([, names]) =>
    names.length && names.every(name => known.has(name))).map(([name]) => name);
}

function scopeFields(node, moduleName) {
  if (!availableCardModules(node).includes(moduleName))
    throw new Error(text("此节点不支持该模块。", "This node does not support that module."));
  return moduleGroups()[moduleName];
}

function checkWritableScope(node, moduleName, names) {
  const replacement = `用户${moduleName}片段`;
  if (node.inputs?.some(input => input.link != null &&
      (names.includes(input.name) || input.name === replacement)))
    throw new Error(text("该模块有已连接输入，请先断开连接再操作。", "Disconnect linked inputs in this module before continuing."));
  if (String(node.widgets?.find(w => w.name === replacement)?.value || "").trim())
    throw new Error(text("该模块正在使用 TXT 替换，请先清空对应用户模块片段。", "This module uses a TXT replacement. Clear its user module snippet first."));
}

export function validateCard(entry, node) {
  if (!entry || entry.kind !== "vividmuse-content-card" || entry.version !== 1 ||
      !CARD_MODULES.has(entry.module) || typeof entry.name !== "string" ||
      !entry.name.trim() || entry.name !== entry.name.trim() || entry.name.length > 80 ||
      !entry.values || typeof entry.values !== "object" || Array.isArray(entry.values) ||
      Object.keys(entry).some(k => !["kind", "version", "module", "name", "values"].includes(k)))
    throw new Error(text("卡片格式不正确。", "Invalid content card format."));
  const names = scopeFields(node, entry.module);
  if (Object.keys(entry.values).length !== names.length ||
      names.some(name => !Object.hasOwn(entry.values, name)) ||
      Object.values(entry.values).some(value => typeof value !== "string" ||
        ["跟随预设", "随机抽取"].includes(value)))
    throw new Error(text("卡片必须包含该模块的全部具体选项。", "A card must contain every concrete option in its module."));
  validatePreset({ version: 1, type: typeOf(node), name: entry.name, values: entry.values }, node);
  if (entry.module === "人物") {
    const allowed = globalThis.__vividMuseZImagePromptData?.ETHNICITY_BRANCHES_BY_CATEGORY?.[entry.values["族裔大类"]];
    if (allowed && entry.values["地域族裔分支"] !== "不使用" && !allowed.includes(entry.values["地域族裔分支"]))
      throw new Error(text("族裔分类与分支不一致。", "Ethnicity category and branch do not match."));
  }
  return entry;
}

export function captureCard(node, moduleName, name) {
  const names = scopeFields(node, moduleName);
  checkWritableScope(node, moduleName, names);
  const preset = presetData(node);
  const values = Object.fromEntries(names.map(name => {
    const value = node.widgets.find(w => w.name === name).value;
    if (value === "随机抽取") throw new Error(text(
      "请先将随机字段改为具体选项：", "Choose a concrete option before saving: ") + name);
    return [name, value === "跟随预设" ? preset[name] : value];
  }));
  return clone(validateCard({kind: "vividmuse-content-card", version: 1,
    module: moduleName, name: String(name).trim(), values}, node));
}

export function saveCard(node, entry, replace = false) {
  validateCard(entry, node);
  const saved = node.properties?.[CARDS] || [];
  if (!Array.isArray(saved)) throw new Error(text("已保存卡片格式异常。", "Invalid saved card collection."));
  const same = item => item.module === entry.module && item.name === entry.name;
  if (saved.some(same) && !replace) throw new Error(text("已有同名卡片，请确认覆盖。", "Confirm replacement of the existing card."));
  if (saved.length >= 100 && !saved.some(same)) throw new Error(text("最多保存 100 张卡片。", "Maximum 100 saved cards."));
  node.properties ??= {};
  node.properties[CARDS] = [...saved.filter(item => !same(item)), clone(entry)];
  dirty(node);
}

export function applyCard(node, entry, lock = false) {
  validateCard(entry, node);
  const names = scopeFields(node, entry.module);
  checkWritableScope(node, entry.module, names);
  // Assign the whole module before refreshing dependencies; no per-field callbacks
  // or full-node onConfigure, both of which can overwrite unrelated user state.
  for (const w of widgets(node)) if (Object.hasOwn(entry.values, w.name)) w.value = entry.values[w.name];
  if (lock) {
    node.properties ??= {};
    node.properties[LOCKS] = [...new Set([...(node.properties[LOCKS] || []), ...names])];
  }
  node.__vividMuseRefreshCardScope?.(entry.module);
  globalThis.__vividMuseZImageI18n?.localizeNode(node);
  globalThis.__vividMusePromptDiagnostics?.refresh(node);
  dirty(node);
}

export function setModuleLock(node, moduleName, locked) {
  const names = scopeFields(node, moduleName);
  const existing = node.properties?.[LOCKS] || [];
  if (locked) {
    checkWritableScope(node, moduleName, names);
    lockFields(node, [...new Set([...existing, ...names])]);
  } else {
    node.properties ??= {};
    node.properties[LOCKS] = existing.filter(name => !names.includes(name));
    dirty(node);
  }
}

export function findConflicts(node) {
  const preset = presetData(node);
  const values = Object.fromEntries(widgets(node).filter(w =>
    !node.inputs?.some(input => input.name === w.name && input.link != null)).map(w => [w.name,
    w.value === "跟随预设" ? preset[w.name] : w.value]));
  const results = [];
  const close = ["面部特写", "头肩近景", "胸部以上"].includes(values["景别"]);
  const replaced = name => typeof values[`用户${name}片段`] === "string" && values[`用户${name}片段`].trim();
  if (close && !replaced("服装") && !replaced("摄影") && values["鞋履"] && !["不使用", "随机抽取"].includes(values["鞋履"]))
    results.push(values["构图适配"] === "按景别适配"
      ? text("已启用构图适配：此景别的内置鞋袜在三档密度中均省略，原选择保留。", "Framing adaptation is enabled: built-in shoes and legwear are omitted at all densities for this shot; selections are kept.")
      : text("近景中通常看不到鞋履；标准/精简输出会省略鞋袜，详细输出保留。", "Footwear is usually outside a close portrait; concise/standard omit legwear and shoes, detailed keeps them."));
  if (!replaced("姿态动作") && /坐|跪|卧/.test(values["基础姿态"] || "") && values["腿部动作"] === "自然迈步")
    results.push(text("坐姿、跪姿或卧姿与自然迈步可能冲突。", "A seated, kneeling or lying pose may conflict with walking."));
  if (!replaced("姿态动作") && /站立/.test(values["基础姿态"] || "") && /坐姿|盘腿/.test(values["腿部动作"] || ""))
    results.push(text("站立姿态与坐姿腿部动作可能冲突。", "Standing may conflict with a seated leg action."));
  if (["随机抽取", "不使用"].includes(values["穿搭结构"])) {
    const selected = prefix => ["类型", "颜色", "材质", "图案"].some(suffix =>
      values[prefix + suffix] && !["不使用", "随机抽取", "跟随预设"].includes(values[prefix + suffix]));
    const branches = [selected("连衣裙"), selected("连体服"), selected("上装") || selected("下装")];
    if (branches.filter(Boolean).length > 1)
      results.push(text(
        "不同穿搭分支同时有已选衣物，请确认是否为有意叠穿。随机穿搭结构时会保留这些选择，不追加其他随机衣物。",
        "Selections span incompatible outfit branches; check whether layering is intentional. A random structure will keep these selections without adding other random garments."));
  }
  const locked = new Set(node.properties?.[LOCKS] || []);
  for (const [parent, child, table] of [
    ["写真大类", "写真主题", "THEME_OPTIONS_BY_CATEGORY"],
    ["族裔大类", "地域族裔分支", "ETHNICITY_BRANCHES_BY_CATEGORY"],
    ["场景大类", "场景地点", "SCENE_LOCATIONS_BY_CATEGORY"],
  ]) {
    const allowed = globalThis.__vividMuseZImagePromptData?.[table]?.[values[parent]];
    if (allowed && values[child] && !["不使用", "随机抽取"].includes(values[child]) && !allowed.includes(values[child]))
      results.push(text("分类与子选项不一致：", "Category and selection differ: ") + parent + " / " + child +
        (locked.has(child) ? text("（子选项已锁定）", " (selection locked)") : ""));
  }
  if (Object.values(values).includes("随机抽取"))
    results.push(text("随机字段尚未解析；这里只检查当前明确选项。", "Random values are unresolved; only current concrete selections are checked."));
  return results;
}

export function openCardsPanel(node) {
  node.__vividMuseCardsDialog?.close();
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "max-width:680px;width:85vw;max-height:85vh;overflow:auto;background:#242424;color:#eee;border:1px solid #777;border-radius:10px;padding:20px";
  const el = (tag, value = "") => { const item = document.createElement(tag); item.textContent = value; return item; };
  const moduleLabel = name => text(name, {"画面基础":"Canvas", "人物":"Person", "发型":"Hair", "服装":"Clothing",
    "姿态动作":"Pose", "场景":"Scene", "摄影":"Camera", "视觉表现":"Visual"}[name] || name);
  dialog.append(el("h3", text("人物卡 / 穿搭卡 / 模块锁定", "Person / Outfit Cards / Module Locks")));
  dialog.append(el("p", text("卡片只保存所属模块的具体选项。人物卡包含身形和妆容，不含发型；不保证生图人脸一致。卡片随工作流保存，可导出到其他工作流。",
    "Cards save concrete options in one module. Person cards include physique and makeup, not hair; they do not guarantee face identity. Save your workflow to keep cards, or export them for another workflow.")));
  const status = el("p"); status.setAttribute("role", "status");
  const row = () => { const item = el("div"); item.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"; dialog.append(item); return item; };
  let active = true, composing = false;
  const guarded = fn => async () => { try { if (active) await fn(); } catch (e) { if (active) status.textContent = e.message; } };
  const button = (parent, zh, en, fn) => {
    const item = el("button", text(zh, en)); item.type = "button";
    item.addEventListener("click", guarded(fn)); parent.append(item); return item;
  };
  const moduleSelect = el("select"); moduleSelect.setAttribute("aria-label", text("卡片与锁定模块", "Card and lock module"));
  const modules = availableCardModules(node);
  for (const name of modules) { const option = el("option", moduleLabel(name)); option.value = name; moduleSelect.append(option); }
  if (CARD_MODULES.has(node.properties?.vividMuseActiveModule) && modules.includes(node.properties.vividMuseActiveModule)) moduleSelect.value = node.properties.vividMuseActiveModule;
  else if (modules.includes("人物")) moduleSelect.value = "人物";
  row().append(moduleSelect);
  const lockStatus = el("p"); dialog.append(lockStatus);
  const lockActions = row();
  button(lockActions, "锁定此模块", "Lock Module", () => {
    setModuleLock(node, moduleSelect.value, true); refresh();
    status.textContent = text("已锁定具体选项；随机按钮跳过该模块。", "Concrete options locked; random buttons skip this module.");
  });
  button(lockActions, "解锁此模块", "Unlock Module", () => {
    setModuleLock(node, moduleSelect.value, false); refresh();
    status.textContent = text("已解锁，当前选项不变；点击随机按钮才会重新设为随机。", "Unlocked without changing options; use a random button to enable random choices again.");
  });
  dialog.append(el("p", text("锁定不阻止手动编辑、切换预设或清空。随机字段需先选具体值；跟随预设会固定为当前预设值。字段级锁定仍在原高级面板中。",
    "Locks do not prevent manual edits, preset changes or clearing. Choose concrete values for Random fields first; Follow Preset is frozen to the current value. Field-level locks remain in the existing advanced panel.")));
  const cardArea = el("section"); dialog.append(cardArea);
  const name = el("input"); name.maxLength = 80; name.placeholder = text("卡片名称", "Card name"); name.setAttribute("aria-label", name.placeholder);
  const select = el("select"); select.setAttribute("aria-label", text("已保存卡片", "Saved cards"));
  cardArea.append(name, select);
  const saved = () => Array.isArray(node.properties?.[CARDS]) ? node.properties[CARDS] : [];
  const selected = () => {
    const entry = saved().find(item => item.module === moduleSelect.value && item.name === select.value);
    if (!entry) throw new Error(text("请先选择卡片。", "Select a card first."));
    return entry;
  };
  const preview = el("pre"); preview.style.cssText = "white-space:pre-wrap;max-height:170px;overflow:auto";
  const renderPreview = () => {
    const entry = saved().find(item => item.module === moduleSelect.value && item.name === select.value);
    if (entry) {
      try { validateCard(entry, node); } catch (e) { preview.textContent = e.message; return; }
    }
    preview.textContent = entry ? Object.entries(entry.values).map(([k, v]) => {
      const w = node.widgets.find(item => item.name === k);
      const label = globalThis.__vividMuseZImageI18n?.translateMessage?.(k) || k;
      return `${label}: ${w?.options?.getOptionLabel?.(v) || v}`;
    }).join("\n") : text("暂无卡片；保存当前模块或导入 JSON。", "No cards yet. Save this module or import JSON.");
  };
  const refresh = () => {
    const names = moduleGroups()[moduleSelect.value] || [];
    const count = names.filter(n => (node.properties?.[LOCKS] || []).includes(n)).length;
    lockStatus.textContent = text(`已锁定 ${count} / ${names.length} 个字段`, `Locked ${count} / ${names.length} fields`);
    cardArea.hidden = !CARD_MODULES.has(moduleSelect.value);
    const current = select.value; select.replaceChildren();
    for (const entry of saved().filter(item => item.module === moduleSelect.value)) {
      const option = el("option", entry.name); option.value = entry.name; select.append(option);
    }
    if ([...select.options].some(option => option.value === current)) select.value = current;
    renderPreview();
  };
  moduleSelect.addEventListener("change", () => { status.textContent = ""; refresh(); });
  select.addEventListener("change", renderPreview);
  const actions = el("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"; cardArea.append(actions);
  const store = entry => {
    const exists = saved().some(item => item.module === entry.module && item.name === entry.name);
    if (exists && !window.confirm(text("覆盖同类型同名卡片？", "Replace this card of the same type and name?"))) return false;
    saveCard(node, entry, exists); moduleSelect.value = entry.module; refresh(); select.value = entry.name; renderPreview(); return true;
  };
  button(actions, "保存当前模块", "Save Module", () => {
    if (store(captureCard(node, moduleSelect.value, name.value))) status.textContent = text("卡片已保存，请保存工作流以保留。", "Card saved. Save the workflow to keep it.");
  });
  for (const lock of [false, true]) button(actions, lock ? "应用并锁定" : "应用卡片", lock ? "Apply & Lock" : "Apply Card", () => {
    applyCard(node, selected(), lock); refresh();
    status.textContent = text("已应用所属模块，其他模块和自由提示词保持不变。", "Applied to its module; other modules and free text are unchanged.");
  });
  button(actions, "导出卡片", "Export Card", () => {
    const entry = validateCard(selected(), node);
    const url = URL.createObjectURL(new Blob([JSON.stringify(entry, null, 2)], {type: "application/json"}));
    const link = el("a"); link.href = url; link.download = "vividmuse-content-card.json";
    try { dialog.append(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    status.textContent = text("已请求下载卡片 JSON。", "Card JSON download requested.");
  });
  button(actions, "导入卡片", "Import Card", () => {
    const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true; dialog.append(input);
    input.addEventListener("cancel", () => input.remove());
    input.addEventListener("change", guarded(async () => {
      try {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 1024 * 1024) throw new Error(text("文件不能超过 1 MB。", "File must be at most 1 MB."));
        const raw = await file.text(); if (!active) return;
        const entry = validateCard(JSON.parse(raw), node);
        if (store(entry)) status.textContent = text("导入成功，点击应用卡片后生效。", "Imported. Use Apply Card to change the module.");
      } finally { input.remove(); }
    }));
    input.click();
  });
  button(actions, "删除卡片", "Delete Card", () => {
    const entry = selected();
    if (!window.confirm(text("删除选中的卡片？当前模块选项不受影响。", "Delete this card? Current module options will not change."))) return;
    node.properties[CARDS] = saved().filter(item => item !== entry); refresh(); dirty(node);
  });
  cardArea.append(preview); dialog.append(status);
  button(row(), "关闭", "Close", () => dialog.close());
  dialog.addEventListener("compositionstart", () => { composing = true; });
  dialog.addEventListener("compositionend", () => { composing = false; });
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (!composing && !event.isComposing && event.keyCode !== 229) dialog.close();
    }
  });
  dialog.addEventListener("cancel", event => { if (composing) event.preventDefault(); });
  for (const event of ["keyup", "copy", "cut", "paste", "wheel"]) dialog.addEventListener(event, e => e.stopPropagation());
  dialog.addEventListener("close", () => { active = false; dialog.remove(); if (node.__vividMuseCardsDialog === dialog) node.__vividMuseCardsDialog = null; }, {once: true});
  node.__vividMuseCardsDialog = dialog;
  document.body.append(dialog); refresh(); dialog.showModal();
  return dialog;
}

function openPanel(node) {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "max-width:640px;width:85vw;max-height:85vh;overflow:auto;background:#242424;color:#eee;border:1px solid #777;border-radius:10px;padding:20px";
  const title = document.createElement("h3");
  title.textContent = text("用户预设、随机锁定与组合检查", "User Presets, Random Locks & Checks");
  dialog.append(title);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const guarded = fn => async () => { try { await fn(); } catch(e) { status.textContent = e.message; } };
  const row = () => { const el=document.createElement("div"); el.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"; dialog.append(el); return el; };
  const button = (parent, zh, en, fn) => {
    const b=document.createElement("button"); b.type="button"; b.textContent=text(zh,en);
    b.addEventListener("click", guarded(fn)); parent.append(b); return b;
  };
  const name = document.createElement("input");
  name.placeholder=text("输入预设名称", "Preset name"); name.maxLength=80;
  const select=document.createElement("select");
  const saved = () => Array.isArray(node.properties?.[STORE]) ? node.properties[STORE] : [];
  const refresh = () => {
    select.replaceChildren();
    for (const entry of saved()) { const o=document.createElement("option"); o.value=entry.name; o.textContent=entry.name; select.append(o); }
  };
  const saveEntry = entry => {
    validatePreset(entry,node);
    node.properties ??= {};
    const entries=saved();
    if (entries.length >= 100 && !entries.some(p=>p.name===entry.name)) throw new Error(text("最多保存100套预设。","Maximum 100 saved presets."));
    node.properties[STORE]=[...entries.filter(p=>p.name!==entry.name),clone(entry)];
    refresh(); select.value=entry.name; dirty(node);
  };
  row().append(name,select);
  const actions=row();
  button(actions,"保存当前状态","Save Current",()=>{
    const entry=capturePreset(node,name.value);
    if(saved().some(p=>p.name===entry.name) && !window.confirm(text("覆盖同名预设？","Replace this saved preset?"))) return;
    saveEntry(entry); status.textContent=text("已保存到本节点，保存工作流后会保留。","Saved in this node; save the workflow to keep it.");
  });
  button(actions,"应用选中预设","Apply",()=>{
    const entry=saved().find(p=>p.name===select.value);
    if(!entry) throw new Error(text("先选择预设。","Select a preset first."));
    applyUserPreset(node,entry); renderLocks(); status.textContent=text("已恢复字段、自由文本和模块状态。","Fields, free text and module state restored.");
  });
  button(actions,"导出选中预设","Export",()=>{
    const entry=saved().find(p=>p.name===select.value);
    if(!entry) throw new Error(text("先选择预设。","Select a preset first."));
    const url=URL.createObjectURL(new Blob([JSON.stringify(entry,null,2)],{type:"application/json"}));
    const a=document.createElement("a"); a.href=url; a.download="zimage-user-preset.json"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const file=document.createElement("input"); file.type="file"; file.accept=".json,application/json"; file.hidden=true; dialog.append(file);
  button(actions,"导入预设","Import",()=>file.click());
  file.addEventListener("change",guarded(async()=>{
    const selected=file.files?.[0]; if(!selected)return;
    if(selected.size>1024*1024)throw new Error(text("文件不能超过1MB。","File must be at most 1 MB."));
    const entry=validatePreset(JSON.parse(await selected.text()),node);
    if(saved().some(p=>p.name===entry.name) && !window.confirm(text("覆盖同名预设？","Replace this saved preset?"))) return;
    saveEntry(entry); file.value=""; status.textContent=text("导入完成；点击应用后生效。","Imported; click Apply to use it.");
  }));
  button(actions,"删除选中预设","Delete",()=>{
    if(!select.value || !window.confirm(text("删除选中的已保存预设？","Delete the selected saved preset?"))) return;
    node.properties[STORE]=saved().filter(p=>p.name!==select.value);refresh();dirty(node);
  });
  const hint=document.createElement("p");
  hint.textContent=text("随机锁定只约束随机按钮；手动编辑、切换预设和清空仍然有效。勾选字段后点击保存锁定。跟随预设会固定为当前预设值；随机字段需先选具体值。","Locks affect random buttons only. Manual edits, preset changes and clearing remain available. Check fields and save locks. Follow Preset becomes a concrete value; choose a concrete value before locking a Random field.");
  dialog.append(hint);
  const locks=document.createElement("div"); locks.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:220px;overflow:auto";dialog.append(locks);
  const renderLocks=()=>{
    locks.replaceChildren();
    for(const w of fields(node)) {
      const label=document.createElement("label"), check=document.createElement("input");check.type="checkbox";check.value=w.name;
      check.checked=(node.properties?.[LOCKS]||[]).includes(w.name);
      label.append(check,document.createTextNode(w.label||w.name)); locks.append(label);
    }
  };
  button(row(),"保存锁定","Save Locks",()=>{
    lockFields(node,[...locks.querySelectorAll("input:checked")].map(e=>e.value));
    renderLocks();
    status.textContent=text("随机锁定已保存。","Random locks saved.");
  });
  button(row(),"检查当前组合","Check Combination",()=>{
    status.textContent=findConflicts(node).join("\n") || text("未发现已知的明显冲突；这不代表生图效果已验证。","No known obvious conflicts found; image quality is not verified.");
  });
  status.style.whiteSpace="pre-wrap";dialog.append(status);
  button(row(),"关闭","Close",()=>dialog.close());
  refresh();renderLocks();
  dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();
}

app.registerExtension({
  name:"VividMuse.ZImagePromptBuilder.WorkflowTools",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if(nodeData.name !== "VividMuse_ZImageChinesePromptBuilder" && !/^VividMuse_ZImage(?:Canvas|Person|Hair|Clothing|Pose|Scene|Camera|Visual)Module$/.test(nodeData.name)) return;
    const previous=nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions=function(_,options) {
      const result=previous?.apply(this,arguments);
      options.push({content:text("人物卡 / 穿搭卡 / 模块锁定","Person / Outfit Cards / Module Locks"),callback:()=>openCardsPanel(this)});
      options.push({content:text("用户预设 / 随机锁定 / 组合检查","User Presets / Random Locks / Checks"),callback:()=>openPanel(this)});
      return result;
    };
    for (const event of ["onRemoved", "onConfigure"]) {
      const before = nodeType.prototype[event];
      nodeType.prototype[event] = function () {
        this.__vividMuseCardsDialog?.close();
        return before?.apply(this, arguments);
      };
    }
  },
});
