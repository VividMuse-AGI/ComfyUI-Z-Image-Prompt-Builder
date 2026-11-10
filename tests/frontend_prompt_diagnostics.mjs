import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const definitions = [];
const listeners = new Map();
const nodes = new Map();
const timers = [];
let serializePrompt = prompt => prompt;
const sandbox = {
  console, setTimeout(callback) { timers.push(callback); },
  __app: { graph: { get nodes() { return [...nodes.values()]; },
    getNodeById: id => nodes.get(String(id)), setDirtyCanvas() {} },
    async graphToPrompt() { return serializePrompt({workflow: {nodes: []}, output: Object.fromEntries(
      [...nodes].map(([id, node]) => [id, {class_type: node.comfyClass, inputs: {}}]))}); },
    registerExtension: ext => definitions.push(ext) },
  __api: { addEventListener: (name, fn) => listeners.set(name, fn),
    async queuePrompt(_number, _data, options) {
      return options.response ? options.response(_number, _data, options) : {prompt_id: options.promptId};
    } },
};
vm.createContext(sandbox);
const source = fs.readFileSync(new URL("../web/js/prompt_diagnostics.js", import.meta.url), "utf8")
  .replace('import { app } from "../../scripts/app.js";', "const app = globalThis.__app;")
  .replace('import { api } from "../../scripts/api.js";', "const api = globalThis.__api;");
vm.runInContext(`${source}\nglobalThis.testApi = {details, summary, acceptResult, currentState, submissions, earlyResults, terminalIds};`, sandbox);
const { testApi: tools } = sandbox;
const ext = definitions[0];
ext.init?.();
const kinds = ["ChinesePromptBuilder", "CanvasModule", "PersonModule", "HairModule", "ClothingModule",
  "PoseModule", "SceneModule", "CameraModule", "VisualModule"];
function make(kind, id) {
  const node = {
    id, comfyClass: `VividMuse_ZImage${kind}`, widgets: [], properties: {},
    addWidget(type, name, value, callback, options = {}) {
      const w = { type, name, value, callback, options };
      this.widgets.push(w); return w;
    }, setDirtyCanvas() {},
  };
  node.addWidget("combo", "预设", "预设A");
  node.addWidget("number", "随机种子", 123);
  node.addWidget("combo", "发色", "跟随预设", undefined,
    { values: ["跟随预设", "随机抽取", "不使用", "黑色"] });
  node.addWidget("combo", "鞋履", "不使用", undefined,
    { values: ["跟随预设", "随机抽取", "不使用", "球鞋"] });
  node.addWidget("text", "自由提示词", "draft");
  node.addWidget("text", "用户发型片段", "");
  node.__vividMuseRandomButton = node.addWidget("button", "随机按钮", null, () => {}, {serialize: false});
  node.__vividMuseRandomButton.serialize = false;
  ext.nodeCreated(node);
  while (timers.length) timers.shift()();
  nodes.set(String(id), node);
  return node;
}
const w = (node, name) => node.widgets.find(w => w.name === name);
const set = (node, name, value) => { const item = w(node, name); item.value = value; item.callback?.(value); };
const event = (name, detail) => listeners.get(name)?.({detail});
const queue = async id => sandbox.__api.queuePrompt(0, await sandbox.__app.graphToPrompt(), {promptId: id});
function data(node, seed, prompt, status = "text_affecting") {
  return {version: 1, scope: "全部模块", seed: String(seed),
    settings: {预设: "预设A", 发色: w(node, "发色").value, 鞋履: w(node, "鞋履").value,
      自由提示词: w(node, "自由提示词").value, 用户发型片段: w(node, "用户发型片段").value},
    context: {}, resolved: {发色: "黑色", 鞋履: "不使用"}, zh: prompt, en: "black hair",
    modules: [{name: "发型", zh: prompt, en: "black hair", source: "builtin"}],
    random_fields: w(node, "发色").value === "随机抽取"
      ? [{field: "发色", module: "发型", value: "黑色", status}] : []};
}
const submit = async (id, seed, body, node, status) => {
  await queue(id);
  event("execution_start", {prompt_id: id});
  event("executed", {prompt_id: id, node: "1", output: {vividmuse_prompt_diagnostics: [data(node, seed, body, status)]}});
};

