import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const fixture=JSON.parse(execFileSync(process.env.PYTHON||'python',['-B','-X','utf8','-c',`
import json,nodes as n,modular_nodes as m
classes={**n.NODE_CLASS_MAPPINGS,**{k:c for k,c in m.NODE_CLASS_MAPPINGS.items() if issubclass(c,m.ZImageModuleNodeBase)}}
def data(c):
 return getattr(c(),c.FUNCTION)(unique_id='1',**{'预设':n.PRESET_OPTIONS[1],'随机种子':42,**dict.fromkeys(n.FIELD_ORDER,n.RANDOM_CHOICE)})['ui']['vividmuse_prompt_diagnostics'][0]
def coherent(updates):
 args={**dict.fromkeys(n.FIELD_ORDER,n.EMPTY_CHOICE),'预设':n.PRESET_OPTIONS[0],'随机范围':n.RANDOM_SCOPES[2],'随机种子':29,'基础姿态':n.RANDOM_CHOICE,'场景地点':'校园教室','组合协调':'协调优先',**updates}
 return n.ZImageChinesePromptBuilder().build_prompt(unique_id='1',**args)['ui']['vividmuse_prompt_diagnostics'][0]
coherence=[coherent(x) for x in [{},{'组合协调':'默认组合'},{'组合协调':'future'},{'基础姿态':'泳池边坐姿'},{'自由提示词':'用户内容'},{'基础姿态':'盘腿而坐','腿部动作':n.RANDOM_CHOICE,'随机种子':1},dict.fromkeys(n.CAMERA_OUTPUT_FIELDS,n.RANDOM_CHOICE)]]
coherence.append(coherent({'预设':'自定义组合','随机种子':21,'基础姿态':'泳池边坐姿',**dict.fromkeys((*n.SCENE_GROUP_FIELDS,*n.LIGHTING_OUTPUT_FIELDS),n.RANDOM_CHOICE)}))
for changes in [{'随机范围':n.RANDOM_SCOPES[0],'随机种子':2}, {'随机种子':0}, {'腿部动作':'坐姿双膝并拢'}, {'随机种子':0,'自由提示词':'用户文字'}]:
 coherence.append(coherent({'基础姿态':'自然站立','腿部动作':n.RANDOM_CHOICE,'手部动作':'双手托住咖啡杯',**changes}))
for cls,context,values in [(m.ZImagePoseModule,{'场景地点':'校园教室'},{'基础姿态':n.RANDOM_CHOICE,'随机种子':29}), (m.ZImageSceneModule,{'基础姿态':'泳池边坐姿'},{'场景地点':n.RANDOM_CHOICE,'随机种子':21})]:
 coherence.append(cls().build_module(unique_id='1',**{**dict.fromkeys(m.MODULE_FIELD_GROUPS[cls.MODULE_NAME],n.EMPTY_CHOICE),'预设':'自定义组合','前置提示词':m.PromptChainText('上游。',context),'组合协调':'协调优先',**values})['ui']['vividmuse_prompt_diagnostics'][0])
coherence.append(m.ZImagePoseModule().build_module(unique_id='1',**{**dict.fromkeys(n.POSE_OUTPUT_FIELDS,n.EMPTY_CHOICE),'预设':n.PRESET_OPTIONS[0],'随机种子':2,'基础姿态':'自然站立','手部动作':'双手托住咖啡杯','腿部动作':n.RANDOM_CHOICE,'组合协调':'协调优先'})['ui']['vividmuse_prompt_diagnostics'][0])
print(json.dumps({'schemas':{k:c.INPUT_TYPES() for k,c in classes.items()},'results':{k:data(c) for k,c in classes.items()},
 'coherence':coherence,'pose_fields':n.POSE_OUTPUT_FIELDS,
 'groups':{'scene':n.SCENE_GROUP_FIELDS,'camera':n.CAMERA_OUTPUT_FIELDS,'lighting':n.LIGHTING_OUTPUT_FIELDS,'color_finish':n.COLOR_OUTPUT_FIELDS+n.FINISH_OUTPUT_FIELDS}}))
`],{cwd:root,encoding:'utf8'}));
const copy=x=>JSON.parse(JSON.stringify(x));
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attrs={};this.style={};this.textContent='';this.value='';}
 set innerHTML(_){throw Error('Unsafe HTML');}
 append(...xs){for(const x of xs){this.children.push(x);x.parent=this;}}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 showModal(){this.open=true;}
 close(){this.open=false;this.onclose?.();}
 remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
