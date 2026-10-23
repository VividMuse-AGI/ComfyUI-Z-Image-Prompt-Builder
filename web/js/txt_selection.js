import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const CLASSES = {
  VividMuse_ZImageTxtPromptLibrary: "prompt",
  VividMuse_ZImageTxtModuleLibrary: "module",
};
const PROPERTY = { prompt: "vividMuseTxtPromptLibrary", module: "vividMuseTxtModuleLibrary" };
const widget = (node, name) => node.widgets?.find(w => w.name === name);
const randomMode = node => widget(node, "选择模式")?.value === "随机抽取";
const tr = text => globalThis.__vividMuseZImageI18n?.translateMessage?.(text) || text;
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage?.() === "en" ? en : zh;
const typeOf = node => node.comfyClass || node.constructor?.type;
const rootGraph = () => app.rootGraph || app.graph;
const submissions = new Map(), early = new Map(), terminal = new Set(), ownersByPrompt = new WeakMap();
let pending = 0, order = 0;
const bounded = (map, key, value) => { map.set(key, value); if (map.size > 128) map.delete(map.keys().next().value); };
function nodeAtPath(graph, path) {
  const parts = String(path).split(":");
  for (let i = 0; graph && i < parts.length; i++) {
    const node = graph.getNodeById?.(parts[i]);
    if (i === parts.length - 1) return node;
    graph = node?.subgraph;
  }
  return null;
}
function captureOwners(graph) {
  const owners = new Map(), counts = new Map();
  const visit = (current, prefix = "", ancestors = new Set()) => {
    if (!current || ancestors.has(current)) return;
    const next = new Set(ancestors).add(current);
    for (const node of current.nodes || current._nodes || []) {
      const path = prefix ? `${prefix}:${node.id}` : String(node.id);
      if (CLASSES[typeOf(node)]) {
        owners.set(path, {node, graph, path, generation: node.__txtSelectionGeneration || 0});
        counts.set(node, (counts.get(node) || 0) + 1);
      }
      if (node.subgraph) visit(node.subgraph, path, next);
    }
  };
  visit(graph);
  for (const [path, owner] of owners) if (counts.get(owner.node) > 1) owners.delete(path);
  return owners;
}
const liveOwner = owner => owner && rootGraph() === owner.graph && nodeAtPath(owner.graph, owner.path) === owner.node
  && owner.generation === (owner.node.__txtSelectionGeneration || 0);

