import assert from "node:assert/strict";
import { test } from "node:test";
import { createVmContext, loadLibModule } from "./vm_loader.mjs";

const zh = "第一段正文。\n\n第二段保留空行。";
const en = "First paragraph.\n\nKeep the blank line.";
const full = "VividMuse_ZImageChinesePromptBuilder";
const pose = "VividMuse_ZImagePoseModule";
const fixture = () => ({ changeTracker: {}, graphId: "same-file-id" });
const latest = node => node.__vividMusePromptHistory?.at(-1);

function host({ compatible = true } = {}) {
  const nodes = new Map(), graphListeners = new Map(), apiListeners = new Map();
  const timers = [], opened = [], activations = [], actions = [];
  let ext;
  const store = { activeWorkflow: null, openWorkflows: opened,
    onUserActivation(fn) { activations.push(fn); },
    $onAction(fn) { actions.push(fn); },
  };
  const graph = {
    get nodes() { return [...nodes.values()]; },
    getNodeById(id) { return nodes.get(String(id)); },
    setDirtyCanvas() {},
    events: { addEventListener(type, fn) { graphListeners.set(type, fn); } },
  };
  const app = {
    graph, rootGraphOrUndefined: graph,
    extensionManager: compatible ? { workflow: store } : {},
    async graphToPrompt() {
      return { output: Object.fromEntries([...nodes].map(([key, node]) => [key, { class_type: node.comfyClass }])) };
    },
    registerExtension(value) { ext = value; },
  };
  const api = {
    addEventListener(type, fn) { apiListeners.set(type, fn); },
    async queuePrompt(_n, _prompt, {id, early}) {
      if (early) early();
      return { prompt_id: id };
    },
  };
  const runtime = createVmContext({ app, api, setTimeout: fn => timers.push(fn) });
  runtime.qa = loadLibModule("prompt_diagnostics", runtime, { expose: ["resultSnapshot", "details"] });
  ext.init(); ext.setup();
  const event = (type, id, data = {}) => apiListeners.get(type)?.({ detail: { prompt_id: id, ...data } });
  const queue = async (id, early) => api.queuePrompt(0, await app.graphToPrompt(), {id, early});
  const result = (id, { key = 1, text = zh, english = en, seed = "42", scope = "全部模块" } = {}) =>
    event("executed", id, { node: String(key), output: { vividmuse_prompt_diagnostics: [{
      version: 1, scope, seed, settings: {}, resolved: {}, modules: [], random_fields: [], zh: text, en: english,
    }] } });
  function make(id, type) {
    const node = {id, comfyClass: type, properties: {}, widgets: [],
      addWidget(type, name, value, callback, options) {
        const w = { type, name, value, callback, options }; this.widgets.push(w); return w;
      },
      setDirtyCanvas() {},
    };
    nodes.set(String(id), node);
    ext.nodeCreated(node); node.onConfigure(); ext.loadedGraphNode(node);
    while (timers.length) timers.shift()();
    return node;
  }
  function begin() {
    ext.beforeLoadGraph();
    for (const node of nodes.values()) node.onRemoved();
    nodes.clear();
    ext.beforeConfigureGraph();
  }
  function finish(to, ids, {activate = true} = {}) {
    const instantiated = ids.map(row => Array.isArray(row) ? make(...row) : make(row, full));
    ext.afterConfigureGraph();
    if (!opened.includes(to)) opened.push(to);
    store.activeWorkflow = to;
    ext.afterLoadGraph();
    if (activate) activateTab(to);
    return instantiated;
  }
  function activateTab(to) { for (const cb of activations) cb(to); }
  function load(to, ids = [1], options) { begin(); return finish(to, ids, options); }
  function deleteNode(id) {
    const node = graph.getNodeById(id);
    nodes.delete(String(id));
    node.onRemoved();
    graphListeners.get("node:removed")?.({detail: {node}});
  }
  function close(to) {
    const after = [];
    for (const fn of actions) fn({ name: "closeWorkflow", args: [to],
      after: callback => after.push(callback), onError() {} });
    opened.splice(opened.indexOf(to), 1);
    to.changeTracker = null;
    for (const cb of after) cb();
  }
  async function run(id, fields, { order = "normal", terminal = "execution_success" } = {}) {
    if (order === "before-http") {
      await queue(id, () => { event(terminal, id); result(id, fields); });
      return;
    }
    await queue(id);
    if (order === "success-first") { event(terminal, id); result(id, fields); }
    else { result(id, fields); event(terminal, id); }
  }
  return { make, load, begin, finish, activateTab, deleteNode, close, run, result, queue, event, graph, store,
    exports: runtime.qa, error: () => ext.onGraphLoadError(),
    orphanConfigure: () => ext.afterConfigureGraph() };
}

