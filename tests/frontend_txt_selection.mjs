import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const definitions = [];
globalThis.__txtSelectionApp = {
  graph: { setDirtyCanvas() {} }, registerExtension(ext) { definitions.push(ext); },
};
function load(file, exports = "") {
  let code = fs.readFileSync(new URL(`../web/js/${file}`, import.meta.url), "utf8")
    .replace('import { app } from "../../scripts/app.js";', 'const app = globalThis.__txtSelectionApp;');
  vm.runInThisContext(`(function(){${code}\n${exports}})();`, { filename: file });
}
load("txt_library.js", "globalThis.__promptTools = { importTxtPromptFile, clearTxtPromptLibrary, applySelectedTxtPrompt, clearFreePrompt }; ");
load("txt_module_library.js", "globalThis.__moduleTools = { importTxtModuleFile, clearModuleLibrary, applySelectedModuleEntry, clearCurrentModule }; ");
load("txt_selection.js");
function make(kind, reverse = false) {
  const node = {
    comfyClass: kind === "module" ? "VividMuse_ZImageTxtModuleLibrary" : "VividMuse_ZImageTxtPromptLibrary",
    widgets: [], properties: {}, size: [360, 200],
    addWidget(type, name, value, callback, options = {}) {
      const w = { type, name, value, callback, options, computeSize: () => [360, 24] };
      this.widgets.push(w); return w;
    },
    setDirtyCanvas() {}, computeSize() { return [360, 60 + this.widgets.filter(w => !w.hidden).length * 24]; },
    setSize(size) { this.size = size; },
  };
  if (kind === "module") node.addWidget("combo", "模块类型", "人物");
  node.addWidget("text", kind === "module" ? "模块提示词" : "自由提示词", "手动草稿");
  node.addWidget("combo", "拼接位置", "前置提示词在前");
  node.addWidget("combo", "输出排版", "按模块分段");
  node.addWidget("combo", "选择模式", "手动选择");
  node.addWidget("number", "随机种子", 0);
  node.addWidget("combo", "control_after_generate", "fixed");
  node.addWidget("text", "词库数据", "");
  for (const ext of reverse ? [...definitions].reverse() : definitions) ext.nodeCreated?.(node);
  // Model the host's name-keyed state lookup. Renaming loses label/disabled state.
  node.hostWidgetStates = new Map(node.widgets.map(item => [item.name, item]));
  return node;
}
const w = (node, name) => node.widgets.find(w => w.name === name);
const set = (node, name, value) => { const item = w(node, name); item.value = value; item.callback?.(value); };
const read = node => JSON.parse(w(node, "词库数据").serializeValue());
function save(node) {
  const info = { properties: structuredClone(node.properties), widgets_values: [] };
  node.widgets.forEach((w, i) => { if (w.serialize !== false) info.widgets_values[i] = w.value; });
  node.onSerialize?.(info);
  return JSON.parse(JSON.stringify(info));
}
function restore(node, info) {
  node.properties = structuredClone(info.properties || {});
  const serialized = node.widgets.filter(w => w.serialize !== false);
  info.widgets_values.forEach((v, i) => { if (serialized[i]) serialized[i].value = v; });
  node.onConfigure?.(info);
  definitions.forEach(ext => ext.loadedGraphNode?.(node));
}

