import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';

// Real extension modules and real input schemas; DOM simulation, not browser QA.
const root=fileURLToPath(new URL('..',import.meta.url));
const schemas=JSON.parse(execFileSync(process.env.PYTHON||'python',['-B','-c',
  'import json,nodes,modular_nodes; print(json.dumps({k:c.INPUT_TYPES() for k,c in {**nodes.NODE_CLASS_MAPPINGS,**modular_nodes.NODE_CLASS_MAPPINGS}.items()}))'],
  {cwd:root,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}}));
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.style={};this.textContent='';this.value='';}
  set innerHTML(_){throw Error('HTML interpolation is forbidden');}
  append(...items){for(const item of items){this.children.push(item);item.parent=this;if(this.tag==='select'&&!this.value)this.value=item.value;}}
  replaceChildren(...items){this.children=[];this.value='';this.append(...items);}
  get options(){return this.children;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  async fire(k,e={}){if(this['on'+k])await this['on'+k](e);for(const fn of this.listeners[k]||[])await fn(e);}
  click(){return this.disabled?undefined:this.fire('click');}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  showModal(){this.open=true;}
  close(){this.open=false;return this.fire('close');}
  focus(){}
  querySelectorAll(query){assert.equal(query,'input:checked');return flatten(this).filter(e=>e.tag==='input'&&e.checked);}
}
const flatten=e=>[e,...e.children.flatMap(flatten)];
const allText=p=>flatten(p).map(e=>e.textContent).filter(Boolean).join('\n');
const button=(p,label)=>{const e=flatten(p).find(e=>e.tag==='button'&&e.textContent===label);assert.ok(e,label);return e;};
const control=(p,label)=>{const e=flatten(p).find(e=>e.attributes['aria-label']===label);assert.ok(e,label);return e;};
const summaries=p=>flatten(p).filter(e=>e.attributes['data-vividmuse-card-summary']==='true');
const extensions=[],registry=new Map(),storage=new Map();
let language='zh',confirmHook=null,confirmed=true,changes=0;
const app={registerExtension:e=>extensions.push(e),graph:{setDirtyCanvas(){},beforeChange(){changes++;},afterChange(){}}};
const ctx=vm.createContext({console,app,Blob,TextEncoder,crypto:webcrypto,setTimeout(){},clearTimeout(){},
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  document:{createElement:t=>new Element(t),createTextNode:s=>Object.assign(new Element('text'),{textContent:s}),body:new Element('body')},
  window:{confirm(){confirmHook?.();return confirmed;}}});
