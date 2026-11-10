import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = file => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
const schema = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c",
  "import json,nodes; print(json.dumps(nodes.ZImageChinesePromptBuilder.INPUT_TYPES()))"], {cwd: root, encoding:"utf8"}));
// Frozen against v0.19.0, so committing this change cannot move the baseline.
// Keep this runnable in a source ZIP or clean copy without Git metadata.
const randomBaseline = JSON.parse(read("tests/fixtures/random_preparation_v019.json"));
assert.equal(randomBaseline.baseline_commit, "90108ae414731b1c4f4d24e7d1df9ae047471ef1");
assert.equal(randomBaseline.cases.length, 3);
class Element {
  children = []; listeners = {}; style = {}; open = false; value = "";
  constructor(tag) { this.tagName = tag; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  addEventListener(event, callback) { (this.listeners[event] ??= []).push(callback); }
  fire(event, info = {}) { for (const callback of this.listeners[event] || []) callback(info); }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire("close"); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  focus() {}
  setAttribute(name, value) { this[name] = value; }
}
function setup(language, reverse = false, source = null) {
  const extensions = [], scheduled = [], confirmations = [];
  const app = {graph:{setDirtyCanvas(){}}, registerExtension(e){extensions.push(e);},
    ui:{settings:{getSettingValue(_id, fallback){return fallback;}}}};
  const context = vm.createContext({console, app, document:{body:new Element("body"),createElement:t=>new Element(t)},
    setTimeout:fn=>scheduled.push(fn), clearTimeout(){}, confirm:message=>{confirmations.push(message);return false;}});
  const evaluate = source => vm.runInContext(`(()=>{${source}\n})()`, context);
  const load = file => evaluate((source && file === "preset_sync" ? source : read(`web/js/${file}.js`))
    .replace('import { app } from "../../scripts/app.js";', "const app=globalThis.app;")
    + (file === "preset_sync" ? "\nglobalThis.actions={FIELD_NAMES,MODULE_FIELD_GROUPS,prepareRandomCombination};" : ""));
  evaluate(read("web/js/i18n_catalog.js").replace("export const EN_CATALOG =", "globalThis.catalog ="));
  evaluate(read("web/js/i18n.js").replace('import { app } from "../../scripts/app.js";', "const app=globalThis.app;")
    .replace('import { EN_CATALOG } from "./i18n_catalog.js";', "const EN_CATALOG=globalThis.catalog;"));
  const localize = context.__vividMuseZImageI18n.localizeNode;
  context.__vividMuseZImageI18n.activeLanguage = () => language;
  // The production translator uses its internal language state; this narrow
  // translator only chooses catalog labels for the confirmation's module name.
  context.__vividMuseZImageI18n.translateMessage = value => language === "en" ? context.catalog.moduleLabels[value] || value : value;
  for (const file of reverse ? ["txt_module_library","txt_library","preset_sync"] : ["preset_sync","txt_library","txt_module_library"]) load(file);
  const widgets = Object.entries({...schema.required,...schema.optional}).map(([name,[spec,options={} ]]) => ({
    name, options:{...options,...(Array.isArray(spec)?{values:[...spec]}:{})},
    value:options.default ?? (Array.isArray(spec)?spec[0]:spec === "STRING"?"":0),
    type:Array.isArray(spec)?"combo":spec === "STRING"?"text":"number", computeSize(){return [400,24];},
  }));
  const node={comfyClass:"VividMuse_ZImageChinesePromptBuilder",widgets,properties:{},graph:app.graph,size:[400,600],
    addWidget(type,name,value,callback,options){const w={type,name,value,callback,options,computeSize(){return [400,24];}};this.widgets.push(w);return w;},
    computeSize(){return [400,600];},setSize(size){this.size=size;},setDirtyCanvas(){}};
  for (const extension of extensions.filter(e=>!e.name.endsWith("I18n"))) extension.nodeCreated?.(node);
  while(scheduled.length) scheduled.shift()();
  return {node,context,app,confirmations,localize,find:name=>node.widgets.find(w=>w.name===name)};
}
const snapshot = node => JSON.stringify({values:node.widgets.filter(w=>w.serialize!==false).map(w=>[w.name,w.value]),properties:node.properties});
const bodyText = element => [element.textContent||"",...element.children.map(bodyText)].join(" ");
let cases=0;
for (const language of ["zh","en"]) for (const reverse of [false,true]) {
  const {node,context,app,confirmations,find} = setup(language,reverse);
  const namesBefore = node.widgets.filter(w=>w.serialize!==false).map(w=>w.name);
  assert(!find("清空结构化模块") && !find("全部清空"));
  assert(find("清空内容…"));
  assert.equal(find("🎲 生成随机组合").__vividMuseDisplayText,"🎲 设置随机组合");
  assert.equal(find("清除模块词库").__vividMuseDisplayText,"移除 TXT 模块词库");
  assert.equal(find("清除已导入词库").__vividMuseDisplayText,"移除 TXT 用户词库");
  const fill=()=>{
    for (const name of context.actions.FIELD_NAMES) find(name).value="跟随预设";
    find("自由提示词").value="保留的自由文字";
    for (const w of node.widgets.filter(w=>/^用户.+片段$/u.test(w.name))) w.value="已应用文本";
    node.properties.vividMuseTxtPromptLibrary={version:1,fileName:"demo.txt",entries:[{title:"A",prompt:"自定义"}]};
    node.properties.vividMuseTxtModuleLibrary={version:1,fileName:"modules.txt",entries:[{module:"人物",title:"P",prompt:"人物文本"}]};
    node.properties.vividMuseRandomLocks=["年龄阶段"];
  };
  fill();
  const retained=()=>JSON.stringify({seed:find("随机种子").value,locks:node.properties.vividMuseRandomLocks,
    libraries:[node.properties.vividMuseTxtPromptLibrary,node.properties.vividMuseTxtModuleLibrary],
    resolution:node.widgets.filter(w=>["分辨率模式","目标总像素","尺寸对齐倍数","目标总像素（万）"].includes(w.name)).map(w=>w.value)});
  const before=snapshot(node), kept=retained();
  find("清空内容…").callback();
  let dialog=node.__vividMuseClearDialog;
  assert.match(bodyText(dialog), language==="en"?/Keep Free Prompt/:/保留自由提示词/);
  assert.equal(snapshot(node),before);
  dialog.children.at(-2).onclick();
  assert.equal(snapshot(node),before);
  find("清空内容…").callback();
  node.__vividMuseClearDialog.children.at(-1).onclick();
  assert(context.actions.FIELD_NAMES.every(name=>find(name).value==="不使用"));
  assert(node.widgets.filter(w=>/^用户.+片段$/u.test(w.name)).every(w=>w.value===""));
  assert.equal(find("自由提示词").value,"保留的自由文字");
  assert.equal(retained(),kept);
  fill();
  find("清空内容…").callback();
  dialog=node.__vividMuseClearDialog;
  const select=dialog.children[1].children[0]; select.value="all";select.fire("change");
  dialog.children.at(-1).onclick();
  assert.equal(find("自由提示词").value,"");
  assert.equal(retained(),kept);
  assert.deepEqual(node.widgets.filter(w=>w.serialize!==false).map(w=>w.name),namesBefore);
  cases+=3;

  fill();
  assert.notEqual(find("清空自由提示词").hidden,true);
  assert.equal(node.widgets.indexOf(find("清空自由提示词")),node.widgets.indexOf(find("自由提示词"))+1);
  find("清空自由提示词").callback();
  assert.equal(find("自由提示词").value,"");
  assert.equal(find("用户人物片段").value,"已应用文本");
  assert.equal(retained(),kept);
  fill();find("清除已导入词库").callback();
  assert.equal(find("自由提示词").value,"保留的自由文字");
  assert(!node.properties.vividMuseTxtPromptLibrary?.entries?.length);
  fill();find("清除模块词库").callback();
  assert.equal(find("用户人物片段").value,"已应用文本");
  assert(!node.properties.vividMuseTxtModuleLibrary?.entries?.length);
  cases+=3;
  fill();
  node.__vividMuseTxtModuleModuleWidget.value="人物";
  find("清空当前用户模块").callback();
  assert.equal(find("用户人物片段").value,"");
  assert.equal(find("用户服装片段").value,"已应用文本");
  assert.equal(find("年龄阶段").value,"跟随预设");
  assert.equal(retained(),kept); cases++;

  fill();node.__vividMuseModuleWidget.value="人物";
  const onlyBefore=snapshot(node);
  find("仅启用当前模块").callback();
  assert.equal(snapshot(node),onlyBefore);
  assert.match(confirmations.at(-1),language==="en"?/Keep only Person/:/仅保留“人物”/);
  context.confirm=()=>true;
  find("仅启用当前模块").callback();
  assert(context.actions.MODULE_FIELD_GROUPS["人物"].every(name=>find(name).value==="跟随预设"));
  assert(context.actions.FIELD_NAMES.filter(n=>!context.actions.MODULE_FIELD_GROUPS["人物"].includes(n)).every(n=>find(n).value==="不使用"));
  assert.equal(find("用户人物片段").value,"已应用文本");
  assert.equal(find("用户自定义片段").value,"");
  assert.equal(find("自由提示词").value,"保留的自由文字");
  context.confirm=()=>{throw new Error("No confirmation when no other content exists");};
  find("仅启用当前模块").callback();
  find("🎲 生成随机组合").callback();
  assert.equal(find("年龄阶段").value,"跟随预设");
  assert.equal(find("基础姿态").value,"不使用");
  cases+=2;

  for (const invalidate of [()=>node.onConfigure({}),()=>node.onRemoved(),()=>{app.graph={};},()=>{node.graph={};},()=>{node.__vividMuseClearDialog.open=false;}]) {
    fill();find("清空内容…").callback();
    const oldDialog=node.__vividMuseClearDialog;
    invalidate();const untouched=snapshot(node);
    oldDialog.children.at(-1).onclick();
    assert.equal(snapshot(node),untouched);
  }
  fill();find("清空内容…").callback();dialog=node.__vividMuseClearDialog;
  dialog.fire("compositionstart");
  let cancelPrevented=false;
  dialog.fire("cancel",{preventDefault(){cancelPrevented=true;}});
  assert.equal(cancelPrevented,true);
  dialog.fire("keydown",{key:"Escape",isComposing:true,stopPropagation(){},preventDefault(){throw new Error("IME interrupted");}});
  assert.equal(dialog.open,true);
  dialog.fire("compositionend");
  dialog.fire("keydown",{key:"Escape",stopPropagation(){},preventDefault(){}});
  assert.equal(dialog.open,false);
  cases+=6;
}
// Same fixed random source, scopes, input values and locks: preparing fields is
// byte-for-byte identical to the pre-simplification implementation.
for(const baseline of randomBaseline.cases) {
  const current=setup("zh");
  vm.runInContext("Math.random=()=>0.125",current.context);
  current.find("随机范围").value=baseline.scope;
  current.node.properties.vividMuseRandomLocks=["年龄阶段","鞋履"];
  current.find("🎲 生成随机组合").callback();
  assert.deepEqual(JSON.parse(snapshot(current.node)),baseline.snapshot);cases++;
}
console.log(`clear actions: ${cases} bilingual/order/scope/cancel/lifecycle/compatibility groups passed`);
