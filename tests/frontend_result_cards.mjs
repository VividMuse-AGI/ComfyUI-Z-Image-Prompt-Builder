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
print(json.dumps({'schemas':{k:c.INPUT_TYPES() for k,c in classes.items()}, 'results':{k:[run(c,42),run(c,n.MAX_SEED)] for k,c in classes.items()}}))
`],{cwd:root,encoding:"utf8"}));
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
  const files=["preset_sync","modular_nodes","workflow_tools"];
  diagnosticsFirst?files.unshift("prompt_diagnostics"):files.push("prompt_diagnostics");
  for(const file of files){const source=fs.readFileSync(new URL(`../web/js/${file}.js`,import.meta.url),"utf8")
    .replace('import { app } from "../../scripts/app.js";',"").replace('import { api } from "../../scripts/api.js";',"").replaceAll("export function ","function ");
    vm.runInContext(`(()=>{${source}\n})();`,ctx);}
  ctx.__vividMuseZImageI18n={activeLanguage:()=>lang,translateMessage:v=>v};
  for(const e of extensions)e.init?.();
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
  console.log(`PASS result cards: actual Python data, scopes, frozen history, save-only, invalid records, ownership, IME; diagnosticsFirst=${diagnosticsFirst}`);
}
