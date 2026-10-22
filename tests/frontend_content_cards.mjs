import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c", `
import json, nodes as n, modular_nodes as m
classes = {**n.NODE_CLASS_MAPPINGS, **{k:c for k,c in m.NODE_CLASS_MAPPINGS.items() if issubclass(c,m.ZImageModuleNodeBase)}}
print(json.dumps({k:c.INPUT_TYPES() for k,c in classes.items()}))
`], {cwd:root, encoding:"utf8"}));
const extensions = [];
const app = {registerExtension(e) {extensions.push(e);}, graph:{setDirtyCanvas(){}}};
const context = vm.createContext({console, app, setTimeout(){}, clearTimeout(){}});
for (const file of ["preset_sync", "modular_nodes", "workflow_tools"]) {
  const source = fs.readFileSync(new URL(`../web/js/${file}.js`, import.meta.url), "utf8")
    .replace('import { app } from "../../scripts/app.js";', "").replaceAll("export function ", "function ");
  const extra = file === "workflow_tools" ? "globalThis.cards={captureCard,validateCard,saveCard,applyCard,setModuleLock,availableCardModules,openCardsPanel};"
    : file === "preset_sync" ? "globalThis.randomFull=prepareRandomCombination;" : "globalThis.randomModule=prepareModuleRandomCombination;";
  vm.runInContext(`(()=>{${source}\n${extra}})()`, context);
}
const api = context.cards;
const create = async key => {
  const node = {comfyClass:key, widgets:[], properties:{}, inputs:[], size:[360,400],
    addWidget(type,name,value,callback,options={}) {const w={type,name,value,callback,options}; this.widgets.push(w); return w;},
    setDirtyCanvas(){}, setSize(size){this.size=size;}, computeSize(){return [360,400];}};
  const schema = fixture[key];
  for (const [name, [kind, options={}]] of Object.entries({...schema.required,...schema.optional})) {
    if (options.forceInput) continue;
    node.addWidget(Array.isArray(kind) ? "combo" : "text", name,
      options.default ?? (Array.isArray(kind) ? kind[0] : kind === "STRING" ? "" : 0), undefined,
      {...options,...(Array.isArray(kind) ? {values:[...kind]} : {})});
  }
  for (const ext of extensions) await ext.nodeCreated?.(node);
  return node;
};
const w = (node,name) => node.widgets.find(w=>w.name===name);
const values = node => Object.fromEntries(node.widgets.filter(w=>w.serialize!==false).map(w=>[w.name,w.value]));
const json = value => JSON.parse(JSON.stringify(value));
const full = await create("VividMuse_ZImageChinesePromptBuilder");
const groups = context.__vividMuseZImagePromptData.MODULE_FIELD_GROUPS;
assert.equal(api.availableCardModules(full).length,8);
for (const [moduleName, key, count] of [["人物","VividMuse_ZImagePersonModule",20],["服装","VividMuse_ZImageClothingModule",21]]) {
  const standalone = await create(key);
  const beforeCapture = JSON.stringify(values(full));
  const card = api.captureCard(full,moduleName,"  reusable  ");
  assert.equal(card.name,"reusable"); assert.equal(Object.keys(card.values).length,count);
  assert.equal(JSON.stringify(values(full)),beforeCapture,"Capture must not mutate selections");
  assert.ok(!Object.values(card.values).includes("跟随预设"));
  assert.ok(!Object.values(card.values).includes("随机抽取"));
  api.saveCard(full,card);
  card.values[groups[moduleName][0]] = "bad";
  const stored = json(full.properties.vividMuseContentCards.find(c=>c.module===moduleName));
  assert.notEqual(stored.values[groups[moduleName][0]],"bad","Saved card is an independent snapshot");
  assert.throws(()=>api.saveCard(full,stored));
  api.saveCard(full,stored,true);
  assert.equal(full.properties.vividMuseContentCards.filter(c=>c.module===moduleName).length,1);
  api.applyCard(standalone,stored,true);
  assert.deepEqual(json(Object.fromEntries(groups[moduleName].map(n=>[n,w(standalone,n).value]))), stored.values);
  context.randomModule(standalone);
  assert.deepEqual(json(Object.fromEntries(groups[moduleName].map(n=>[n,w(standalone,n).value]))), stored.values);
  const back = api.captureCard(standalone,moduleName,"from module");
  w(full,"自由提示词").value="keep free text";
  full.properties.vividMuseActiveModule="场景";
  full.__vividMusePromptHistory=[{data:{seed:"42"}}];
  const beforeApply=values(full), history=full.__vividMusePromptHistory;
  api.applyCard(full,back,true);
  for(const [name,value] of Object.entries(beforeApply)) if(!groups[moduleName].includes(name)) assert.equal(w(full,name).value,value,name);
  assert.equal(full.properties.vividMuseActiveModule,"场景");
  assert.equal(full.__vividMusePromptHistory,history,"Scoped refresh must not clear execution history");
  const locks=json(full.properties.vividMuseRandomLocks);
  const field=groups[moduleName][0];
  const snapshot=()=>JSON.stringify({values:values(full),properties:full.properties});
  for(const bad of [null, {...stored,version:2}, {...stored,kind:"other"}, {...stored,module:"发型"},
    {...stored,name:" "}, {...stored,name:"x".repeat(81)}, {...stored,values:{}},
    {...stored,values:{...stored.values,unknown:"a"}}, {...stored,extra:"ignored?"},
    ...["随机抽取","跟随预设","invalid",null,{}].map(value=>({...stored,values:{...stored.values,[field]:value}}))]) {
    const before=snapshot(); assert.throws(()=>api.applyCard(full,bad,true)); assert.equal(snapshot(),before);
  }
  for(const inputName of [field,`用户${moduleName}片段`]) {
    full.inputs=[{name:inputName,link:7}];
    const before=snapshot();
    assert.throws(()=>api.captureCard(full,moduleName,"linked"));
    assert.throws(()=>api.applyCard(full,stored));
    assert.throws(()=>api.setModuleLock(full,moduleName,true));
    assert.equal(snapshot(),before); full.inputs=[];
  }
  const replacement=w(full,`用户${moduleName}片段`);
  assert.ok(replacement);
  replacement.value="user replacement";
  assert.throws(()=>api.applyCard(full,stored));
  assert.throws(()=>api.captureCard(full,moduleName,"replaced"));
  api.setModuleLock(full,moduleName,false); // Unlocking is always allowed.
  assert.ok(!full.properties.vividMuseRandomLocks.some(n=>groups[moduleName].includes(n)));
  replacement.value="";
  w(full,field).value="随机抽取";
  const before=snapshot(); assert.throws(()=>api.captureCard(full,moduleName,"random"));
  assert.throws(()=>api.setModuleLock(full,moduleName,true)); assert.equal(snapshot(),before);
  api.applyCard(full,stored,true);
  assert.deepEqual(json(full.properties.vividMuseRandomLocks).sort(),locks.sort());
}
// Whole-module locks survive the full builder's all-fields random button.
w(full,"随机范围").value="跨风格混搭（全部字段）";
const lockedValues=Object.fromEntries([...groups["人物"],...groups["服装"]].map(n=>[n,w(full,n).value]));
context.randomFull(full);
for(const [name,value] of Object.entries(lockedValues)) assert.equal(w(full,name).value,value,name);
assert.equal(w(full,"自由提示词").value,"keep free text");
assert.equal(w(full,"基础姿态").value,"随机抽取");
assert.equal(w(full,"发型造型").value,"随机抽取","Hair is intentionally independent");
api.setModuleLock(full,"人物",false);
assert.ok(groups["服装"].every(n=>full.properties.vividMuseRandomLocks.includes(n)));
assert.ok(groups["人物"].every(n=>!full.properties.vividMuseRandomLocks.includes(n)));
// Independent non-card modules can lock their own module but cannot import cards.
const pose=await create("VividMuse_ZImagePoseModule");
assert.deepEqual(Array.from(api.availableCardModules(pose)),["姿态动作"]);
api.setModuleLock(pose,"姿态动作",true);
assert.equal(pose.properties.vividMuseRandomLocks.length,10);
assert.throws(()=>api.applyCard(pose,full.properties.vividMuseContentCards[0]));
// Saved workflow properties retain cards/locks without any backend input changes.
const restored=json(full.properties);
assert.equal(restored.vividMuseContentCards.length,2);
assert.deepEqual(restored.vividMuseRandomLocks,json(full.properties.vividMuseRandomLocks));
const personCard=restored.vividMuseContentCards.find(c=>c.module==="人物");
api.validateCard(personCard,full);
const nonMatching=Object.entries(context.__vividMuseZImagePromptData.ETHNICITY_BRANCHES_BY_CATEGORY)
  .find(([name,branches])=>name!==personCard.values["族裔大类"] && branches.length &&
    !context.__vividMuseZImagePromptData.ETHNICITY_BRANCHES_BY_CATEGORY[personCard.values["族裔大类"]]?.includes(branches[0]));
if(nonMatching) assert.throws(()=>api.validateCard({...personCard,values:{...personCard.values,"地域族裔分支":nonMatching[1][0]}},full));
const presetNode=await create("VividMuse_ZImageChinesePromptBuilder");
for(const presetName of Object.keys(context.__vividMuseZImagePromptData.PRESETS)) {
  w(presetNode,"预设").value=presetName;
  for(const moduleName of ["人物","服装"]) api.captureCard(presetNode,moduleName,presetName);
}
const capped=await create("VividMuse_ZImagePersonModule");
for(let i=0;i<100;i++) api.saveCard(capped,{...personCard,name:`card ${i}`});
const cappedBefore=JSON.stringify(capped.properties);
assert.throws(()=>api.saveCard(capped,{...personCard,name:"overflow"}));
assert.equal(JSON.stringify(capped.properties),cappedBefore);
api.saveCard(capped,{...personCard,name:"card 0"},true);
assert.equal(capped.properties.vividMuseContentCards.length,100);
// Verify real Python execution, not just widget state, with three seeds.
const execution = execFileSync(process.env.PYTHON || "python", ["-c", `
import json, sys, nodes as n, modular_nodes as m
cards = json.load(sys.stdin)
locked = {k:v for c in cards for k,v in c['values'].items()}
for seed in (0,42,987654321):
    requested = dict.fromkeys(n.FIELD_ORDER, n.RANDOM_CHOICE)
    requested.update(locked)
    resolved = n.resolve_fields(next(iter(n.PRESETS)), n.RANDOM_SCOPES[2], seed, requested)
    assert all(resolved[k] == v for k,v in locked.items())