const flatten=e=>[e,...e.children.flatMap(flatten)];
const find=(p,label)=>flatten(p).find(e=>e.attrs['aria-label']===label);
const extensions=[],listeners=new Map(),nodes=[];
let language='zh',mutations=0;
const app={graph:{nodes,getNodeById:id=>nodes.find(n=>String(n.id)===String(id)),beforeChange(){mutations++;},afterChange(){mutations++;}},registerExtension:e=>extensions.push(e)};
const ctx=vm.createContext({app,api:{addEventListener:(name,fn)=>listeners.set(name,fn)},console,
 setTimeout:fn=>fn(),document:{createElement:t=>new Element(t),body:new Element('body')},
 __vividMuseZImageI18n:{activeLanguage:()=>language,translateMessage:s=>s}});
let source=fs.readFileSync(new URL('../web/js/prompt_diagnostics.js',import.meta.url),'utf8')
 .replace('import { app } from "../../scripts/app.js";','').replace('import { api } from "../../scripts/api.js";','');
vm.runInContext(`${source}\nglobalThis.tools={parseRandomExplanation,randomExplanationLines,executionImpactLines,currentConfigurationLines,details,acceptResult,showDetails,resultSnapshot,DRAW_GROUPS,parseCoherenceExplanation,coherenceExplanationLines,coherenceSummaryLines,COHERENCE_POSE_FIELDS,stale};`,ctx);
const t=ctx.tools;
assert.deepEqual(copy(Object.fromEntries(Object.entries(t.DRAW_GROUPS).map(([key,v])=>[key,v.fields]))),fixture.groups);
function make(kind,schema){
 const node={id:nodes.length+1,comfyClass:kind,widgets:[],properties:{},size:[360,420],inputs:[],
  addWidget(type,name,value,callback,options={}){const w={type,name,value,callback,options};this.widgets.push(w);return w;},setDirtyCanvas(){}};
 for(const [name,[type,opts={}]] of Object.entries({...schema.required,...schema.optional})){
  if(opts.forceInput)continue;
  node.addWidget(Array.isArray(type)?'combo':type,name,opts.default??(Array.isArray(type)?type[0]:''),null,{...opts,...(Array.isArray(type)?{values:type}:{})});
 }
 nodes.push(node);extensions.forEach(e=>e.nodeCreated?.(node));return node;
}
const state=n=>JSON.stringify({properties:n.properties,size:n.size,widgets:n.widgets.map(w=>[w.name,w.value,w.serialize])});
const raw=()=>({version:1,coverage:'partial',truncated:false,draws:[{module:'视觉表现',group:'color_finish',stage:'initial',entry_count:3,distinct_active_count:1,active_fields:['主配色'],effect:'retained'}],unmeasured:[]});
const fullKey='VividMuse_ZImageChinesePromptBuilder';
const full=make(fullKey,fixture.schemas[fullKey]);
const add=(node,data)=>{assert.equal(t.acceptResult(node,data),true);return node.__vividMusePromptHistory.at(-1);};

