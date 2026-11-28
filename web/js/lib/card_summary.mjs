// Presentation only: caller supplies the existing domain validator, field groups
// and hidden-branch predicate. No editor values or persistent state are accepted.
const EMPTY = "不使用";
const CONTENT = ["人物", "发型", "服装", "姿态动作"];
const SHOOT = ["场景", "摄影", "视觉表现"];
const PRIORITY = {
  "人物": ["年龄阶段", "族裔大类", "基础身形", "肤色", "整体妆容预设", "底妆质感", "唇妆颜色"],
  "发型": ["发色", "发色色调", "染色方式", "头发长度", "发质与卷度", "发型造型", "刘海"],
  "服装": ["连衣裙类型", "连体服类型", "上装类型", "下装类型", "连衣裙颜色", "连体服颜色", "上装颜色", "下装颜色", "连衣裙材质", "连体服材质", "上装材质", "下装材质", "鞋履"],
  "姿态动作": ["基础姿态", "身体方向", "手部动作", "腿部动作", "视线", "表情"],
  "场景": ["场景地点", "背景环境", "时间切片"],
  "摄影": ["景别", "机位", "等效焦段"],
  "视觉表现": ["主光来源", "主配色", "影像风格"],
};
const copy = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function buildCardSummary(entry, {validate, fieldGroups, hiddenField, selectedModules} = {}) {
  if (entry === null) return {status: "keep-current"};
  if (typeof validate !== "function" || typeof hiddenField !== "function" || !record(fieldGroups))
    throw new TypeError("Summary requires the existing validator, field groups and hidden-field predicate");
  const card = copy(validate(copy(entry)));
  const isContent = card?.kind === "vividmuse-content-card";
  const isShoot = card?.kind === "vividmuse-shoot-plan-card";
  if ((!isContent && !isShoot) || card.version !== 1 || typeof card.name !== "string")
    throw new TypeError("Invalid validated summary input");
  if (isContent && !CONTENT.includes(card.module)) throw new TypeError("Unknown card module");
  if (isShoot && (!record(card.modules) || !Object.keys(card.modules).length || Object.keys(card.modules).some(m => !SHOOT.includes(m))))
    throw new TypeError("Unknown shoot-plan module");
  const modules = isContent ? [card.module] : SHOOT.filter(m => Object.hasOwn(card.modules, m));
  if (selectedModules !== undefined && (!Array.isArray(selectedModules) ||
      new Set(selectedModules).size !== selectedModules.length || selectedModules.some(m => !modules.includes(m))))
    throw new TypeError("Selected modules must be a subset of the card");
  const selected = selectedModules === undefined ? null : [...selectedModules];
  const groups = modules.map(module => {
    const values = isContent ? card.values : card.modules[module];
    const fields = fieldGroups[module];
    if (!Array.isArray(fields) || !fields.length || new Set(fields).size !== fields.length || !record(values)
        || Object.keys(values).length !== fields.length || fields.some(f => !Object.hasOwn(values, f)
          || typeof values[f] !== "string" || ["跟随预设", "随机抽取"].includes(values[f])))
      throw new TypeError("Summary requires a complete validated snapshot");
    const hidden = new Set(fields.filter(f => hiddenField(f, values)));
    const order = [...new Set([...PRIORITY[module], ...fields])].filter(f => fields.includes(f));
    const effective = order.filter(f => !hidden.has(f) && values[f] !== EMPTY);
    const items = effective.slice(0, isShoot ? 2 : 5).map(field => ({field, value: values[field]}));
    const clearCount = fields.filter(f => values[f] === EMPTY).length;
    return {module, totalFields: fields.length, items, omittedCount: effective.length - items.length,
      clearCount, allEmpty: clearCount === fields.length,
      hiddenValueCount: [...hidden].filter(f => values[f] !== EMPTY).length,
      selected: selected === null ? null : selected.includes(module)};
  });
  return {status: "summary", kind: card.kind, name: card.name, selectedModules: selected, groups};
}

// Text-only renderer; callers must assign this to textContent, not innerHTML.
export function formatCardSummary(summary, {language = "zh", fieldLabel = s => s,
  valueLabel = (_field, value) => value, moduleLabel} = {}) {
  const en = language === "en";
  const text = (zh, english) => en ? english : zh;
  const englishModules = {"人物":"Person", "发型":"Hair", "服装":"Clothing", "姿态动作":"Pose / Action", "场景":"Scene", "摄影":"Camera", "视觉表现":"Visual"};
  const label = moduleLabel || (m => en ? englishModules[m] || m : m);
  if (summary.status === "keep-current") return text("保持当前：此模块不修改。", "Keep Current: this module will not change.");
  if (summary.status !== "summary") throw new TypeError("Invalid summary");
  const lines = [text("卡片内容：", "Card contents: ") + summary.name];
  for (const g of summary.groups) {
    const application = g.selected === null ? "" : g.selected ? text(" · 本次应用", " · Applying") : text(" · 本次不应用", " · Not applying");
    lines.push(`${label(g.module)} · ${g.totalFields}${text(" 个字段", " fields")}${application}`);
    if (g.allEmpty) lines.push(g.selected === false
      ? text("此模块保存的是全空配置；本次未选择，不会清空。", "This module stores an all-Unused snapshot; it is not selected and will not be cleared.")
      : text("全空卡片：应用将清空此模块。", "All-Unused snapshot: applying will clear this module."));
    if (g.items.length) lines.push(g.items.map(r => `${fieldLabel(r.field)}: ${valueLabel(r.field, r.value)}`).join(text("；", "; ")));
    if (g.clearCount && !g.allEmpty) lines.push(g.selected === false
      ? text(`含 ${g.clearCount} 项明确清空值；本次未选择，不会写入。`, `Contains ${g.clearCount} explicit clear values; this module is not selected and will not be written.`)
      : text(`含 ${g.clearCount} 项明确清空值，应用会覆盖原值。`, `Contains ${g.clearCount} explicit clear values; applying overwrites the previous values.`));
    if (g.hiddenValueCount) lines.push(text(`另含 ${g.hiddenValueCount} 项有值的隐藏分支；应用此模块会恢复完整快照。`,
      `Also contains ${g.hiddenValueCount} populated hidden fields; applying this module restores its complete snapshot.`));
    lines.push(text(`显示 ${g.items.length} 项，其余内容见全部字段。`, `Showing ${g.items.length} items; see All Fields for the remaining contents.`));
  }
  return lines.join("\n");
}
