import { app } from "../../scripts/app.js";
import {
  registerShootPlanSchema, availableShootPlanModules, captureShootPlan,
  listShootPlans, shootPlanCollectionStamp, saveShootPlan, renameShootPlan,
  deleteShootPlan, planShootPlanApply, commitShootPlanApply,
  captureResultShootPlan, validateShootPlan, validateShootPlanPack,
  planShootPlanImport, commitShootPlanImport,
} from "./shoot_plan_core.js";

const MODULES = ["场景", "摄影", "视觉表现"];
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;
const moduleLabel = name => text(name === "视觉表现" ? "视觉表现（灯光与色调）" : name,
  {"场景": "Scene", "摄影": "Camera", "视觉表现": "Visual (Lighting & Color)"}[name] || name);
const copy = value => JSON.parse(JSON.stringify(value));

// A mutually exclusive view of the existing card dialog, not another node widget.
export function openShootPlanPanel(node) {
  const supported = availableShootPlanModules(node);
  if (!supported.length) throw new Error(text("此节点不支持拍摄方案卡。", "This node does not support shoot plan cards."));
  node.__vividMuseCardsDialog?.close();
  const el = (tag, value = "") => {
    const element = document.createElement(tag); element.textContent = value; return element;
  };
  const dialog = el("dialog");
  dialog.style.cssText = "max-width:760px;width:88vw;max-height:85vh;overflow:auto;background:#242424;color:#eee;border:1px solid #777;border-radius:10px;padding:20px";
  const title = el("h3", text("拍摄方案卡", "Shoot Plan Cards"));
  dialog.append(title);
  dialog.append(el("p", text(
    "保存场景、摄影和视觉表现。只覆盖勾选模块，不改变人物、穿搭、动作、自由提示词、画幅或种子。卡片随本节点保存，请保存工作流。",
    "Save scene, camera and visual settings. Only checked modules are applied; person, outfit, pose, free text, canvas and seed stay unchanged. Save the workflow to keep this node's cards.")));
  dialog.append(el("p", text(
    "可从当前配置保存，或在实际执行结果面板中保存历史方案；支持 JSON 单卡和卡片包。导入只加入卡片库，不自动应用。",
    "Save current settings here or historical plans in Actual Execution Results. JSON cards and packs are supported. Importing adds cards without applying them.")));
  let active = true, composing = false;
  const root = app.rootGraph || app.graph, owner = node.graph;
  const generation = node.__vividMuseCardsGeneration || 0;
  const belongs = (graph, seen = new Set()) => {
    if (!graph || seen.has(graph)) return false;
    seen.add(graph);
    if (graph.getNodeById?.(node.id) === node) return true;
    return (graph._nodes || []).some(child => child.subgraph && belongs(child.subgraph, seen));
  };
  const live = () => active && (app.rootGraph || app.graph) === root && node.graph === owner &&
    (node.__vividMuseCardsGeneration || 0) === generation &&
    (!owner?.getNodeById || owner.getNodeById(node.id) === node) &&
    (!root?.getNodeById || belongs(root));
  const requireLive = () => {
    if (!live()) throw new Error(text("节点会话已变化，请重新打开面板。", "Node session changed. Reopen the panel."));
  };
  const status = el("p"); status.setAttribute("role", "status"); status.style.whiteSpace = "pre-wrap";
  const guarded = fn => async () => {
    try { requireLive(); if (!composing) await fn(); }
    catch (e) { if (active) status.textContent = e.message; }
  };
  const row = parent => {
    const item = el("div"); item.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0";
    parent.append(item); return item;
  };
  const button = (parent, zh, en, fn) => {
    const item = el("button", text(zh, en)); item.type = "button";
    item.addEventListener("click", guarded(fn)); parent.append(item); return item;
  };
  button(row(dialog), "人物卡 / 穿搭卡 / 模块锁定", "Person / Outfit Cards / Module Locks", () => {
    dialog.close(); globalThis.__vividMuseContentCards?.openCardsPanel(node);
  });
  const control = (type, zh, en) => {
    const input = el("input"); input.type = type; input.placeholder = text(zh, en);
    input.setAttribute("aria-label", input.placeholder);
    input.style.cssText = "box-sizing:border-box;width:100%;padding:6px;margin:8px 0;min-width:0";
    return input;
  };
  const name = control("text", "卡片名称（最多 80 个字符）", "Card name (up to 80 characters)"); name.maxLength = 80;
  const captureSection = el("section");
  captureSection.append(el("h4", text("保存当前配置", "Save Current Settings")), name);
  const captureChoices = el("div"); captureSection.append(captureChoices);
  const captureChecks = new Map();
  const captureSummary = el("pre"); captureSummary.style.cssText = "white-space:pre-wrap;max-height:160px;overflow:auto";
  const captureDetails = el("details");
  captureDetails.append(el("summary", text("待保存字段摘要", "Fields to Save")), captureSummary);
  captureSection.append(captureDetails);
  const captureActions = row(captureSection);
  dialog.append(captureSection);
  const labelFor = key => globalThis.__vividMuseZImageI18n?.translateMessage?.(key) || key;
  const valueFor = (key, value) => node.widgets?.find(w => w.name === key)?.options?.getOptionLabel?.(value) || value;
  const selectedCaptureModules = () => [...captureChecks].filter(([, c]) => c.checked && !c.disabled).map(([m]) => m);
  const updateCaptureSummary = () => {
    try {
      const modules = selectedCaptureModules();
      if (!modules.length) { captureSummary.textContent = text("请选择至少一个可保存模块。", "Select at least one saveable module."); return; }
      const card = captureShootPlan(node, modules, "preview");
      captureSummary.textContent = Object.entries(card.modules).map(([m, values]) =>
        `${moduleLabel(m)}\n${Object.entries(values).map(([k, v]) => `${labelFor(k)}: ${valueFor(k, v)}`).join("\n")}`).join("\n\n");
    } catch (e) { captureSummary.textContent = e.message; }
  };
  const renderCapture = () => {
    const previous = new Map([...captureChecks].map(([m, c]) => [m, c.checked]));
    captureChoices.replaceChildren(); captureChecks.clear();
    for (const module of MODULES) {
      const label = el("label"); label.style.cssText = "display:block;margin:6px 0";
      const check = el("input"); check.type = "checkbox"; check.value = module;
      let reason = "";
      if (!supported.includes(module)) reason = text("本节点不包含此模块", "Not part of this node");
      else {
        try { captureShootPlan(node, [module], "preview"); }
        catch (e) { reason = e.message; }
      }
      check.disabled = Boolean(reason); check.checked = !reason && (previous.get(module) ?? true);
      label.append(check, el("span", `${moduleLabel(module)}${reason ? ` — ${reason}` : ""}`));
      captureChoices.append(label); captureChecks.set(module, check);
      check.addEventListener("change", guarded(() => { saveButton.disabled = !selectedCaptureModules().length; updateCaptureSummary(); }));
    }
    saveButton.disabled = !selectedCaptureModules().length; updateCaptureSummary();
  };
  const saveButton = button(captureActions, "保存为拍摄方案卡", "Save Shoot Plan Card", () => {
    const modules = selectedCaptureModules(), entry = captureShootPlan(node, modules, name.value);
    const base = shootPlanCollectionStamp(node);
    const exists = listShootPlans(node).some(c => c.name === entry.name);
    if (exists && !window.confirm(text("覆盖同名拍摄方案卡？", "Replace this shoot plan card?"))) return;
    requireLive();
    if (JSON.stringify(captureShootPlan(node, modules, name.value)) !== JSON.stringify(entry))
      throw new Error(text("当前配置已变化，请重新保存。", "Current settings changed. Save again."));
    saveShootPlan(node, entry, exists, base);
    search.value = ""; renderList(entry.name);
    status.textContent = text("拍摄方案卡已保存，尚未应用或锁定；请保存工作流。", "Shoot plan card saved without applying or locking. Save the workflow.");
  });
  button(captureActions, "刷新可保存模块", "Refresh Saveable Modules", renderCapture);

  const savedSection = el("section"); savedSection.append(el("h4", text("已保存拍摄方案卡", "Saved Shoot Plan Cards")));
  const search = control("search", "搜索名称或模块", "Search names or modules");
  const count = el("p"), select = el("select");
  select.setAttribute("aria-label", text("已保存拍摄方案卡", "Saved shoot plan cards"));
  select.style.cssText = "box-sizing:border-box;width:100%;padding:6px;margin:8px 0;min-width:0";
  savedSection.append(search, count, select);
  const coverage = el("p"), applyChoices = el("div"); savedSection.append(coverage, applyChoices);
  const applyChecks = new Map();
  const changed = el("pre"), all = el("pre"), details = el("details"), hint = el("p");
  for (const pre of [changed, all]) pre.style.cssText = "white-space:pre-wrap;max-height:220px;overflow:auto";
  details.append(el("summary", text("全部字段（含隐藏字段）", "All Fields (Including Hidden Fields)")), all);
  hint.style.whiteSpace = "pre-wrap";
  savedSection.append(changed, details, hint);
  const applyActions = row(savedSection), management = row(savedSection);
  dialog.append(savedSection);
  let normalPlan = null, lockPlan = null, selectionStamp = "";
  const saved = () => listShootPlans(node);
  const matches = () => {
    const query = search.value.trim().toLowerCase();
    return saved().filter(c => `${c.name} ${Object.keys(c.modules).map(moduleLabel).join(" ")} ${Object.keys(c.modules).join(" ")}`.toLowerCase().includes(query));
  };
  const selected = () => matches().find(c => c.name === select.value);
  const selectedApplyModules = () => [...applyChecks].filter(([, c]) => c.checked && !c.disabled).map(([m]) => m);
  const renderPreview = () => {
    normalPlan = lockPlan = null; changed.textContent = all.textContent = hint.textContent = "";
    applyButton.disabled = lockButton.disabled = true;
    const entry = selected(); if (!entry) return;
    try {
      const modules = selectedApplyModules();
      normalPlan = planShootPlanApply(node, entry, modules, false);
      lockPlan = planShootPlanApply(node, entry, modules, true);
      const format = r => `${labelFor(r.name)}: ${valueFor(r.name, r.current)}${r.preset === undefined ? "" : ` (${valueFor(r.name, r.preset)})`} → ${valueFor(r.name, r.target)}`;
      const render = changesOnly => modules.map(m => {
        const rows = normalPlan.rows.filter(r => r.module === m && (!changesOnly || r.changed));
        return `${moduleLabel(m)}\n${rows.map(format).join("\n") || text("无字段变化。", "No field changes.")}`;
      }).join("\n\n");
      changed.textContent = render(true); all.textContent = render(false);
      const lockedCount = normalPlan.rows.filter(r => (node.properties?.vividMuseRandomLocks || []).includes(r.name)).length;
      hint.textContent = [
        text(`应用完整模块快照，包含“不使用”和隐藏字段。应用并锁定将新增 ${lockPlan.newLocks.length} 项锁定。`,
          `Applies complete modules, including unused and hidden fields. Apply & Lock adds ${lockPlan.newLocks.length} locks.`),
        lockedCount ? text(`其中 ${lockedCount} 个字段已有锁定，本次手动应用仍会更新它们。`, `${lockedCount} fields are already locked; explicit application still updates them.`) : "",
        ...normalPlan.warnings,
      ].filter(Boolean).join("\n");
      applyButton.disabled = lockButton.disabled = false;
    } catch (e) { normalPlan = lockPlan = null; hint.textContent = e.message; }
  };
  const renderSelection = () => {
    const previous = new Map([...applyChecks].map(([m, c]) => [m, c.checked]));
    const entry = selected(), nextStamp = entry ? JSON.stringify(entry) : "";
    const sameCard = nextStamp === selectionStamp;
    selectionStamp = nextStamp;
    applyChoices.replaceChildren(); applyChecks.clear();
    renameButton.disabled = deleteButton.disabled = !entry;
    if (!entry) {
      coverage.textContent = text("暂无匹配卡片。", "No matching cards."); renderPreview(); return;
    }
    coverage.textContent = text("卡片包含：", "Card includes: ") + Object.keys(entry.modules).map(moduleLabel).join(" / ");
    for (const module of MODULES.filter(m => Object.hasOwn(entry.modules, m))) {
      const label = el("label"); label.style.cssText = "display:block;margin:6px 0";
      const check = el("input"); check.type = "checkbox"; check.value = module;
      check.disabled = !supported.includes(module);
      check.checked = !check.disabled && (sameCard ? previous.get(module) ?? true : true);
      label.append(check, el("span", moduleLabel(module) + (check.disabled ? text(" — 本节点不应用", " — Not applied by this node") : "")));
      applyChoices.append(label); applyChecks.set(module, check);
      check.addEventListener("change", guarded(renderPreview));
    }
    renderPreview();
  };
  const renderList = (preferred = select.value) => {
    select.replaceChildren(); const entries = matches();
    for (const card of entries) { const option = el("option", card.name); option.value = card.name; select.append(option); }
    if (entries.some(c => c.name === preferred)) select.value = preferred;
    count.textContent = text(`匹配 ${entries.length}；拍摄方案卡 ${saved().length} / 100（与人物／穿搭卡分别计数）`,
      `${entries.length} matches; shoot plan cards ${saved().length} / 100 (separate from person/outfit cards)`);
    renderSelection();
  };
  const apply = lock => {
    const plan = lock ? lockPlan : normalPlan;
    if (!plan) { renderPreview(); return; }
    try { commitShootPlanApply(node, plan); }
    catch (e) { renderPreview(); throw e; }
    renderPreview(); renderCapture();
    status.textContent = lock
      ? text("已应用并锁定所选模块，其他配置保持不变；请保存工作流。", "Selected modules applied and locked; other settings unchanged. Save the workflow.")
      : text("已应用所选模块，锁定不变；后续随机操作仍可能改变未锁定字段。", "Selected modules applied; locks unchanged. Later random operations can still change unlocked fields.");
  };
  const applyButton = button(applyActions, "应用所选模块", "Apply Selected Modules", () => apply(false));
  const lockButton = button(applyActions, "应用并锁定", "Apply & Lock", () => apply(true));
  button(applyActions, "刷新差异预览", "Refresh Differences", renderPreview);
  const renameButton = button(management, "使用上方名称重命名", "Rename Using Name Above", () => {
    const source = selected(); if (!source) return;
    const original = copy(source), base = shootPlanCollectionStamp(node), next = name.value.trim();
    const exists = saved().some(c => c.name === next && c.name !== original.name);
    if (exists && !window.confirm(text("覆盖同名拍摄方案卡？", "Replace this shoot plan card?"))) return;
    requireLive(); renameShootPlan(node, original, next, exists, base);
    search.value = ""; renderList(next);
    status.textContent = text("已重命名，请保存工作流。", "Renamed. Save the workflow.");
  });
  const deleteButton = button(management, "删除卡片", "Delete Card", () => {
    const source = selected(); if (!source) return;
    const original = copy(source), base = shootPlanCollectionStamp(node);
    if (!window.confirm(text("删除选中的拍摄方案卡？当前模块选项不会改变。", "Delete this shoot plan card? Current module settings will not change."))) return;
    requireLive(); deleteShootPlan(node, original, base); renderList();
    status.textContent = text("卡片已删除，当前配置不变；请保存工作流。", "Card deleted; current settings unchanged. Save the workflow.");
  });
  const fileSection = el("section");
  fileSection.append(el("h4", text("JSON 导入导出", "JSON Import / Export")), el("p", text(
    "文件上限 1 MiB；卡片包包含 1–100 张。独立节点保留卡片全部模块，导出不会丢失其他模块。",
    "Maximum file size: 1 MiB; packs contain 1–100 cards. Standalone nodes retain and export every module in a card.")));
  const fileActions = row(fileSection), filePreview = el("div"); fileSection.append(filePreview); dialog.append(fileSection);
  let fileGeneration = 0;
  const clearFilePreview = () => { fileGeneration++; filePreview.replaceChildren(); };
  const download = (value, filename) => {
    requireLive();
    const blob = new Blob([JSON.stringify(value, null, 2)], {type: "application/json;charset=utf-8"});
    if (blob.size > 1024 * 1024) throw new Error(text("导出内容超过 1 MiB，请减少卡片数量。", "Export exceeds 1 MiB. Select fewer cards."));
    const url = URL.createObjectURL(blob), link = el("a"); link.href = url; link.download = filename;
    try { dialog.append(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    status.textContent = text("已请求下载 JSON；卡片和当前配置保持不变。", "JSON download requested; cards and current settings are unchanged.");
  };
  button(fileActions, "导出选中卡片", "Export Selected Card", () => {
    const entry = selected(); if (!entry) throw new Error(text("请先选择卡片。", "Select a card first."));
    download(validateShootPlan(entry, node), "vividmuse-shoot-plan-card.json");
  });
  button(fileActions, "导出卡片包", "Export Card Pack", () => {
    clearFilePreview(); const ticket = fileGeneration, base = shootPlanCollectionStamp(node), cards = saved();
    if (!cards.length) throw new Error(text("尚无卡片可导出。", "No cards to export."));
    filePreview.append(el("p", text("选择要导出的卡片（包含完整模块）", "Select cards to export (complete modules)")));
    const checks = cards.map(card => {
      const check = el("input"); check.type = "checkbox"; check.checked = true;
      const label = el("label"); label.style.cssText = "display:block;margin:6px 0";
      label.append(check, el("span", `${card.name} — ${Object.keys(card.modules).map(moduleLabel).join(" / ")}`));
      filePreview.append(label); return {card, check};
    });
    button(filePreview, "确认导出卡片包", "Confirm Export Pack", () => {
      if (ticket !== fileGeneration || base !== shootPlanCollectionStamp(node)) throw new Error(text("卡片库已变化，请重新选择导出。", "The library changed. Select cards to export again."));
      const pack = validateShootPlanPack({kind: "vividmuse-shoot-plan-card-pack", version: 1,
        cards: checks.filter(item => item.check.checked).map(item => item.card)}, node);
      download(pack, "vividmuse-shoot-plan-card-pack.json"); clearFilePreview();
    });
    button(filePreview, "取消", "Cancel", clearFilePreview);
  });
  button(fileActions, "导入卡片或卡片包", "Import Card or Pack", () => {
    clearFilePreview(); const ticket = fileGeneration;
    const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true; dialog.append(input);
    input.addEventListener("cancel", () => input.remove());
    input.addEventListener("change", guarded(async () => {
      try {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 1024 * 1024) throw new Error(text("文件不能超过 1 MiB。", "File must be at most 1 MiB."));
        const raw = await file.text();
        if (!live() || ticket !== fileGeneration) return;
        if (new Blob([raw]).size > 1024 * 1024) throw new Error(text("文件不能超过 1 MiB。", "File must be at most 1 MiB."));
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
        // Validate before adding controls. A bad card invalidates the entire file.
        planShootPlanImport(node, parsed);
        const strategy = el("select"); strategy.setAttribute("aria-label", text("同名冲突处理", "Name conflict strategy"));
        for (const [value, caption] of [["skip", text("跳过同名", "Skip existing")], ["replace", text("覆盖同名", "Replace existing")]]) {
          const option = el("option", caption); option.value = value; strategy.append(option);
        }
        strategy.value = "skip";
        const detail = el("pre"); detail.style.cssText = "white-space:pre-wrap;max-height:240px;overflow:auto";
        let plan = null;
        const update = () => {
          plan = null;
          try {
            plan = planShootPlanImport(node, parsed, strategy.value);
            detail.textContent = [[text("新增", "New"), plan.added], [text("将覆盖", "Will replace"), plan.replaced],
              [text("跳过同名", "Skipped existing"), plan.skipped], [text("不适用", "Inapplicable"), plan.inapplicable]]
              .map(([caption, names]) => `${caption}: ${names.length}\n${names.join("\n")}`).join("\n");
          } catch (e) { detail.textContent = e.message; }
        };
        strategy.addEventListener("change", guarded(update)); filePreview.append(strategy, detail); update();
        button(filePreview, "确认导入", "Confirm Import", () => {
          if (!plan || ticket !== fileGeneration) throw new Error(text("请重新选择文件并预览。", "Select the file and preview again."));
          const confirmedPlan = plan;
          if (plan.replaced.length && !window.confirm(text("确认覆盖预览中的同名拍摄方案卡？", "Replace the shoot plan cards listed in this preview?"))) return;
          requireLive();
          if (ticket !== fileGeneration || plan !== confirmedPlan) throw new Error(text("导入预览已变化，请重新确认。", "Import preview changed. Confirm again."));
          let result;
          try { result = commitShootPlanImport(node, confirmedPlan); }
          catch (e) { update(); throw e; }
          clearFilePreview(); renderList();
          status.textContent = text(
            `已新增 ${result.added.length}、覆盖 ${result.replaced.length}、跳过同名 ${result.skipped.length}、不适用 ${result.inapplicable.length} 张。未应用；请保存工作流。`,
            `Added ${result.added.length}, replaced ${result.replaced.length}, skipped ${result.skipped.length}, inapplicable ${result.inapplicable.length}. Not applied; save the workflow.`);
        });
        button(filePreview, "取消", "Cancel", clearFilePreview);
      } finally { input.remove(); }
    })); input.click();
  });
  select.addEventListener("change", guarded(renderSelection));
  search.addEventListener("input", guarded(() => renderList()));
  dialog.append(status); button(row(dialog), "关闭", "Close", () => dialog.close());
  dialog.addEventListener("compositionstart", () => { composing = true; });
  dialog.addEventListener("compositionend", event => {
    composing = false;
    if (live() && event.target === search) return guarded(() => renderList())();
  });
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape" && !composing && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); dialog.close();
    }
  });
  dialog.addEventListener("cancel", event => { if (composing) event.preventDefault(); });
  for (const type of ["keyup", "copy", "cut", "paste", "wheel"]) dialog.addEventListener(type, event => event.stopPropagation());
  dialog.addEventListener("close", () => {
    active = false; normalPlan = lockPlan = null; dialog.remove();
    if (node.__vividMuseCardsDialog === dialog) node.__vividMuseCardsDialog = null;
  }, {once: true});
  node.__vividMuseCardsDialog = dialog; document.body.append(dialog);
  try { renderCapture(); renderList(); }
  catch (e) {
    saveButton.disabled = applyButton.disabled = lockButton.disabled = renameButton.disabled = deleteButton.disabled = true;
    status.textContent = e.message;
  }
  dialog.showModal(); return dialog;
}

globalThis.__vividMuseShootPlanCards = {openPanel: openShootPlanPanel, availableModules: availableShootPlanModules,
  captureResult: captureResultShootPlan, saveCard: saveShootPlan, listCards: listShootPlans, collectionStamp: shootPlanCollectionStamp};
app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.ShootPlanCards",
  beforeRegisterNodeDef(_nodeType, nodeData) { registerShootPlanSchema(nodeData); },
});