for (const [index, kind] of kinds.entries()) {
  const node = make(kind, index + 1);
  const button = node.__vividMusePromptStatusButton;
  assert.equal(button.name, "随机状态与执行结果");
  assert.equal(button.type, "button"); // Same native widget in Classic and Nodes 2.0.
  assert.equal(button.serialize, false);
  assert.equal(button.options.serialize, false);
  assert.equal(node.widgets.indexOf(button), node.widgets.indexOf(node.__vividMuseRandomButton) + 1);
  assert.match(tools.details(node), /改变种子不会改变本节点的结构化内容/);
  const hostStates = new Map(node.widgets.map(w => [w.name, w]));
  set(node, "随机种子", 777);
  assert.equal(button.label, "查看结果");
  set(node, "发色", "随机抽取");
  assert.equal(button.label, "查看结果");
  assert.match(tools.summary(node), /已启用随机：1/);
  set(node, "用户发型片段", "我的头发");
  assert.match(tools.details(node), /用户文本替代内置模块：发型/);
  assert.equal(w(node, "鞋履").value, "不使用");
  assert.equal(w(node, "自由提示词").value, "draft");
  assert.equal(hostStates.get(button.name), button); // Never rename dynamic helper keys.
  const count = node.widgets.length;
  ext.loadedGraphNode(node);
  assert.equal(node.widgets.length, count);
}
const node = nodes.get("1");
set(node, "用户发型片段", "");
await submit("one", "18446744073709551615", "黑发", node);
set(node, "随机种子", 999); // The host's next seed must not masquerade as the executed seed.
assert.match(tools.details(node), /18446744073709551615/);
assert.doesNotMatch(tools.summary(node), /设置已修改/);
assert.match(tools.details(node), /首次记录/);
await submit("two", 2, "红发", node);
assert.match(tools.details(node), /1 个模块变化/);
await submit("cached-three", 2, "红发", node);
assert.match(tools.details(node), /0 个模块变化/);
assert.match(tools.details(node), /缓存重放/);

await queue("old");
await queue("new");
event("execution_start", {prompt_id: "old"});
event("execution_start", {prompt_id: "new"});
const coherentBlock={version:1,mode:'coherent',fallback:false,coverage:'partial',events:[],truncated:false};
event("executed", {prompt_id: "new", node: "1", output: {vividmuse_prompt_diagnostics: [{...data(node, 5, "新结果"),coherence_explanation:coherentBlock}]}});
event("executed", {prompt_id: "old", node: "1", output: {vividmuse_prompt_diagnostics: [{...data(node, 4, "旧结果"),coherence_explanation:{...coherentBlock,mode:'standard'}}]}});
assert.equal(node.__vividMusePromptHistory.at(-1).data.zh, "新结果");
assert.equal(node.__vividMusePromptHistory.at(-1).data.coherence_explanation.mode,'coherent','late metadata cannot replace the selected execution');
event("executed", {prompt_id: "missed-start", node: "1", output: {vividmuse_prompt_diagnostics: [data(node, 9, "未关联结果")]}});
assert.equal(node.__vividMusePromptHistory.at(-1).data.zh, "新结果");
assert.equal(tools.acceptResult(node, {version: 2}, "new"), false);
set(node, "自由提示词", "修改草稿");
assert.match(tools.summary(node), /设置已修改/);
await submit("different-settings", 6, "不比较", node);
assert.equal(node.__vividMusePromptHistory.at(-1).changed, null);
for (let i = 0; i < 9; ++i) await submit(`history-${i}`, i, "bounded", node);
assert.equal(node.__vividMusePromptHistory.length, 5);
const saved = JSON.stringify({properties: node.properties, widgets_values: node.widgets.filter(w => w.serialize !== false).map(w => w.value)});
assert.doesNotMatch(saved, /history-|vividmuse_prompt_diagnostics|bounded/);
await queue("previous-workflow");
event("execution_start", {prompt_id: "previous-workflow"});
node.onConfigure({});
assert.equal(node.__vividMusePromptHistory.length, 0);
assert.match(tools.summary(node), /待运行/);
event("executed", {prompt_id: "previous-workflow", node: "1", output: {vividmuse_prompt_diagnostics: [data(node, 9, "已关闭工作流的结果")]}});
assert.equal(node.__vividMusePromptHistory.length, 0);

