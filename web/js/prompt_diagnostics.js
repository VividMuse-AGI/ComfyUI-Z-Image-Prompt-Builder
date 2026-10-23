import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Observes execution UI messages; saving a result card is an explicit action.
// Never queues prompts, changes seeds/fields or serializes diagnostic history.
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

function details(node, record = node.__vividMusePromptHistory?.at(-1), includeOutputs = true) {
  const state = currentState(node);
  const history = node.__vividMusePromptHistory || [];
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
  lines.push("", text("所选实际执行（不是实时预览）", "Selected Actual Execution (Not a Live Preview)"));
  if (stale(node, record)) lines.push(text("当前设置与所选记录不同，历史结果仅供参考。", "Current settings differ from the selected record; this historical result is for reference only."));
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
    framing_omitted: text("被构图适配省略（原选择保留）", "Omitted by framing adaptation (selection preserved)"),
    user_replaced: text("被用户模块文本替代", "Replaced by user module text"),
    not_randomized: text("完整套组优先等联动规则取消了此字段的随机", "Randomization removed by complete-combination/dependency rules"),
    empty: text("本次解析为空（受联动／候选规则影响；未测量候选数）", "Resolved to empty (dependency/candidate rules; count not measured)"),
    not_in_text: text("移除此字段不会改变当前文本（分支／密度／构图等）", "Removing this field does not change the current text (branch/density/framing, etc.)"),
    text_affecting: text("移除此字段会改变当前文本", "Removing this field changes the current text"),
  };
  if (data.framing && data.framing.status !== "disabled") {
    const reasons = {
      applied: text("已按明确景别适配", "Adapted to explicit framing"),
      no_context: text("没有明确摄影景别，未适配", "No explicit camera framing; not adapted"),
      opaque_camera: text("摄影由用户文本替代，未推断景别", "Camera replaced by user text; framing was not inferred"),
      unsupported_shot: text("此景别的可见范围不明确，保留原描述", "Visibility is ambiguous for this shot; original descriptions kept"),
    };
    lines.push("", text("构图适配", "Framing Adaptation"), reasons[data.framing.status] || data.framing.status);
    for (const row of data.framing.omitted || []) lines.push(`${tr(row.module)} / ${tr(row.field)}: ${displayValue(node, row.field, row.value)} — `
      + text("按景别省略，原选择保留", "omitted for framing; selection preserved"));
    lines.push(text("仅过滤明确画外的独立字段；不拆分整套造型或复合动作，不改写自由文本与 TXT。", "Only clearly out-of-frame standalone fields are filtered. Compound outfits/poses, free text and TXT content are not rewritten."));
  }
  lines.push("", text("已配置随机字段的解析与文本影响", "Resolved Random Fields and Text Effects"),
    text("文本影响通过移除单字段后重渲染检查；不等于候选数量或生图效果。", "Text effects are measured by rendering without one field, not candidate counts or image quality."));
  for (const row of data.random_fields) lines.push(`${tr(row.module)} / ${tr(row.field)}: ${displayValue(node, row.field, row.value)} — ${statuses[row.status] || row.status}`
    + (row.configured === false ? text("（由兼容映射启用）", " (enabled by compatibility mapping)") : ""));
  lines.push("", text("实际解析字段（未保证每项写入正文）", "Actual Resolved Fields (Not All Necessarily Rendered)"));
  for (const [field, value] of Object.entries(data.resolved)) lines.push(`${tr(field)}: ${displayValue(node, field, value)}`);
  if (includeOutputs) lines.push("", tr("中文提示词"), data.zh, "", tr("英文提示词"), data.en);
  if (history.length > 1) {
    lines.push("", text("近期执行记录（仅保存在内存，最多 5 条）", "Recent Executions (Memory Only, Up to 5)"));
    for (const item of history) lines.push(`${item.data.seed} — ${item.promptId || "—"}`);
  }
  return lines.join("\n");
}

