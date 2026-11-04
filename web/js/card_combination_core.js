// Plan all selected cards before writing any field. No UI, persistence or queue calls.
import { validateCard, cardDifference, findConflicts } from "./workflow_tools.js";
import { validateShootPlan, planShootPlanApply, snapshotWidget } from "./shoot_plan_core.js";

const FULL = "VividMuse_ZImageChinesePromptBuilder";
const LOCKS = "vividMuseRandomLocks";
const CONTENT = "vividMuseContentCards", SHOOT = "vividMuseShootPlanCards";
const ORDER = ["人物", "服装", "场景", "摄影", "视觉表现"];
const issued = new WeakMap();
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;
const label = name => text(name, {人物: "Person", 服装: "Clothing", 场景: "Scene", 摄影: "Camera", 视觉表现: "Visual"}[name] || name);
const stale = () => new Error(text("状态已变化，请重新预览并确认。", "State changed. Preview and confirm again."));
const copy = value => JSON.parse(JSON.stringify(value));
const widget = (node, name) => node.widgets?.find(w => w.name === name);
const groups = () => globalThis.__vividMuseZImagePromptData?.MODULE_FIELD_GROUPS || {};
const type = node => node?.comfyClass || node?.constructor?.type;
const record = value => value && typeof value === "object" && !Array.isArray(value);
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export function supportsCardCombination(node) { return type(node) === FULL; }

function locks(node) {
  const value = node.properties?.[LOCKS] ?? [], names = new Set(Object.values(groups()).flat());
  if (!Array.isArray(value) || value.some(name => typeof name !== "string" || !names.has(name)))
    throw new Error(text("随机锁定数据不正确。", "Invalid random lock data."));
  return value;
}

function savedSource(node, store, entry) {
  const library = node.properties?.[store];
  if (!Array.isArray(library)) throw new Error(text("所选卡片库不可用。", "The selected card library is unavailable."));
  const matches = library.filter(card => card?.name === entry.name && (store !== CONTENT || card?.module === entry.module));
  if (matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(entry)) throw stale();
  return {store, name: entry.name, module: entry.module};
}

function sourceStamp(node, sources) {
  return sources.map(source => {
    const library = node.properties?.[source.store];
    if (!Array.isArray(library)) return null;
    return library.filter(card => card?.name === source.name && (source.store !== CONTENT || card?.module === source.module));
  });
}

function targetStamp(node, sources) {
  return JSON.stringify({type: type(node),
    widgets: node.widgets?.map(w => [w.name, w.value, w.options?.values, w.__vividMuseAllValues]),
    inputs: node.inputs?.map(input => [input.name, input.link]), locks: node.properties?.[LOCKS],
    active: node.properties?.vividMuseActiveModule, only: node.properties?.vividMuseOnlyEnabledModule,
    preset: globalThis.__vividMuseZImagePromptData?.PRESETS?.[widget(node, "预设")?.value],
    sources: sourceStamp(node, sources)});
}

export function planCardCombination(node, selection = {}) {
  if (!supportsCardCombination(node)) throw new Error(text("快捷组合仅支持完整节点。", "Quick combination is available on the full builder only."));
  const keys = ["person", "outfit", "shootPlan", "shootModules", "lockModules"];
  if (!record(selection) || Reflect.ownKeys(selection).some(key => !keys.includes(key)))
    throw new Error(text("组合选项不正确。", "Invalid combination options."));
  const existingLocks = locks(node), rows = [], sources = [];
  for (const [key, module] of [["person", "人物"], ["outfit", "服装"]]) {
    const entry = selection[key];
    if (entry == null) continue; // Keep current, never clear this module implicitly.
    try {
      if (entry.module !== module) throw new Error(text("卡片类型不匹配。", "Card type does not match."));
      validateCard(entry, node);
      sources.push(savedSource(node, CONTENT, entry));
      const diff = cardDifference(node, entry);
      if (diff.blocked) throw new Error(diff.blocked);
      rows.push(...diff.rows.map(row => ({...row, module, source: entry.name})));
    } catch (error) { throw new Error(`${label(module)}: ${error.message}`); }
  }
  if (selection.shootPlan != null) {
    const entry = validateShootPlan(selection.shootPlan, node);
    const selected = selection.shootModules ?? Object.keys(entry.modules);
    if (!Array.isArray(selected)) throw new Error(text("拍摄模块选项不正确。", "Invalid shoot module selection."));
    // Unchecking every shoot module means keep those modules, even with a card selected.
    if (selected.length) {
      sources.push(savedSource(node, SHOOT, selection.shootPlan));
      const diff = planShootPlanApply(node, entry, selected, false);
      rows.push(...diff.rows.map(row => ({...row, source: entry.name})));
    }
  } else if (selection.shootModules !== undefined && (!Array.isArray(selection.shootModules) || selection.shootModules.length)) {
    throw new Error(text("请先选择拍摄方案卡。", "Select a shoot plan card first."));
  }
  if (!rows.length) throw new Error(text("请至少选择一张卡片及其应用模块。", "Select at least one card and a module to apply."));
  const modules = ORDER.filter(module => rows.some(row => row.module === module));
  const lockModules = selection.lockModules ?? [];
  if (!Array.isArray(lockModules) || new Set(lockModules).size !== lockModules.length || lockModules.some(module => !modules.includes(module)))
    throw new Error(text("只能锁定本次参与应用的模块。", "Only modules applied in this combination can be locked."));
  const newLocks = rows.filter(row => lockModules.includes(row.module) && !existingLocks.includes(row.name)).map(row => row.name);
  const warnings = [];
  if (rows.some(row => existingLocks.includes(row.name))) warnings.push(text(
    "本次显式应用也会更新所选模块中已锁定的字段。", "This explicit application also updates locked fields in the selected modules."));
  const active = Object.entries(groups()).filter(([, names]) => names.some(name => {
    const control = widget(node, name); return control && control.value !== "不使用";
  })).map(([name]) => name);
  const priorOnly = active.length === 1 ? active[0] : active.length === 0 ? node.properties?.vividMuseOnlyEnabledModule : undefined;
  if (priorOnly && rows.some(row => row.module !== priorOnly && row.target !== "不使用")) warnings.push(text(
    "应用后将增加有效模块，后续随机操作不再只针对原模块。", "Applying adds active modules; subsequent randomization will no longer target only the original module."));
  const targets = new Map(rows.map(row => [row.name, row.target]));
  warnings.push(...findConflicts({...node, widgets: node.widgets.map(w => ({...w, value: targets.has(w.name) ? targets.get(w.name) : w.value})),
    properties: {...node.properties, [LOCKS]: [...existingLocks, ...newLocks]}}));
  const plan = freeze({modules, rows, newLocks, lockModules: [...lockModules], warnings: [...new Set(warnings)],
    changed: rows.some(row => row.changed) || newLocks.length > 0});
  issued.set(plan, {node, graph: node.graph, properties: node.properties, generation: node.__vividMuseCardsGeneration,
    sources, stamp: targetStamp(node, sources), widgets: [...node.widgets], selection: copy(selection)});
  return plan;
}

