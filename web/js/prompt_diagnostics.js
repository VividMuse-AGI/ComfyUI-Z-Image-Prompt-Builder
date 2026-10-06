import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// This extension only observes inputs and execution UI messages. It never queues
// prompts, changes seeds, replaces field values or serializes diagnostic history.
const FULL = "VividMuse_ZImageChinesePromptBuilder";
const MODULES = new Set(["Canvas", "Person", "Hair", "Clothing", "Pose", "Scene", "Camera", "Visual"]
  .map(name => `VividMuse_ZImage${name}Module`));
const HISTORY_LIMIT = 5;
const ORDERS_LIMIT = 128;
const submissions = new Map();
const promptOwners = new WeakMap();
const earlyResults = new Map();
const terminalIds = new Set();
let pendingRequests = 0;
let nextOrder = 0;
const widget = (node, name) => node.widgets?.find(w => w.name === name);
const target = node => node && (node.comfyClass === FULL || MODULES.has(node.comfyClass)
  || node.constructor?.type === FULL || MODULES.has(node.constructor?.type));
const language = () => globalThis.__vividMuseZImageI18n?.activeLanguage?.() || "zh";
const text = (zh, en) => language() === "en" ? en : zh;
const tr = value => globalThis.__vividMuseZImageI18n?.translateMessage?.(value) || value;
const displayValue = (node, name, value) => widget(node, name)?.options?.getOptionLabel?.(value) || tr(value);
const fields = node => (node.widgets || []).filter(w => w.serialize !== false
  && Array.isArray(w.options?.values) && w.options.values.includes("跟随预设"));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const linked = (node, name) => node.inputs?.some(input => input.name === name && input.link != null);

const rootGraph = () => app.rootGraph || app.graph;
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
  const owners = new Map();
  const counts = new Map();
  function visit(current, prefix = "", ancestors = new Set()) {
    if (!current || ancestors.has(current)) return;
    const next = new Set(ancestors).add(current);
    for (const node of current.nodes || current._nodes || []) {
      const path = prefix ? `${prefix}:${node.id}` : String(node.id);
      if (target(node)) {
        owners.set(path, { node, graph, generation: node.__vividMuseDiagnosticsGeneration || 0 });
        counts.set(node, (counts.get(node) || 0) + 1);
      }
      if (node.subgraph) visit(node.subgraph, path, next);
    }
  }
  visit(graph);
  // Shared subgraph definitions can represent several instances with one node
  // object. A single node panel cannot safely present these as one result.
  for (const [path, owner] of owners) if (counts.get(owner.node) > 1) owners.delete(path);
  return owners;
}

function bounded(map, key, value) {
  map.set(key, value);
  if (map.size > ORDERS_LIMIT) map.delete(map.keys().next().value);
}

function routeResult(detail) {
  if (!detail?.output?.vividmuse_prompt_diagnostics?.[0] || detail.prompt_id == null) return;
  const id = String(detail.prompt_id);
  if (terminalIds.has(id)) return;
  const submission = submissions.get(id);
  if (!submission) {
    // WebSocket output may beat the HTTP response. Buffer only while a local
    // submission is in flight, and replay only after its returned ID is known.
    if (pendingRequests) {
      let messages = earlyResults.get(id);
      if (!messages) { messages = new Map(); bounded(earlyResults, id, messages); }
      bounded(messages, String(detail.display_node ?? detail.node), detail);
    }
    return;
  }
  const path = String(detail.display_node ?? detail.node);
  const owner = submission.owners.get(path);
  if (!owner || owner.graph !== rootGraph() || nodeAtPath(owner.graph, path) !== owner.node
      || owner.generation !== (owner.node.__vividMuseDiagnosticsGeneration || 0)) return;
  acceptResult(owner.node, detail.output.vividmuse_prompt_diagnostics[0], id, path);
}

function observeSubmissions() {
  if (typeof app.graphToPrompt === "function" && !app.graphToPrompt.__vividMuseDiagnosticsObserver) {
    const original = app.graphToPrompt;
    const observed = async function () {
      // Capture before serialization awaits: switching tabs during an async
      // widget export must not attach the serialized prompt to the new graph.
      const owners = captureOwners(arguments[0] || rootGraph());
      const prompt = await original.apply(this, arguments);
      if (prompt && typeof prompt === "object") promptOwners.set(prompt, owners);
      return prompt;
    };
    observed.__vividMuseDiagnosticsObserver = true;
    app.graphToPrompt = observed;
  }
  if (typeof api?.queuePrompt === "function" && !api.queuePrompt.__vividMuseDiagnosticsObserver) {
    const original = api.queuePrompt;
    const observed = async function (_number, prompt) {
      const owners = promptOwners.get(prompt);
      if (!owners?.size) return original.apply(this, arguments);
      const submission = { owners: new Map([...owners].filter(([path]) => prompt.output?.[path])),
        order: ++nextOrder };
      pendingRequests++;
      try {
        const response = await original.apply(this, arguments);
        if (response?.prompt_id != null) {
          const id = String(response.prompt_id);
          bounded(submissions, id, submission);
          const messages = earlyResults.get(id);
          earlyResults.delete(id);
          for (const detail of messages?.values() || []) routeResult(detail);
        }
        return response;
      } finally {
        if (--pendingRequests === 0) earlyResults.clear();
      }
    };
    observed.__vividMuseDiagnosticsObserver = true;
    api.queuePrompt = observed;
  }
}

