// Structured shooting cards are separate from the v1 person/outfit card format.
// This module never resolves random values, writes unrelated modules or runs a graph.
export const SHOOT_PLAN_MODULES = Object.freeze(["场景", "摄影", "视觉表现"]);
export const SHOOT_PLAN_STORE = "vividMuseShootPlanCards";
const KIND = "vividmuse-shoot-plan-card";
const LOCKS = "vividMuseRandomLocks";
const EMPTY = "不使用", FOLLOW = "跟随预设", RANDOM = "随机抽取";
const definitions = new Map();
const issuedPlans = new WeakMap();
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;
const label = name => {
  const i18n = globalThis.__vividMuseZImageI18n;
  if (i18n?.activeLanguage() !== "en") return name;
  return {"场景": "Scene", "摄影": "Camera", "视觉表现": "Visual"}[name]
    || i18n.translateMessage?.(name) || name;
};
const clone = value => JSON.parse(JSON.stringify(value));
const data = () => globalThis.__vividMuseZImagePromptData || {};
const groups = () => data().MODULE_FIELD_GROUPS || {};
const widget = (node, name) => node.widgets?.find(item => item.name === name);
const typeOf = node => node?.comfyClass || node?.constructor?.type;
const supportedType = type => type === "VividMuse_ZImageChinesePromptBuilder"
  || /^VividMuse_ZImage(?:Scene|Camera|Visual)Module$/.test(type || "");
const dirty = node => { node.setDirtyCanvas?.(true, true); node.graph?.setDirtyCanvas?.(true, true); };
const record = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.prototype.toString.call(value) === "[object Object]";
const exactKeys = (value, names) => record(value) && Reflect.ownKeys(value).length === names.length
  && names.every(name => Object.hasOwn(value, name));
const changed = () => new Error(text("状态已变化，请重新预览并确认。", "State changed. Preview and confirm again."));
const collectionChanged = () => new Error(text("拍摄方案卡库已变化，请重新确认。", "The shoot plan library changed. Confirm again."));
const preset = node => data().PRESETS?.[widget(node, "预设")?.value] || {};
const locks = node => {
  const value = node.properties?.[LOCKS] ?? [];
  if (!Array.isArray(value) || value.some(name => typeof name !== "string"))
    throw new Error(text("随机锁定数据不正确。", "Invalid random lock data."));
  return value;
};

function normalizedName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw new Error(text("名称需为 1–80 个字符。", "Use a name of 1–80 characters."));
  return value.trim();
}

function moduleFields(moduleName) {
  const names = groups()[moduleName];
  if (!SHOOT_PLAN_MODULES.includes(moduleName) || !Array.isArray(names) || !names.length)
    throw new Error(text("拍摄模块校验数据尚未就绪。", "Shoot plan validation data is not ready."));
  return names;
}

export function registerShootPlanSchema(nodeData) {
  if (!supportedType(nodeData?.name)) return;
  // Keep definitions even if the shared catalog has not been loaded yet.
  const inputs = {...nodeData.input?.required, ...nodeData.input?.optional};
  definitions.set(nodeData.name, Object.fromEntries(Object.entries(inputs)
    .filter(([, input]) => Array.isArray(input?.[0]))
    .map(([name, input]) => [name, [...input[0]]])));
}

export function availableShootPlanModules(node) {
  if (!supportedType(typeOf(node))) return [];
  return SHOOT_PLAN_MODULES.filter(moduleName => {
    const names = groups()[moduleName];
    return names?.length && names.every(name => widget(node, name));
  });
}