// Build a whitelist-only snapshot. Never resolve randomness or read current inputs.
function selectionSnapshot(nodeType, r) {
  const kind = CLASSES[nodeType];
  const modules = ["画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现", "自定义"];
  const invalid = () => new Error(text("抽取记录格式无效，不能复制或导出。", "Invalid selection record; copying and export are unavailable."));
  if (!kind || !r || r.kind !== kind || r.mode !== "随机抽取" || r.algorithm !== "python-random-v1"
      || typeof r.seed !== "string" || !/^(0|[1-9]\d{0,19})$/.test(r.seed) || BigInt(r.seed) > 18446744073709551615n
      || !(kind === "prompt" ? r.module === null : modules.includes(r.module))
      || !Number.isInteger(r.count) || r.count < 0 || r.count > 500
      || !(r.index === null || (Number.isInteger(r.index) && r.index >= 0 && r.index < 500))
      || typeof r.title !== "string" || typeof r.prompt !== "string" || r.prompt.length > 20000
      || r.title.length > 1100000) throw invalid();
  if (r.status === "empty") {
    if (r.count !== 0 || r.index !== null || r.title !== "" || r.prompt !== "") throw invalid();
  } else if (r.status !== "selected" || r.count < 1 || !r.prompt.trim()) throw invalid();
  return {kind: "vividmuse-txt-selection-result", version: 1, source: {node_type: nodeType},
    algorithm: r.algorithm, seed: r.seed, module: r.module, status: r.status, count: r.count,
    index: r.index, title: r.title, prompt: r.prompt, content_snapshot_only: true, includes_upstream_workflow: false};
}
function routeResult(detail) {
  const raw = detail?.output?.vividmuse_txt_selection?.[0];
  if (!raw || detail.prompt_id == null) return;
  const id = String(detail.prompt_id), path = String(detail.display_node ?? detail.node);
  if (terminal.has(id)) return;
  const submission = submissions.get(id);
  if (!submission) {
    if (pending) {
      if (!early.has(id)) bounded(early, id, new Map());
      bounded(early.get(id), path, detail);
    }
    return;
  }
  const owner = submission.owners.get(path);
  if (!liveOwner(owner) || submission.seen.has(path)) return;
  const node = owner.node;
  if (submission.order < (node.__txtSelectionOrder || 0)) return;
  submission.seen.add(path);
  node.__txtSelectionOrder = submission.order;
  try {
    const snapshot = selectionSnapshot(typeOf(node), raw);
    node.__txtSelectionResult = snapshot;
    node.__txtSelectionOwner = owner;
    node.__txtSelectionError = "";
  } catch {
    node.__txtSelectionResult = null;
    node.__txtSelectionError = "invalid";
  }
  refresh(node, CLASSES[typeOf(node)]);
}
function observeSubmissions() {
  if (typeof app.graphToPrompt === "function" && !app.graphToPrompt.__vividMuseTxtObserver) {
    const original = app.graphToPrompt;
    const observed = async function () {
      const owners = captureOwners(arguments[0] || rootGraph());
      const prompt = await original.apply(this, arguments);
      if (prompt && typeof prompt === "object") ownersByPrompt.set(prompt, owners);
      return prompt;
    };
    observed.__vividMuseTxtObserver = true; app.graphToPrompt = observed;
  }
  if (typeof api?.queuePrompt === "function" && !api.queuePrompt.__vividMuseTxtObserver) {
    const original = api.queuePrompt;
    const observed = async function (_number, prompt) {
      const owners = ownersByPrompt.get(prompt);
      if (!owners?.size) return original.apply(this, arguments);
      const submission = {owners: new Map([...owners].filter(([path]) => prompt.output?.[path])), order: ++order, seen: new Set()};
      pending++;
      try {
        const response = await original.apply(this, arguments);
        if (response?.prompt_id != null && !terminal.has(String(response.prompt_id))) {
          const id = String(response.prompt_id);
          bounded(submissions, id, submission);
          const buffered = early.get(id); early.delete(id);
          for (const detail of buffered?.values() || []) routeResult(detail);
        }
        return response;
      } finally { if (--pending === 0) early.clear(); }
    };
    observed.__vividMuseTxtObserver = true; api.queuePrompt = observed;
  }
}

// Separate from each library's accordion: never undo the accordion's hidden state.
function visible(w, show) {
  if (!w) return;
  if (!show && !w.__txtSelectionHidden) {
    w.__txtSelectionOriginal = { type: w.type, computeSize: w.computeSize, hidden: w.hidden,
      optionHidden: w.options?.hidden };
    w.type = "hidden";
    w.computeSize = () => [0, -4];
    w.hidden = true;
    w.options ??= {};
    w.options.hidden = true;
    w.__txtSelectionHidden = true;
  } else if (show && w.__txtSelectionHidden) {
    const old = w.__txtSelectionOriginal;
    w.type = old.type;
    w.computeSize = old.computeSize;
    w.hidden = old.hidden;
    if (old.optionHidden === undefined) delete w.options.hidden;
    else w.options.hidden = old.optionHidden;
    w.__txtSelectionHidden = false;
  }
}

function payload(node, kind) {
  const entries = node.__vividMuseTxtSelectionEntries?.()
    || node.properties?.[PROPERTY[kind]]?.entries || [];
  return JSON.stringify({ version: 1, kind, entries });
}