function currentState(node) {
  const rows = fields(node).map(w => ({ field: w.name, value: w.value,
    mode: linked(node, w.name) ? "connected" : w.value === "随机抽取" ? "random" : w.value === "跟随预设" ? "preset"
      : w.value === "不使用" ? "empty" : "fixed" }));
  const replaced = (node.widgets || []).filter(w => /^用户.+片段$/u.test(w.name)
    && !linked(node, w.name) && typeof w.value === "string" && w.value.trim()).map(w => w.name.slice(2, -2));
  return { rows, randomCount: rows.filter(row => row.mode === "random").length, replaced };
}

function stale(node, record) {
  if (!record) return false;
  // The host may already display the *next* seed after submitting a prompt.
  // Seed is excluded deliberately; actual submitted seed always comes from UI metadata.
  return Object.entries(record.data.settings).some(([name, value]) => {
    const w = widget(node, name);
    return w && w.serialize !== false && !linked(node, name) && !same(w.value, value);
  });
}

function comparison(previous, current) {
  if (!previous || previous.scope !== current.scope || !same(previous.settings, current.settings)
      || !same(previous.context, current.context)) return null;
  return current.modules.filter(module => {
    const before = previous.modules.find(item => item.name === module.name);
    return !before || before.zh !== module.zh || before.en !== module.en || before.source !== module.source;
  }).map(module => module.name);
}

function acceptResult(node, data, promptId = null, executionNode = null) {
  if (!target(node) || !data || data.version !== 1 || !Array.isArray(data.modules)
      || !Array.isArray(data.random_fields) || !data.settings || !data.resolved) return false;
  const order = promptId == null ? ++nextOrder : submissions.get(String(promptId))?.order;
  const previous = node.__vividMusePromptHistory?.at(-1);
  if (promptId != null && (order == null
      || (previous && order < previous.order))) return false;
  if (previous && promptId != null && previous.promptId === String(promptId)) return false;
  const record = { data, promptId: promptId == null ? null : String(promptId),
    executionNode, order: order ?? ++nextOrder, changed: comparison(previous?.data, data) };
  node.__vividMusePromptHistory ??= [];
  node.__vividMusePromptHistory.push(record);
  if (node.__vividMusePromptHistory.length > HISTORY_LIMIT) node.__vividMusePromptHistory.shift();
  refresh(node);
  node.setDirtyCanvas?.(true, true);
  return true;
}

function summary(node, lang = language()) {
  const en = lang === "en";
  const { randomCount } = currentState(node);
  const countText = `${randomCount} ${randomCount === 1 ? "field" : "fields"}`;
  const record = node.__vividMusePromptHistory?.at(-1);
  if (stale(node, record)) return en ? "Settings changed · View last result" : "设置已修改 · 查看上次结果";
  if (!record) return randomCount
    ? (en ? `Random: ${countText} · Not run` : `已启用随机：${randomCount} 项 · 待运行`)
    : (en ? "Random off · Details" : "随机未启用 · 查看详情");
  return en ? `Random: ${countText} · Last result` : `随机 ${randomCount} 项 · 查看上次结果`;
}