function choicesFor(node, moduleName, name) {
  const schemas = [definitions.get(typeOf(node)), ...definitions.values()].filter(Boolean);
  const schema = schemas.find(input => moduleFields(moduleName).every(key => Array.isArray(input[key])));
  if (schema) return schema[name];
  // Current widgets are a fallback only for an owned module. The scene dropdown
  // is filtered, so use the existing full catalog rather than its current slice.
  if (availableShootPlanModules(node).includes(moduleName)) {
    if (name === "场景地点") {
      const all = data().SCENE_LOCATION_VALUES;
      if (Array.isArray(all)) return [EMPTY, ...all];
    }
    const control = widget(node, name);
    const choices = control?.__vividMuseAllValues || control?.options?.values;
    if (Array.isArray(choices)) return choices;
  }
  throw new Error(text("模块选项校验数据尚未就绪，请稍后重试。", "Module option schemas are not ready. Try again shortly."));
}

function validateModule(node, moduleName, values) {
  const names = moduleFields(moduleName);
  if (!exactKeys(values, names)) throw new Error(text(
    "模块必须包含全部字段且不能带有未知字段：", "A module must contain every field and no unknown fields: ") + label(moduleName));
  for (const name of names) {
    const value = values[name];
    if (typeof value !== "string" || value === FOLLOW || value === RANDOM ||
        (value !== EMPTY && !choicesFor(node, moduleName, name).includes(value)))
      throw new Error(text("字段必须是有效的具体选项：", "Use a valid concrete option for: ") + label(name));
  }
  if (names.every(name => values[name] === EMPTY)) throw new Error(text(
    "不能保存全部为不使用的模块：", "Cannot save an entirely unused module: ") + label(moduleName));
  if (moduleName === "场景" && values["场景大类"] !== EMPTY && values["场景地点"] !== EMPTY) {
    const allowed = data().SCENE_LOCATIONS_BY_CATEGORY?.[values["场景大类"]];
    if (!Array.isArray(allowed)) throw new Error(text("场景分类校验数据尚未就绪。", "Scene category validation is not ready."));
    if (!allowed.includes(values["场景地点"])) throw new Error(text(
      "场景大类与场景地点不一致。", "Scene category and location do not match."));
  }
}

export function validateShootPlan(entry, node) {
  if (!supportedType(typeOf(node))) throw new Error(text("此节点不支持拍摄方案卡。", "This node does not support shoot plan cards."));
  if (!exactKeys(entry, ["kind", "version", "name", "modules"]) || entry.kind !== KIND || entry.version !== 1
      || typeof entry.name !== "string" || normalizedName(entry.name) !== entry.name || !record(entry.modules))
    throw new Error(text("拍摄方案卡格式不正确。", "Invalid shoot plan card format."));
  const modules = Reflect.ownKeys(entry.modules);
  if (!modules.length || modules.length > 3 || modules.some(name => !SHOOT_PLAN_MODULES.includes(name)))
    throw new Error(text("拍摄方案卡只能包含场景、摄影或视觉表现。", "A shoot plan may contain only Scene, Camera or Visual modules."));
  for (const moduleName of modules) validateModule(node, moduleName, entry.modules[moduleName]);
  return {kind: KIND, version: 1, name: entry.name, modules: Object.fromEntries(
    SHOOT_PLAN_MODULES.filter(name => Object.hasOwn(entry.modules, name)).map(name => [name,
      Object.fromEntries(moduleFields(name).map(field => [field, entry.modules[name][field]]))]))};
}

function selectedModules(node, moduleNames, entry) {
  if (!Array.isArray(moduleNames) || !moduleNames.length || new Set(moduleNames).size !== moduleNames.length
      || moduleNames.some(name => !availableShootPlanModules(node).includes(name)
        || (entry && !Object.hasOwn(entry.modules, name))))
    throw new Error(text("请至少选择一个本节点可用的卡片模块。", "Select at least one card module supported by this node."));
  return SHOOT_PLAN_MODULES.filter(name => moduleNames.includes(name));
}

function checkWritable(node, moduleName) {
  const names = moduleFields(moduleName), replacement = `用户${moduleName}片段`;
  if (node.inputs?.some(input => input.link != null && (names.includes(input.name) || input.name === replacement)))
    throw new Error(`${label(moduleName)}: ` + text("该模块有已连接输入，请先断开连接。", "Disconnect linked inputs in this module first."));
  if (String(widget(node, replacement)?.value || "").trim())
    throw new Error(`${label(moduleName)}: ` + text("该模块使用 TXT 替换，请先清空对应用户片段。", "This module uses a TXT replacement. Clear its user snippet first."));
}