// Every real node's backend payload fits the front-end whitelist, in both languages.
for(const [kind,data] of Object.entries(fixture.results)){
 const node=kind===fullKey?full:make(kind,fixture.schemas[kind]);
 const before=state(node),count=node.widgets.length;
 const r=add(node,copy(data));assert.equal(r.explanationStatus,'valid');
 for(const lang of ['zh','en']){
  language=lang;t.showDetails(node);const panel=node.__vividMusePromptDialog;
  const sampling=find(panel,lang==='zh'?'本次抽取说明':'Sampling Details for This Execution');
  assert.ok(sampling);assert.ok(sampling.textContent.includes(lang==='zh'?'所选执行':'selected execution'));
  assert.match(sampling.style.cssText,/font-size:14px/);
  assert.match(sampling.style.cssText,/line-height:1\.6/);
  assert.match(sampling.style.cssText,/max-height:24vh;overflow:auto/);
  assert.ok(find(panel,lang==='zh'?'当前配置摘要':'Current Configuration Summary'));
  if(lang==='en')assert.doesNotMatch(sampling.textContent,/[\u3400-\u9fff]/);
  panel.close();assert.ok(panel.removed);assert.equal(node.widgets.length,count);assert.equal(state(node),before);
 }
}
language='zh';
const data={...copy(fixture.results[fullKey]),random_explanation:raw()};
const original=copy(data);const record=add(full,data);
assert.match(t.randomExplanationLines(record).join('\n'),/3 个候选条目 \/ 1 种随机字段组合/);
assert.deepEqual(data,original);
data.random_explanation.draws[0].entry_count=99;
assert.equal(record.data.random_explanation.draws[0].entry_count,3,'freeze incoming explanation');
assert.equal(t.resultSnapshot(full,record).random_explanation,undefined,'export format is unchanged');

// A bad additive block never invalidates the original output or card candidates.
const invalid=[null,[],{}, {...raw(),version:2},{...raw(),coverage:'complete'}, {...raw(),truncated:1},
 {...raw(),draws:Array(17).fill(raw().draws[0])},{...raw(),unmeasured:Array(9).fill({module:'人物',reason:'no_random_fields'})}];
for(const change of [{entry_count:0},{entry_count:-1},{entry_count:1.5},{entry_count:NaN},{entry_count:Infinity},
 {entry_count:Number.MAX_SAFE_INTEGER+1},{distinct_active_count:4},{distinct_active_count:0},{distinct_active_count:true},
 {group:'__proto__'},{module:'摄影'},{active_fields:['<script>']},{active_fields:[]},{active_fields:['主配色','主配色']},
 {stage:'after_reference'},{effect:'final_output_guaranteed'}])invalid.push({...raw(),draws:[{...raw().draws[0],...change}]});
invalid.push({...raw(),unmeasured:[{module:'unknown',reason:'no_random_fields'}]},
 {...raw(),unmeasured:[{module:'人物',reason:'unknown'}]},
 {...raw(),unmeasured:[{module:'人物',reason:'no_random_fields'},{module:'人物',reason:'no_random_fields'}]});
for(const value of invalid){
 const r=add(full,{...copy(fixture.results[fullKey]),random_explanation:value});
 assert.equal(r.explanationStatus,'invalid');assert.equal(r.data.random_explanation,undefined);
 assert.equal(r.data.zh,fixture.results[fullKey].zh);assert.deepEqual(copy(r.data.card_candidates),fixture.results[fullKey].card_candidates);
 assert.match(t.randomExplanationLines(r).join('\n'),/已忽略/);
 t.showDetails(full);full.__vividMusePromptDialog.close();
}
const extra=raw();extra.secret='<script>';extra.draws[0].private='hidden';extra.cycle=extra;
const clean=t.parseRandomExplanation(extra,'全部模块');assert.equal(clean.status,'valid');assert.equal(clean.data.secret,undefined);assert.equal(clean.data.draws[0].private,undefined);
assert.equal(t.parseRandomExplanation(raw(),'摄影').status,'invalid');
assert.equal(add(full,{...oldScopeFixture(),scope:'摄影'}).explanationStatus,'invalid');
function oldScopeFixture(){return {...copy(fixture.results[fullKey]),random_explanation:raw()};}