// A queued task can start after switching workflows, reusing exactly the same ID/settings.
await queue("late-previous-workflow");
node.onConfigure({});
event("execution_start", {prompt_id: "late-previous-workflow"});
event("executed", {prompt_id: "late-previous-workflow", node: "1",
  output: {vividmuse_prompt_diagnostics: [data(node, 10, "另一个工作流的结果")]}});
assert.equal(node.__vividMusePromptHistory.length, 0, "Late-start result must not belong to the reconfigured node");

let lang = "en";
sandbox.__vividMuseZImageI18n = {activeLanguage: () => lang, translateMessage: s => s};
assert.equal(node.__vividMusePromptStatusButton.__vividMuseDynamicLabel("en"), "View Results");
assert.match(tools.details(node), /Run samples only fields set to Random/);
set(node, "发色", "不使用");
assert.match(tools.summary(node), /Random off/);
lang = "zh";
assert.match(tools.summary(node), /随机未启用/);

const txt = {comfyClass: "VividMuse_ZImageTxtPromptLibrary", widgets: []};
ext.nodeCreated(txt);
assert.equal(txt.widgets.length, 0);

const elements = [];
sandbox.document = {
  body: {append() {}}, createElement(tag) {
    const el = {tag, style: {}, attrs: {}, children: [], events: {},
      setAttribute(k,v) {this.attrs[k]=v;}, addEventListener(k,fn) {this.events[k]=fn;},
      append(...children) {this.children.push(...children);}, click() {this.onclick?.();},
      focus() {this.focused = true;}, select() {this.selectedText = this.value;},
      close() {this.onclose?.();}, remove() {this.removed = true;}, showModal() {this.opened = true;}};
    Object.defineProperty(el, "innerHTML", {set() {throw Error("No HTML writes");}});
    elements.push(el); return el;
  },
};
set(node, "发色", "随机抽取");
await submit("safe", 7, "<img src=x onerror=alert(1)>", node, "not_in_text");
node.__vividMusePromptStatusButton.callback();
assert.ok(elements.find(el => el.tag === "dialog").opened);
const pre = elements.find(el => el.attrs["aria-label"] === "中文结果正文");
assert.match(pre.textContent, /<img src=x onerror=alert\(1\)>/);
assert.equal(pre.innerHTML, undefined);
elements.find(el => el.tag === "button").onclick();
assert.ok(elements.find(el => el.tag === "dialog").removed);
assert.equal(node.__vividMusePromptDialog, null);
assert.equal(w(node, "自由提示词").value, "修改草稿");

// Selection, copy and JSON export must use the chosen execution, not editor values.
await submit("result-old", "18446744073709551615", "历史中文\n分段", node);
node.__vividMusePromptHistory.at(-1).data.framing={mode:"按景别适配",status:"applied",shot:"胸部以上",
  omitted:[{field:"鞋履",module:"服装",value:"球鞋",reason:"outside_frame"}]};