function resultSnapshot(node, record) {
  // Content only: resolved fields are not an executable set of widget inputs.
  return JSON.parse(JSON.stringify({
    kind: "vividmuse-prompt-result", version: 1,
    source: { node_type: node.comfyClass || node.constructor?.type,
      prompt_id: record.promptId, execution_node: record.executionNode },
    scope: record.data.scope, seed: String(record.data.seed),
    zh: record.data.zh, en: record.data.en,
    resolved: record.data.resolved, modules: record.data.modules,
    framing: record.data.framing || null,
    limitations: {
      content_snapshot_only: true, executable_workflow: false,
      includes_upstream_workflow: false, resolved_fields_may_not_appear_in_text: true,
    },
  }));
}

function showDetails(node) {
  const bodyText = details(node);
  if (!globalThis.document?.createElement) { globalThis.alert?.(bodyText); return; }
  node.__vividMusePromptDialog?.close();
  // Freeze the panel at open time, including records evicted by a later run.
  const records = JSON.parse(JSON.stringify(node.__vividMusePromptHistory || [])).reverse();
  const graph = rootGraph();
  const generation = node.__vividMuseDiagnosticsGeneration || 0;
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "width:min(760px,90vw);max-height:85vh;overflow:auto;padding:20px;background:var(--comfy-menu-bg,#252525);color:var(--input-text,#eee);border:1px solid #777;border-radius:10px";
  const el = (tag, content = "") => {
    const item = document.createElement(tag); item.textContent = content; return item;
  };
  const button = (zh, en, action) => {
    const item = el("button", text(zh, en)); item.type = "button"; item.onclick = action; return item;
  };
  const title = el("h3", text("实际执行结果", "Actual Execution Results"));
  dialog.setAttribute("aria-label", title.textContent);
  const note = el("p", text("仅保留本次会话最近 5 条。此面板为打开时的快照；运行后请重新打开。导出只保存结果正文，不包含可执行或上游工作流。",
    "The latest 5 records are kept in this session only. Reopen after running to refresh. Export saves result content, not an executable or upstream workflow."));
  const close = button("关闭", "Close", () => dialog.close());
  dialog.append(title, note, close);
  const selector = el("select");
  selector.setAttribute("aria-label", text("选择执行记录", "Select Execution Record"));
  selector.style.cssText = "display:block;max-width:100%;margin:12px 0";
  records.forEach((record, index) => {
    const option = el("option", `${records.length - index} · ${text("实际种子", "Actual Seed")}: ${record.data.seed} · ${record.promptId || "—"}`);
    option.value = String(index); selector.append(option);
  });
  selector.value = "0";
  const info = el("p");
  const status = el("p"); status.setAttribute("role", "status");
  const zhBody = el("pre"), enBody = el("pre"), diagnosticBody = el("pre");
  for (const body of [zhBody, enBody, diagnosticBody]) {
    // textContent only: output may contain literal HTML or user fragments.
    body.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:32vh;overflow:auto;user-select:text";
    body.tabIndex = 0;
  }
  zhBody.setAttribute("aria-label", text("中文结果正文", "Chinese Result Text"));
  enBody.setAttribute("aria-label", text("英文结果正文", "English Result Text"));
  const selected = () => records[Number(selector.value)];
  let active = true, composing = false;
  const copy = async key => {
    const record = selected();
    if (!record) return;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw Error("Clipboard unavailable");
      await globalThis.navigator.clipboard.writeText(record.data[key] || "");
      if (active && selected() === record) status.textContent = text("正文已复制。", "Result text copied.");
    } catch {
      if (active && selected() === record) status.textContent = text("复制失败，请选中下方正文手动复制。", "Copy failed. Select the result text below and copy it manually.");
    }
  };
  const exportResult = () => {
    const record = selected();
    if (!record) return;
    let url, link;
    try {
      const json = JSON.stringify(resultSnapshot(node, record), null, 2);
      url = URL.createObjectURL(new Blob([json], {type: "application/json;charset=utf-8"}));
      link = el("a"); link.href = url; link.download = "vividmuse-prompt-result.json";
      dialog.append(link); link.click();
      status.textContent = text("已请求下载结果快照；这不是工作流文件。", "Result snapshot download requested; this is not a workflow file.");
    } catch {
      status.textContent = text("无法导出，请检查浏览器下载权限；仍可复制正文。", "Export failed. Check browser download permissions; the result text can still be copied.");
    } finally {
      link?.remove();
      if (url) globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  const actions = el("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
  actions.append(button("复制中文", "Copy Chinese", () => copy("zh")),
    button("复制英文", "Copy English", () => copy("en")), button("导出此结果", "Export This Result", exportResult));
  const cardArea = el("section");
  const cardActions = el("div"); cardActions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0";
  const cardAvailability = el("p"); cardAvailability.style.whiteSpace = "pre-wrap";
  const cardEditor = el("div"); cardEditor.hidden = true;
  const cardName = el("input"); cardName.maxLength = 80;
  cardName.setAttribute("aria-label", text("卡片名称", "Card name"));
  const cardInfo = el("p"); cardInfo.style.whiteSpace = "pre-wrap";
  const cardPreview = el("pre");
  cardPreview.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:26vh;overflow:auto";
  const cardNotice = el("p", text(
    "保存该次执行的完整模块选项，含未写入正文的隐藏或省略字段；不含发型、上游工作流，不保证换景别或密度后正文一致。保存不会应用卡片或新增锁定。",
    "Save this execution's complete module options, including hidden or omitted fields. Hair and upstream workflows are not included. Text may differ with framing or density. Saving does not apply or lock the card."));
  let cardDraft = null;
  const cardModules = (node.comfyClass || node.constructor?.type) === FULL ? ["人物", "服装"]
    : (node.comfyClass || node.constructor?.type) === "VividMuse_ZImagePersonModule" ? ["人物"]
    : (node.comfyClass || node.constructor?.type) === "VividMuse_ZImageClothingModule" ? ["服装"] : [];
  const checkCardOwner = record => {
    if (!active || rootGraph() !== graph || generation !== (node.__vividMuseDiagnosticsGeneration || 0)
        || record?.promptId == null || record?.executionNode == null
        || nodeAtPath(graph, record.executionNode) !== node)
      throw new Error(text("无法确认该记录所属的节点会话，请重新打开面板或执行节点。",
        "Cannot confirm this record's node session. Reopen the panel or run the node again."));
  };
  const captureResult = (record, moduleName, name) => {
    checkCardOwner(record);
    const cards = globalThis.__vividMuseContentCards;
    if (!cards?.captureResultCard || !cards?.saveCard) throw new Error(text(
      "卡片功能尚未加载，请刷新页面后重试。", "Card tools are not loaded. Refresh the page and retry."));
    return cards.captureResultCard(node, record.data, moduleName, name);
  };
  const guardedCardAction = action => () => {
    if (!active || composing) return;
    try { action(); } catch (error) { if (active) status.textContent = error.message; }
  };
  const clearCardDraft = () => { cardDraft = null; cardEditor.hidden = true; };
  const cardButtons = cardModules.map(moduleName => {
    const item = button(moduleName === "人物" ? "保存为人物卡" : "保存为穿搭卡",
      moduleName === "人物" ? "Save as Person Card" : "Save as Outfit Card", guardedCardAction(() => {
        const record = selected();
        const name = `${text(moduleName === "人物" ? "人物" : "穿搭", moduleName === "人物" ? "Person" : "Outfit")} · ${record.data.seed}`;
        const entry = captureResult(record, moduleName, name);
        cardDraft = {record, moduleName}; cardName.value = name;
        cardInfo.textContent = `${text("实际提交种子", "Actual Submitted Seed")}: ${record.data.seed}\n`
          + `${text("执行记录", "Execution Record")}: ${record.promptId}`;
        cardPreview.textContent = Object.entries(entry.values).map(([key, value]) =>
          `${tr(key)}: ${displayValue(node, key, value)}`).join("\n");
        cardEditor.hidden = false; status.textContent = ""; cardName.focus();
      }));
    cardActions.append(item);
    return {item, moduleName};
  });
  const confirmCard = button("确认保存卡片", "Confirm Save Card", guardedCardAction(() => {
    if (!cardDraft || cardDraft.record !== selected()) throw new Error(text(
      "执行记录已变化，请重新选择要保存的卡片。", "The selected record changed. Choose the card to save again."));
    const {record, moduleName} = cardDraft;
    const entry = captureResult(record, moduleName, cardName.value);
    const saved = node.properties?.vividMuseContentCards;
    const exists = Array.isArray(saved) && saved.some(card => card.module === entry.module && card.name === entry.name);
    if (exists && !window.confirm(text("覆盖同类型同名卡片？", "Replace this card of the same type and name?"))) return;
    checkCardOwner(record);
    globalThis.__vividMuseContentCards.saveCard(node, entry, exists);
    clearCardDraft();
    status.textContent = text("已保存到此节点的卡片库；请保存工作流以保留。当前选项与锁定未改变。",
      "Saved in this node's card library; save the workflow to keep it. Current options and locks are unchanged.");
  }));
  cardEditor.append(cardInfo, cardNotice, cardName, cardPreview, confirmCard,
    button("取消保存", "Cancel Save", clearCardDraft));
  cardArea.hidden = !cardModules.length;
  cardArea.append(cardActions, cardAvailability, cardEditor);
  const diagnostic = el("details");
  diagnostic.append(el("summary", text("字段与诊断详情", "Fields and Diagnostics")), diagnosticBody);
  const render = () => {
    const record = selected(); status.textContent = "";
    clearCardDraft();
    const unavailable = [];
    for (const {item, moduleName} of cardButtons) {
      try {
        captureResult(record, moduleName, "preview"); item.disabled = false; item.title = "";
      } catch (error) {
        item.disabled = true; item.title = error.message;
        unavailable.push(`${text(moduleName, moduleName === "人物" ? "Person" : "Outfit")}: ${error.message}`);
      }
    }
    cardAvailability.textContent = unavailable.join("\n");
    if (!record) { diagnosticBody.textContent = bodyText; diagnostic.open = true; return; }
    info.textContent = `${text("实际提交种子", "Actual Submitted Seed")}: ${record.data.seed}\n`
      + (record.changed === null ? text("首次记录或设置／上下文不同，不比较变化。", "First record or different settings/context; changes are not comparable.")
        : text(`相对前次可比较执行：${record.changed.length} 个模块变化`, `Compared with the previous comparable execution: ${record.changed.length} modules changed`)
          + (record.changed.length ? ` (${record.changed.map(tr).join(", ")})` : ""))
      + (stale(node, record) ? text("\n当前设置与此记录不同；这是历史结果。", "\nCurrent settings differ from this historical result.") : "");
    info.style.whiteSpace = "pre-wrap";
    if (record.data.framing?.status && record.data.framing.status !== "disabled") info.textContent += text(
      `\n构图适配省略 ${record.data.framing.omitted.length} 项，原因见字段与诊断详情。`,
      `\nFraming adaptation omitted ${record.data.framing.omitted.length} fields; see Fields and Diagnostics for reasons.`);
    zhBody.textContent = record.data.zh || ""; enBody.textContent = record.data.en || "";
    diagnosticBody.textContent = details(node, record, false);
  };
  selector.onchange = render;
  if (records.length) dialog.append(selector, info, actions, cardArea, status,
    el("h4", text("中文提示词", "Chinese Prompt")), zhBody, el("h4", text("英文提示词", "English Prompt")), enBody);
  else dialog.append(el("p", text("暂无实际执行记录，请先运行节点。", "No execution record yet. Run the node first.")));
  dialog.append(diagnostic); render();
  dialog.addEventListener("compositionstart", () => { composing = true; });
  dialog.addEventListener("compositionend", () => { composing = false; });
  dialog.addEventListener("cancel", event => { if (composing) event.preventDefault(); });
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape" && !composing && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); dialog.close();
    }
  });
  for (const name of ["keyup", "copy", "cut", "paste", "wheel"]) dialog.addEventListener(name, event => event.stopPropagation());
  dialog.onclose = () => { active = false; dialog.remove(); if (node.__vividMusePromptDialog === dialog) node.__vividMusePromptDialog = null; };
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