function refresh(node, kind, resize = false) {
  const data = widget(node, "词库数据");
  if (!data) return;
  data.value = payload(node, kind);
  visible(data, false);
  const random = randomMode(node);
  visible(widget(node, "随机种子"), random);
  visible(widget(node, "control_after_generate"), random);
  visible(widget(node, kind === "prompt" ? "自由提示词" : "模块提示词"), !random);
  // Disable, rather than hide, accordion controls to avoid competing visibility owners.
  const controls = kind === "prompt" ? node.__vividMuseTxtLibraryControls : node.__vividMuseTxtModuleControls;
  for (const w of controls || []) {
    const manual = kind === "prompt"
      ? ["词库条目", "词库加入方式", "添加到自由提示词", "清空自由提示词"].includes(w.name)
      : w === node.__vividMuseTxtModuleEntryWidget || w === node.__vividMuseTxtModuleApplyButton
        || w.name === "清空当前用户模块";
    if (manual) { w.disabled = random; w.options ??= {}; w.options.disabled = random; }
  }
  // Module scope is required even when the library accordion is closed.
  if (kind === "module" && random) {
    const scope = widget(node, "模块类型");
    if (scope?.__vividMuseTxtModuleHidden) {
      scope.type = scope.__vividMuseTxtModuleOriginalType;
      scope.computeSize = scope.__vividMuseTxtModuleOriginalComputeSize;
      scope.hidden = false;
      scope.options.hidden = false;
      scope.__vividMuseTxtModuleHidden = false;
    }
  }
  if (node.__txtSelectionResultButton) {
    // Always historical: safe for queued results, cached replay and next-seed changes.
    node.__txtSelectionResultButton.label = node.__txtSelectionResultButton.__vividMuseDisplayText = node.__txtSelectionResult
      ? "上次随机结果（点击查看）" : "随机抽取：尚未执行";
  }
  globalThis.__vividMuseZImageI18n?.localizeNode?.(node);
  if (resize) {
    const marker = { name: "__txtSelectionRefresh", type: "hidden", hidden: true,
      options: { hidden: true, serialize: false } };
    node.widgets.push(marker); node.widgets.pop();
    const size = node.computeSize?.();
    if (size) node.setSize?.([Math.max(360, size[0]), size[1]]);
  }
  node.setDirtyCanvas?.(true, true);
}