await submit("result-new", "12", "最新中文", node);
set(node, "随机种子", 9999); set(node, "自由提示词", "当前改动");
const serializedBefore = JSON.stringify(node.widgets.map(w=>w.value));
const historyBefore = JSON.stringify(node.__vividMusePromptHistory);
node.__vividMusePromptStatusButton.callback();
const resultDialog = node.__vividMusePromptDialog;
const all = root => [root,...root.children.flatMap(all)];
const labeled = label => all(resultDialog).find(el=>el.attrs["aria-label"]===label);
const action = label => all(resultDialog).find(el=>el.tag==="button" && el.textContent===label);
// Primary output precedes all advanced sections. Hidden controls remain reachable.
const primary = labeled("结果操作"), more = labeled("更多结果操作");
assert.deepEqual(primary.children.map(e=>e.tag), ["button", "button", "details"]);
assert.deepEqual(primary.children.slice(0,2).map(e=>e.textContent), ["复制中文", "复制英文"]);
assert.ok(!more.open);
assert.ok(all(more).includes(action("导出结果 JSON")));
assert.ok(all(more).includes(action("手动复制中文")));
assert.ok(all(more).includes(action("手动复制英文")));
for (const label of ["保存为卡片", "随机与组合说明", "字段与诊断详情"]) {
  const section = labeled(label);
  assert.ok(!section.open, `${label} starts collapsed`);
  assert.ok(resultDialog.children.indexOf(section) > resultDialog.children.indexOf(labeled("英文结果正文")));
}
assert.ok(all(labeled("随机与组合说明")).includes(labeled("当前配置摘要")));
assert.ok(all(labeled("随机与组合说明")).includes(labeled("本次抽取说明")));
assert.ok(resultDialog.children.indexOf(primary) < resultDialog.children.indexOf(labeled("中文结果正文")));
const select = labeled("选择执行记录");
select.value = "1"; select.onchange();
assert.equal(labeled("中文结果正文").textContent, "历史中文\n分段");
assert.equal(labeled("字段与诊断详情").open, undefined, "Verbose diagnostics start collapsed");
let copied;
sandbox.navigator = {clipboard:{async writeText(value){copied=value;}}};
await action("复制中文").onclick(); assert.equal(copied,"历史中文\n分段");
assert.match(all(resultDialog).find(el=>el.attrs.role==="status").textContent,/中文复制/);
await action("复制英文").onclick(); assert.equal(copied,"black hair");
assert.match(all(resultDialog).find(el=>el.attrs.role==="status").textContent,/英文复制/);
const manualText = labeled("手动复制正文");
assert.equal(manualText.readOnly, true);
more.open = true;
action("手动复制中文").onclick();
assert.equal(more.open, false);
assert.equal(manualText.value, "历史中文\n分段");
assert.equal(manualText.selectedText, manualText.value);
assert.equal(manualText.focused, true);
assert.match(all(resultDialog).find(el=>el.attrs.role==="status").textContent,/尚未复制/);
assert.equal(copied, "black hair", "Manual selection must not claim or perform an API copy");
action("手动复制英文").onclick(); assert.equal(manualText.selectedText, "black hair");
sandbox.navigator.clipboard.writeText = async()=>{throw Error("denied");};
await action("复制中文").onclick();
assert.match(all(resultDialog).find(el=>el.attrs.role==="status").textContent,/复制失败/);
assert.equal(manualText.selectedText, "历史中文\n分段");
assert.equal(labeled("中文结果正文").textContent,"历史中文\n分段");
// An unavailable API takes the same usable manual path.
sandbox.navigator = {};
await action("复制英文").onclick(); assert.equal(manualText.selectedText, "black hair");
// Late failures must not replace a manual choice or a newly selected record.
let rejectCopy;
sandbox.navigator.clipboard = {writeText() {return new Promise((resolve,reject)=>{rejectCopy=reject;});}};
const lateCopy = action("复制英文").onclick();
action("手动复制中文").onclick(); rejectCopy(Error("late denial")); await lateCopy;
assert.equal(manualText.value, "历史中文\n分段");
assert.match(all(resultDialog).find(el=>el.attrs.role==="status").textContent,/尚未复制/);
const oldCopy = action("复制中文").onclick();
select.value = "0"; select.onchange(); rejectCopy(Error("record changed")); await oldCopy;
assert.equal(manualText.value, "");
assert.equal(all(resultDialog).find(el=>el.children.includes(manualText)).hidden, true);
assert.equal(all(resultDialog).find(el=>el.attrs.role==="status").textContent, "");
select.value = "1"; select.onchange();
let exportedBlob, revoked;
sandbox.Blob = Blob;
sandbox.URL = {createObjectURL(blob){exportedBlob=blob;return "blob:test";},revokeObjectURL(url){revoked=url;}};
more.open = true;
action("导出结果 JSON").onclick();
assert.equal(more.open, false);
const snapshot = JSON.parse(await exportedBlob.text());
assert.equal(snapshot.kind,"vividmuse-prompt-result"); assert.equal(snapshot.version,1);
assert.equal(snapshot.seed,"18446744073709551615"); assert.equal(snapshot.zh,"历史中文\n分段");
assert.equal(snapshot.en,"black hair"); assert.equal(snapshot.source.prompt_id,"result-old");
assert.deepEqual(snapshot.resolved,{发色:"黑色",鞋履:"不使用"});
assert.equal(snapshot.limitations.executable_workflow,false);
assert.equal(snapshot.limitations.includes_upstream_workflow,false);
assert.equal(snapshot.framing.omitted[0].field,"鞋履");
assert.match(labeled("字段与诊断详情").children.find(e=>e.tag==="pre").textContent,/按景别省略，原选择保留/);
while(timers.length) timers.shift()(); assert.equal(revoked,"blob:test");
assert.equal(JSON.stringify(node.widgets.map(w=>w.value)),serializedBefore);
assert.equal(JSON.stringify(node.__vividMusePromptHistory),historyBefore);
sandbox.URL.createObjectURL=()=>{throw Error("download unavailable");};
action("导出结果 JSON").onclick();
assert.match(all(resultDialog).find(el=>el.attrs.role==="status").textContent,/无法导出/);
// Later runs may evict history entries; an open panel must still show its snapshot.
for(let i=0;i<6;i++) await submit(`panel-open-${i}`,i,"later",node);
select.value="1";select.onchange();
assert.equal(labeled("中文结果正文").textContent,"历史中文\n分段");
sandbox.navigator.clipboard.writeText=async value=>{copied=value;};
await action("复制中文").onclick();assert.equal(copied,"历史中文\n分段");
for(const name of ["keyup","copy","cut","paste","wheel"]) {
  let stopped=false; resultDialog.events[name]({stopPropagation(){stopped=true;}}); assert.ok(stopped);
}
resultDialog.events.keydown({key:"Escape",isComposing:true,stopPropagation(){},preventDefault(){throw Error("IME interrupted");}});
assert.equal(resultDialog.removed,undefined);
resultDialog.events.keydown({key:"Escape",stopPropagation(){},preventDefault(){}});
assert.ok(resultDialog.removed);
lang="en";
await submit("english-panel-old", "42", "历史中文\n分段", node);
await submit("english-panel-new", "43", "新的中文结果", node);
node.__vividMusePromptStatusButton.callback();
assert.ok(all(node.__vividMusePromptDialog).find(el=>el.textContent==="Copy English"));
const englishPanel = node.__vividMusePromptDialog;
const englishAction = name => all(englishPanel).find(el=>el.tag==="button"&&el.textContent===name);
const englishSelect = all(englishPanel).find(el=>el.attrs["aria-label"]==="Select Execution Record");
const oldRecordIndex = [...node.__vividMusePromptHistory].reverse().findIndex(record=>record.promptId==="english-panel-old");
assert.ok(oldRecordIndex>=0);
englishSelect.value = String(oldRecordIndex); englishSelect.onchange();
await englishAction("Copy Chinese").onclick(); assert.equal(copied,"历史中文\n分段");
await englishAction("Copy English").onclick(); assert.equal(copied,"black hair");
const englishStatus = all(englishPanel).find(el=>el.attrs.role==="status");
assert.equal(englishStatus.textContent,"English copy request sent.");
while(timers.length) timers.shift()();
assert.equal(englishStatus.textContent, "", "Success message expires without reading clipboard");
const englishMore = all(englishPanel).find(el=>el.attrs["aria-label"]==="More Result Actions");
assert.ok(!englishMore.open);
englishMore.open = true; englishAction("Manual Copy Chinese").onclick();
assert.equal(all(englishPanel).find(el=>el.attrs["aria-label"]==="Manual Copy Text").value,"历史中文\n分段");
assert.equal(englishMore.open,false);
node.__vividMusePromptDialog.close(); lang="zh";
for (const [index,kind] of kinds.entries()) {
  const recordNode=make(kind,100+index);
  recordNode.__vividMusePromptStatusButton.callback();
  assert.ok(all(recordNode.__vividMusePromptDialog).some(el=>/暂无实际执行记录/.test(el.textContent)));
  assert.ok(!all(recordNode.__vividMusePromptDialog).some(el=>el.textContent==="导出结果 JSON"));
  assert.ok(!all(recordNode.__vividMusePromptDialog).find(el=>el.attrs["aria-label"]==="字段与诊断详情").open);
  recordNode.__vividMusePromptDialog.close();
  tools.acceptResult(recordNode,data(recordNode,"18446744073709551615",`${kind}正文`));
  recordNode.__vividMusePromptStatusButton.callback();
  assert.equal(all(recordNode.__vividMusePromptDialog).find(el=>el.attrs["aria-label"]==="中文结果正文").textContent,`${kind}正文`);
  const saveSection=all(recordNode.__vividMusePromptDialog).find(el=>el.attrs["aria-label"]==="保存为卡片");
  assert.equal(saveSection.hidden,kind==="CanvasModule");
  recordNode.__vividMusePromptDialog.close();nodes.delete(String(recordNode.id));
}