// Old payload, partial coverage, overwritten steps and truncated records are explicit.
const old=copy(fixture.results[fullKey]);delete old.random_explanation;
assert.match(t.randomExplanationLines(add(full,old)).join('\n'),/未提供候选统计/);
for(const effect of ['overwritten','unknown']){
 const value=raw();value.draws[0].effect=effect;
 const lines=t.randomExplanationLines(add(full,{...old,random_explanation:value})).join('\n');
 assert.match(lines,effect==='overwritten'?/后续已覆盖/:/最终影响未确定/);
 assert.doesNotMatch(lines,/该次采样环节只有一种/);
}
const partial={...raw(),truncated:true,unmeasured:[{module:'场景',reason:'reference_replacement'},{module:'人物',reason:'not_instrumented'}]};
assert.match(t.randomExplanationLines(add(full,{...old,random_explanation:partial})).join('\n'),/截断/);
assert.match(t.randomExplanationLines(full.__vividMusePromptHistory.at(-1)).join('\n'),/最终候选数量未统计/);
const multiple=raw();multiple.draws[0].distinct_active_count=2;
assert.match(t.randomExplanationLines(add(full,{...old,random_explanation:multiple})).join('\n'),/不同种子仍可能/);
for(const status of ['user_replaced','framing_omitted','not_randomized','empty','not_in_text']) {
 const r={data:{random_fields:[{status},{status}]}};
 assert.equal(t.executionImpactLines(r).length,1);assert.match(t.executionImpactLines(r)[0],/: 2$/);
 language='en';assert.doesNotMatch(t.executionImpactLines(r)[0],/[\u3400-\u9fff]/);language='zh';
}
assert.match(t.executionImpactLines({data:{random_fields:[]}})[0],/没有随机字段/);

// Locks are current editor state, not a claim about old sampling or fixed values.
const hair=full.widgets.find(w=>w.name==='发色');hair.value='深棕黑色';
full.properties.vividMuseRandomLocks=['发色','发色','unknown'];
let before=state(full);assert.match(t.currentConfigurationLines(full).join('\n'),/当前 1 个字段/);
assert.match(t.currentConfigurationLines(full).join('\n'),/不能解释历史结果/);assert.equal(state(full),before);
full.properties.vividMuseRandomLocks=[];
assert.doesNotMatch(t.currentConfigurationLines(full).join('\n'),/受随机按钮锁定保护/);
assert.equal(hair.value,'深棕黑色','unlock does not set random');
full.inputs=[{name:'发色',link:4}];assert.match(t.currentConfigurationLines(full).join('\n'),/存在连接输入/);full.inputs=[];
const noHistory=make(fullKey,fixture.schemas[fullKey]);t.showDetails(noHistory);
assert.match(flatten(noHistory.__vividMusePromptDialog).map(e=>e.textContent).join('\n'),/暂无实际执行记录/);noHistory.__vividMusePromptDialog.close();

// Selected history controls the explanation; next seed and current lock changes do not rewrite it.
full.__vividMusePromptHistory=[];
add(full,{...old,seed:'42',random_explanation:raw()});
add(full,{...old,seed:'43',random_explanation:multiple});
full.widgets.find(w=>w.name==='随机种子').value=44;
t.showDetails(full);const p=full.__vividMusePromptDialog;
const picker=find(p,'选择执行记录'),summary=find(p,'本次抽取说明'),configuration=find(p,'当前配置摘要');
assert.match(summary.textContent,/2 种随机字段组合/);
const frozenConfig=configuration.textContent;full.properties.vividMuseRandomLocks=['发色'];
picker.value='1';picker.onchange();assert.match(summary.textContent,/1 种随机字段组合/);assert.equal(configuration.textContent,frozenConfig);
const snapshot=summary.textContent;add(full,{...old,random_explanation:partial});assert.equal(summary.textContent,snapshot);
p.close();full.onConfigure({});assert.equal(full.__vividMusePromptHistory.length,0);
assert.equal(mutations,0);

