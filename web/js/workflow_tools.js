import { app } from "../../scripts/app.js";

const STORE = "vividMuseUserPresets";
const LOCKS = "vividMuseRandomLocks";
const CARDS = "vividMuseContentCards";
const CARD_MODULES = new Set(["人物", "服装"]);
const cardSchemas = new Map();
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

export function captureResultCard(node, data, moduleName, name) {
  scopeFields(node, moduleName);
  const candidates = data?.card_candidates;
  if (candidates?.version !== 1) throw new Error(text(
    "此记录没有完整的卡片数据，请重新执行后保存。",
    "This record has no complete card data. Run the node again before saving."));
  if (data.version !== 1 || !["全部模块", moduleName].includes(data.scope))
    throw new Error(text("此执行记录不包含该模块。", "This execution record does not include this module."));
  const candidate = candidates.modules?.[moduleName];
  const reasons = {
    user_replaced: text("此模块由 TXT 或用户片段替代，不能转为结构化卡片。", "This module uses a TXT or user replacement and cannot become a structured card."),
    empty_module: text("此模块在该次执行中没有输出。", "This module had no output in this execution."),
    incomplete_fields: text("此记录缺少模块的完整字段，不能补填保存。", "This record lacks complete module fields; missing values will not be filled in."),
    unsupported_values: text("此记录包含无法保存为卡片的选项。", "This record contains options that cannot be saved as a card."),
  };
  if (candidate?.available !== true) throw new Error(reasons[candidate?.reason] || text(
    "此记录没有可用的模块卡片数据。", "No usable card data for this module in this record."));
  const module = data.modules?.find(item => item.name === moduleName);
  if (module?.source !== "builtin" || ![module.zh, module.en].some(value => typeof value === "string" && value.trim()))
    throw new Error(text("此模块不是可保存的内置执行结果。", "This module is not a saveable built-in execution result."));
  // Saving a historical result does not edit inputs, so only application checks
  // current linked inputs / TXT replacements. Never fill values from widgets here.
  return clone(validateCard({kind: "vividmuse-content-card", version: 1,
    module: moduleName, name: String(name).trim(), values: candidate.values}, node));
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

const cardKey = card => JSON.stringify([card.module, card.name]);
const cardCollection = node => {
  const cards = node.properties?.[CARDS] ?? [];
  if (!Array.isArray(cards)) throw new Error(text("已保存卡片格式异常。", "Invalid saved card collection."));
  return cards;
};
const collectionStamp = node => JSON.stringify(cardCollection(node));
const changedCollection = () => new Error(text("卡片库已变化，请重新预览并确认。", "The card library changed. Preview and confirm again."));
const hiddenCardField = (name, values) => {
  if (/^(连衣裙|连体服|上装|下装)(类型|颜色|材质|图案)$/.test(name)) {
    const structure = values["穿搭结构"];
    if (structure === "连衣裙") return !name.startsWith("连衣裙");
    if (structure === "连体服") return !name.startsWith("连体服");
    if (["上装＋下装", "西装套装", "叠穿造型"].includes(structure)) return !/^(上装|下装)/.test(name);
  }
  if (values["妆容模式"] === "整体预设") return ["底妆质感", "眼影色系", "眼线造型", "唇妆颜色", "唇面质感"].includes(name);
  if (values["妆容模式"] === "分项自定义") return name === "整体妆容预设";
  return false;
};

// Portable validation must also validate legal but inapplicable cards in a pack.
// Schemas come from Comfy's registered definitions, not a second option catalog.
export function validatePortableCard(entry, node) {
  if (CARD_MODULES.has(entry?.module) && availableCardModules(node).includes(entry.module)) return validateCard(entry, node);
  const schema = cardSchemas.get(entry?.module);
  if (!schema) throw new Error(text("卡片模块不支持或校验数据尚未就绪。", "Unsupported card module or validation schema not ready."));
  return validateCard(entry, schema);
}

export function filterCards(node, moduleName, query = "") {
  const queryText = String(query).trim().toLowerCase();
  return cardCollection(node).filter(c => c.module === moduleName && c.name.toLowerCase().includes(queryText));
}

export function renameCard(node, original, name, replace = false, expected = collectionStamp(node)) {
  if (collectionStamp(node) !== expected) throw changedCollection();
  const cards = cardCollection(node), source = cards.find(c => cardKey(c) === cardKey(original));
  if (!source || JSON.stringify(source) !== JSON.stringify(original)) throw changedCollection();
  const entry = clone({...source, name: String(name).trim()});
  validateCard(entry, node);
  if (entry.name === source.name) return entry;
  const conflict = cards.some(c => cardKey(c) === cardKey(entry));
  if (conflict && !replace) throw new Error(text("已有同名卡片，请确认覆盖。", "Confirm replacement of the existing card."));
  const next = cards.filter(c => cardKey(c) !== cardKey(entry)).map(c => cardKey(c) === cardKey(source) ? entry : c);
  node.properties[CARDS] = next;
  dirty(node);
  return clone(entry);
}

export function cardDifference(node, entry) {
  validateCard(entry, node);
  let blocked = "";
  const names = scopeFields(node, entry.module);
  try { checkWritableScope(node, entry.module, names); } catch (e) { blocked = e.message; }
  const preset = presetData(node);
  const rows = names.map(name => {
    const current = node.widgets.find(w => w.name === name)?.value;
    return {name, current, target: entry.values[name], changed: current !== entry.values[name], hidden: hiddenCardField(name, entry.values),
      preset: current === "跟随预设" ? preset[name] : undefined};
  });
  const newLocks = names.filter(n => !(node.properties?.[LOCKS] || []).includes(n));
  return {rows, blocked, newLocks};
}

export function validateCardPack(pack, node) {
  if (!pack || pack.kind !== "vividmuse-content-card-pack" || pack.version !== 1 ||
      Object.keys(pack).some(k => !["kind", "version", "cards"].includes(k)) ||
      !Array.isArray(pack.cards) || !pack.cards.length || pack.cards.length > 100)
    throw new Error(text("卡片包格式不正确，需包含 1–100 张卡片。", "Invalid card pack; expected 1–100 cards."));
  const seen = new Set();
  for (const [index, entry] of pack.cards.entries()) {
    try {
      validatePortableCard(entry, node);
      if (seen.has(cardKey(entry))) throw new Error(text("包内同模块同名重复。", "Duplicate module and name in pack."));
      seen.add(cardKey(entry));
    } catch (e) { throw new Error(`${index + 1}. ${entry?.name ?? "?"}: ${e.message}`); }
  }
  return clone(pack);
}

export function planCardPack(node, input, strategy = "skip") {
  if (!["skip", "replace"].includes(strategy)) throw new Error("Invalid conflict strategy");
  const pack = validateCardPack(input, node), saved = cardCollection(node);
  const supported = availableCardModules(node), next = clone(saved);
  const added = [], conflicts = [], skipped = [], replaced = [], inapplicable = [];
  for (const card of pack.cards) {
    if (!supported.includes(card.module)) { inapplicable.push(card); continue; }
    const index = next.findIndex(c => cardKey(c) === cardKey(card));
    if (index < 0) { added.push(card); next.push(card); }
    else {
      conflicts.push(card);
      if (strategy === "replace") { replaced.push(card); next[index] = card; }
      else skipped.push(card);
    }
  }
  if (next.length > 100) throw new Error(text("导入后超过 100 张，未写入任何卡片。", "Import exceeds 100 cards; nothing was written."));
  return {pack, strategy, base: collectionStamp(node), next, added, conflicts, skipped, replaced, inapplicable};
}

export function commitCardPack(node, plan) {
  if (collectionStamp(node) !== plan.base) throw changedCollection();
  // Revalidate rather than trust a mutable preview's proposed collection.
  const checked = planCardPack(node, plan.pack, plan.strategy);
  if (checked.added.length || checked.replaced.length) {
    node.properties ??= {};
    node.properties[CARDS] = clone(checked.next);
    dirty(node);
  }
  return checked;
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
  dialog.append(el("h3", text("卡片管理 / 模块锁定", "Cards / Module Locks")));
  dialog.append(el("p", text("卡片只保存所属模块的具体选项。人物卡包含身形和妆容，不含发型；不保证生图人脸一致。卡片随工作流保存，可导出到其他工作流。",
    "Cards save concrete options in one module. Person cards include physique and makeup, not hair; they do not guarantee face identity. Save your workflow to keep cards, or export them for another workflow.")));
  const status = el("p"); status.setAttribute("role", "status");
  const row = () => { const item = el("div"); item.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"; dialog.append(item); return item; };
  let active = true, composing = false;
  const root = app.rootGraph || app.graph, ownerGraph = node.graph;
  const generation = node.__vividMuseCardsGeneration || 0;
  const belongs = (graph, seen = new Set()) => {
    if (!graph || seen.has(graph)) return false;
    seen.add(graph);
    if (graph.getNodeById?.(node.id) === node) return true;
    return (graph._nodes || []).some(child => child.subgraph && belongs(child.subgraph, seen));
  };
  const live = () => active && (app.rootGraph || app.graph) === root &&
    (node.__vividMuseCardsGeneration || 0) === generation && node.graph === ownerGraph &&
    (!ownerGraph?.getNodeById || ownerGraph.getNodeById(node.id) === node) &&
    (!root?.getNodeById || belongs(root));
  const requireLive = () => { if (!live()) throw new Error(text("节点会话已变化，请重新打开面板。", "Node session changed. Reopen the panel.")); };
  const guarded = fn => async () => { try { if (live() && !composing) await fn(); } catch (e) { if (active) status.textContent = e.message; } };
  const button = (parent, zh, en, fn) => {
    const item = el("button", text(zh, en)); item.type = "button";
    item.addEventListener("click", guarded(fn)); parent.append(item); return item;
  };
  const shootPlans = globalThis.__vividMuseShootPlanCards;
  if (shootPlans?.availableModules(node).length) {
    button(row(), "拍摄方案卡（场景 / 摄影 / 视觉表现）", "Shoot Plan Cards (Scene / Camera / Visual)", () => {
      requireLive();
      dialog.close();
      shootPlans.openPanel(node);
    });
  }
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
  const search = el("input"); search.type = "search"; search.placeholder = text("搜索卡片名称", "Search card names"); search.setAttribute("aria-label", search.placeholder);
  for (const control of [search, name, select]) control.style.cssText = "display:block;box-sizing:border-box;width:100%;margin:8px 0;padding:6px;min-width:0";
  const countLabel = el("p");
  cardArea.append(search, countLabel, name, select);
  const saved = () => cardCollection(node);
  const selected = () => {
    const entry = filterCards(node, moduleSelect.value, search.value).find(item => item.name === select.value);
    if (!entry) throw new Error(text("请先选择卡片。", "Select a card first."));
    return entry;
  };
  const preview = el("pre"); preview.style.cssText = "white-space:pre-wrap;max-height:170px;overflow:auto";
  const allDetails = el("details"), allPreview = el("pre");
  allPreview.style.cssText = "white-space:pre-wrap;max-height:200px;overflow:auto";
  allDetails.append(el("summary", text("全部字段（含隐藏分支）", "All fields (including hidden branches)")), allPreview);
  const applicationHint = el("p");
  let previewStamp = "";
  const selectionButtons = [];
  const labelFor = k => globalThis.__vividMuseZImageI18n?.translateMessage?.(k) || k;
  const valueFor = (k, v) => node.widgets.find(w => w.name === k)?.options?.getOptionLabel?.(v) || v;
  const renderPreview = () => {
    const entry = filterCards(node, moduleSelect.value, search.value).find(item => item.name === select.value);
    previewStamp = ""; allPreview.textContent = ""; applicationHint.textContent = "";
    selectionButtons.forEach(b => { b.disabled = !entry; });
    if (!entry) { preview.textContent = saved().length ? text("没有匹配的卡片。", "No matching cards.") : text("尚无卡片。", "No cards yet."); return; }
    try {
      const diff = cardDifference(node, entry);
      previewStamp = JSON.stringify({entry, diff});
      const format = row => `${labelFor(row.name)}: ${valueFor(row.name, row.current)}${row.preset === undefined ? "" : ` (${valueFor(row.name, row.preset)})`} → ${valueFor(row.name, row.target)}`;
      const hiddenChanges = diff.rows.filter(r => r.changed && r.hidden).length;
      preview.textContent = diff.rows.filter(r => r.changed && !r.hidden).map(format).join("\n") || text("可见字段无变化。", "No visible field changes.");
      if (hiddenChanges) preview.textContent += text(`\n另有 ${hiddenChanges} 项隐藏分支变化，展开全部字段查看。`, `\n${hiddenChanges} hidden-branch changes; expand all fields to review.`);
      allPreview.textContent = diff.rows.map(format).join("\n");
      applicationHint.textContent = diff.blocked || text(
        `应用完整模块快照，包含隐藏分支。应用并锁定将新增 ${diff.newLocks.length} 项锁定。`,
        `Applies the complete module, including hidden branches. Apply & Lock adds ${diff.newLocks.length} locks.`);
    } catch (e) { preview.textContent = e.message; selectionButtons.forEach(b => { b.disabled = true; }); }
  };
  const refresh = () => {
    const names = moduleGroups()[moduleSelect.value] || [];
    const count = names.filter(n => (node.properties?.[LOCKS] || []).includes(n)).length;
    lockStatus.textContent = text(`已锁定 ${count} / ${names.length} 个字段`, `Locked ${count} / ${names.length} fields`);
    cardArea.hidden = !CARD_MODULES.has(moduleSelect.value);
    const current = select.value; select.replaceChildren();
    const matches = filterCards(node, moduleSelect.value, search.value);
    countLabel.textContent = text(`匹配 ${matches.length} / 本节点共 ${saved().length} 张`, `${matches.length} matches / ${saved().length} cards in this node`);
    for (const entry of matches) {
      const option = el("option", entry.name); option.value = entry.name; select.append(option);
    }
    if ([...select.options].some(option => option.value === current)) select.value = current;
    renderPreview();
  };
  moduleSelect.addEventListener("change", () => { status.textContent = ""; refresh(); });
  select.addEventListener("change", renderPreview);
  search.addEventListener("input", () => { if (!composing) refresh(); });
  const actions = el("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"; cardArea.append(actions);
  const store = entry => {
    const base = collectionStamp(node);
    const exists = saved().some(item => item.module === entry.module && item.name === entry.name);
    if (exists && !window.confirm(text("覆盖同类型同名卡片？", "Replace this card of the same type and name?"))) return false;
    requireLive(); if (base !== collectionStamp(node)) throw changedCollection();
    saveCard(node, entry, exists); moduleSelect.value = entry.module; search.value = ""; refresh(); select.value = entry.name; renderPreview(); return true;
  };
  button(actions, "保存当前模块", "Save Module", () => {
    if (store(captureCard(node, moduleSelect.value, name.value))) status.textContent = text("卡片已保存，请保存工作流以保留。", "Card saved. Save the workflow to keep it.");
  });
  selectionButtons.push(button(actions, "重命名", "Rename", () => {
    const original = clone(selected()), base = collectionStamp(node);
    const newName = name.value.trim();
    validateCard({...original, name: newName}, node);
    const exists = saved().some(c => c.module === original.module && c.name === newName && c.name !== original.name);
    if (exists && !window.confirm(text("覆盖同类型同名卡片？", "Replace this card of the same type and name?"))) return;
    requireLive();
    const renamed = renameCard(node, original, newName, exists, base);
    refresh();
    if (filterCards(node, moduleSelect.value, search.value).some(c => c.name === renamed.name)) select.value = renamed.name;
    renderPreview(); status.textContent = text("已重命名，请保存工作流。", "Renamed. Save the workflow.");
  }));
  for (const lock of [false, true]) selectionButtons.push(button(actions, lock ? "应用并锁定" : "应用卡片", lock ? "Apply & Lock" : "Apply Card", () => {
    const entry = selected(), diff = cardDifference(node, entry);
    if (JSON.stringify({entry, diff}) !== previewStamp) {
      renderPreview(); status.textContent = text("当前设置已变化，请核对刷新后的差异，再次点击应用。", "Settings changed. Review the refreshed differences and apply again."); return;
    }
    applyCard(node, entry, lock); refresh();
    status.textContent = text("已应用所属模块，其他模块和自由提示词保持不变。", "Applied to its module; other modules and free text are unchanged.");
  }));
  const download = (entry, filename) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(entry, null, 2)], {type: "application/json"}));
    const link = el("a"); link.href = url; link.download = filename;
    try { dialog.append(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    status.textContent = text("已请求下载卡片 JSON。", "Card JSON download requested.");
  };
  selectionButtons.push(button(actions, "导出卡片", "Export Card", () => download(validateCard(selected(), node), "vividmuse-content-card.json")));
  button(actions, "导入卡片", "Import Card", () => {
    const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true; dialog.append(input);
    input.addEventListener("cancel", () => input.remove());
    input.addEventListener("change", guarded(async () => {
      try {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 1024 * 1024) throw new Error(text("文件不能超过 1 MB。", "File must be at most 1 MB."));
        const raw = await file.text(); if (!live()) return;
        const entry = validateCard(JSON.parse(raw), node);
        if (store(entry)) status.textContent = text("导入成功，点击应用卡片后生效。", "Imported. Use Apply Card to change the module.");
      } finally { input.remove(); }
    }));
    input.click();
  });
  selectionButtons.push(button(actions, "删除卡片", "Delete Card", () => {
    const entry = selected(), base = collectionStamp(node);
    if (!window.confirm(text("删除选中的卡片？当前模块选项不受影响。", "Delete this card? Current module options will not change."))) return;
    requireLive(); if (base !== collectionStamp(node)) throw changedCollection();
    node.properties[CARDS] = saved().filter(item => item !== entry); refresh(); dirty(node);
  }));
  cardArea.append(applicationHint, preview, allDetails);
  const packArea = el("section"); dialog.append(packArea);
  packArea.hidden = !modules.some(m => CARD_MODULES.has(m));
  const packActions = el("div"), packPreview = el("section");
  packActions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0";
  packArea.append(packActions, packPreview);
  let fileGeneration = 0;
  const clearPack = () => { fileGeneration++; packPreview.replaceChildren(); };
  button(packActions, "导出卡片包", "Export Card Pack", () => {
    clearPack();
    const base = collectionStamp(node);
    const candidates = saved().filter(c => modules.includes(c.module) && CARD_MODULES.has(c.module));
    packPreview.append(el("p", text("默认勾选本节点支持的全部卡片，不受名称搜索影响。", "All supported cards are selected by default, independent of search.")));
    const checks = candidates.map(card => {
      const label = el("label"), check = el("input"); check.type = "checkbox"; check.checked = true;
      label.style.display = "block"; label.append(check, el("span", `${moduleLabel(card.module)} / ${card.name}`)); packPreview.append(label);
      return {card, check};
    });
    const count = el("p"); packPreview.append(count);
    const update = () => { count.textContent = text(`已选择 ${checks.filter(c => c.check.checked).length} 张`, `${checks.filter(c => c.check.checked).length} selected`); };
    checks.forEach(c => c.check.addEventListener("change", update)); update();
    button(packPreview, "确认导出卡片包", "Confirm Export Pack", () => {
      if (base !== collectionStamp(node)) { clearPack(); throw changedCollection(); }
      const pack = validateCardPack({kind: "vividmuse-content-card-pack", version: 1, cards: checks.filter(c => c.check.checked).map(c => c.card)}, node);
      download(pack, "vividmuse-content-card-pack.json"); clearPack();
    });
    button(packPreview, "取消", "Cancel", clearPack);
  });
  button(packActions, "导入卡片包", "Import Card Pack", () => {
    clearPack(); const ticket = fileGeneration;
    const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true; dialog.append(input);
    input.addEventListener("cancel", () => input.remove());
    input.addEventListener("change", guarded(async () => {
      try {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 1024 * 1024) throw new Error(text("文件不能超过 1 MB。", "File must be at most 1 MB."));
        const raw = await file.text(); if (!live() || ticket !== fileGeneration) return;
        const pack = validateCardPack(JSON.parse(raw), node);
        const strategy = el("select"); strategy.setAttribute("aria-label", text("同名冲突处理", "Name conflict strategy"));
        for (const [value, label] of [["skip", text("跳过同名", "Skip existing")], ["replace", text("覆盖同名", "Replace existing")]]) {
          const option = el("option", label); option.value = value; strategy.append(option);
        }
        const detail = el("pre"); detail.style.cssText = "white-space:pre-wrap;max-height:240px;overflow:auto";
        let plan = null;
        const update = () => {
          plan = null;
          try {
            plan = planCardPack(node, pack, strategy.value);
            detail.textContent = [[text("新增", "New"), plan.added], [text("同名冲突", "Conflicts"), plan.conflicts],
              [text("将覆盖", "Will replace"), plan.replaced], [text("跳过同名", "Skipped existing"), plan.skipped],
              [text("不适用模块", "Inapplicable"), plan.inapplicable]].map(([label, cards]) => `${label}: ${cards.length}\n${cards.map(c => `${moduleLabel(c.module)} / ${c.name}`).join("\n")}`).join("\n");
          } catch (e) { detail.textContent = e.message; }
        };
        strategy.addEventListener("change", update); packPreview.append(strategy, detail); update();
        button(packPreview, "确认导入卡片包", "Confirm Import Pack", () => {
          if (!plan) { update(); return; }
          if (plan.base !== collectionStamp(node)) { update(); status.textContent = changedCollection().message; return; }
          if (plan.replaced.length && !window.confirm(text("确认覆盖这些同类型同名卡片？", "Replace these cards of the same type and name?"))) return;
          requireLive();
          if (plan.base !== collectionStamp(node)) { update(); status.textContent = changedCollection().message; return; }
          const result = commitCardPack(node, plan);
          clearPack(); refresh();
          status.textContent = result.added.length || result.replaced.length
            ? text(`已新增 ${result.added.length}、覆盖 ${result.replaced.length}、跳过同名 ${result.skipped.length}、不适用 ${result.inapplicable.length} 张；请保存工作流。`,
              `Added ${result.added.length}, replaced ${result.replaced.length}, skipped existing ${result.skipped.length}, inapplicable ${result.inapplicable.length}. Save the workflow.`)
            : text("没有可导入的卡片，卡片库未变化。", "No cards to import; library unchanged.");
        });
        button(packPreview, "取消", "Cancel", clearPack);
      } finally { input.remove(); }
    })); input.click();
  });
  dialog.append(status);
  button(row(), "关闭", "Close", () => dialog.close());
  dialog.addEventListener("compositionstart", () => { composing = true; });
  dialog.addEventListener("compositionend", () => { composing = false; refresh(); });
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape" && !composing && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      dialog.close();
    }
    if (event.key === "Enter" && (composing || event.isComposing || event.keyCode === 229)) return;
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