test("real result export fields and paragraph breaks survive A → B → A", async () => {
  const h = host(), a = fixture(), b = fixture();
  const [before] = h.load(a);
  await h.run("A-result", { seed: "18446744073709551615" });
  const exportBefore = JSON.stringify(h.exports.resultSnapshot(before, latest(before)));
  h.load(b);
  await h.run("B-result", { text: "B" });
  const [back] = h.load(a);
  assert.equal(latest(back).data.zh, zh);
  assert.equal(latest(back).data.en, en);
  assert.equal(latest(back).data.seed, "18446744073709551615");
  assert.equal(JSON.stringify(h.exports.resultSnapshot(back, latest(back))), exportBefore);
  assert.equal(latest(back).restoredAcrossWorkflow, true);
  assert.doesNotMatch(JSON.stringify({ properties: back.properties, widgets: back.widgets.map(x => x.value) }),
    /A-result|restoredAcrossWorkflow|第一段正文/);
});

test("same graph ID, same node IDs across workflows and two nodes within one workflow remain isolated", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a, [[1, full], [2, pose], [3, full]]);
  await h.queue("A");
  h.result("A", { key: 1, text: "A / one" });
  h.result("A", { key: 2, text: "A / two", scope: "姿态动作" });
  h.event("execution_success", "A");
  const [b1] = h.load(b);
  assert.equal(latest(b1), undefined);
  await h.run("B", { text: "B / one" });
  const [one, two, three] = h.load(a, [[1, full], [2, pose], [3, full]]);
  assert.equal(latest(one).data.zh, "A / one");
  assert.equal(latest(two).data.zh, "A / two");
  assert.equal(latest(three), undefined);
  assert.equal(latest(h.load(b)[0]).data.zh, "B / one");
});

test("retains native five-record limit without switching and only latest on repeated switching", async () => {
  const h = host(), a = fixture(), b = fixture();
  const [node] = h.load(a);
  for (let i = 0; i < 7; i++) await h.run(`prompt-${i}`, {text: String(i)});
  assert.equal(node.__vividMusePromptHistory.length, 5);
  for (let i = 0; i < 3; i++) {
    h.load(b);
    const [back] = h.load(a);
    assert.equal(back.__vividMusePromptHistory.length, 1);
    assert.equal(latest(back).data.zh, "6");
    assert.equal(latest(back).promptId, "prompt-6");
  }
});

test("old late completed result cannot overwrite a newer accepted result", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a);
  await h.queue("older");
  await h.run("newer", { text: "new" });
  h.result("older", { text: "late, old" });
  h.event("execution_success", "older");
  h.load(b);
  assert.equal(latest(h.load(a)[0]).data.zh, "new");
});

test("failed, interrupted, and missing diagnostics do not replace saved success", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a);
  await h.run("keeper", { text: "keep" });
  await h.run("failed", { text: "partial fail" }, { terminal: "execution_error" });
  await h.run("cancelled", { text: "partial cancel" }, { terminal: "execution_interrupted" });
  await h.queue("missing");
  h.event("execution_success", "missing");
  h.load(b);
  assert.equal(latest(h.load(a)[0]).data.zh, "keep");
});

test("accepted cached/early events before queue response or success retain original record", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a);
  await h.run("early", { text: "early" }, { order: "before-http" });
  h.load(b);
  assert.equal(latest(h.load(a)[0]).data.zh, "early");
  await h.run("cached", { text: "cached" }, { order: "success-first" });
  h.load(b);
  assert.equal(latest(h.load(a)[0]).data.zh, "cached");
});

test("late events cannot attach to a subsequent instance or a different active workflow", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a);
  await h.run("saved", { text: "keep" });
  await h.queue("old-in-flight");
  const [b1] = h.load(b);
  h.result("old-in-flight", { text: "wrong!" });
  h.event("execution_success", "old-in-flight");
  assert.equal(latest(b1), undefined);
  const [returned] = h.load(a);
  h.result("old-in-flight", { text: "wrong again" });
  h.event("execution_success", "old-in-flight");
  assert.equal(latest(returned).data.zh, "keep");
});