// Public-node coherence payloads, including true module-chain executions.
assert.deepEqual(copy(t.COHERENCE_POSE_FIELDS),fixture.pose_fields);
const catalogCtx=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../web/js/i18n_catalog.js',import.meta.url),'utf8').replace('export const EN_CATALOG =','globalThis.catalog ='),catalogCtx);
const catalog=catalogCtx.catalog;
const translations={};
const collect=obj=>{for(const [k,v] of Object.entries(obj)){if(typeof v==='string')translations[k]=v;else if(v && typeof v==='object')collect(v);}};
collect(catalog);
ctx.__vividMuseZImageI18n.translateMessage=s=>language==='en'?(translations[s]||s):s;
assert.equal(translations['组合协调'],'Combination Coherence');
assert.equal(translations['协调优先'],'Coherence First');
assert.equal(translations['默认组合'],'Standard');
for(const payload of fixture.coherence){
 const kind=payload.scope==='全部模块'?fullKey:payload.scope==='场景'?'VividMuse_ZImageSceneModule':'VividMuse_ZImagePoseModule';
 const node=make(kind,fixture.schemas[kind]);const original=copy(payload),before=state(node);
 const record=add(node,payload);assert.equal(record.coherenceStatus,'valid');assert.equal(record.explanationStatus,'valid');
 assert.deepEqual(payload,original);
 assert.equal(t.resultSnapshot(node,record).coherence_explanation,undefined);
 for(const lang of ['zh','en']){
  language=lang;t.showDetails(node);
  const area=find(node.__vividMusePromptDialog,lang==='zh'?'本次组合协调':'Coherence for This Execution');
  assert.ok(area&&!area.hidden);assert.match(area.style.cssText,/max-height/);
  assert.match(area.style.cssText,/font-size:14px;line-height:1\.6/);
  const detail=find(node.__vividMusePromptDialog,lang==='zh'?'协调详情':'Coherence Details');
  assert.ok(detail);assert.equal(detail.open,false,'details start collapsed');
  assert.equal(detail.hidden,!payload.coherence_explanation.events.length);
  assert.equal(detail.children[0].tag,'summary','native keyboard-operable disclosure');
  if(!detail.hidden){
    const body=detail.children[1];
    assert.match(body.style.cssText,/font-size:14px;line-height:1\.6/);
    if(payload.coherence_explanation.events.some(e=>e.status==='no_candidate')){
      assert.match(area.textContent,lang==='zh'?/无可靠替代/:/no reliable replacement/);
      assert.match(body.textContent,lang==='zh'?/可用替代候选：0/:/Eligible replacement candidates: 0/);
    }
    detail.open=true;
    const historySelect=flatten(node.__vividMusePromptDialog).find(e=>e.tag==='select');
    historySelect.onchange();assert.equal(detail.open,false,'history selection resets disclosure');
    if(lang==='en')assert.doesNotMatch(body.textContent,/[\u3400-\u9fff]/);
  }
  if(lang==='en')assert.doesNotMatch(area.textContent,/[\u3400-\u9fff]/);
  node.__vividMusePromptDialog.close();assert.equal(state(node),before);
 }
}
language='zh';
// Simultaneous statuses remain visible; repeated rule events do not double-count fields.
const mixed=copy(fixture.coherence[0]);
const adjusted=mixed.coherence_explanation.events[0];
mixed.coherence_explanation.events=[adjusted,copy(adjusted),
 {rule_id:'standing_seated_legs',module:'姿态动作',status:'no_candidate',fields:[],before:{},after:{},candidate_count:0},
 {rule_id:'standing_pigeon_legs',module:'姿态动作',status:'unknown_context',fields:[],before:{},after:{},candidate_count:0}];