ctx.modules={};
function load(name){
  if(ctx.modules[name])return ctx.modules[name];
  const raw=fs.readFileSync(new URL(`../web/js/${name}.js`,import.meta.url),'utf8');
  const names=[...raw.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(m=>m[1]);
  const code=raw.replace('import { app } from "../../scripts/app.js";','')
    .replace(/import\s*\{([^}]+)\}\s*from\s*["']\.\/([\w_]+)\.js["'];/g,(_,names,file)=>{load(file);return `const {${names}}=globalThis.modules.${file};`;})
    .replaceAll('export async function ','async function ').replaceAll('export function ','function ').replaceAll('export const ','const ').replaceAll('export class ','class ');
  vm.runInContext(`(()=>{${code}\nglobalThis.modules.${name}={${names.join(',')}};})()`,ctx,{filename:name});
  return ctx.modules[name];
}
load('preset_sync');load('modular_nodes');
const cards=load('workflow_tools'),shoot=load('shoot_plan_core'),shootUI=load('shoot_plan_cards'),combo=load('card_combination_ui'),discovery=load('library_discovery');
const catalog=load('i18n_catalog').EN_CATALOG;
ctx.__vividMuseZImageI18n={activeLanguage:()=>language,localizeNode(){},translateMessage:s=>language==='en'?catalog.widgetLabels[s]||catalog.uiLabels[s]||catalog.moduleLabels[s]||s:s};
for(const [name,input] of Object.entries(schemas)){
  const Type=class{};registry.set(name,Type);for(const ext of extensions)ext.beforeRegisterNodeDef?.(Type,{name,input});
}
async function make(suffix='ChinesePromptBuilder'){
  const type='VividMuse_ZImage'+suffix;
  const n=Object.assign(new (registry.get(type))(),{id:1,comfyClass:type,widgets:[],inputs:[],properties:{},size:[360,400],
    addWidget(type,name,value,callback,options={}){const w={type,name,value,callback,options};this.widgets.push(w);return w;},
    setDirtyCanvas(){},setSize(){},computeSize(){return [360,400];}});
  for(const [name,[kind,options={}]] of Object.entries({...schemas[type].required,...schemas[type].optional})){
    if(options.forceInput)continue;
    n.addWidget(Array.isArray(kind)?'combo':'text',name,options.default??(Array.isArray(kind)?kind[0]:kind==='STRING'?'':0),null,
      {...options,...(Array.isArray(kind)?{values:[...kind],getOptionLabel:v=>language==='en'?catalog.optionLabels[name]?.[v]||v:v}:{})});
  }
  for(const ext of extensions)await ext.nodeCreated?.(n);
  n.graph=app.graph;return n;
}
const state=n=>JSON.stringify({properties:n.properties,values:n.widgets.map(w=>[w.name,w.value]),storage:[...storage],changes});
const specs=[
  {entry:'content-card',zh:'导入卡片',en:'Import Card',open:n=>cards.openCardsPanel(n),data:(n,name)=>cards.captureCard(n,'人物',name)},
  {entry:'content-pack',zh:'导入卡片包',en:'Import Card Pack',open:n=>cards.openCardsPanel(n),data:(n,name)=>({kind:'vividmuse-content-card-pack',version:1,cards:[cards.captureCard(n,'人物',name)]})},
  {entry:'shoot-plan',zh:'导入卡片或卡片包',en:'Import Card or Pack',open:n=>shootUI.openShootPlanPanel(n),data:(n,name)=>shoot.captureShootPlan(n,['场景','摄影','视觉表现'],name)},
  {entry:'preset',zh:'导入预设',en:'Import',open:n=>{const menu=[];n.getExtraMenuOptions(null,menu);menu.find(x=>x.content===(language==='en'?'My Presets & Cards':'我的预设与卡片')).callback();return n.__vividMusePresetDialog;},data:(n,name)=>cards.capturePreset(n,name)},
  {entry:'favorites',zh:'导入收藏',en:'Import Favorites',open:n=>discovery.openDiscovery(n),data:(_n,name)=>({kind:'vividmuse-favorites',version:1,favorites:['b:fixture:'+name]})},
];
async function start(p,s){await button(p,language==='en'?s.en:s.zh).click();return flatten(p).filter(e=>e.type==='file').at(-1);}
async function feed(input,data){const raw=typeof data==='string'?data:JSON.stringify(data);input.files=[{size:new Blob([raw]).size,text:async()=>raw}];await input.fire('change');}
let groups=0;
for(language of ['zh','en'])for(const spec of specs){
  const n=await make(),p=await spec.open(n);
  const before=state(n);
  for(const other of specs.filter(s=>s.entry!==spec.entry)){
    await feed(await start(p,spec),other.data(n,'wrong-entry'));
    assert.equal(state(n),before,`${spec.entry} misroute writes`);
    assert.match(allText(p),language==='en'?/full builder.*still validates/:/完整节点.*仍会校验/);
  }
  for(const value of ['', '{broken', {kind:'unknown',version:1}, {kind:'vividmuse-prompt-result',version:1},
    {...spec.data(n,'wrong-version'),version:9}, spec.entry==='preset'?{version:1,type:n.comfyClass,name:'bad',values:{bad:'x'}}:{kind:spec.data(n,'x').kind,version:1}]){
    await feed(await start(p,spec),value);assert.equal(state(n),before);
  }
  const cancel=await start(p,spec);cancel.files=[];await cancel.fire('change');assert.equal(state(n),before);
  let readCount=0;const oversized=await start(p,spec);oversized.files=[{size:1048577,text(){readCount++;throw Error('must not read');}}];await oversized.fire('change');
  assert.equal(readCount,0);assert.match(allText(p),/1 MiB/);assert.equal(state(n),before);
  // A newer operation wins even if the earlier read completes last.
  let finish;const old=await start(p,spec);old.files=[{size:1,text:()=>new Promise(resolve=>{finish=resolve;})}];
  const pending=old.fire('change');await feed(await start(p,spec),spec.data(n,'newer'));
  const newer=state(n),newerText=allText(p);finish(JSON.stringify(spec.data(n,'older')));await pending;
  assert.equal(state(n),newer);assert.equal(allText(p),newerText);
  assert.ok(!JSON.stringify(n.properties).includes('older'));
  await p.close();groups++;
}
language='zh';
for(const spec of specs)for(const boundary of ['close','close-event-pending','root','removed','configure']){
  const n=await make(),p=await spec.open(n),file=await start(p,spec);let finish;
  file.files=[{size:1,text:()=>new Promise(resolve=>{finish=resolve;})}];const pending=file.fire('change');
  const oldGraph=app.graph;
  if(boundary==='close')await p.close();
  if(boundary==='close-event-pending')p.open=false;
  if(boundary==='root')app.graph={};
  if(boundary==='removed')n.graph=null;
  if(boundary==='configure')n.__vividMuseCardsGeneration=(n.__vividMuseCardsGeneration||0)+1;
  const before=state(n);finish(JSON.stringify(spec.data(n,'late')));await pending;assert.equal(state(n),before,`${spec.entry}: ${boundary}`);
  app.graph=oldGraph;await p.close();groups++;
}
// TXT nodes do not register WorkflowTools' card generation hook.
for(const suffix of ['TxtPromptLibrary','TxtModuleLibrary']){
  const n=await make(suffix);
  n.__vividMusePromptDiscovery={entries:()=>[],fileName:()=>''};
  const spec=specs.find(s=>s.entry==='favorites'),p=await spec.open(n),file=await start(p,spec);let finish;
  file.files=[{size:1,text:()=>new Promise(resolve=>{finish=resolve;})}];const pending=file.fire('change');
  n.onConfigure({});assert.equal(p.open,false);
  const before=state(n);finish(JSON.stringify(spec.data(n,'late-txt')));await pending;assert.equal(state(n),before);groups++;
}
// Explicit replacement confirmation remains authoritative, even across a newer picker.
for(const spec of specs.filter(s=>['content-card','preset'].includes(s.entry))){
  const n=await make(),p=await spec.open(n),original=spec.data(n,'same');
  await feed(await start(p,spec),original);
  const replacement=JSON.parse(JSON.stringify(original));replacement.values['年龄阶段']='30–39岁';
  const before=state(n);confirmed=false;await feed(await start(p,spec),replacement);assert.equal(state(n),before);
  confirmed=true;confirmHook=()=>{button(p,spec.zh).click();};
  await feed(await start(p,spec),replacement);confirmHook=null;assert.equal(state(n),before);
  await feed(await start(p,spec),replacement);
  const store=spec.entry==='preset'?'vividMuseUserPresets':'vividMuseContentCards';
  assert.equal(n.properties[store][0].values['年龄阶段'],'30–39岁');
  await p.close();groups++;
}
// Summaries must remain independent from differences and keep state read-only.
for(language of ['zh','en']){
  const n=await make();
  for(const module of ['人物','发型','服装','姿态动作'])cards.saveCard(n,cards.captureCard(n,module,'Named card '+module));
  shoot.saveShootPlan(n,shoot.captureShootPlan(n,['场景','摄影','视觉表现'],'Named shoot'));
  let before=state(n),p=cards.openCardsPanel(n);
  assert.match(summaries(p)[0].textContent,language==='en'?/Card contents:/:/卡片内容/);assert.equal(state(n),before);
  const search=control(p,language==='en'?'Search card names':'搜索卡片名称');search.value='no-match';await search.fire('input');assert.equal(summaries(p)[0].textContent,'');
  await p.close();p=combo.openCardCombinationPanel(n);assert.equal(summaries(p).length,5);
  assert.ok(summaries(p).every(e=>/保持当前|Keep Current/.test(e.textContent)));
  const hair=control(p,language==='en'?'Hair Card':'发型卡');hair.value='0';await hair.fire('change');
  const hairText=summaries(p)[1].textContent;assert.match(hairText,/Named card 发型/);assert.equal(state(n),before);
  if(language==='en')assert.ok(!/[\u3400-\u9fff]/.test(hairText.replace('Named card 发型','')),'English summary uses actual catalog');
  const shootSelect=control(p,language==='en'?'Shoot Plan Card':'拍摄方案卡');shootSelect.value='0';await shootSelect.fire('change');
  const camera=control(p,language==='en'?'Apply Camera':'应用摄影');camera.checked=false;await camera.fire('change');
  assert.match(summaries(p)[4].textContent,language==='en'?/Camera.*Not applying/:/摄影.*本次不应用/);
  await button(p,language==='en'?'Refresh Card Lists':'刷新卡片列表').click();assert.ok(summaries(p).every(e=>/保持当前|Keep Current/.test(e.textContent)));assert.equal(state(n),before);
  await p.close();p=shootUI.openShootPlanPanel(n);assert.match(summaries(p)[0].textContent,/Named shoot/);
  assert.equal(state(n),before);await p.close();groups++;
}
console.log(`PASS ${groups} v0.16 usability UI groups: five entry routing, bilingual guidance, original validation, cancel/oversize/races, close/root/removal/configure, read-only summaries and catalog translation. DOM simulation only.`);

let managerGroups=0;
const caption=(zh,en)=>language==='en'?en:zh;
const openMenu=(n,label)=>{const entries=[];n.getExtraMenuOptions(null,entries);const entry=entries.find(e=>e.content===label);assert.ok(entry,label);return entry.callback();};
// Every supported node keeps the same widget count and business state on navigation.
for(language of ['zh','en'])for(const suffix of ['ChinesePromptBuilder','CanvasModule','PersonModule','HairModule','ClothingModule','PoseModule','SceneModule','CameraModule','VisualModule']){
  const n=await make(suffix),before=state(n),count=n.widgets.length,menu=[];n.getExtraMenuOptions(null,menu);
  assert.deepEqual(menu.slice(-2).map(e=>e.content),[caption('我的预设与卡片','My Presets & Cards'),caption('随机设置与检查','Random Settings & Checks')]);
  const p=openMenu(n,menu.at(-2).content), tabs=flatten(p).filter(e=>e.attributes.role==='tab');
  assert.equal(tabs.length,suffix==='ChinesePromptBuilder'?3:suffix==='CanvasModule'?1:2);
  assert.equal(control(p,caption('预设管理操作','Preset Management Actions')).open,undefined);
  for(const tab of tabs){await tab.click();assert.equal(n.__vividMuseLibraryDialog,p);assert.ok(p.open);
    assert.equal(flatten(p).filter(e=>e.tag==='dialog').length,1,'No nested native dialogs');
    assert.equal(tab.attributes['aria-selected'],'true');
    assert.equal(state(n),before);assert.equal(n.widgets.length,count);
    assert.ok(!flatten(p).some(e=>e.textContent===caption('锁定此模块','Lock Module')),'Locks have a separate entry');
  }
  await p.close();assert.equal(state(n),before);
  managerGroups++;
}

// Pending file reads cannot land in a different tab or card type.
language='zh';
for(const kind of ['preset','content','shoot']){
  const n=await make(),p=cards.openLibraryManager(n),before=state(n);
  let importLabel='导入预设',payload=cards.capturePreset(n,'late preset');
  if(kind!=='preset'){
    await button(p,'模块卡片').click();
    if(kind==='shoot'){const type=control(p,'卡片类型');type.value='shoot';await type.fire('change');
      importLabel='导入卡片或卡片包';payload=shoot.captureShootPlan(n,['场景'],'late shoot');
    }else{importLabel='导入卡片';payload=cards.captureCard(n,'人物','late card');}
  }
  await button(p,importLabel).click();const file=flatten(p).filter(e=>e.type==='file').at(-1);let finish;
  file.files=[{size:1,text:()=>new Promise(resolve=>{finish=resolve;})}];const pending=file.fire('change');
  if(kind==='content'){const type=control(p,'卡片类型');type.value='发型';await type.fire('change');}
  else await button(p,kind==='preset'?'模块卡片':'整套预设').click();
  const currentText=allText(p);finish(JSON.stringify(payload));await pending;
  assert.equal(state(n),before);assert.equal(allText(p),currentText);assert.ok(p.open);
  await p.close();managerGroups++;
}

for(const kind of ['preset','content','shoot']){
  const n=await make(),p=cards.openLibraryManager(n),before=state(n);
  if(kind!=='preset')await button(p,'模块卡片').click();
  if(kind==='shoot'){const type=control(p,'卡片类型');type.value='shoot';await type.fire('change');}
  const spec=specs.find(s=>s.entry===({preset:'preset',content:'content-card',shoot:'shoot-plan'}[kind]));
  const file=await start(p,spec);let finish;
  file.files=[{size:1,text:()=>new Promise(resolve=>{finish=resolve;})}];const pending=file.fire('change');
  p.open=false; // Native close() clears open before dispatching its queued close event.
  finish(JSON.stringify(spec.data(n,'closed host')));await pending;
  assert.equal(state(n),before);await p.fire('close');managerGroups++;
}

// All content types and shoot plans share one native dialog and retain stale-preview guards.
for(language of ['zh','en']){
  const n=await make();for(const module of ['人物','发型','服装','姿态动作'])cards.saveCard(n,cards.captureCard(n,module,'card '+module));
  shoot.saveShootPlan(n,shoot.captureShootPlan(n,['场景','摄影','视觉表现'],'plan'));
  const before=state(n),p=cards.openLibraryManager(n,'cards'),type=control(p,caption('卡片类型','Card Type'));
  assert.deepEqual(type.children.map(o=>o.value),['人物','发型','服装','姿态动作','shoot']);
  for(const value of type.children.map(o=>o.value)){
    type.value=value;await type.fire('change');assert.equal(n.__vividMuseLibraryDialog,p);
    const label=value==='shoot'?caption('拍摄方案管理操作','Shoot Plan Management Actions'):caption('卡片管理操作','Card Management Actions');
    assert.ok(!control(p,label).open);assert.equal(state(n),before);
  }
  await button(p,caption('组合应用','Apply Combination')).click();
  const select=control(p,caption('人物卡','Person Card'));select.value='0';await select.fire('change');
  await button(p,caption('预览组合','Preview Combination')).click();
  const obsolete=button(p,caption('确认应用','Confirm Apply'));
  await button(p,caption('整套预设','Whole Presets')).click();await obsolete.click();assert.equal(state(n),before);
  await button(p,caption('组合应用','Apply Combination')).click();
  assert.equal(control(p,caption('人物卡','Person Card')).value,'');
  assert.ok(button(p,caption('确认应用','Confirm Apply')).disabled);
  await button(p,caption('返回卡片管理','Back to Cards')).click();assert.equal(n.__vividMuseLibraryDialog,p);assert.equal(state(n),before);
  await p.close();managerGroups++;
}

// Partial module locks, field drafts, explicit saving, and TXT/link protection.
for(language of ['zh','en']){
  const n=await make();n.properties.vividMuseRandomLocks=['年龄阶段'];
  const before=state(n),p=openMenu(n,caption('随机设置与检查','Random Settings & Checks'));
  assert.match(control(p,caption('模块锁定摘要','Module Lock Summary')).textContent,language==='en'?/Person: Partially locked \(1\/20\)/:/人物: 部分锁定 \(1\/20\)/);
  const fieldArea=control(p,caption('字段级锁定','Field Locks'));assert.ok(!fieldArea.open);
  assert.ok(!flatten(p).some(e=>e.textContent===caption('保存当前状态','Save Current')));
  const checkbox=flatten(fieldArea).find(e=>e.tag==='input'&&e.value==='年龄阶段');checkbox.checked=false;
  assert.equal(state(n),before);await button(p,caption('保存锁定','Save Locks')).click();
  assert.deepEqual([...n.properties.vividMuseRandomLocks],[]);
  const target=control(p,caption('锁定模块','Lock Module'));target.value='人物';
  await button(p,caption('锁定此模块','Lock Module')).click();assert.equal(n.properties.vividMuseRandomLocks.length,20);
  assert.match(control(p,caption('模块锁定摘要','Module Lock Summary')).textContent,language==='en'?/Fully locked \(20\/20\)/:/全部锁定 \(20\/20\)/);
  const fieldValues=JSON.stringify(n.widgets.map(w=>w.value));
  await button(p,caption('解锁此模块','Unlock Module')).click();assert.equal(JSON.stringify(n.widgets.map(w=>w.value)),fieldValues);
  n.widgets.find(w=>w.name==='用户人物片段').value='replacement';let blocked=state(n);
  await button(p,caption('锁定此模块','Lock Module')).click();assert.equal(state(n),blocked);
  n.widgets.find(w=>w.name==='用户人物片段').value='';n.inputs=[{name:'年龄阶段',link:1}];blocked=state(n);
  await button(p,caption('锁定此模块','Lock Module')).click();assert.equal(state(n),blocked);
  await button(p,caption('检查当前组合','Check Combination')).click();assert.equal(state(n),blocked);
  await p.close();managerGroups++;
}

// Tab keyboard navigation, IME isolation, and disposal on configure/remove.
language='zh';
for(const suffix of ['ChinesePromptBuilder','PersonModule']){
  const n=await make(suffix),p=cards.openLibraryManager(n,'cards');
  const initialValues=JSON.stringify(n.widgets.map(w=>w.value));
  control(p,'卡片名称').value='new card';await button(p,'保存当前模块').click();
  assert.equal(n.properties.vividMuseContentCards.length,1);assert.equal(JSON.stringify(n.widgets.map(w=>w.value)),initialValues);
  const entry=n.properties.vividMuseContentCards[0],other=JSON.stringify(n.widgets.filter(w=>!Object.hasOwn(entry.values,w.name)).map(w=>[w.name,w.value]));
  await button(p,'应用卡片').click();
  for(const [key,value] of Object.entries(entry.values))assert.equal(n.widgets.find(w=>w.name===key).value,value);
  assert.equal(JSON.stringify(n.widgets.filter(w=>!Object.hasOwn(entry.values,w.name)).map(w=>[w.name,w.value])),other);
  const fieldValues=JSON.stringify(n.widgets.map(w=>w.value));
  control(p,'卡片管理操作').open=true;
  control(p,'卡片名称').value='renamed';await button(p,'重命名').click();assert.equal(n.properties.vividMuseContentCards[0].name,'renamed');
  const beforeDelete=state(n);confirmed=false;await button(p,'删除卡片').click();assert.equal(state(n),beforeDelete);
  confirmed=true;await button(p,'删除卡片').click();assert.equal(n.properties.vividMuseContentCards.length,0);
  assert.equal(JSON.stringify(n.widgets.map(w=>w.value)),fieldValues);
  await p.close();managerGroups++;
}

for(const boundary of ['configure','removed']){
  const n=await make(),p=cards.openLibraryManager(n),before=state(n),tab=button(p,'整套预设');
  await p.fire('compositionstart');await button(p,'模块卡片').click();assert.equal(tab.attributes['aria-selected'],'true');
  let prevented=0;await p.fire('keydown',{key:'Escape',stopPropagation(){},preventDefault(){prevented++;}});assert.ok(p.open);assert.equal(prevented,0);
  await p.fire('compositionend');await tab.fire('keydown',{key:'ArrowRight',stopPropagation(){},preventDefault(){prevented++;}});
  assert.equal(button(p,'模块卡片').attributes['aria-selected'],'true');assert.equal(state(n),before);
  if(boundary==='configure')n.onConfigure({});else n.onRemoved();
  assert.equal(p.open,false);assert.equal(n.__vividMuseLibraryDialog,null);
  const after=state(n);await button(p,'模块卡片').click();assert.equal(state(n),after);
  managerGroups++;
}
console.log(`PASS ${managerGroups} unified-management groups: nine node scopes in both languages, one-dialog navigation, pending-import cancellation, stale previews, scoped locks and IME/lifecycle protection. DOM simulation only.`);