for card in cards:
    key = 'VividMuse_ZImagePersonModule' if card['module']=='人物' else 'VividMuse_ZImageClothingModule'
    cls = m.NODE_CLASS_MAPPINGS[key]
    outputs = [cls().build_module(**{**card['values'], '随机种子':s}) for s in (0,42,987654321)]
    assert outputs[0] == outputs[1] == outputs[2]
print('Python: locked person/outfit fields and bilingual module text stable across three seeds')
`], {cwd:root,encoding:"utf8",input:JSON.stringify(restored.vividMuseContentCards)});
console.log(execution.trim());

// Lightweight DOM event regression: default scope, keyboard isolation and late imports.
class Element {
  constructor(tag) {this.tag=tag; this.children=[]; this.listeners={}; this.value=""; this.attributes={}; this.style={}; this.textContent="";}
  append(...items) {for(const item of items) {this.children.push(item); item.parent=this; if(this.tag==="select" && !this.value) this.value=item.value;}}
  replaceChildren(...items) {this.children=[]; this.value=""; this.append(...items);}
  get options() {return this.children;}
  setAttribute(k,v) {this.attributes[k]=v;}
  addEventListener(type,fn) {(this.listeners[type]??=[]).push(fn);}
  async fire(type,event={}) {for(const fn of this.listeners[type]||[]) await fn(event);}
  click() {return this.fire("click");}
  remove() {if(this.parent) this.parent.children=this.parent.children.filter(c=>c!==this);}
  showModal() {this.open=true;}
  close() {this.open=false; return this.fire("close");}
}
context.document={createElement:tag=>new Element(tag),body:new Element("body")};
context.window={confirm:()=>true};
const flatten=el=>[el,...el.children.flatMap(flatten)];
const panelNode=await create("VividMuse_ZImageChinesePromptBuilder");
panelNode.properties.vividMuseActiveModule="画面基础";
let panel=api.openCardsPanel(panelNode);
assert.equal(flatten(panel).find(e=>e.attributes["aria-label"]==="卡片与锁定模块").value,"人物");
await panel.fire("compositionstart");
let stopped=false, prevented=false;
const escape={key:"Escape",stopPropagation(){stopped=true;},preventDefault(){prevented=true;}};
await panel.fire("keydown",escape);
assert.ok(stopped && prevented && panel.open,"IME Escape must not close or reach canvas");
await panel.fire("cancel",{preventDefault(){prevented=true;}});
assert.ok(panel.open);
await panel.fire("compositionend");
await panel.fire("keydown",escape); assert.equal(panel.open,false);
panel=api.openCardsPanel(panelNode);
await flatten(panel).find(e=>e.tag==="button"&&e.textContent==="导入卡片").click();
let fileInput=flatten(panel).find(e=>e.type==="file");
fileInput.files=[{size:1024*1024+1}]; await fileInput.fire("change");
assert.match(flatten(panel).find(e=>e.attributes.role==="status").textContent,/1 MB/);
assert.equal(panelNode.properties.vividMuseContentCards,undefined);
await flatten(panel).find(e=>e.tag==="button"&&e.textContent==="导入卡片").click();
fileInput=flatten(panel).find(e=>e.type==="file");
let resolveFile;
fileInput.files=[{size:100,text:()=>new Promise(resolve=>{resolveFile=resolve;})}];
const pending=fileInput.fire("change");
await panel.close(); resolveFile(JSON.stringify(personCard)); await pending;
assert.equal(panelNode.properties.vividMuseContentCards,undefined,"Closing prevents late asynchronous imports");
console.log("content cards panel: default scope, IME/Escape, import size and lifecycle guards passed");
console.log("content cards: actual schemas, scoped round trips, locks, source guards and atomic validation passed");