// Unknown/other-client executions never acquire ownership from execution_start.
event("execution_start", {prompt_id: "other-client"});
event("executed", {prompt_id: "other-client", node: "1", output: {vividmuse_prompt_diagnostics: [data(node, 0, "外部结果")]}});
assert.notEqual(node.__vividMusePromptHistory.at(-1).data.zh, "外部结果");

// Results may arrive before HTTP, even when execution_start was missed on reconnect.
const earlyPrompt = await sandbox.__app.graphToPrompt();
const beforeRequest = JSON.stringify(earlyPrompt);
const response = await sandbox.__api.queuePrompt(-1, earlyPrompt, {promptId: "early", response(number, prompt, options) {
  assert.equal(number, -1);
  assert.equal(prompt, earlyPrompt);
  assert.equal(options.promptId, "early");
  event("executed", {prompt_id: "early", node: "1", output: {vividmuse_prompt_diagnostics: [data(node, 8, "早于HTTP")]}});
  assert.notEqual(node.__vividMusePromptHistory.at(-1).data.zh, "早于HTTP");
  return {prompt_id: "early", number: 77};
}});
assert.equal(response.number, 77);
assert.equal(JSON.stringify(earlyPrompt), beforeRequest, "Observers must not change prompt/workflow JSON");
assert.equal(node.__vividMusePromptHistory.at(-1).data.zh, "早于HTTP");
assert.equal(tools.earlyResults.size, 0);