for (const reverse of [false, true]) {
  for (const kind of ["prompt", "module"]) {
    const node = make(kind, reverse);
    const body = kind === "prompt" ? "自由提示词" : "模块提示词";
    const file = { name: "library.txt", size: 100, async text() {
      return kind === "prompt" ? "## A\n第一行\n第二行\n---\n## B\n其他正文"
        : "## A\n模块：人物\n人物正文\n---\n## B\n模块：姿态动作\n姿态正文";
    } };
    await (kind === "prompt" ? __promptTools.importTxtPromptFile : __moduleTools.importTxtModuleFile)(node, file);
    assert.equal(read(node).entries.length, 2);
    assert.equal(w(node, "词库数据").serialize, true);
    assert.equal(w(node, "词库数据").hidden, true);
    assert.equal(w(node, "词库数据").options.hidden, true); // Nodes 2.0 visibility flag.
    assert.equal(w(node, "词库数据").computeSize()[1], -4);
    assert.equal(w(node, "随机种子").options.max, Number.MAX_SAFE_INTEGER);
    set(node, "选择模式", "随机抽取");
    set(node, "随机种子", Number.MAX_SAFE_INTEGER);
    assert.equal(w(node, "随机种子").serializeValue(), Number.MAX_SAFE_INTEGER);
    set(node, "随机种子", Number.MAX_SAFE_INTEGER + 1);
    assert.throws(() => w(node, "随机种子").serializeValue(), /API/);
    set(node, "随机种子", Number.MAX_SAFE_INTEGER);
    assert.equal(w(node, body).value, "手动草稿");
    assert.equal(w(node, body).hidden, true);
    assert.equal(w(node, "随机种子").hidden, undefined);
    const apply = kind === "prompt" ? __promptTools.applySelectedTxtPrompt : __moduleTools.applySelectedModuleEntry;
    assert.equal(apply(node), false);
    assert.equal((kind === "prompt" ? __promptTools.clearFreePrompt : __moduleTools.clearCurrentModule)(node), false);
    if (kind === "module") {
      set(node, "模块类型", "姿态动作");
      assert.equal(w(node, body).value, "手动草稿");
      assert.equal(w(node, "模块类型").hidden, false);
      const button = node.__vividMuseTxtModuleApplyButton;
      for (const scope of ["画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现", "自定义"]) {
        set(node, "模块类型", scope);
        assert.equal(node.hostWidgetStates.get(button.name), button);
        assert.equal(button.disabled, true);
        assert.equal(button.options.disabled, true);
        assert.match(button.label, new RegExp(scope));
        assert.equal(__moduleTools.applySelectedModuleEntry(node), false);
        assert.equal(w(node, body).value, "手动草稿");
      }
      set(node, "模块类型", "姿态动作");
    }
    const apiSnapshot = w(node, "词库数据").serializeValue();
    const saved = save(node);
    const copy = make(kind, reverse);
    restore(copy, saved);
    assert.equal(w(copy, "选择模式").value, "随机抽取");
    assert.equal(w(copy, "随机种子").value, Number.MAX_SAFE_INTEGER);
    assert.equal(w(copy, "control_after_generate").value, "fixed");
    assert.equal(w(copy, "词库数据").serializeValue(), apiSnapshot);
    const height = node.size[1];
    const result = { status: "selected", seed: "18446744073709551615", count: 2,
      title: "<script>user title</script>", prompt: "<img src=x>body", module: kind === "module" ? "人物" : null };
    node.onExecuted({ vividmuse_txt_selection: [result] });
    assert.equal(node.__txtSelectionResult.seed, result.seed);
    assert.equal(node.__txtSelectionResultButton.name, "随机抽取：尚未执行");
    assert.equal(node.__txtSelectionResultButton.label, "上次随机结果（点击查看）");
    assert.equal(node.hostWidgetStates.get(node.__txtSelectionResultButton.name), node.__txtSelectionResultButton);
    assert.equal(w(node, body).value, "手动草稿");
    assert.equal(node.size[1], height);
    // A cached/late execution is explicitly historical, not tied to the next seed.
    set(node, "随机种子", 17);
    node.onExecuted({ vividmuse_txt_selection: [result] });
    assert.equal(node.__txtSelectionResult.seed, result.seed);
    assert.ok(!JSON.stringify(save(node)).includes("<script>"));
    (kind === "prompt" ? __promptTools.clearTxtPromptLibrary : __moduleTools.clearModuleLibrary)(node);
    assert.equal(read(node).entries.length, 0);
    assert.equal(JSON.parse(apiSnapshot).entries.length, 2); // Frozen queued input.
    set(node, "选择模式", "手动选择");
    assert.equal(w(node, body).value, "手动草稿");
    assert.equal(w(node, body).hidden, undefined);
    if (kind === "module") assert.equal(w(node, "模块类型").value, "人物");
    assert.equal(w(node, "随机种子").hidden, true);
    // Restore a pre-output-layout workflow, with a saved legacy properties library.
    const legacy = kind === "prompt" ? ["旧手动", "前置提示词在前"] : ["人物", "旧手动", "前置提示词在前"];
    restore(copy, { properties: saved.properties, widgets_values: legacy });
    assert.equal(w(copy, "选择模式").value, "手动选择");
    assert.equal(w(copy, "随机种子").value, 0);
    assert.equal(w(copy, body).value, "旧手动");
    assert.equal(read(copy).entries.length, 2);
    // Even a properties-only change immediately before saving refreshes the saved mirror.
    delete copy.properties[kind === "prompt" ? "vividMuseTxtPromptLibrary" : "vividMuseTxtModuleLibrary"];
    const clearedSave = save(copy);
    const serialized = copy.widgets.filter(w => w.serialize !== false);
    assert.equal(JSON.parse(clearedSave.widgets_values[serialized.indexOf(w(copy, "词库数据"))]).entries.length, 0);
  }
}

// Read-only result uses textContent, never HTML; dialog is ephemeral.
const nodes = [];
globalThis.document = { createElement(tag) {
  const el = { tag, style: {}, append(...items) { this.children = items; },
    showModal() {}, close() { this.onclose(); }, remove() { this.removed = true; } };
  Object.defineProperty(el, "innerHTML", { set() { throw Error("Unsafe HTML"); } });
  nodes.push(el); return el;
}, body: { append() {} } };
const node = make("prompt");
node.onExecuted({ vividmuse_txt_selection: [{ status: "empty", count: 0, seed: "9", title: "<script>", prompt: "<img>" }] });
node.__txtSelectionResultButton.callback();
assert.ok(nodes.find(n => n.tag === "pre").textContent.includes("<script>"));
nodes.find(n => n.tag === "button").onclick();
assert.equal(nodes.find(n => n.tag === "dialog").removed, true);
delete globalThis.document;

const full = { comfyClass: "VividMuse_ZImageChinesePromptBuilder", widgets: [], properties: {} };
definitions.find(e => e.name.endsWith(".TxtSelection")).nodeCreated(full);
assert.equal(full.__txtSelectionInstalled, undefined);
const large = make("prompt");
const largeText = Array.from({ length: 500 }, (_, i) => `## Entry ${i}\n${"a".repeat(1000)}`).join("\n---\n");
await __promptTools.importTxtPromptFile(large, { name: "500.txt", size: Buffer.byteLength(largeText),
  async text() { return largeText; } });
const payloadBytes = Buffer.byteLength(w(large, "词库数据").serializeValue());
const workflowBytes = Buffer.byteLength(JSON.stringify(save(large)));
assert.equal(read(large).entries.length, 500);
assert.ok(workflowBytes < payloadBytes * 2.3);
console.log(`500-entry fixture: TXT ${Buffer.byteLength(largeText)} bytes, API payload ${payloadBytes}, workflow ${workflowBytes}.`);
console.log("TXT seeded selection: mirror, scope, manual drafts, workflow/API snapshots, safe UI, load order and Node 2.0 flags OK");
