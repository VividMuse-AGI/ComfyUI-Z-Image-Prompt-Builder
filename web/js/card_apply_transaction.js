// Shared atomic field application for content cards and quick combinations.
// Validation/preview ownership belongs to callers; no card-library writes here.
const LOCKS = "vividMuseRandomLocks";
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;

function snapshotControl(control) {
  const value = control.value, descriptors = Object.getOwnPropertyDescriptors(control);
  const options = control.options, optionDescriptors = options && Object.getOwnPropertyDescriptors(options);
  if (optionDescriptors?.values && Array.isArray(optionDescriptors.values.value))
    optionDescriptors.values = {...optionDescriptors.values, value: [...optionDescriptors.values.value]};
  return () => {
    for (const key of Reflect.ownKeys(control)) if (!Object.hasOwn(descriptors, key)
        && Object.getOwnPropertyDescriptor(control, key)?.configurable) delete control[key];
    Object.defineProperties(control, descriptors);
    if (control.value !== value) control.value = value;
    if (options && optionDescriptors) {
      for (const key of Reflect.ownKeys(options)) if (!Object.hasOwn(optionDescriptors, key)
          && Object.getOwnPropertyDescriptor(options, key)?.configurable) delete options[key];
      Object.defineProperties(options, optionDescriptors);
    }
  };
}

export function commitCardFields(node, plan, validate) {
  validate();
  if (!plan.changed) return {changed: false, modules: [...plan.modules], fields: 0};
  const graph = node.graph;
  if (Boolean(graph?.beforeChange) !== Boolean(graph?.afterChange)) throw new Error(text(
    "工作流撤销接口不完整，未应用卡片。", "Incomplete workflow undo hooks; cards were not applied."));
  const restoreWidgets = node.widgets.map(snapshotControl);
  const targets = new Map(plan.rows.map(row => [row.name, row.target]));
  const expectedValues = node.widgets.filter(w => w.serialize !== false && w.options?.serialize !== false)
    .map(w => [w, targets.has(w.name) ? targets.get(w.name) : w.value]);
  const properties = node.properties, descriptors = properties && Object.getOwnPropertyDescriptors(properties);
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
    validate();
    attemptedWrite = true;
    for (const row of plan.rows) node.widgets.find(w => w.name === row.name).value = row.target;
    if (plan.newLocks.length) {
      node.properties ??= {};
      node.properties[LOCKS] = [...new Set([...(node.properties[LOCKS] ?? []), ...plan.newLocks])];
    }
    for (const module of plan.modules) node.__vividMuseRefreshCardScope?.(module);
    globalThis.__vividMuseZImageI18n?.localizeNode?.(node);
    globalThis.__vividMusePromptDiagnostics?.refresh(node);
    if (expectedValues.some(([control, value]) => control.value !== value)) throw new Error(text(
      "刷新后字段与预览不一致。", "Refreshed fields differ from the preview."));
  } catch (error) {
    if (attemptedWrite) restore();
    if (began) { try { graph?.afterChange?.(); } catch { /* retain original failure */ } }
    throw error;
  }
  try { graph?.afterChange?.(); } catch (error) { restore(); throw error; }
  try { node.setDirtyCanvas?.(true, true); graph?.setDirtyCanvas?.(true, true); } catch { /* committed */ }
  return {changed: true, modules: [...plan.modules], fields: plan.rows.filter(row => row.changed).length};
}
