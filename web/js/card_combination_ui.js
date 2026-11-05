import { app } from "../../scripts/app.js";
import { supportsCardCombination, planCardCombination, commitCardCombination } from "./card_combination_core.js";
import { validateShootPlan } from "./shoot_plan_core.js";
import { validateCard, hiddenCardField } from "./workflow_tools.js";
import { cardSummaryText, createCardSummaryElement } from "./card_summary_view.js";

const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;
const moduleLabel = name => text(name, {人物: "Person", 发型: "Hair", 服装: "Clothing", 姿态动作: "Pose / Action", 场景: "Scene", 摄影: "Camera", 视觉表现: "Visual"}[name] || name);
const SHOOT = ["场景", "摄影", "视觉表现"];
const CONTENT = [["person", "人物", "人物卡", "Person Card"], ["hair", "发型", "发型卡", "Hair Card"],
  ["outfit", "服装", "穿搭卡", "Outfit Card"], ["pose", "姿态动作", "姿态动作卡", "Pose / Action Card"]];

export function openCardCombinationPanel(node) {
  if (!supportsCardCombination(node)) throw new Error(text("快捷组合仅支持完整节点。", "Quick combination is available on the full builder only."));
  node.__vividMuseCardsDialog?.close();
  const el = (tag, value = "") => { const item = document.createElement(tag); item.textContent = value; return item; };
  const dialog = el("dialog");
  dialog.style.cssText = "box-sizing:border-box;max-width:760px;width:88vw;max-height:85vh;overflow:auto;background:#242424;color:#eee;border:1px solid #777;border-radius:10px;padding:20px";
  dialog.setAttribute("aria-label", text("卡片快捷组合", "Quick Card Combination"));
  dialog.append(el("h3", text("卡片快捷组合", "Quick Card Combination")), el("p", text(
    "只应用所选模块。保持当前不会清空内容；发型、姿态动作独立选择。自由提示词、比例、分辨率和种子均保持当前。",
    "Only selected modules are applied. Keep Current does not clear anything. Choose hair and pose independently. Free text, ratio, resolution and seed stay unchanged.")));
  dialog.append(el("p", text(
    "保留当前锁定不等于解锁。需要后续随机变化时，请在原面板解锁，再使用随机组合按钮。",
    "Preserve Current Locks does not unlock fields. For later variations, unlock them in Cards / Module Locks, then use the random combination button.")));
  let active = true, composing = false, pending = null;
  const root = app.rootGraph || app.graph, owner = node.graph, generation = node.__vividMuseCardsGeneration || 0;
  const belongs = (graph, seen = new Set()) => {
    if (!graph || seen.has(graph)) return false;
    seen.add(graph);
    return graph.getNodeById?.(node.id) === node || (graph._nodes || []).some(child => child.subgraph && belongs(child.subgraph, seen));
  };
  const requireLive = () => {
    if (!active || (app.rootGraph || app.graph) !== root || node.graph !== owner
      || (node.__vividMuseCardsGeneration || 0) !== generation
      || (owner?.getNodeById && owner.getNodeById(node.id) !== node)
      || (root?.getNodeById && !belongs(root)))
      throw new Error(text("节点会话已变化，请重新打开面板。", "Node session changed. Reopen the panel."));
  };
  const status = el("p"); status.setAttribute("role", "status"); status.style.whiteSpace = "pre-wrap";
  const guarded = fn => async () => {
    try { requireLive(); if (!composing) await fn(); }
    catch (error) { pending = null; confirm.disabled = true; if (active) status.textContent = error.message; }
  };
  const row = parent => { const item = el("div"); item.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;align-items:center"; parent.append(item); return item; };
  const button = (parent, zh, en, fn) => {
    const item = el("button", text(zh, en)); item.type = "button";
    item.addEventListener("click", guarded(fn)); parent.append(item); return item;
  };
  const control = (parent, zh, en) => {
    const label = el("label", text(zh, en)); label.style.cssText = "display:block;flex:1;min-width:160px";
    const select = el("select"); select.setAttribute("aria-label", text(zh, en));
    select.style.cssText = "box-sizing:border-box;width:100%;min-width:0;padding:6px;margin:5px 0";
    label.append(select); parent.append(label); return select;
  };
  const option = (select, value, caption) => { const item = el("option", caption); item.value = value; select.append(item); };
  const selectors = {}, libraries = {}, summaries = {}, lockControls = new Map(), checks = new Map();
  const makeLock = (parent, module) => {
    const select = control(parent, `${module}锁定策略`, `${moduleLabel(module)} lock policy`);
    option(select, "preserve", text("保留当前锁定", "Preserve Current Locks"));
    option(select, "lock", text("应用后锁定此模块", "Lock Module After Applying"));
    select.value = "preserve"; select.disabled = true;
    select.addEventListener("change", guarded(() => invalidate())); lockControls.set(module, select);
  };
  dialog.append(el("h4", text("人物与造型", "Subject and Styling")));
  for (const [key, module, chinese, english] of CONTENT) {
    const section = el("section"), controls = row(section); dialog.append(section);
    selectors[key] = control(controls, chinese, english);
    makeLock(controls, module);
    summaries[key] = createCardSummaryElement(el); section.append(summaries[key]);
  }
  const shootSection = el("section"); dialog.append(el("h4", text("拍摄方案", "Shoot Plan")), shootSection);
  selectors.shootPlan = control(row(shootSection), "拍摄方案卡", "Shoot Plan Card");
  summaries.shootPlan = createCardSummaryElement(el); shootSection.append(summaries.shootPlan);
  const coverage = el("p"); shootSection.append(coverage);
  for (const module of SHOOT) {
    const controls = row(shootSection), label = el("label"), check = el("input");
    check.type = "checkbox"; check.checked = false; check.disabled = true;
    check.setAttribute("aria-label", text(`应用${module}`, `Apply ${moduleLabel(module)}`));
    label.append(check, el("span", moduleLabel(module))); controls.append(label); checks.set(module, check);
    makeLock(controls, module);
    check.addEventListener("change", guarded(() => { updateLocks(); invalidate(); }));
  }
  const libraryStatus = el("p"); libraryStatus.style.whiteSpace = "pre-wrap"; dialog.append(libraryStatus);
  const changes = el("pre"), all = el("pre"), summary = el("p"), details = el("details");
  for (const area of [changes, all]) area.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto";
  summary.style.whiteSpace = "pre-wrap";
  details.append(el("summary", text("全部字段（含隐藏分支）", "All Fields (Including Hidden Branches)")), all);
  const actions = row(dialog);
  const preview = button(actions, "预览组合", "Preview Combination", () => {
    invalidate();
    const plan = planCardCombination(node, selection());
    const labelFor = key => globalThis.__vividMuseZImageI18n?.translateMessage?.(key) || key;
    const valueFor = (key, value) => node.widgets.find(w => w.name === key)?.options?.getOptionLabel?.(value) || value;
    const render = onlyChanges => plan.modules.map(module => {
      const rows = plan.rows.filter(r => r.module === module);
      const shown = rows.filter(r => !onlyChanges || r.changed);
      return `${moduleLabel(module)} — ${rows[0].source}\n${shown.map(r =>
        `${labelFor(r.name)}${r.hidden ? text("（隐藏字段）", " (hidden field)") : ""}: ${valueFor(r.name, r.current)}${r.preset === undefined ? "" : ` (${valueFor(r.name, r.preset)})`} → ${valueFor(r.name, r.target)}`
      ).join("\n") || text("无字段变化。", "No field changes.")}`;
    }).join("\n\n");
    changes.textContent = render(true); all.textContent = render(false);
    summary.textContent = [text(
      `将应用 ${plan.modules.length} 个模块，修改 ${plan.rows.filter(r => r.changed).length} 个字段，新增 ${plan.newLocks.length} 项锁定。`,
      `Applies ${plan.modules.length} modules, changes ${plan.rows.filter(r => r.changed).length} fields and adds ${plan.newLocks.length} locks.`),
      text("“不使用”会清空对应字段，包含隐藏分支。", "Unused explicitly clears a field, including hidden branches."),
      ...plan.modules.filter(module => plan.rows.filter(r => r.module === module).every(r => r.target === "不使用")).map(module => text(
        `${moduleLabel(module)}：将清空此模块的结构化选项。`, `${moduleLabel(module)}: all structured options in this module will be cleared.`)),
      ...(plan.modules.includes("姿态动作") ? [text("动作需要的座椅、墙面或道具不会自动添加，请自行匹配场景。", "Seating, walls or props required by a pose are not added automatically; match the scene yourself.")] : []),
      ...plan.warnings].join("\n");
    pending = {plan, selection: JSON.stringify(selection())}; confirm.disabled = !plan.changed;
    status.textContent = plan.changed ? text("请核对差异，再确认应用。", "Review the differences, then confirm.") : text("无需应用：字段和锁定均无变化。", "Nothing to apply: fields and locks are unchanged.");
  });
  const confirm = button(actions, "确认应用", "Confirm Apply", () => {
    if (!pending || pending.selection !== JSON.stringify(selection())) { invalidate(); throw new Error(text("请重新预览组合。", "Preview the combination again.")); }
    const {plan} = pending; pending = null; confirm.disabled = true;
    try { commitCardCombination(node, plan); }
    catch (error) { invalidate(); throw error; }
    changes.textContent = all.textContent = summary.textContent = "";
    status.textContent = text("组合已应用；未选模块保持不变。请保存工作流。", "Combination applied; unselected modules are unchanged. Save the workflow.");
  });
  dialog.append(summary, changes, details, status);
  const navigation = row(dialog);
  button(navigation, "刷新卡片列表", "Refresh Card Lists", () => reload());
  button(navigation, "返回卡片管理", "Back to Cards", () => { dialog.close(); globalThis.__vividMuseContentCards?.openCardsPanel(node); });
  button(navigation, "关闭", "Close", () => dialog.close());
  const chosen = key => libraries[key]?.[selectors[key].value] ?? null;
  const selection = () => ({...Object.fromEntries(CONTENT.map(([key]) => [key, chosen(key)])), shootPlan: chosen("shootPlan"),
    shootModules: [...checks].filter(([, check]) => check.checked && !check.disabled).map(([module]) => module),
    lockModules: [...lockControls].filter(([, select]) => !select.disabled && select.value === "lock").map(([module]) => module)});
  const updateLocks = () => {
    for (const [key, module] of CONTENT) lockControls.get(module).disabled = !chosen(key);
    for (const module of SHOOT) lockControls.get(module).disabled = checks.get(module).disabled || !checks.get(module).checked;
  };
  const invalidate = () => {
    pending = null; confirm.disabled = true;
    changes.textContent = all.textContent = summary.textContent = status.textContent = "";
    preview.disabled = !CONTENT.some(([key]) => chosen(key)) && ![...checks.values()].some(check => !check.disabled && check.checked);
    for (const key of [...CONTENT.map(([key]) => key), "shootPlan"]) {
      summaries[key].textContent = "";
      try {
        summaries[key].textContent = key === "shootPlan"
          ? cardSummaryText(chosen(key), c => validateShootPlan(c, node), undefined, selection().shootModules)
          : cardSummaryText(chosen(key), c => validateCard(c, node), hiddenCardField);
      } catch (error) { summaries[key].textContent = error.message; preview.disabled = true; }
    }
  };
  const updateShoot = () => {
    for (const check of checks.values()) { check.checked = false; check.disabled = true; }
    coverage.textContent = "";
    const card = chosen("shootPlan");
    try {
      if (card) {
        const checked = validateShootPlan(card, node);
        coverage.textContent = text("应用范围：", "Apply modules: ") + Object.keys(checked.modules).map(moduleLabel).join(" / ");
        for (const module of Object.keys(checked.modules)) { checks.get(module).disabled = false; checks.get(module).checked = true; }
      }
    } finally { updateLocks(); invalidate(); }
  };
  for (const key of [...CONTENT.map(([key]) => key), "shootPlan"]) selectors[key].addEventListener("change", guarded(() => {
    if (key === "shootPlan") updateShoot(); else { updateLocks(); invalidate(); }
  }));
  const reload = () => {
    const messages = [];
    for (const [key, module, store] of [...CONTENT.map(([key, module]) => [key, module, "vividMuseContentCards"]), ["shootPlan", "", "vividMuseShootPlanCards"]]) {
      const raw = node.properties?.[store] ?? [];
      const entries = Array.isArray(raw) ? raw.filter(c => c && typeof c.name === "string" && (module ? c.module === module : true)) : [];
      libraries[key] = entries.map(card => JSON.parse(JSON.stringify(card)));
      const select = selectors[key]; select.replaceChildren(); option(select, "", text("保持当前", "Keep Current"));
      entries.forEach((card, index) => option(select, String(index), card.name)); select.value = "";
      const caption = module ? moduleLabel(module) : text("拍摄方案", "Shoot Plan");
      if (!Array.isArray(raw)) messages.push(`${caption}: ` + text("卡片库格式异常，请返回卡片管理检查。", "Invalid library; review it in Cards / Module Locks."));
      else if (!entries.length) messages.push(`${caption}: ` + text("尚无卡片，可返回卡片管理保存或导入。", "No cards yet; return to Cards to save or import."));
    }
    for (const select of lockControls.values()) select.value = "preserve";
    updateShoot(); libraryStatus.textContent = messages.join("\n");
  };
  dialog.addEventListener("compositionstart", () => { composing = true; });
  dialog.addEventListener("compositionend", () => { composing = false; });
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape" && !composing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); dialog.close(); }
  });
  dialog.addEventListener("cancel", event => { if (composing) event.preventDefault(); });
  for (const event of ["keyup", "copy", "cut", "paste", "wheel"]) dialog.addEventListener(event, e => e.stopPropagation());
  dialog.addEventListener("close", () => {
    active = false; pending = null; dialog.remove();
    if (node.__vividMuseCardsDialog === dialog) node.__vividMuseCardsDialog = null;
  }, {once: true});
  node.__vividMuseCardsDialog = dialog; document.body.append(dialog);
  reload(); dialog.showModal(); return dialog;
}

globalThis.__vividMuseCardCombination = {available: supportsCardCombination, openPanel: openCardCombinationPanel};