function details(node) {
  const state = currentState(node);
  const history = node.__vividMusePromptHistory || [];
  const record = history.at(-1);
  const lines = [text("随机状态与实际执行结果", "Random Status and Actual Execution Result"), summary(node), "",
    text("此面板为打开时的快照；运行或修改后请关闭并重新打开。",
      "This panel is a snapshot. Close and reopen after running or editing."),
    text("运行只抽取已设为随机抽取的字段；改变种子不会启用随机。",
      "Run samples only fields set to Random. Changing the seed does not enable randomization."),
    text("随机范围控制随机按钮启用哪些字段，也影响已随机字段的候选池；指定值、跟随预设、不使用均保持固定。",
      "Random Scope controls which fields the randomize button enables and affects random candidate pools. Fixed, Follow Preset and Omit stay fixed."),
    text("输入框的种子可能已变为下一次种子；下方记录的是实际提交种子。",
      "The editor may show the next seed. The record below uses the actual submitted seed.")];
  const hasConnections = node.inputs?.some(input => input.link != null);
  if (hasConnections) lines.push(text("连接输入以实际执行值为准；本面板未核对上游修改，控件随机数量不包含连接输入。",
    "Connected inputs use executed values. Upstream changes are not checked here; the random count excludes connected inputs."));
  if (!state.randomCount && !hasConnections) lines.push(text("随机未启用，改变种子不会改变本节点的结构化内容。",
    "Random is off: changing the seed will not change this node's structured content."));
  if (state.replaced.length) lines.push(text("用户文本替代内置模块：", "User text replaces built-in modules: ")
    + state.replaced.map(tr).join(", "));
  lines.push("", text("当前字段状态", "Current Field States"));
  const modes = { random: text("随机", "Random"), fixed: text("指定值", "Fixed"),
    preset: text("跟随预设", "Follow Preset"), empty: text("省略", "Omit"), connected: text("连接输入（待执行确定）", "Connected Input (Determined on Run)") };
  for (const row of state.rows) lines.push(`${tr(row.field)}: ${modes[row.mode]}`
    + (row.mode === "connected" ? "" : ` — ${displayValue(node, row.field, row.value)}`));
  if (!record) return lines.join("\n");
  const { data, changed } = record;
  lines.push("", text("上次实际执行（不是实时预览）", "Last Actual Execution (Not a Live Preview)"));
  if (stale(node, record)) lines.push(text("设置已修改，上次结果仅供参考。", "Settings changed; this historical result is for reference only."));
  lines.push(`${tr("随机种子")}: ${data.seed}`, `${text("执行范围", "Execution Scope")}: ${data.scope === "全部模块" ? text("全部模块", "All Modules") : tr(data.scope)}`);
  if (record.promptId) lines.push(`${text("执行标识", "Execution ID")}: ${record.promptId}`);
  if (record.executionNode) lines.push(`${text("节点执行路径", "Node Execution Path")}: ${record.executionNode}`);
  lines.push(changed === null ? text("首次记录或设置／上下文不同：不比较变化。",
    "First record or different settings/context: changes are not comparable.")
    : text(`相对上次可比较执行：${changed.length} 个模块变化。`, `Compared with the last comparable execution: ${changed.length} modules changed.`));
  if (changed?.length) lines.push(changed.map(tr).join(", "));
  if (changed?.length === 0) {
    if (!data.random_fields.length) lines.push(text("没有随机字段，固定输出相同。", "No random fields: fixed output is unchanged."));
    else if (data.random_fields.every(row => row.status !== "text_affecting")) lines.push(text(
      "随机字段被用户文本替代、本次为空或未影响当前文本；查看下面逐项记录。",
      "Random fields were replaced, empty or did not affect the current text; see individual records below."));
    else lines.push(text("本次输出相同：输入与种子相同时可复现（也可缓存重放）；不同种子也可能抽到相同结果。不据此推断候选数量。",
      "Output is unchanged: identical inputs and seed are reproducible (including cached replay); different seeds can also draw the same result. This does not establish candidate counts."));
  }
  const statuses = {
    user_replaced: text("被用户模块文本替代", "Replaced by user module text"),
    not_randomized: text("完整套组优先等联动规则取消了此字段的随机", "Randomization removed by complete-combination/dependency rules"),
    empty: text("本次解析为空（受联动／候选规则影响；未测量候选数）", "Resolved to empty (dependency/candidate rules; count not measured)"),
    not_in_text: text("移除此字段不会改变当前文本（分支／密度／构图等）", "Removing this field does not change the current text (branch/density/framing, etc.)"),
    text_affecting: text("移除此字段会改变当前文本", "Removing this field changes the current text"),
  };
  lines.push("", text("已配置随机字段的解析与文本影响", "Resolved Random Fields and Text Effects"),
    text("文本影响通过移除单字段后重渲染检查；不等于候选数量或生图效果。", "Text effects are measured by rendering without one field, not candidate counts or image quality."));
  for (const row of data.random_fields) lines.push(`${tr(row.module)} / ${tr(row.field)}: ${displayValue(node, row.field, row.value)} — ${statuses[row.status] || row.status}`
    + (row.configured === false ? text("（由兼容映射启用）", " (enabled by compatibility mapping)") : ""));
  lines.push("", text("实际解析字段（未保证每项写入正文）", "Actual Resolved Fields (Not All Necessarily Rendered)"));
  for (const [field, value] of Object.entries(data.resolved)) lines.push(`${tr(field)}: ${displayValue(node, field, value)}`);
  lines.push("", tr("中文提示词"), data.zh, "", tr("英文提示词"), data.en);
  if (history.length > 1) {
    lines.push("", text("近期执行记录（仅保存在内存，最多 5 条）", "Recent Executions (Memory Only, Up to 5)"));
    for (const item of history) lines.push(`${item.data.seed} — ${item.promptId || "—"}`);
  }
  return lines.join("\n");
}

