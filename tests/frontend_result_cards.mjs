import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const fixture=JSON.parse(execFileSync(process.env.PYTHON||"python",["-c",`
import json, nodes as n, modular_nodes as m
classes={**n.NODE_CLASS_MAPPINGS, **{k:c for k,c in m.NODE_CLASS_MAPPINGS.items() if issubclass(c,m.ZImageModuleNodeBase)}}
def run(c,seed):
    return getattr(c(),c.FUNCTION)(unique_id='1', **{'预设':n.PRESET_OPTIONS[1], '随机种子':seed, **dict.fromkeys(n.FIELD_ORDER,n.RANDOM_CHOICE)})['ui']['vividmuse_prompt_diagnostics'][0]
print(json.dumps({'schemas':{k:c.INPUT_TYPES() for k,c in classes.items()}, 'results':{k:[run(c,42),run(c,n.MAX_SEED)] for k,c in classes.items()},
    'concrete':{k:getattr(c(),c.FUNCTION)(unique_id='1')['ui']['vividmuse_prompt_diagnostics'][0] for k,c in classes.items()}}))
`],{cwd:root,encoding:"utf8",env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"}}));
const json=value=>JSON.parse(JSON.stringify(value));
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attrs={};this.style={};this.textContent="";this.value="";}
  append(...children){for(const child of children){this.children.push(child);child.parent=this;if(this.tag==="select"&&!this.value)this.value=child.value;}}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  async fire(k,event={}){await this[`on${k}`]?.(event);for(const fn of this.listeners[k]||[])await fn(event);}
  click(){if(!this.disabled)return this.fire("click");}
  showModal(){this.open=true;}
  close(){this.open=false;this.fire("close");}
  remove(){this.removed=true;}
  focus(){this.focused=true;}
  set innerHTML(_){throw Error("No HTML insertion");}
}
const all=el=>[el,...el.children.flatMap(all)];
const key=name=>`VividMuse_ZImage${name}`;
for(const diagnosticsFirst of [true,false]){
  const extensions=[],listeners=new Map(),nodes=new Map();let lang="zh",confirm=()=>true;
  const graph={get nodes(){return [...nodes.values()];},getNodeById(id){return nodes.get(String(id));},setDirtyCanvas(){}};
  const app={graph,registerExtension(e){extensions.push(e);},async graphToPrompt(){return {output:Object.fromEntries([...nodes].map(([id,n])=>[id,{class_type:n.comfyClass}]))};}};
  const api={addEventListener(k,fn){listeners.set(k,fn);},async queuePrompt(_number,_prompt,extra){return {prompt_id:extra.id};}};
  const ctx=vm.createContext({console,app,api,setTimeout(){},clearTimeout(){},document:{createElement:t=>new Element(t),body:new Element("body")},window:{confirm:()=>confirm()}});
  const files=["preset_sync","modular_nodes","workflow_tools","shoot_plan_core","shoot_plan_cards"];
  diagnosticsFirst?files.unshift("prompt_diagnostics"):files.push("prompt_diagnostics");
  for(const file of files){const original=fs.readFileSync(new URL(`../web/js/${file}.js`,import.meta.url),"utf8");
    let source=original.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];/g,"")
      .replaceAll("export function ","function ").replaceAll("export const ","const ");
    const names=[...original.matchAll(/export (?:function|const) (\w+)/g)].map(m=>m[1]);
    if(file==="shoot_plan_core")source+=`\nglobalThis.shootCore={${names.join(",")}};`;
    if(file==="shoot_plan_cards")source=`const {${Object.keys(ctx.shootCore).join(",")}}=globalThis.shootCore;\n${source}`;
    vm.runInContext(`(()=>{${source}\n})();`,ctx);}
  ctx.__vividMuseZImageI18n={activeLanguage:()=>lang,translateMessage:v=>v};
  for(const e of extensions)e.init?.();
  for(const [name,input] of Object.entries(fixture.schemas))for(const e of extensions)e.beforeRegisterNodeDef?.(class {},{name,input});
  let nextId=1;
  const make=async type=>{
    const node={id:nextId++,comfyClass:key(type),widgets:[],properties:{},inputs:[],size:[360,400],
      addWidget(type,name,value,callback,options={}){const w={type,name,value,callback,options};this.widgets.push(w);return w;},
      setDirtyCanvas(){},setSize(){},computeSize(){return [360,400];}};
    const schema=fixture.schemas[node.comfyClass];
    for(const [name,[kind,options={}]] of Object.entries({...schema.required,...schema.optional})){
      if(options.forceInput)continue;
      node.addWidget(Array.isArray(kind)?"combo":"text",name,options.default??(Array.isArray(kind)?kind[0]:kind==="STRING"?"":0),undefined,
        {...options,...(Array.isArray(kind)?{values:[...kind]}:{})});}
    nodes.set(String(node.id),node);
    for(const e of extensions)await e.nodeCreated?.(node);
    return node;
  };
  const emit=async(node,id,data)=>{
    await api.queuePrompt(0,await app.graphToPrompt(),{id});
    listeners.get("executed")({detail:{prompt_id:id,node:String(node.id),output:{vividmuse_prompt_diagnostics:[json(data)]}}});
  };
  const open=node=>{node.__vividMusePromptStatusButton.callback();return node.__vividMusePromptDialog;};
  const button=(panel,label)=>all(panel).find(e=>e.tag==="button"&&e.textContent===label);
  const named=(panel,label)=>all(panel).find(e=>e.attrs["aria-label"]===label);
  const status=panel=>all(panel).find(e=>e.attrs.role==="status").textContent;
  const state=node=>JSON.stringify({widgets:node.widgets.map(w=>w.value),locks:node.properties.vividMuseRandomLocks,inputs:node.inputs,history:node.__vividMusePromptHistory});
  const node=await make("ChinesePromptBuilder"),results=fixture.results[node.comfyClass];
  const w=name=>node.widgets.find(w=>w.name===name);
  await emit(node,"old",results[0]);await emit(node,"new",results[1]);
  w("随机种子").value=999;w("年龄阶段").value="随机抽取";w("自由提示词").value="current free draft";
  w("用户人物片段").value="current TXT replacement";node.inputs=[{name:"年龄阶段",link:5}];node.properties.vividMuseRandomLocks=["发色"];
  let panel=open(node);
  const selector=named(panel,"选择执行记录");selector.value="1";await selector.fire("change");
  const before=state(node);await button(panel,"保存为人物卡").click();
  assert.equal(node.properties.vividMuseContentCards,undefined,"Preview must not save");
  named(panel,"卡片名称").value="历史人物";
  await button(panel,"确认保存卡片").click();
  assert.equal(state(node),before,"Saving must not edit widgets/locks/inputs/history");
  assert.deepEqual(json(node.properties.vividMuseContentCards[0].values),results[0].card_candidates.modules["人物"].values);
  assert.deepEqual(Object.keys(node.properties.vividMuseContentCards[0]).sort(),["kind","version","module","name","values"].sort());
  await button(panel,"保存为人物卡").click();named(panel,"卡片名称").value="历史人物";
  const savedBefore=JSON.stringify(node.properties.vividMuseContentCards);confirm=()=>false;
  await button(panel,"确认保存卡片").click();assert.equal(JSON.stringify(node.properties.vividMuseContentCards),savedBefore);
  confirm=()=>true;await button(panel,"确认保存卡片").click();assert.equal(node.properties.vividMuseContentCards.length,1);
  // Switching the selected record cancels an unconfirmed draft.
  await button(panel,"保存为穿搭卡").click();selector.value="0";await selector.fire("change");
  await button(panel,"确认保存卡片").click();assert.equal(node.properties.vividMuseContentCards.length,1);
  await button(panel,"保存为穿搭卡").click();
  assert.ok(all(panel).some(e=>e.textContent?.includes("18446744073709551615")),"Actual uint64 seed must not lose precision");
  named(panel,"卡片名称").value="历史穿搭";
  for(let i=0;i<6;i++)await emit(node,`later-${i}`,results[0]);
  await button(panel,"确认保存卡片").click();
  assert.deepEqual(json(node.properties.vividMuseContentCards[1].values),results[1].card_candidates.modules["服装"].values,"Open snapshot survives history eviction");
  // IME events must reach the input method; cancellation does not close the panel.
  await panel.fire("compositionstart");await panel.fire("keydown",{key:"Escape",isComposing:true,stopPropagation(){},preventDefault(){throw Error("IME blocked");}});
  let prevented=false;await panel.fire("cancel",{preventDefault(){prevented=true;}});assert.ok(prevented&&panel.open);
  await panel.fire("compositionend");
  await button(panel,"保存为人物卡").click();named(panel,"卡片名称").value="closed";
  panel.close();await button(panel,"确认保存卡片").click();assert.equal(node.properties.vividMuseContentCards.length,2);
  panel=open(node);await button(panel,"保存为人物卡").click();named(panel,"卡片名称").value="switched";
  app.graph={};await button(panel,"确认保存卡片").click();assert.equal(node.properties.vividMuseContentCards.length,2);assert.match(status(panel),/会话/);app.graph=graph;panel.close();
  panel=open(node);await button(panel,"保存为人物卡").click();named(panel,"卡片名称").value="历史人物";
  confirm=()=>{node.onRemoved();return true;};await button(panel,"确认保存卡片").click();
  assert.equal(node.properties.vividMuseContentCards.length,2);confirm=()=>true;
  // Shared helper validates complete actual values, never editor fallbacks.
  const cards=ctx.__vividMuseContentCards;
  for(const invalid of [undefined,{}, {...results[0],card_candidates:undefined},
    {...results[0],scope:"摄影"},
    ...["user_replaced","empty_module","incomplete_fields","unsupported_values"].map(reason=>({...results[0],card_candidates:{version:1,modules:{人物:{available:false,reason}}}})),
    ...[{}, {...results[0].card_candidates.modules["人物"].values,年龄阶段:"随机抽取"},
      {...results[0].card_candidates.modules["人物"].values,extra:"unknown"}].map(values=>({...results[0],card_candidates:{version:1,modules:{人物:{available:true,values}}}}))]){
    const before=JSON.stringify(node.properties);assert.throws(()=>cards.captureResultCard(node,invalid,"人物","bad"));assert.equal(JSON.stringify(node.properties),before);}
  // Real independent modules expose only their own result-to-card action, in both languages.
  for(const [kind,moduleName] of [["PersonModule","人物"],["ClothingModule","服装"],["HairModule",null]]){
    const target=await make(kind);await emit(target,kind,fixture.results[target.comfyClass][0]);lang="en";panel=open(target);
    assert.equal(!!button(panel,"Save as Person Card"),moduleName==="人物");
    assert.equal(!!button(panel,"Save as Outfit Card"),moduleName==="服装");
    if(moduleName){await button(panel,moduleName==="人物"?"Save as Person Card":"Save as Outfit Card").click();
      named(panel,"Card name").value="standalone";await button(panel,"Confirm Save Card").click();
      assert.equal(target.properties.vividMuseContentCards[0].module,moduleName);}
    panel.close();lang="zh";
  }
  const legacy=await make("ChinesePromptBuilder"),legacyData=json(results[0]);delete legacyData.card_candidates;
  await emit(legacy,"legacy",legacyData);panel=open(legacy);assert.ok(button(panel,"保存为人物卡").disabled);
  assert.ok(all(panel).some(e=>e.textContent?.includes("重新执行")));panel.close();
  // New cards remain usable by the public v1 validator and preserve non-target fields on application.
  const target=await make("PersonModule"),card=cards.captureResultCard(target,fixture.results[key("PersonModule")][0],"人物","roundtrip");
  cards.saveCard(target,json(card));assert.deepEqual(json(target.properties.vividMuseContentCards[0]),json(card));
  const shootNode=await make("ChinesePromptBuilder");
  await emit(shootNode,"shoot-old",results[0]); await emit(shootNode,"shoot-new",results[1]);
  shootNode.widgets.find(w=>w.name==="景别").value="随机抽取";
  shootNode.widgets.find(w=>w.name==="用户场景片段").value="CURRENT TXT";
  shootNode.inputs=[{name:"场景地点",link:9}];
  panel=open(shootNode); const recordSelect=named(panel,"选择执行记录"); recordSelect.value="1"; await recordSelect.fire("change");
  const shootBefore=state(shootNode); await button(panel,"保存为拍摄方案卡").click();
  named(panel,"拍摄方案卡名称").value="历史拍摄"; await button(panel,"确认保存拍摄方案卡").click();
  assert.equal(state(shootNode),shootBefore);
  const eligible=Object.entries(results[0].shoot_plan_candidates.modules).filter(([,c])=>c.available).map(([m])=>m);
  assert.deepEqual(Object.keys(shootNode.properties.vividMuseShootPlanCards[0].modules),eligible);
  for(const module of eligible)assert.deepEqual(json(shootNode.properties.vividMuseShootPlanCards[0].modules[module]),results[0].shoot_plan_candidates.modules[module].values);
  // Same-name replace must also recheck library state after confirmation.
  await button(panel,"保存为拍摄方案卡").click();named(panel,"拍摄方案卡名称").value="历史拍摄";
  confirm=()=>{ctx.__vividMuseShootPlanCards.saveCard(shootNode,{...json(shootNode.properties.vividMuseShootPlanCards[0]),name:"concurrent"});return true;};
  await button(panel,"确认保存拍摄方案卡").click();assert.equal(shootNode.properties.vividMuseShootPlanCards.length,2);assert.match(status(panel),/变化/);confirm=()=>true;
  // Changing records cancels drafts; an opened historical snapshot survives newer runs.
  await button(panel,"保存为拍摄方案卡").click(); recordSelect.value="0";await recordSelect.fire("change");
  await button(panel,"确认保存拍摄方案卡").click();assert.equal(shootNode.properties.vividMuseShootPlanCards.length,2);
  const shootChecks=all(panel).filter(e=>e.type==="checkbox");
  for(const check of shootChecks){check.checked=check.value==="摄影";await check.fire("change");}
  await button(panel,"保存为拍摄方案卡").click();named(panel,"拍摄方案卡名称").value="仅摄影历史";
  for(let i=0;i<6;i++)await emit(shootNode,`shoot-later-${i}`,results[0]);
  await button(panel,"确认保存拍摄方案卡").click();
  assert.deepEqual(Object.keys(shootNode.properties.vividMuseShootPlanCards[2].modules),["摄影"]);
  assert.deepEqual(json(shootNode.properties.vividMuseShootPlanCards[2].modules["摄影"]),results[1].shoot_plan_candidates.modules["摄影"].values);
  panel.close();
  for(const [kind,module] of [["SceneModule","场景"],["CameraModule","摄影"],["VisualModule","视觉表现"]]){
    const single=await make(kind);await emit(single,`shoot-${kind}`,fixture.concrete[single.comfyClass]);lang="en";panel=open(single);
    assert.equal(all(panel).filter(e=>e.type==="checkbox").length,1);
    await button(panel,"Save as Shoot Plan Card").click();named(panel,"Shoot plan card name").value="single";
    await button(panel,"Confirm Save Shoot Plan").click();assert.deepEqual(Object.keys(single.properties.vividMuseShootPlanCards[0].modules),[module]);
    panel.close();lang="zh";
  }
  const oldShoot=await make("ChinesePromptBuilder"),oldData=json(results[0]);delete oldData.shoot_plan_candidates;
  await emit(oldShoot,"old-protocol",oldData);panel=open(oldShoot);assert.ok(button(panel,"保存为拍摄方案卡").disabled);
  assert.ok(all(panel).some(e=>e.textContent?.includes("重新执行")));panel.close();
  const noShoot=await make("ChinesePromptBuilder"),partial=json(results[0]);
  partial.shoot_plan_candidates.modules["场景"]={available:false,reason:"user_replaced"};
  await emit(noShoot,"partial",partial);panel=open(noShoot);
  assert.ok(all(panel).find(e=>e.type==="checkbox"&&e.value==="场景").disabled);
  await button(panel,"保存为拍摄方案卡").click();named(panel,"拍摄方案卡名称").value="not-owned";
  app.graph={};await button(panel,"确认保存拍摄方案卡").click();assert.equal(noShoot.properties.vividMuseShootPlanCards,undefined);app.graph=graph;panel.close();
  console.log(`PASS result cards and shoot plans: actual Python records, history, selective modules, old/TXT rejection, ownership, save-only, races; diagnosticsFirst=${diagnosticsFirst}`);
}
