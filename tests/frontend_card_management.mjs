import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemas = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', `
import json, nodes as n, modular_nodes as m
print(json.dumps({k:c.INPUT_TYPES() for k,c in {**n.NODE_CLASS_MAPPINGS, **m.NODE_CLASS_MAPPINGS}.items()}))
`], {cwd:root, encoding:'utf8'}));
const extensions = [], downloads = [];
const app = {registerExtension(e){extensions.push(e);}, graph:{setDirtyCanvas(){}}};
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.value='';this.attributes={};this.style={};this.textContent='';}
  append(...items){for(const item of items){this.children.push(item);item.parent=this;if(this.tag==='select'&&!this.value)this.value=item.value;}}
  replaceChildren(...items){this.children=[];this.value='';this.append(...items);}
  get options(){return this.children;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  async fire(type,event={}){for(const fn of this.listeners[type]||[])await fn(event);}
  click(){if(this.tag==='a')downloads.push({name:this.download,href:this.href});return this.disabled?undefined:this.fire('click');}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  showModal(){this.open=true;}
  close(){this.open=false;return this.fire('close');}
}
let confirmed=true, confirmHook=null, blob;
const ctx = vm.createContext({console, app, setTimeout(fn){fn();}, clearTimeout(){}, Blob,
  URL:{createObjectURL(b){blob=b;return 'blob:test';},revokeObjectURL(){}},
  document:{createElement:t=>new Element(t),body:new Element('body')},
  window:{confirm(){confirmHook?.();return confirmed;}}});
for(const file of ['preset_sync','modular_nodes','workflow_tools']){
  const code=fs.readFileSync(new URL(`../web/js/${file}.js`,import.meta.url),'utf8').replace('import { app } from "../../scripts/app.js";','').replaceAll('export function ','function ');
  vm.runInContext(`(()=>{${code}\n${file==='workflow_tools'?'globalThis.cards={captureCard,saveCard,applyCard,filterCards,renameCard,cardDifference,validateCardPack,planCardPack,commitCardPack,openCardsPanel};':''}})()`,ctx);
}
const api=ctx.cards, json=x=>JSON.parse(JSON.stringify(x));
for(const [name,input] of Object.entries(schemas))for(const ext of extensions)ext.beforeRegisterNodeDef?.(class {},{name,input});
const create=async(kind='ChinesePromptBuilder')=>{
  const key=`VividMuse_ZImage${kind}`, schema=schemas[key];
  const node={comfyClass:key,widgets:[],properties:{},inputs:[],size:[360,400],
    addWidget(type,name,value,callback,options={}){const w={type,name,value,callback,options};this.widgets.push(w);return w;},
    setDirtyCanvas(){},setSize(){},computeSize(){return [360,400];}};
  for(const [name,[kind,options={}]] of Object.entries({...schema.required,...schema.optional})){
    if(options.forceInput)continue;
    node.addWidget(Array.isArray(kind)?'combo':'text',name,options.default??(Array.isArray(kind)?kind[0]:kind==='STRING'?'':0),null,{...options,...(Array.isArray(kind)?{values:[...kind]}:{})});
  }
  for(const ext of extensions)await ext.nodeCreated?.(node);
  return node;
};
const w=(n,k)=>n.widgets.find(w=>w.name===k);
const snap=n=>JSON.stringify({properties:n.properties,values:n.widgets.map(w=>[w.name,w.value]),inputs:n.inputs});
const full=await create(), person=api.captureCard(full,'人物','窗边 Summer'), outfit=api.captureCard(full,'服装','窗边 Summer');
const b={...json(person),name:'人物 B',values:{...person.values,'年龄阶段':'30–39岁'}};
const pack=cards=>({kind:'vividmuse-content-card-pack',version:1,cards:json(cards)});
api.saveCard(full,person);api.saveCard(full,outfit);api.saveCard(full,b);
let before=snap(full);
assert.equal(api.filterCards(full,'人物','SUMMER').length,1);
assert.equal(api.filterCards(full,'人物','窗边').length,1);
assert.equal(api.filterCards(full,'人物','不存在').length,0);assert.equal(snap(full),before);
for(const name of ['',' ','x'.repeat(81),'😀'.repeat(41)]){assert.throws(()=>api.renameCard(full,person,name));assert.equal(snap(full),before);}
api.renameCard(full,person,'  窗边 Summer  ');assert.equal(snap(full),before);
assert.throws(()=>api.renameCard(full,person,b.name));assert.equal(snap(full),before);
api.renameCard(full,person,b.name,true);
assert.equal(full.properties.vividMuseContentCards.length,2);
assert.equal(full.properties.vividMuseContentCards.find(c=>c.module==='人物').values['年龄阶段'],'20–29岁');
assert.equal(full.properties.vividMuseContentCards.find(c=>c.module==='服装').name,person.name);
before=snap(full);assert.throws(()=>api.renameCard(full,b,'stale'));assert.equal(snap(full),before);
const renamed=full.properties.vividMuseContentCards.find(c=>c.module==='人物');
api.renameCard(full,renamed,'😀'.repeat(40));
// Difference reads markers, never resolves random, and includes hidden fields.
const diffNode=await create();w(diffNode,'年龄阶段').value='随机抽取';
before=snap(diffNode);let diff=api.cardDifference(diffNode,person);
assert.equal(diff.rows.length,20);assert.equal(diff.rows[0].current,'随机抽取');assert.equal(snap(diffNode),before);
api.applyCard(diffNode,person);diff=api.cardDifference(diffNode,person);assert.equal(diff.rows.filter(r=>r.changed).length,0);assert.equal(diff.newLocks.length,20);
diffNode.inputs=[{name:'年龄阶段',link:1}];assert.match(api.cardDifference(diffNode,person).blocked,/连接/);
before=snap(diffNode);assert.throws(()=>api.applyCard(diffNode,person));assert.equal(snap(diffNode),before);
diffNode.inputs=[{name:'鞋履',link:1}];assert.equal(api.cardDifference(diffNode,person).blocked,'');
diffNode.inputs=[];w(diffNode,'用户人物片段').value='TXT';assert.match(api.cardDifference(diffNode,person).blocked,/TXT/);
// Packs validate all cards, including cards inapplicable to standalone nodes.
const standalone=await create('PersonModule');
let plan=api.planCardPack(standalone,pack([person,outfit]));assert.equal(plan.added.length,1);assert.equal(plan.inapplicable.length,1);
api.commitCardPack(standalone,plan);assert.equal(standalone.properties.vividMuseContentCards.length,1);
before=snap(standalone);
for(const invalid of [pack([]),pack(Array.from({length:101},(_,i)=>({...person,name:String(i)}))),{...pack([person]),version:2},{...pack([person]),extra:1},pack([person,person]),pack([{...outfit,values:{...outfit.values,'上装颜色':'bad'}}]),pack([{...person,values:{}}]),pack([{...person,extra:1}]),JSON.parse(JSON.stringify(pack([person])).replace('"cards":','"__proto__":{},"cards":'))]){
  assert.throws(()=>api.planCardPack(standalone,invalid));assert.equal(snap(standalone),before);
}
plan=api.planCardPack(standalone,pack([person,b]));assert.equal(plan.skipped.length,1);assert.equal(plan.added.length,1);
api.saveCard(standalone,{...person,name:'concurrent'});before=snap(standalone);assert.throws(()=>api.commitCardPack(standalone,plan));assert.equal(snap(standalone),before);
const capped=await create();capped.properties.vividMuseContentCards=Array.from({length:98},(_,i)=>({...json(person),name:`card ${i}`}));
plan=api.planCardPack(capped,pack([person,b]));api.commitCardPack(capped,plan);assert.equal(capped.properties.vividMuseContentCards.length,100);
before=snap(capped);assert.throws(()=>api.planCardPack(capped,pack([{...person,name:'overflow'}])));assert.equal(snap(capped),before);
plan=api.planCardPack(capped,pack([{...b,name:person.name}]),'replace');api.commitCardPack(capped,plan);assert.equal(capped.properties.vividMuseContentCards.length,100);
assert.equal(capped.properties.vividMuseContentCards.find(c=>c.name===person.name).values['年龄阶段'],'30–39岁');
api.renameCard(capped,capped.properties.vividMuseContentCards[0],'renamed at capacity');assert.equal(capped.properties.vividMuseContentCards.length,100);
// UI exercises the real extension, not copied handlers.
const flatten=e=>[e,...e.children.flatMap(flatten)];
const button=(p,label)=>flatten(p).find(e=>e.tag==='button'&&e.textContent===label);
const input=(p,label)=>flatten(p).find(e=>e.attributes['aria-label']===label);
const status=p=>flatten(p).find(e=>e.attributes.role==='status').textContent;
const ui=await create();api.saveCard(ui,person);api.saveCard(ui,b);api.saveCard(ui,outfit);
let panel=api.openCardsPanel(ui);
input(panel,'搜索卡片名称').value='not found';await input(panel,'搜索卡片名称').fire('input');assert.ok(button(panel,'应用卡片').disabled);
input(panel,'搜索卡片名称').value='';await input(panel,'搜索卡片名称').fire('input');
input(panel,'卡片名称').value=b.name;confirmed=false;before=snap(ui);await button(panel,'重命名').click();assert.equal(snap(ui),before);
confirmed=true;await button(panel,'重命名').click();assert.equal(ui.properties.vividMuseContentCards.length,2);
await button(panel,'应用卡片').click();assert.equal(w(ui,'年龄阶段').value,'20–29岁');
w(ui,'年龄阶段').value='40–49岁';await button(panel,'应用卡片').click();assert.equal(w(ui,'年龄阶段').value,'40–49岁');assert.match(status(panel),/已变化/);
await button(panel,'应用卡片').click();assert.equal(w(ui,'年龄阶段').value,'20–29岁');
await button(panel,'应用并锁定').click();assert.equal(ui.properties.vividMuseRandomLocks.length,20);
// Search cannot narrow export silently; zero selected must not download.
input(panel,'搜索卡片名称').value='人物 B';await input(panel,'搜索卡片名称').fire('input');
await button(panel,'导出卡片包').click();let checks=flatten(panel).filter(e=>e.type==='checkbox');assert.equal(checks.length,2);
checks.forEach(c=>c.checked=false);await button(panel,'确认导出卡片包').click();assert.equal(downloads.length,0);
checks.forEach(c=>c.checked=true);await button(panel,'确认导出卡片包').click();assert.equal(downloads.length,1);
assert.equal(JSON.parse(await blob.text()).cards.length,2);
const importFile=async(p,file)=>{await button(p,'导入卡片包').click();const f=flatten(p).filter(e=>e.type==='file').at(-1);f.files=[file];await f.fire('change');};
before=snap(ui);await importFile(panel,{size:1048577,text(){throw Error('must not read');}});assert.equal(snap(ui),before);assert.match(status(panel),/1 MB/);
await importFile(panel,{size:2,text:async()=>'{!'});assert.equal(snap(ui),before);
await importFile(panel,{size:1048576,text:async()=>JSON.stringify(pack([person]))});await button(panel,'取消').click();assert.equal(snap(ui),before);
await importFile(panel,{size:100,text:async()=>JSON.stringify(pack([person]))});
api.saveCard(ui,{...person,name:'late'});before=snap(ui);await button(panel,'确认导入卡片包').click();assert.equal(snap(ui),before);assert.match(status(panel),/已变化/);
await button(panel,'确认导入卡片包').click();assert.ok(ui.properties.vividMuseContentCards.some(c=>c.name===person.name&&c.module==='人物'));
// Replacement cancel/confirm; changes only the library.
await importFile(panel,{size:100,text:async()=>JSON.stringify(pack([{...b,name:person.name}]))});
input(panel,'同名冲突处理').value='replace';await input(panel,'同名冲突处理').fire('change');
confirmed=false;before=snap(ui);await button(panel,'确认导入卡片包').click();assert.equal(snap(ui),before);
confirmed=true;await button(panel,'确认导入卡片包').click();assert.equal(w(ui,'年龄阶段').value,'20–29岁');
assert.equal(ui.properties.vividMuseContentCards.find(c=>c.module==='人物'&&c.name===person.name).values['年龄阶段'],'30–39岁');
// Realistic delayed reads: closing, root switching, replacing node, reconfigure.
for(const invalidate of [p=>p.close(),()=>{app.graph={};},()=>{ui.graph={getNodeById:()=>null};},()=>{ui.__vividMuseCardsGeneration=(ui.__vividMuseCardsGeneration||0)+1;}]){
  panel=api.openCardsPanel(ui);let finish;
  await button(panel,'导入卡片包').click();const f=flatten(panel).filter(e=>e.type==='file').at(-1);f.files=[{size:100,text:()=>new Promise(r=>finish=r)}];
  const pending=f.fire('change');before=snap(ui);await invalidate(panel);finish(JSON.stringify(pack([{...person,name:'must not save'}])));await pending;
  assert.equal(snap(ui),before);assert.ok(!button(panel,'确认导入卡片包'));await panel.close();ui.graph=undefined;
}
panel=api.openCardsPanel(ui);await panel.fire('compositionstart');let prevented=false;
await panel.fire('keydown',{key:'Escape',stopPropagation(){},preventDefault(){prevented=true;}});assert.ok(panel.open&&!prevented);
await panel.fire('compositionend');await panel.fire('keydown',{key:'Escape',stopPropagation(){},preventDefault(){}});assert.equal(panel.open,false);
// A complete 100-card pack and external references cannot mutate committed data.
const bulkNode=await create();
const bulk=pack(Array.from({length:100},(_,i)=>({...person,name:`Bulk ${i}`})));
const bulkPlan=api.planCardPack(bulkNode,bulk);
bulk.cards[0].values['年龄阶段']='30–39岁';
api.commitCardPack(bulkNode,bulkPlan);
bulkPlan.next[0].values['年龄阶段']='40–49岁';
assert.equal(bulkNode.properties.vividMuseContentCards[0].values['年龄阶段'],'20–29岁');
assert.equal(bulkNode.properties.vividMuseContentCards.length,100);
// Names are literal text, not markup; read failures leave no import transaction.
const literalNode=await create();const literal={...person,name:'<img src=x onerror=alert(1)>'};
api.saveCard(literalNode,literal);panel=api.openCardsPanel(literalNode);
assert.equal(input(panel,'已保存卡片').children[0].textContent,literal.name);
assert.equal(flatten(panel).filter(e=>e.tag==='img'||e.tag==='script').length,0);
before=snap(literalNode);
await importFile(panel,{size:100,text:async()=>{throw Error('read failed');}});
assert.equal(snap(literalNode),before);assert.match(status(panel),/read failed/);
assert.equal(flatten(panel).filter(e=>e.type==='file').length,0);
// A library mutation during a native confirmation cannot overwrite stale data.
api.saveCard(literalNode,b);await panel.close();panel=api.openCardsPanel(literalNode);
input(panel,'卡片名称').value=b.name;let atConfirmation;
confirmHook=()=>{api.saveCard(literalNode,{...person,name:'external edit'});atConfirmation=snap(literalNode);};
await button(panel,'重命名').click();confirmHook=null;
assert.equal(snap(literalNode),atConfirmation);assert.match(status(panel),/已变化/);
await panel.close();
console.log('PASS phase2: search, atomic rename, differences, mixed packs, strict validation, capacity, preview races, real-source UI transactions, download selection, lifecycle and IME guards.');