export function captureShootPlan(node, moduleNames, name) {
  const modules = {}, currentPreset = preset(node);
  for (const moduleName of selectedModules(node, moduleNames)) {
    checkWritable(node, moduleName);
    modules[moduleName] = Object.fromEntries(moduleFields(moduleName).map(field => {
      const value = widget(node, field).value;
      if (value === RANDOM) throw new Error(text(
        "请先选择具体值，或执行节点后从结果保存。字段：",
        "Choose a concrete value, or run the node and save from its result. Field: ") + label(field));
      return [field, value === FOLLOW ? currentPreset[field] : value];
    }));
  }
  return validateShootPlan({kind: KIND, version: 1, name: normalizedName(name), modules}, node);
}

export function captureResultShootPlan(node, result, moduleNames, name) {
  const selected = selectedModules(node, moduleNames);
  if (result?.version !== 1 || result?.shoot_plan_candidates?.version !== 1)
    throw new Error(text("此记录不包含拍摄方案数据，请重新执行。", "This record has no shoot plan data. Run the node again."));
  const reasons = {
    user_replaced: text("此模块由 TXT 或用户片段替代，不能转为结构化卡片。", "This module uses a TXT or user replacement and cannot become a structured card."),
    empty_module: text("此模块在该次执行中没有可保存的输出。", "This module has no saveable output in this execution."),
    incomplete_fields: text("此记录缺少完整字段，不能补填保存。", "This record lacks complete fields; missing values will not be filled in."),
    unsupported_values: text("此记录包含无效或未解析选项。", "This record contains invalid or unresolved options."),
    incompatible_scene: text("此记录的场景大类与地点不一致。", "The scene category and location in this record do not match."),
  };
  const modules = {};
  for (const module of selected) {
    if (!["全部模块", module].includes(result.scope))
      throw new Error(text("该记录不包含所选模块。", "The record does not include the selected module."));
    const candidate = result.shoot_plan_candidates.modules?.[module];
    if (candidate?.available !== true) throw new Error(`${label(module)}: ` + (reasons[candidate?.reason]
      || text("此记录没有可用的模块数据。", "No usable module data in this record.")));
    const rendered = Array.isArray(result.modules) ? result.modules.filter(item => item?.name === module) : [];
    if (rendered.length !== 1 || rendered[0].source !== "builtin" ||
        ![rendered[0].zh, rendered[0].en].some(value => typeof value === "string" && value.trim()))
      throw new Error(text("此模块不是可保存的内置执行结果。", "This module is not a saveable built-in execution result."));
    modules[module] = candidate.values;
  }
  // Only historical canonical fields: current connections, TXT replacements and
  // editor values must never alter or fill this snapshot. Check them on apply.
  return validateShootPlan({kind: KIND, version: 1, name: normalizedName(name), modules}, node);
}

export function validateShootPlanPack(pack, node) {
  if (!exactKeys(pack, ["kind", "version", "cards"]) || pack.kind !== "vividmuse-shoot-plan-card-pack"
      || pack.version !== 1 || !Array.isArray(pack.cards) || !pack.cards.length || pack.cards.length > 100)
    throw new Error(text("拍摄方案卡包格式不正确，需包含 1–100 张卡片。", "Invalid shoot plan pack; include 1–100 cards."));
  const seen = new Set();
  const cards = pack.cards.map(card => {
    const entry = validateShootPlan(card, node);
    if (seen.has(entry.name)) throw new Error(text("卡片包包含同名卡片。", "The pack contains duplicate card names."));
    seen.add(entry.name); return entry;
  });
  return {kind: "vividmuse-shoot-plan-card-pack", version: 1, cards};
}

