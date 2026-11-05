import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {withCardOrganizationImports} from './card_organization_vm.mjs';

const source=fs.readFileSync(new URL('../web/js/card_summary.js',import.meta.url),'utf8');
const summary=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const root=fileURLToPath(new URL('..',import.meta.url));
const fixture=JSON.parse(execFileSync(process.env.PYTHON||'python',['-B','-c',
  'import json,nodes,modular_nodes; print(json.dumps({k:c.INPUT_TYPES() for k,c in {**nodes.NODE_CLASS_MAPPINGS,**modular_nodes.NODE_CLASS_MAPPINGS}.items()}))'],
  {cwd:root,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}}));
const extensions=[];
const ctx=vm.createContext({console,app:{registerExtension(e){extensions.push(e);}},setTimeout(){},clearTimeout(){}});
for(const name of ['preset_sync','modular_nodes','workflow_tools','shoot_plan_core']) {
  const raw=withCardOrganizationImports(fs.readFileSync(new URL(`../web/js/${name}.js`,import.meta.url),'utf8'),ctx);
  const exports=[...raw.matchAll(/export (?:function|const) (\w+)/g)].map(m=>m[1]);
  const code=raw.replace('import { app } from "../../scripts/app.js";','').replaceAll('export function ','function ').replaceAll('export const ','const ');
  vm.runInContext(`(()=>{${code}\nglobalThis.${name}={${exports.join(',')}};})()`,ctx);
}
for(const [name,input] of Object.entries(fixture)) {
  ctx.shoot_plan_core.registerShootPlanSchema({name,input});
  for(const ext of extensions) ext.beforeRegisterNodeDef?.(class {},{name,input});
}
const node={comfyClass:'VividMuse_ZImageChinesePromptBuilder',widgets:[],properties:{},inputs:[]};
for(const [name,[kind,options={}]] of Object.entries({...fixture[node.comfyClass].required,...fixture[node.comfyClass].optional})) {
  if(options.forceInput)continue;
  node.widgets.push({name,value:options.default??(Array.isArray(kind)?kind[0]:kind==='STRING'?'':0),options:{...options,...(Array.isArray(kind)?{values:[...kind]}:{})}});
}
const cards=ctx.workflow_tools,shoot=ctx.shoot_plan_core;
const groups=JSON.parse(JSON.stringify(ctx.__vividMuseZImagePromptData.MODULE_FIELD_GROUPS));
const clone=x=>JSON.parse(JSON.stringify(x));
const before=JSON.stringify(node);
const options={fieldGroups:groups,hiddenField:cards.hiddenCardField,validate:c=>c.kind==='vividmuse-content-card'?cards.validateCard(c,node):shoot.validateShootPlan(c,node)};
const build=(c,extra={})=>summary.buildCardSummary(c,{...options,...extra});
let count=0;
function check(name,fn){fn();count++;}
const samples={};
for(const module of ['人物','发型','服装','姿态动作']) {
  const card=clone(cards.captureCard(node,module,`${module}测试`)); samples[module]=card;
  check(`${module} complete snapshot`,()=>{
    const original=JSON.stringify(card), result=build(card);
    assert.equal(result.name,card.name); assert.equal(result.groups.length,1);
    const group=result.groups[0];
    assert.equal(group.totalFields,groups[module].length); assert.ok(group.items.length<=5);
    assert.ok(group.items.every(r=>r.value!=='不使用'&&!cards.hiddenCardField(r.field,card.values)));
    assert.equal(JSON.stringify(card),original); assert.deepEqual(build(card),result);
  });
  check(`${module} all unused is a clear operation`,()=>{
    const empty={...card,values:Object.fromEntries(groups[module].map(n=>[n,'不使用']))};
    const result=build(empty); assert.equal(result.groups[0].clearCount,groups[module].length);
    assert.equal(result.groups[0].allEmpty,true); assert.equal(result.groups[0].items.length,0);
    assert.match(summary.formatCardSummary(result),/清空/);
    assert.match(summary.formatCardSummary(result,{language:'en'}),/clear/i);
  });
  check(`${module} validation and no fallback`,()=>{
    for(const bad of [{...card,version:2},{...card,values:{}},{...card,values:{...card.values,[groups[module][0]]:'随机抽取'}},
      {...card,values:{...card.values,[groups[module][0]]:'invalid'}}]) assert.throws(()=>build(bad));
  });
}
check('hair hidden branch uses card mode',()=>{
  const card=clone(samples['发型']); card.values['发色模式']='基础发色';
  card.values['发色色调']=node.widgets.find(w=>w.name==='发色色调').options.values.find(v=>!['不使用','跟随预设','随机抽取'].includes(v));
  const result=build(card); assert.ok(result.groups[0].hiddenValueCount>=1);
  assert.ok(!result.groups[0].items.some(i=>i.field==='发色色调'));
  assert.match(summary.formatCardSummary(result),/隐藏/);
});
check('clothing does not summarize inactive garments',()=>{
  const card=clone(samples['服装']); card.values['穿搭结构']='连衣裙';
  const result=build(card);
  assert.ok(!result.groups[0].items.some(i=>/^(上装|下装|连体服)/.test(i.field)));
});
check('person hides inactive makeup',()=>{
  const card=clone(samples['人物']);card.values['妆容模式']='分项自定义';
  assert.ok(!build(card).groups[0].items.some(i=>i.field==='整体妆容预设'));
});
const shootCard=clone(shoot.captureShootPlan(node,['场景','摄影','视觉表现'],'拍摄测试'));
check('shoot plan groups and application subset',()=>{
  const result=build(shootCard,{selectedModules:['摄影']});
  assert.equal(result.groups.length,3);
  assert.deepEqual(result.selectedModules,['摄影']);
  assert.equal(result.groups.find(g=>g.module==='场景').selected,false);
  assert.equal(result.groups.find(g=>g.module==='摄影').selected,true);
  assert.ok(result.groups.every(g=>g.items.length<=2));
  assert.match(summary.formatCardSummary(result),/本次不应用/);
  assert.deepEqual(build(shootCard,{selectedModules:[]}).selectedModules,[]);
  assert.throws(()=>build(shootCard,{selectedModules:['人物']}));
});
check('shoot validators remain authoritative',()=>{
  assert.throws(()=>build({...shootCard,version:2}));
  assert.throws(()=>build({...shootCard,modules:{摄影:{}}}));
  assert.throws(()=>build({...shootCard,modules:{摄影:Object.fromEntries(groups['摄影'].map(n=>[n,'不使用']))}}));
});
check('null means keep current, not an empty card',()=>{
  const result=build(null);assert.equal(result.status,'keep-current');
  assert.match(summary.formatCardSummary(result),/不修改/);
});
check('name and text-only translation',()=>{
  const card={...samples['发型'],name:'<img src=x onerror=evil>'};
  const result=build(card);
  const text=summary.formatCardSummary(result,{language:'en',fieldLabel:s=>'Field '+s,valueLabel:(f,v)=>'Value '+v,moduleLabel:s=>'Module '+s});
  assert.ok(text.includes(card.name)); assert.ok(text.includes('Field ')); assert.ok(text.includes('Value '));
  assert.equal(build({...card,name:'a'.repeat(80)}).name.length,80);
  assert.throws(()=>build({...card,name:'a'.repeat(81)}));
});
check('editor values do not become summary values',()=>{
  const first=build(samples['发型']); const w=node.widgets.find(w=>w.name==='发色'); const old=w.value;
  w.value='随机抽取'; assert.deepEqual(build(samples['发型']),first);w.value=old;
});
check('validation is required, not a decorative callback',()=>{
  let calls=0;
  assert.throws(()=>build(samples['人物'],{validate:()=>{calls++;throw Error('Rejected by original validator');}}),/original validator/);
  assert.equal(calls,1);
  assert.throws(()=>build(samples['人物'],{validate:undefined}));
  assert.throws(()=>build(samples['人物'],{hiddenField:undefined}));
});
check('no side effects or random source',()=>{
  assert.equal(JSON.stringify(node),before);
  assert.ok(!/document\.|localStorage|Math\.random|app\./.test(source));
});
console.log(`Card summaries: ${count} cases passed with actual registered schemas and validators.`);