mixed.coherence_explanation.truncated=true;
const mixedRecord=add(full,mixed);
for(const lang of ['zh','en']){
 language=lang;const summary=t.coherenceSummaryLines(mixedRecord,full).join('\n');
 assert.match(summary,lang==='zh'?/已调整 1 个随机字段/:/1 random field adjusted/);
 assert.match(summary,lang==='zh'?/无可靠替代/:/no reliable replacement/);
 assert.match(summary,lang==='zh'?/未判断/:/Not evaluated/);
 assert.match(summary,lang==='zh'?/截断/:/Truncated/);
 assert.doesNotMatch(summary,/→/,'before/after stays in details');
 assert.equal((summary.match(lang==='zh'?/已调整 1 个随机字段/g:/1 random field adjusted/g)||[]).length,1);
}
language='zh';
const valid=fixture.coherence[0].coherence_explanation;
const badCoherence=[null,[],{}, {...valid,version:2},{...valid,mode:'unknown'},{...valid,coverage:'complete'},
 {...valid,fallback:'yes'},{...valid,truncated:1},{...valid,events:Array(17).fill(valid.events[0])},
 {...valid,mode:'standard'}];
for(const change of [{rule_id:'__proto__'},{rule_id:'future'},{module:'人物'},{status:'guaranteed'},
 {module:'场景'},
 {fields:['自由提示词']},{fields:['基础姿态','基础姿态']},{before:{基础姿态:'x'.repeat(257)}},
 {after:{基础姿态:3}},{after:{unexpected:'value'}},{candidate_count:-1},{candidate_count:1.5}])
 badCoherence.push({...valid,events:[{...valid.events[0],...change}]});
for(const block of badCoherence){
 const base=copy(fixture.coherence[0]);base.coherence_explanation=block;
 const record=add(full,base);assert.equal(record.coherenceStatus,'invalid');assert.equal(record.data.coherence_explanation,undefined);
 assert.equal(record.data.zh,base.zh);assert.deepEqual(copy(record.data.card_candidates),base.card_candidates);
 assert.match(t.coherenceExplanationLines(record,full).join('\n'),/已忽略/);
 assert.match(t.coherenceSummaryLines(record,full).join('\n'),/已忽略/);
 t.showDetails(full);assert.equal(find(full.__vividMusePromptDialog,'协调详情').hidden,true);full.__vividMusePromptDialog.close();
}
const extraCoherence=copy(valid);extraCoherence.private='not kept';extraCoherence.events[0].private='not kept';extraCoherence.loop=extraCoherence;
const parsed=t.parseCoherenceExplanation(extraCoherence,'全部模块');assert.equal(parsed.status,'valid');
assert.equal(parsed.data.private,undefined);assert.equal(parsed.data.events[0].private,undefined);
assert.equal(t.parseCoherenceExplanation(valid,'摄影').status,'invalid');
const oldCoherence=copy(fixture.results[fullKey]);const historical=add(full,oldCoherence);
assert.match(t.coherenceExplanationLines(historical,full).join('\n'),/未提供/);
const mode=full.widgets.find(w=>w.name==='组合协调');mode.value='协调优先';
assert.equal(t.stale(full,historical),true,'old record missing setting is not coherent');
full.inputs=[{name:'组合协调',link:5}];
// A connected input cannot be compared with its hidden widget; other settings may still be stale.
const cleanNode=make(fullKey,fixture.schemas[fullKey]);
const cleanRecord=add(cleanNode,{...oldCoherence,settings:{}});
cleanNode.widgets.find(w=>w.name==='组合协调').value='协调优先';assert.equal(t.stale(cleanNode,cleanRecord),true);
cleanNode.inputs=[{name:'组合协调',link:5}];assert.equal(t.stale(cleanNode,cleanRecord),false);
const finalRecord=add(full,fixture.coherence[0]);valid.events[0].after['基础姿态']='输入被修改';
assert.equal(finalRecord.data.coherence_explanation.events[0].after['基础姿态'],'自然站立');
full.onConfigure({});assert.equal(full.__vividMusePromptHistory.length,0);assert.equal(mutations,0);
console.log(`PASS coherence: ${fixture.coherence.length} real payloads, bilingual dialog, ${badCoherence.length} invalid blocks, export/card preservation, legacy settings and connected inputs. Simulation only.`);
console.log(`PASS random explanation: ${Object.keys(fixture.results).length} real node payloads, 2 languages, ${invalid.length} invalid blocks, old records, frozen history, current locks, export compatibility and no edits. DOM simulation, not browser QA.`);