const importPlans = new WeakMap();
export function planShootPlanImport(node, input, strategy = "skip") {
  if (!["skip", "replace"].includes(strategy)) throw new Error(text("导入策略不正确。", "Invalid import strategy."));
  const pack = input?.kind === KIND
    ? {kind: "vividmuse-shoot-plan-card-pack", version: 1, cards: [validateShootPlan(input, node)]}
    : validateShootPlanPack(input, node);
  const current = listShootPlans(node), supported = availableShootPlanModules(node);
  const added = [], replaced = [], skipped = [], inapplicable = [];
  for (const card of pack.cards) {
    if (!Object.keys(card.modules).some(module => supported.includes(module))) { inapplicable.push(card.name); continue; }
    if (current.some(item => item.name === card.name)) (strategy === "replace" ? replaced : skipped).push(card.name);
    else added.push(card.name);
  }
  if (current.length + added.length > 100) throw new Error(text("导入后超过 100 张拍摄方案卡上限。", "Import would exceed the limit of 100 shoot plan cards."));
  const plan = Object.freeze({added: Object.freeze(added), replaced: Object.freeze(replaced),
    skipped: Object.freeze(skipped), inapplicable: Object.freeze(inapplicable), strategy});
  importPlans.set(plan, {node, pack, strategy, base: shootPlanCollectionStamp(node),
    supported: JSON.stringify(supported), generation: node.__vividMuseCardsGeneration});
  return plan;
}

export function commitShootPlanImport(node, plan) {
  const transaction = importPlans.get(plan);
  if (!transaction || transaction.node !== node) throw collectionChanged();
  if (transaction.base !== shootPlanCollectionStamp(node)
      || transaction.supported !== JSON.stringify(availableShootPlanModules(node))
      || transaction.generation !== node.__vividMuseCardsGeneration) throw collectionChanged();
  // Revalidate every card, even inapplicable modules, before the single write.
  const checked = validateShootPlanPack(transaction.pack, node);
  const nextPlan = planShootPlanImport(node, checked, transaction.strategy);
  importPlans.delete(nextPlan); importPlans.delete(plan);
  if (!nextPlan.added.length && !nextPlan.replaced.length) return nextPlan;
  const incoming = new Map(checked.cards.filter(card => nextPlan.added.includes(card.name)
    || nextPlan.replaced.includes(card.name)).map(card => [card.name, card]));
  const next = listShootPlans(node).map(card => incoming.get(card.name) || card);
  next.push(...checked.cards.filter(card => nextPlan.added.includes(card.name)));
  node.properties ??= {};
  node.properties[SHOOT_PLAN_STORE] = clone(next);
  dirty(node);
  return nextPlan;
}

export function listShootPlans(node) {
  const cards = node.properties?.[SHOOT_PLAN_STORE] ?? [];
  if (!Array.isArray(cards) || cards.length > 100)
    throw new Error(text("已保存拍摄方案卡格式或数量异常。", "Invalid saved shoot plan collection or capacity."));
  const names = new Set();
  for (const entry of cards) {
    validateShootPlan(entry, node);
    if (names.has(entry.name)) throw new Error(text("已保存拍摄方案卡存在重名。", "Saved shoot plans contain duplicate names."));
    names.add(entry.name);
  }
  return cards;
}

export function shootPlanCollectionStamp(node) { return JSON.stringify(listShootPlans(node)); }

function checkCollection(node, expected) {
  if (expected !== undefined && shootPlanCollectionStamp(node) !== expected) throw collectionChanged();
}

export function saveShootPlan(node, entry, replace = false, expectedCollection) {
  checkCollection(node, expectedCollection);
  const validated = validateShootPlan(entry, node), cards = listShootPlans(node);
  if (!Object.keys(validated.modules).some(name => availableShootPlanModules(node).includes(name)))
    throw new Error(text("此卡片没有本节点可用的模块。", "This card has no module supported by this node."));
  const existing = cards.find(card => card.name === validated.name);
  if (existing && !replace) throw new Error(text("已有同名拍摄方案卡，请确认覆盖。", "Confirm replacement of the existing shoot plan."));
  if (!existing && cards.length >= 100) throw new Error(text("最多保存 100 张拍摄方案卡。", "Maximum 100 saved shoot plans."));
  node.properties ??= {};
  node.properties[SHOOT_PLAN_STORE] = existing
    ? cards.map(card => card === existing ? validated : card) : [...cards, validated];
  dirty(node);
  return clone(validated);
}