await queue("deleted-node");
node.__vividMusePromptStatusButton.callback();
const deletedDialog = node.__vividMusePromptDialog;
node.onRemoved();
assert.ok(deletedDialog.removed);
assert.equal(node.__vividMusePromptDialog, null);
const replacement = make("ChinesePromptBuilder", 1);
event("executed", {prompt_id: "deleted-node", node: "1", output: {vividmuse_prompt_diagnostics: [data(node, 9, "旧实例")]}});
assert.equal(replacement.__vividMusePromptHistory, undefined);

// Switching while serialization or the submission request is awaiting must be safe.
let releaseSerialization;
serializePrompt = prompt => new Promise(resolve => { releaseSerialization = () => resolve(prompt); });
const serializing = sandbox.__app.graphToPrompt();
replacement.onConfigure({});
releaseSerialization();
serializePrompt = prompt => prompt;
await sandbox.__api.queuePrompt(0, await serializing, {promptId: "serialize-switch"});
event("executed", {prompt_id: "serialize-switch", node: "1", output: {vividmuse_prompt_diagnostics: [data(replacement, 1, "序列化切图")]}});
assert.equal(replacement.__vividMusePromptHistory.length, 0);
const awaitingPrompt = await sandbox.__app.graphToPrompt();
let releaseResponse;
const awaitingResponse = sandbox.__api.queuePrompt(0, awaitingPrompt, {response() {
  return new Promise(resolve => { releaseResponse = resolve; });
}});
replacement.onConfigure({});
releaseResponse({prompt_id: "response-switch"});
await awaitingResponse;
event("executed", {prompt_id: "response-switch", node: "1", output: {vividmuse_prompt_diagnostics: [data(replacement, 1, "响应切图")]}});
assert.equal(replacement.__vividMusePromptHistory.length, 0);

for (const failure of ["execution_error", "execution_interrupted"]) {
  const id = `failed-${failure}`;
  await queue(id);
  event(failure, {prompt_id: id});
  event("executed", {prompt_id: id, node: "1", output: {vividmuse_prompt_diagnostics: [data(replacement, 1, "错误后迟到结果")]}});
  assert.equal(replacement.__vividMusePromptHistory.length, 0);
}
const rejection = new Error("submission rejected");
await assert.rejects(sandbox.__api.queuePrompt(0, await sandbox.__app.graphToPrompt(), {response() {
  event("executed", {prompt_id: "rejected", node: "1", output: {vividmuse_prompt_diagnostics: [data(replacement, 1, "拒绝结果")]}});
  throw rejection;
}}), error => error === rejection);
assert.equal(tools.earlyResults.size, 0);
await submit("recover", 11, "恢复后的结果", replacement);
assert.equal(replacement.__vividMusePromptHistory.at(-1).data.zh, "恢复后的结果");