function showResult(node) {
  node.__txtSelectionDialog?.close();
  const owner = node.__txtSelectionOwner;
  const result = node.__txtSelectionResult && liveOwner(owner) ? JSON.parse(JSON.stringify(node.__txtSelectionResult)) : null;
  const unavailable = node.__txtSelectionError === "invalid"
    ? text("抽取记录格式无效，请重新执行。", "Invalid selection record. Run the node again.")
    : node.__txtSelectionResult || node.__txtSelectionError
      ? text("来源未确认，暂不可复制或导出。请在当前工作流重新执行。", "Source unconfirmed. Run this workflow before copying or exporting.")
      : tr("随机抽取：尚未执行");
  if (!globalThis.document?.createElement) { globalThis.alert?.(unavailable); return; }
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "max-width:680px;width:85vw;max-height:85vh;overflow:auto;background:#242424;color:#eee;border:1px solid #777;border-radius:10px;padding:20px";
  const el = (tag, value = "") => { const item = document.createElement(tag); item.textContent = value; return item; };
  dialog.setAttribute("aria-label", text("历史随机抽取记录", "Historical Random Selection"));
  dialog.append(el("h3", text("历史随机抽取记录", "Historical Random Selection")),
    el("p", text("只包含抽中条目，不含前置提示词或上游工作流；不代表当前手动内容。关闭后重开查看最新记录。",
      "Selected entry only, without preceding prompts or upstream workflow; not the current manual draft. Reopen for the latest record.")));
  const info = result ? `${result.status === "empty" ? tr("当前范围没有候选") : tr("已抽取")}\n${tr("随机种子")}: ${result.seed}`
    + `\n${tr("候选数量")}: ${result.count}\n${tr(result.module || "")}\n${result.title}\n`
    + text(`原词库索引（从0开始）: ${result.index ?? "—"}`, `Original library index (zero-based): ${result.index ?? "—"}`) : unavailable;
  dialog.append(el("pre", info));
  const body = document.createElement("pre");
  body.textContent = result?.prompt || "";
  body.setAttribute("aria-label", text("抽中正文", "Selected Text"));
  body.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto;user-select:text";
  dialog.append(body);
  const status = el("p"); status.setAttribute("role", "status");
  const actions = el("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap"; dialog.append(actions, status);
  let active = true;
  const live = () => active && liveOwner(owner);
  const button = (label, disabled, fn) => {
    const b = el("button", label); b.type = "button"; b.disabled = disabled;
    b.addEventListener("click", fn); actions.append(b); return b;
  };
  const copy = button(text("复制抽中正文", "Copy Selected Text"), !result || result.status === "empty", async () => {
    if (!live()) return;
    copy.disabled = true;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(result.prompt);
      if (live()) status.textContent = text("正文已复制。", "Selected text copied.");
    } catch {
      if (live()) status.textContent = text("复制失败，请选中上方正文手动复制。", "Copy failed. Select the text above and copy it manually.");
    } finally { if (live()) copy.disabled = false; }
  });
  button(text("导出抽取记录", "Export Selection Record"), !result, () => {
    if (!live()) return;
    let url, link;
    try {
      url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], {type: "application/json"}));
      link = el("a"); link.href = url; link.download = "vividmuse-txt-selection-result.json";
      dialog.append(link); link.click();
      status.textContent = text("已请求下载抽取记录 JSON；这不是工作流文件。", "Selection JSON download requested; this is not a workflow file.");
    } catch { status.textContent = text("导出失败，请重试。", "Export failed. Please retry."); }
    finally { link?.remove(); if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  button(tr("关闭"), false, () => dialog.close());
  dialog.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); dialog.close(); }
  });
  for (const event of ["keyup", "wheel", "copy", "cut", "paste"]) dialog.addEventListener(event, e => e.stopPropagation());
  dialog.addEventListener("close", () => {
    active = false; dialog.remove(); if (node.__txtSelectionDialog === dialog) node.__txtSelectionDialog = null;
  }, {once: true});
  node.__txtSelectionDialog = dialog;
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function install(node) {
  const kind = CLASSES[node.comfyClass || node.constructor?.type];
  if (!kind || node.__txtSelectionInstalled || !widget(node, "选择模式")) return;
  observeSubmissions();
  node.__txtSelectionInstalled = true;
  node.__vividMuseTxtSelectionRefresh = () => refresh(node, kind);
  const data = widget(node, "词库数据");
  // Real backend input: intentionally serializable even while hidden.
  data.serialize = true;
  data.options ??= {};
  data.options.serialize = true;
  data.serializeValue = () => { data.value = payload(node, kind); return data.value; };
  const seed = widget(node, "随机种子");
  if (seed) {
    seed.options ??= {};
    // JS cannot losslessly represent all uint64 values. API still accepts full uint64.
    seed.options.max = Number.MAX_SAFE_INTEGER;
    seed.options.min = 0;
    const oldSerializeValue = seed.serializeValue;
    seed.serializeValue = function () {
      if (randomMode(node) && (!Number.isSafeInteger(seed.value) || seed.value < 0)) {
        throw new Error(tr("界面种子须为0至9007199254740991的整数；更大整数请使用API。"));
      }
      return oldSerializeValue ? oldSerializeValue.apply(this, arguments) : seed.value;
    };
  }
  const button = node.addWidget("button", "随机抽取：尚未执行", null, () => showResult(node), { serialize: false });
  button.serialize = false;
  node.__txtSelectionResultButton = button;
  const mode = widget(node, "选择模式");
  const original = mode.callback;
  let previousMode = mode.value;
  mode.callback = function () {
    const result = original?.apply(this, arguments);
    node.properties ??= {};
    if (kind === "module" && previousMode !== mode.value) {
      const scope = widget(node, "模块类型");
      if (randomMode(node)) node.properties.vividMuseTxtManualModule = scope?.value;
      else if (scope && node.properties.vividMuseTxtManualModule) {
        // Preserve the manual draft's module when leaving a random-only scope.
        scope.value = node.properties.vividMuseTxtManualModule;
        node.properties.vividMuseTxtModuleSelectedModule = scope.value;
      }
    }
    previousMode = mode.value;
    node.__vividMuseTxtSelectionRestoreControls?.();
    refresh(node, kind, true);
    return result;
  };
  const oldConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    node.__txtSelectionGeneration = (node.__txtSelectionGeneration || 0) + 1;
    node.__txtSelectionDialog?.close();
    node.__txtSelectionOwner = null; node.__txtSelectionOrder = 0; node.__txtSelectionError = "";
    const result = oldConfigure?.apply(this, arguments);
    // Inputs were appended. Missing fields in known older positional layouts get defaults.
    const saved = info?.widgets_values;
    const serialized = (node.widgets || []).filter(w => w.serialize !== false);
    if (Array.isArray(saved)) {
      for (const [name, value] of [["选择模式", "手动选择"], ["随机种子", 0], ["词库数据", ""]]) {
        const w = widget(node, name);
        if (serialized.indexOf(w) >= saved.length) w.value = value;
      }
    }
    previousMode = mode.value;
    node.__txtSelectionResult = null;
    refresh(node, kind, true);
    return result;
  };
  const oldSerialize = node.onSerialize;
  node.onSerialize = function (info) {
    refresh(node, kind);
    // LiteGraph may have copied values before onSerialize. Update that raw slot
    // before the existing helper compaction guard, in either extension order.
    if (Array.isArray(info.widgets_values)) {
      const serialized = node.widgets.filter(w => w.serialize !== false);
      const index = info.widgets_values.length === serialized.length
        ? serialized.indexOf(data) : node.widgets.indexOf(data);
      info.widgets_values[index] = data.value;
    }
    return oldSerialize?.apply(this, arguments);
  };
  const oldExecuted = node.onExecuted;
  node.onExecuted = function (message) {
    const result = oldExecuted?.apply(this, arguments);
    // Uncorrelated callbacks must never expose another workflow's body.
    if (message?.vividmuse_txt_selection?.[0] && !node.__txtSelectionResult) node.__txtSelectionError = "unconfirmed";
    return result;
  };
  const oldRemoved = node.onRemoved;
  node.onRemoved = function () {
    node.__txtSelectionGeneration = (node.__txtSelectionGeneration || 0) + 1;
    node.__txtSelectionDialog?.close(); node.__txtSelectionResult = null; node.__txtSelectionOwner = null;
    return oldRemoved?.apply(this, arguments);
  };
  refresh(node, kind, true);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.TxtSelection",
  init: observeSubmissions,
  nodeCreated: install,
  loadedGraphNode(node) {
    install(node);
    const kind = CLASSES[node.comfyClass || node.constructor?.type];
    if (kind && node.__txtSelectionInstalled) refresh(node, kind, true);
  },
});
api?.addEventListener?.("executed", event => routeResult(event.detail));
for (const event of ["execution_error", "execution_interrupted"]) api?.addEventListener?.(event, message => {
  const id = message.detail?.prompt_id;
  if (id == null) return;
  terminal.add(String(id)); if (terminal.size > 128) terminal.delete(terminal.values().next().value);
  early.delete(String(id)); submissions.delete(String(id));
});