function originalCard(node, original, expected) {
  checkCollection(node, expected);
  const source = listShootPlans(node).find(card => card.name === original?.name);
  if (!source || JSON.stringify(source) !== JSON.stringify(original)) throw collectionChanged();
  return source;
}

export function renameShootPlan(node, original, name, replace = false, expectedCollection = shootPlanCollectionStamp(node)) {
  const source = originalCard(node, original, expectedCollection);
  const entry = validateShootPlan({...source, name: normalizedName(name)}, node);
  if (entry.name === source.name) return clone(entry);
  const cards = listShootPlans(node);
  if (cards.some(card => card.name === entry.name) && !replace)
    throw new Error(text("已有同名拍摄方案卡，请确认覆盖。", "Confirm replacement of the existing shoot plan."));
  node.properties[SHOOT_PLAN_STORE] = cards.filter(card => card.name !== entry.name)
    .map(card => card === source ? entry : card);
  dirty(node);
  return clone(entry);
}

export function deleteShootPlan(node, original, expectedCollection = shootPlanCollectionStamp(node)) {
  const source = originalCard(node, original, expectedCollection);
  node.properties[SHOOT_PLAN_STORE] = listShootPlans(node).filter(card => card !== source);
  dirty(node);
}

function effectiveModules(node) {
  return Object.entries(groups()).filter(([, names]) => names.some(name => {
    const control = widget(node, name);
    return control && control.value !== EMPTY;
  })).map(([name]) => name);
}

function targetStamp(node, moduleNames) {
  const names = moduleNames.flatMap(moduleFields), replacements = moduleNames.map(name => `用户${name}片段`);
  return JSON.stringify({type: typeOf(node), fields: names.map(name => {
    const control = widget(node, name);
    return [name, control?.value, control?.options?.values];
  }), replacements: replacements.map(name => [name, widget(node, name)?.value]),
    inputs: (node.inputs || []).filter(input => names.includes(input.name) || replacements.includes(input.name))
      .map(input => [input.name, input.link]), locks: locks(node), preset: widget(node, "预设")?.value,
    presetValues: names.map(name => preset(node)[name]), enabled: effectiveModules(node),
    only: node.properties?.vividMuseOnlyEnabledModule, generation: node.__vividMuseCardsGeneration,
    collection: shootPlanCollectionStamp(node)});
}

export function planShootPlanApply(node, entry, moduleNames, lock = false) {
  if (typeof lock !== "boolean") throw new Error(text("锁定选项不正确。", "Invalid lock option."));
  const validated = validateShootPlan(entry, node), selected = selectedModules(node, moduleNames, validated);
  selected.forEach(moduleName => checkWritable(node, moduleName));
  const currentPreset = preset(node), existingLocks = locks(node), rows = selected.flatMap(moduleName =>
    moduleFields(moduleName).map(name => {
      const current = widget(node, name).value, target = validated.modules[moduleName][name];
      return {module: moduleName, name, current, target, changed: current !== target,
        preset: current === FOLLOW ? currentPreset[name] : undefined};
    }));
  const enabled = effectiveModules(node), warnings = [];
  const onlyHint = node.properties?.vividMuseOnlyEnabledModule;
  const priorOnly = enabled.length === 1 ? enabled[0]
    : enabled.length === 0 && Object.hasOwn(groups(), onlyHint) ? onlyHint : undefined;
  if (priorOnly && selected.some(name => name !== priorOnly)) warnings.push(text(
    "应用后将增加有效模块，后续随机操作不再只针对原模块。",
    "Applying adds active modules; subsequent randomization will no longer target only the original module."));
  if (rows.some(row => existingLocks.includes(row.name))) warnings.push(text(
    "本次显式应用也会更新所选模块中已锁定的字段。",
    "This explicit application also updates locked fields in the selected modules."));
  const plan = Object.freeze({moduleNames: Object.freeze([...selected]), rows: Object.freeze(rows.map(Object.freeze)),
    warnings: Object.freeze(warnings), newLocks: Object.freeze(rows.map(row => row.name).filter(name => !existingLocks.includes(name))), lock});
  issuedPlans.set(plan, {node, entry: validated, original: entry, originalStamp: JSON.stringify(entry),
    selected, lock, target: targetStamp(node, selected), controls: rows.map(row => widget(node, row.name))});
  return plan;
}