// Connected widgets' dormant values do not describe submitted values or random state.
replacement.inputs = [{name: "发色", link: 42}, {name: "前置提示词", link: 43}];
set(replacement, "发色", "随机抽取");
assert.equal(tools.currentState(replacement).randomCount, 0);
assert.doesNotMatch(tools.summary(replacement), /设置已修改/);
assert.match(tools.details(replacement), /未核对上游修改/);
assert.match(tools.details(replacement), /连接输入（待执行确定）/);
replacement.inputs = [];
replacement.onConnectionsChange();
assert.match(tools.summary(replacement), /设置已修改/);

replacement.__vividMusePromptStatusButton.callback();
const configuredDialog = replacement.__vividMusePromptDialog;
replacement.onConfigure({});
assert.ok(configuredDialog.removed);
assert.equal(replacement.__vividMusePromptDialog, null);

// Native subgraph paths are kept distinct from root-local IDs.
const root = sandbox.__app.graph;
const inner = make("HairModule", 31);
nodes.delete("31");
const subgraph = {nodes: [inner], getNodeById(id) {return String(id) === "31" ? inner : null;}};
const container = {id: 20, subgraph};
nodes.set("20", container);
const subPrompt = await sandbox.__app.graphToPrompt();
subPrompt.output["20:31"] = {class_type: inner.comfyClass, inputs: {}};
await sandbox.__api.queuePrompt(0, subPrompt, {promptId: "nested"});
event("executed", {prompt_id: "nested", node: "expanded-backend-id", display_node: "20:31",
  output: {vividmuse_prompt_diagnostics: [data(inner, 1, "子图结果")]}});
assert.equal(inner.__vividMusePromptHistory.at(-1).data.zh, "子图结果");
assert.equal(inner.__vividMusePromptHistory.at(-1).executionNode, "20:31");
const innerCount = inner.__vividMusePromptHistory.length;
nodes.set("21", {id: 21, subgraph}); // Shared definition: one UI object, two execution instances.
const sharedPrompt = await sandbox.__app.graphToPrompt();
sharedPrompt.output["20:31"] = subPrompt.output["20:31"];
sharedPrompt.output["21:31"] = subPrompt.output["20:31"];
await sandbox.__api.queuePrompt(0, sharedPrompt, {promptId: "shared"});
event("executed", {prompt_id: "shared", display_node: "21:31", output: {vividmuse_prompt_diagnostics: [data(inner, 2, "共享定义")]}});
assert.equal(inner.__vividMusePromptHistory.length, innerCount, "Do not mix shared subgraph instances in one panel");
nodes.delete("20"); nodes.delete("21");
assert.equal(sandbox.__app.graph, root);

await queue("evicted");
for (let i = 0; i < 140; i++) {
  await queue(`bounded-${i}`);
  event("execution_interrupted", {prompt_id: `bounded-${i}`});
}
assert.equal(tools.submissions.size, 128);
assert.equal(tools.terminalIds.size, 128);
assert.equal(tools.earlyResults.size, 0);
event("executed", {prompt_id: "evicted", node: "1", output: {vividmuse_prompt_diagnostics: [data(replacement, 1, "淘汰结果")]}});
assert.equal(replacement.__vividMusePromptHistory.length, 0);

// Reopening/reloading creates a fresh extension and node, without any history.
const freshDefinitions = [];
const freshSandbox = {console, __app: {registerExtension(ext) {freshDefinitions.push(ext);}}, __api: {}};
vm.createContext(freshSandbox);
vm.runInContext(source, freshSandbox);
const freshNode = {comfyClass: "VividMuse_ZImageHairModule", widgets: [],
  addWidget(type, name, value, callback, options) {const w = {type, name, value, callback, options}; this.widgets.push(w); return w;},
  onExecuted(message) {this.originalExecution = message;}, setDirtyCanvas() {}};
freshDefinitions[0].nodeCreated(freshNode);
assert.equal(freshNode.__vividMusePromptHistory, undefined);
const fallbackMessage = {vividmuse_prompt_diagnostics: [data(replacement, 1, "无事件API回退")]};
freshNode.onExecuted(fallbackMessage);
assert.equal(freshNode.originalExecution, fallbackMessage);
assert.equal(freshNode.__vividMusePromptHistory.at(-1).data.zh, "无事件API回退");

console.log("PASS: diagnostics; 9 nodes, submit ownership, late starts, HTTP/WS races, reused IDs, failures, reconnect, input links, dialogs, nested paths, bounded records and fresh-session fallback.");