function showDetails(node) {
  const bodyText = details(node);
  if (!globalThis.document?.createElement) { globalThis.alert?.(bodyText); return; }
  node.__vividMusePromptDialog?.close();
  const dialog = document.createElement("dialog");
  const body = document.createElement("pre");
  body.textContent = bodyText; // Untrusted user fragments must never be HTML.
  body.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-width:75vw;max-height:70vh;overflow:auto";
  const close = document.createElement("button");
  close.textContent = text("关闭", "Close");
  close.onclick = () => dialog.close();
  dialog.append(body, close);
  dialog.onclose = () => { dialog.remove(); if (node.__vividMusePromptDialog === dialog) node.__vividMusePromptDialog = null; };
  document.body.append(dialog);
  node.__vividMusePromptDialog = dialog;
  dialog.showModal();
}

function refresh(node) {
  const button = node?.__vividMusePromptStatusButton;
  if (!button) return;
  const label = summary(node);
  const changed = button.label !== label;
  button.label = button.__vividMuseDisplayText = label;
  button.tooltip = text("点击查看当前随机状态和上次实际输出；不会修改输入。", "View random status and last actual output; inputs are not modified.");
  if (changed) {
    // Node 2.0's widget-state map watches structural changes. Keep the helper
    // name stable and use the same synchronous refresh marker as existing UI.
    node.widgets.push({ name: "__vividMuseDiagnosticsRefresh", type: "hidden", hidden: true,
      options: { hidden: true, serialize: false } });
    node.widgets.pop();
  }
}

function install(node) {
  if (!target(node)) return;
  observeSubmissions();
  if (!node.__vividMusePromptStatusButton) {
    node.__vividMuseDiagnosticsGeneration = 0;
    const button = node.addWidget("button", "随机状态与执行结果", null, () => showDetails(node), { serialize: false });
    button.serialize = false;
    button.__vividMuseDynamicLabel = lang => summary(node, lang);
    node.__vividMusePromptStatusButton = button;
    const before = node.onConfigure;
    node.onConfigure = function () {
      this.__vividMusePromptHistory = [];
      this.__vividMuseDiagnosticsGeneration++;
      this.__vividMusePromptDialog?.close();
      const result = before?.apply(this, arguments);
      refresh(this);
      return result;
    };
    const removed = node.onRemoved;
    node.onRemoved = function () {
      this.__vividMuseDiagnosticsGeneration++;
      this.__vividMusePromptDialog?.close();
      return removed?.apply(this, arguments);
    };
    const connections = node.onConnectionsChange;
    node.onConnectionsChange = function () {
      const result = connections?.apply(this, arguments);
      refresh(this);
      return result;
    };
    // Fallback for hosts without the execution event API; event-capable hosts
    // use submission ownership and must not also consume uncorrelated onExecuted.
    if (!api?.addEventListener) {
      const executed = node.onExecuted;
      node.onExecuted = function (message) {
        const result = executed?.apply(this, arguments);
        acceptResult(this, message?.vividmuse_prompt_diagnostics?.[0]);
        return result;
      };
    }
  }
  for (const w of node.widgets || []) {
    if (w.serialize === false || w.__vividMuseDiagnosticsWrapped) continue;
    const before = w.callback;
    w.callback = function () { const result = before?.apply(this, arguments); refresh(node); return result; };
    w.__vividMuseDiagnosticsWrapped = true;
  }
  // Keep one short helper by the existing random button, never a tall DOM widget.
  const button = node.__vividMusePromptStatusButton;
  const random = node.__vividMuseRandomButton || node.__vividMuseModularRandomButton;
  if (random && node.widgets.indexOf(button) !== node.widgets.indexOf(random) + 1) {
    node.widgets.splice(node.widgets.indexOf(button), 1);
    node.widgets.splice(node.widgets.indexOf(random) + 1, 0, button);
  }
  refresh(node);
}

api?.addEventListener?.("executed", event => routeResult(event.detail));
for (const name of ["execution_error", "execution_interrupted"]) api?.addEventListener?.(name, event => {
  const id = event.detail?.prompt_id;
  if (id == null) return;
  terminalIds.add(String(id));
  if (terminalIds.size > ORDERS_LIMIT) terminalIds.delete(terminalIds.values().next().value);
  earlyResults.delete(String(id));
});

globalThis.__vividMusePromptDiagnostics = { refresh, install };
app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.PromptDiagnostics",
  init: observeSubmissions,
  nodeCreated(node) {
    if (!target(node)) return;
    install(node);
    globalThis.setTimeout?.(() => {
      install(node);
      const size = node.computeSize?.();
      if (size) node.setSize?.([Math.max(node.size?.[0] || 0, size[0]), size[1]]);
    }, 0);
  },
  loadedGraphNode(node) { install(node); },
});