function snapshotWidget(control) {
  const value = control.value;
  const descriptors = Object.getOwnPropertyDescriptors(control);
  // options are mutated by dependency refreshes; remember their descriptors too.
  const options = control.options;
  const optionDescriptors = options && Object.getOwnPropertyDescriptors(options);
  if (optionDescriptors?.values && Array.isArray(optionDescriptors.values.value))
    optionDescriptors.values = {...optionDescriptors.values, value: [...optionDescriptors.values.value]};
  return () => {
    for (const key of Reflect.ownKeys(control)) if (!Object.hasOwn(descriptors, key)
        && Object.getOwnPropertyDescriptor(control, key)?.configurable) delete control[key];
    Object.defineProperties(control, descriptors);
    // Comfy can expose widget values through reactive accessors; restoring the
    // descriptor alone does not restore their backing value.
    if (control.value !== value) control.value = value;
    if (options && optionDescriptors) {
      for (const key of Reflect.ownKeys(options)) if (!Object.hasOwn(optionDescriptors, key)
          && Object.getOwnPropertyDescriptor(options, key)?.configurable) delete options[key];
      Object.defineProperties(options, optionDescriptors);
    }
  };
}

export function commitShootPlanApply(node, plan) {
  const transaction = issuedPlans.get(plan);
  if (!transaction || transaction.node !== node) throw changed();
  const {entry, selected, lock, original, originalStamp, controls} = transaction;
  if (JSON.stringify(original) !== originalStamp || targetStamp(node, selected) !== transaction.target
      || controls.some((control, index) => widget(node, plan.rows[index].name) !== control)) throw changed();
  validateShootPlan(entry, node);
  selectedModules(node, selected, entry).forEach(moduleName => checkWritable(node, moduleName));
  // Consume before writing: a failed commit needs a fresh, honest preview too.
  issuedPlans.delete(plan);
  const restorers = (node.widgets || []).map(snapshotWidget);
  const previousProperties = node.properties;
  const lockDescriptor = previousProperties && Object.getOwnPropertyDescriptor(previousProperties, LOCKS);
  const size = node.size && [...node.size];
  try {
    for (const moduleName of selected) for (const name of moduleFields(moduleName))
      widget(node, name).value = entry.modules[moduleName][name];
    if (lock) {
      node.properties ??= {};
      node.properties[LOCKS] = [...new Set([...locks(node), ...selected.flatMap(moduleFields)])];
    }
    selected.forEach(moduleName => node.__vividMuseRefreshCardScope?.(moduleName));
    globalThis.__vividMuseZImageI18n?.localizeNode(node);
    globalThis.__vividMusePromptDiagnostics?.refresh(node);
    dirty(node);
  } catch (error) {
    for (const restore of restorers) restore();
    if (!previousProperties) node.properties = previousProperties;
    else if (lockDescriptor) Object.defineProperty(previousProperties, LOCKS, lockDescriptor);
    else delete previousProperties[LOCKS];
    if (size && node.size) for (let index = 0; index < size.length; index++) node.size[index] = size[index];
    throw new Error(text("应用失败，已恢复本次字段和锁定：", "Application failed; fields and locks were restored: ") + error.message);
  }
  return {moduleNames: [...selected], locked: lock, changed: plan.rows.filter(row => row.changed).length};
}