test("close, re-open, duplicate, delete/undo, and same-session reload do not inherit", async () => {
  const h = host(), a = fixture(), b = fixture(), copy = fixture();
  h.load(a);
  await h.run("use-once", {});
  assert.equal(latest(h.load(copy)[0]), undefined);
  assert.ok(latest(h.load(a)[0]));
  h.deleteNode(1);
  assert.equal(latest(h.load(a, [1], { activate: false })[0]), undefined);
  await h.run("reload", {});
  assert.equal(latest(h.load(a, [1], { activate: false })[0]), undefined);
  await h.run("closed", {});
  h.load(b);
  h.close(a);
  a.changeTracker = {}; // Same file, graph ID, and workflow object; a new opened period.
  assert.equal(latest(h.load(a)[0]), undefined);
});

test("auto activation caused by closing current tab is not an explicit switch", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(b); await h.run("B-record", { text: "B" });
  h.load(a); await h.run("A-record", { text: "A" });
  const [target] = h.load(b, [1], { activate: false });
  h.close(a); h.activateTab(b);
  assert.equal(latest(target), undefined);
});

for (const successFirst of [false, true]) {
  test(`closing an inactive workflow preserves the active run (${successFirst ? "success first" : "output first"})`, async () => {
    const h = host(), a = fixture(), b = fixture(), c = fixture();
    h.load(b); await h.run("B-saved", { text: "B" });
    const [active] = h.load(a);
    await h.run("A-previous", { text: "previous" });
    await h.queue("A-current");
    const output = () => h.result("A-current", { text: "latest", seed: "153" });
    const success = () => h.event("execution_success", "A-current");
    (successFirst ? success : output)();
    h.close(b);
    (successFirst ? output : success)();
    assert.equal(latest(active).promptId, "A-current");
    h.load(c);
    const [returned] = h.load(a);
    assert.equal(latest(returned).promptId, "A-current");
    assert.equal(latest(returned).data.zh, "latest");
    assert.equal(latest(returned).data.seed, "153");
    b.changeTracker = {};
    assert.equal(latest(h.load(b)[0]), undefined);
  });
}

test("explicit removal invalidates only the removed node even if its number and type are reused", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a, [1, 2]);
  await h.queue("both");
  h.result("both", { key: 1, text: "retain" });
  h.result("both", { key: 2, text: "delete" });
  h.event("execution_success", "both");
  h.deleteNode(2);
  h.make(2, full);
  h.load(b);
  const [one, two] = h.load(a, [1, 2]);
  assert.equal(latest(one).data.zh, "retain");
  assert.equal(latest(two), undefined);
});

test("mismatched delayed activation cannot populate the current tab; next unambiguous switch works", async () => {
  const h = host(), a = fixture(), b = fixture(), c = fixture();
  h.load(a); await h.run("saved-A", {text: "A"});
  h.load(b); await h.run("saved-B", {text: "B"});
  h.load(c);
  const [abandoned] = h.load(a, [1], {activate: false});
  const [current] = h.load(b, [1], {activate: false});
  h.activateTab(a); h.activateTab(b); // A is stale; refuse both when ambiguous.
  assert.equal(latest(abandoned), undefined);
  assert.equal(latest(current), undefined);
  assert.equal(latest(h.load(a)[0]).data.zh, "A");
  assert.equal(latest(h.load(b)[0]).data.zh, "B");
});

test("a new live record present at activation is never replaced by the saved one", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a); await h.run("old-A", {text: "old"});
  h.load(b);
  const [back] = h.load(a, [1], {activate: false});
  await h.run("new-A", {text: "new"});
  h.activateTab(a);
  assert.equal(latest(back).data.zh, "new");
  assert.equal(back.__vividMusePromptHistory.length, 1);
  h.load(b);
  assert.equal(latest(h.load(a)[0]).data.zh, "new");
});

test("failed and overlapping transitions, duplicate activation, unbound results, and absent host APIs fail closed", async () => {
  const h = host(), a = fixture(), b = fixture();
  h.load(a); await h.run("A", {});
  h.begin(); h.error();
  assert.equal(latest(h.load(b)[0]), undefined);
  assert.equal(latest(h.load(a)[0]), undefined);
  await h.run("A-again", {});
  h.begin(); h.begin(); h.finish(b, [1]);
  const [back] = h.load(a);
  assert.equal(latest(back), undefined);
  h.result("unbound");
  h.activateTab(a);
  assert.equal(latest(back), undefined);
  const legacy = host({ compatible: false }), [old] = legacy.load(a);
  await legacy.run("legacy", {});
  assert.equal(latest(old).promptId, "legacy"); // Existing live diagnostics still work.
  legacy.load(b);
  assert.equal(latest(legacy.load(a)[0]), undefined);
});