globalThis.__vividMuseContentCards = { captureResultCard, saveCard, openCardsPanel };

app.registerExtension({
  name:"VividMuse.ZImagePromptBuilder.WorkflowTools",
  beforeRegisterNodeDef(nodeType, nodeData) {
    const inputs = {...nodeData.input?.required, ...nodeData.input?.optional};
    for (const moduleName of CARD_MODULES) {
      const names = moduleGroups()[moduleName];
      if (names?.length && names.every(name => Array.isArray(inputs[name]?.[0]))) {
        cardSchemas.set(moduleName, {comfyClass: nodeData.name, widgets: names.map(name => ({
          name, value: inputs[name][0][0], options: {values: [...inputs[name][0]]},
        }))});
      }
    }
    if(nodeData.name !== "VividMuse_ZImageChinesePromptBuilder" && !/^VividMuse_ZImage(?:Canvas|Person|Hair|Clothing|Pose|Scene|Camera|Visual)Module$/.test(nodeData.name)) return;
    const previous=nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions=function(_,options) {
      const result=previous?.apply(this,arguments);
      options.push({content:text("卡片管理 / 模块锁定","Cards / Module Locks"),callback:()=>openCardsPanel(this)});
      options.push({content:text("用户预设 / 随机锁定 / 组合检查","User Presets / Random Locks / Checks"),callback:()=>openPanel(this)});
      return result;
    };
    for (const event of ["onRemoved", "onConfigure"]) {
      const before = nodeType.prototype[event];
      nodeType.prototype[event] = function () {
        this.__vividMuseCardsGeneration = (this.__vividMuseCardsGeneration || 0) + 1;
        this.__vividMuseCardsDialog?.close();
        return before?.apply(this, arguments);
      };
    }
  },
});