export function commitCardCombination(node, plan) {
  const transaction = issued.get(plan);
  const unchanged = () => transaction && transaction.node === node && transaction.graph === node.graph
    && transaction.properties === node.properties && transaction.generation === node.__vividMuseCardsGeneration
    && transaction.widgets.length === node.widgets?.length && transaction.widgets.every((w, index) => node.widgets[index] === w)
    && (!node.graph?.getNodeById || node.graph.getNodeById(node.id) === node)
    && transaction.stamp === targetStamp(node, transaction.sources);
  // Stale attempts are consumed too; restoring old values must not revive a preview.
  if (transaction?.node === node) issued.delete(plan);
  if (!unchanged()) throw stale();
  if (!plan.changed) return {changed: false, modules: [...plan.modules], fields: 0};
  // Revalidate before writing without calling either existing single-card commit function.
  const fresh = planCardCombination(node, transaction.selection);
  issued.delete(fresh);
  const graph = node.graph;
  if (Boolean(graph?.beforeChange) !== Boolean(graph?.afterChange)) throw new Error(text(
    "工作流撤销接口不完整，未应用组合。", "Incomplete workflow undo hooks; combination was not applied."));
  const restoreWidgets = node.widgets.map(snapshotWidget);
  const targets = new Map(plan.rows.map(row => [row.name, row.target]));
  const expectedValues = node.widgets.filter(w => w.serialize !== false && w.options?.serialize !== false)
    .map(w => [w, targets.has(w.name) ? targets.get(w.name) : w.value]);
  const properties = node.properties;
  const descriptors = properties && Object.getOwnPropertyDescriptors(properties);
  const size = node.size && [...node.size];
  const restore = () => {
    for (const restoreWidget of restoreWidgets) restoreWidget();
    node.properties = properties;
    if (properties) {
      for (const key of Reflect.ownKeys(properties)) if (!Object.hasOwn(descriptors, key)
        && Object.getOwnPropertyDescriptor(properties, key)?.configurable) delete properties[key];
      Object.defineProperties(properties, descriptors);
    }
    if (size && node.size) for (let i = 0; i < size.length; i++) node.size[i] = size[i];
  };
  let began = false, attemptedWrite = false;
  try {
    graph?.beforeChange?.(); began = true;
    if (!unchanged()) throw stale();
    attemptedWrite = true;
    for (const row of plan.rows) widget(node, row.name).value = row.target;
    if (plan.newLocks.length) {
      node.properties ??= {};
      node.properties[LOCKS] = [...new Set([...locks(node), ...plan.newLocks])];
    }
    for (const module of plan.modules) node.__vividMuseRefreshCardScope?.(module);
    globalThis.__vividMuseZImageI18n?.localizeNode?.(node);
    globalThis.__vividMusePromptDiagnostics?.refresh(node);
    if (expectedValues.some(([control, value]) => control.value !== value)) throw new Error(text(
      "刷新后字段与预览不一致。", "Refreshed fields differ from the preview."));
  } catch (error) {
    if (attemptedWrite) restore();
    if (began) { try { graph?.afterChange?.(); } catch { /* original failure remains actionable */ } }
    throw error;
  }
  try { graph?.afterChange?.(); }
  catch (error) { restore(); throw error; }
  try { node.setDirtyCanvas?.(true, true); graph?.setDirtyCanvas?.(true, true); } catch { /* already committed */ }
  return {changed: true, modules: [...plan.modules], fields: plan.rows.filter(row => row.changed).length};
}
