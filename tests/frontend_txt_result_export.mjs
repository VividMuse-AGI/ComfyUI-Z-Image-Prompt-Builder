import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
// Real backend metadata; index 4 with count 1 is deliberately legal.
const fixtures=JSON.parse(execFileSync(process.env.PYTHON||'python',['-c',`
import json
from txt_selection import select_txt
from modular_nodes import TXT_MODULE_TYPES
from nodes import MAX_SEED
body='  中文\\r\\n\\r\\nEnglish 😀 <img src=x>  '
def run(kind,empty=False):
    entries=[] if empty else [{'title':'duplicate','prompt':body,'module':'人物' if i<4 else '自定义','tags':[]} for i in range(5)]
    return select_txt({'选择模式':'随机抽取','随机种子':MAX_SEED,'模块类型':'自定义','词库数据':json.dumps({'version':1,'kind':kind,'entries':entries})},kind=kind,modules=TXT_MODULE_TYPES,max_seed=MAX_SEED)[1]
print(json.dumps({'prompt':run('prompt'),'module':run('module'),'empty':run('module',True)}))
`],{cwd:root,encoding:'utf8'}));
const plain=v=>JSON.parse(JSON.stringify(v));
function harness(reverse=false) {
  const listeners=new Map(),extensions=[],downloads=[],revoked=[];
  let copied=null,copyImpl=async s=>{copied=s;},blob,clickFails=false;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.listeners={};this.style={};this.textContent='';}
    append(...xs){for(const x of xs){this.children.push(x);x.parent=this;}}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
    async fire(k,event={}){for(const fn of this.listeners[k]||[])await fn(event);}
    click(){if(this.disabled)return;if(this.tag==='a'){if(clickFails)throw Error('download blocked');downloads.push({name:this.download,blob});}else return this.fire('click');}
    showModal(){this.open=true;}
    close(){this.open=false;this.fire('close');}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.removed=true;}
  }
  let queueCount=0;
  const app={graph:null,registerExtension:e=>extensions.push(e),async graphToPrompt(){
    const output={};const visit=(g,p='')=>{for(const n of g.nodes||[]){const path=p?`${p}:${n.id}`:String(n.id);output[path]={class_type:n.comfyClass};if(n.subgraph)visit(n.subgraph,path);}};
    visit(app.graph);return {output};
  }};
  const api={addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,[]);listeners.get(k).push(fn);},
    async queuePrompt(_n,_p,options={}){queueCount++;return options.response?options.response():{prompt_id:options.id};}};
  const ctx=vm.createContext({app,api,console,Blob,URL:{createObjectURL(b){blob=b;return 'blob:fixture';},revokeObjectURL:u=>revoked.push(u)},
    navigator:{clipboard:{writeText:s=>copyImpl(s)}},setTimeout:fn=>fn(),document:{createElement:t=>new Element(t),body:new Element('body')}});
  for(const name of reverse?['txt_selection','prompt_diagnostics']:['prompt_diagnostics','txt_selection']) {
    const code=fs.readFileSync(new URL(`../web/js/${name}.js`,import.meta.url),'utf8')
      .replace('import { app } from "../../scripts/app.js";','').replace('import { api } from "../../scripts/api.js";','');
    vm.runInContext(`(()=>{${code}\n${name==='txt_selection'?'globalThis.txt={selectionSnapshot,showResult,submissions,early};':''}})()`,ctx);
  }
  extensions.forEach(e=>e.init?.());
  const graph=nodes=>({nodes,getNodeById:id=>nodes.find(n=>String(n.id)===String(id)),setDirtyCanvas(){}});
  function node(kind='prompt',id=1){const n={id,comfyClass:`VividMuse_ZImageTxt${kind==='module'?'Module':'Prompt'}Library`,widgets:[],properties:{},size:[360,200],
    addWidget(type,name,value,callback,options={}){const w={type,name,value,callback,options};this.widgets.push(w);return w;},
    setDirtyCanvas(){},computeSize(){return this.size;},setSize(s){this.size=s;}};
    for(const [name,value] of [['选择模式','随机抽取'],['随机种子',0],['词库数据',''],['自由提示词','draft'],['模块提示词','module draft'],['模块类型','人物']])n.addWidget('text',name,value,null,{});
    extensions.forEach(e=>e.nodeCreated?.(n));return n;}
  const emit=(name,detail)=>{for(const fn of listeners.get(name)||[])fn({detail});};
  const execute=(id,raw,path='1')=>emit('executed',{prompt_id:id,node:path,output:{vividmuse_txt_selection:[raw]}});
  const queue=async(id,options={})=>api.queuePrompt(0,await app.graphToPrompt(),{id,...options});
  return {app,api,ctx,graph,node,emit,execute,queue,downloads,revoked,
    get copied(){return copied;},get queueCount(){return queueCount;},set copyImpl(fn){copyImpl=fn;},set clickFails(v){clickFails=v;}};
}
const all=e=>[e,...e.children.flatMap(all)];
const button=(p,name)=>all(p).find(e=>e.tag==='button'&&e.textContent===name);
const status=p=>all(p).find(e=>e.attributes.role==='status').textContent;
const state=n=>JSON.stringify({properties:n.properties,widgets:n.widgets.filter(w=>w.serialize!==false).map(w=>[w.name,w.value]),size:n.size});
for(const reverse of [false,true]) {
  const h=harness(reverse),n=h.node();h.app.graph=h.graph([n]);
  let panel=h.ctx.txt.showResult(n);assert.ok(button(panel,'复制抽中正文').disabled&&button(panel,'导出抽取记录').disabled);panel.close();
  n.onExecuted({vividmuse_txt_selection:[fixtures.prompt]});assert.equal(n.__txtSelectionResult,undefined);
  await h.queue('A');h.execute('A',fixtures.prompt);
  assert.equal(h.queueCount,1,'observers must not submit extra jobs');
  assert.equal(n.__txtSelectionResult.seed,'18446744073709551615');
  const before=state(n);panel=h.ctx.txt.showResult(n);
  await button(panel,'复制抽中正文').click();assert.equal(h.copied,fixtures.prompt.prompt);
  await button(panel,'导出抽取记录').click();
  const exported=JSON.parse(await h.downloads.at(-1).blob.text());
  assert.equal(exported.prompt,fixtures.prompt.prompt);assert.equal(exported.source.node_type,n.comfyClass);
  assert.deepEqual(Object.keys(exported).sort(),['kind','version','source','algorithm','seed','module','status','count','index','title','prompt','content_snapshot_only','includes_upstream_workflow'].sort());
  assert.equal(h.revoked.length,1);assert.equal(state(n),before);
  // Current inputs and later executions do not affect an open frozen panel.
  n.widgets.find(w=>w.name==='随机种子').value=77;
  await h.queue('B');const changed={...fixtures.prompt,prompt:'new body',seed:'77'};h.execute('B',changed);changed.prompt='mutated externally';
  await button(panel,'复制抽中正文').click();assert.equal(h.copied,fixtures.prompt.prompt);
  h.execute('A',{...fixtures.prompt,prompt:'late body'});assert.equal(n.__txtSelectionResult.prompt,'new body');
  panel.close();panel=h.ctx.txt.showResult(n);await button(panel,'复制抽中正文').click();assert.equal(h.copied,'new body');
  h.execute('foreign',{...fixtures.prompt,prompt:'foreign body'});assert.equal(n.__txtSelectionResult.prompt,'new body');
  // Clipboard errors retain the literal selectable text, not a fake success.
  h.copyImpl=async()=>{throw Error('denied');};await button(panel,'复制抽中正文').click();assert.match(status(panel),/复制失败/);
  assert.ok(all(panel).some(e=>e.tag==='pre'&&e.textContent==='new body'));
  h.clickFails=true;await button(panel,'导出抽取记录').click();assert.match(status(panel),/导出失败/);assert.equal(h.revoked.length,2);h.clickFails=false;
  let finish;h.copyImpl=()=>new Promise(r=>finish=r);const pendingCopy=button(panel,'复制抽中正文').click();const oldStatus=status(panel);panel.close();finish();await pendingCopy;assert.equal(status(panel),oldStatus);
  // Successful cached UI replay uses a fresh, locally associated submission.
  await h.queue('cache');h.emit('execution_cached',{prompt_id:'cache',nodes:['1']});h.execute('cache',fixtures.prompt);assert.equal(n.__txtSelectionResult.prompt,fixtures.prompt.prompt);
  // An executed event can precede the HTTP response.
  await h.queue('early',{response(){h.execute('early',fixtures.prompt);return {prompt_id:'early'};}});assert.equal(h.ctx.txt.early.size,0);
  // Earlier submission completes last, without replacing the new result.
  await h.queue('old');await h.queue('new');h.execute('new',{...fixtures.prompt,prompt:'newest'});h.execute('old',fixtures.prompt);assert.equal(n.__txtSelectionResult.prompt,'newest');
  await h.queue('abort');h.emit('execution_interrupted',{prompt_id:'abort'});h.execute('abort',fixtures.prompt);assert.equal(n.__txtSelectionResult.prompt,'newest');
  await assert.rejects(h.queue('failed',{response(){throw Error('queue failed');}}));assert.equal(h.ctx.txt.early.size,0);
  // Deleted/reconfigured/replaced nodes and graph switching invalidate ownership.
  for(const invalidate of [()=>{h.app.graph=h.graph([h.node()]);},()=>n.onConfigure({}),()=>n.onRemoved(),()=>{h.app.graph=h.graph([]);}]) {
    h.app.graph=h.graph([n]);await h.queue('invalid-'+h.queueCount);const id='invalid-'+(h.queueCount-1);invalidate();const previous=n.__txtSelectionResult;h.execute(id,fixtures.prompt);assert.equal(n.__txtSelectionResult,previous);
  }
  // Subgraph paths resolve; shared instances are not attributed ambiguously.
  const nested=h.node();const sub=h.graph([nested]);h.app.graph=h.graph([{id:8,subgraph:sub}]);await h.queue('nested');h.execute('nested',fixtures.prompt,'8:1');assert.ok(nested.__txtSelectionResult);
  nested.__txtSelectionResult=null;h.app.graph=h.graph([{id:8,subgraph:sub},{id:9,subgraph:sub}]);await h.queue('shared');h.execute('shared',fixtures.prompt,'8:1');assert.equal(nested.__txtSelectionResult,null);
  const mod=h.node('module');h.app.graph=h.graph([mod]);await h.queue('module');h.execute('module',fixtures.module);
  assert.equal(mod.__txtSelectionResult.index,4);assert.equal(mod.__txtSelectionResult.count,1);
  await h.queue('empty');h.execute('empty',fixtures.empty);panel=h.ctx.txt.showResult(mod);assert.ok(button(panel,'复制抽中正文').disabled);await button(panel,'导出抽取记录').click();assert.equal(JSON.parse(await h.downloads.at(-1).blob.text()).status,'empty');panel.close();
  for(const seed of ['0','9007199254740991','9007199254740993','18446744073709551615'])assert.equal(h.ctx.txt.selectionSnapshot(n.comfyClass,{...fixtures.prompt,seed}).seed,seed);
  for(const bad of [{seed:42},{seed:'18446744073709551616'},{index:undefined},{algorithm:'unknown'},{count:0},{status:'selected',prompt:' '},{status:'empty',count:0,index:null},{module:'wrong'}])assert.throws(()=>h.ctx.txt.selectionSnapshot(n.comfyClass,{...fixtures.prompt,...bad}));
  const safe=h.ctx.txt.selectionSnapshot(n.comfyClass,{...fixtures.prompt,index:null,secret:'must not export'});assert.equal(safe.index,null);assert.equal(safe.secret,undefined);
  // Missing/invalid metadata must disable export instead of showing an older success.
  await h.queue('bad');h.execute('bad',{...fixtures.module,seed:42});assert.equal(mod.__txtSelectionResult,null);
  panel=h.ctx.txt.showResult(mod);assert.ok(button(panel,'导出抽取记录').disabled);panel.close();
  // Near-limit literal text, repeated download, unavailable APIs and modal isolation.
  const longBody='中'.repeat(19970)+'\r\n\r\n😀 <img src=x>  ';
  await h.queue('long');h.execute('long',{...fixtures.module,prompt:longBody});
  panel=h.ctx.txt.showResult(mod);
  const downloadsBefore=h.downloads.length;
  await button(panel,'导出抽取记录').click();await button(panel,'导出抽取记录').click();
  assert.equal(h.downloads.length,downloadsBefore+2);
  assert.equal(JSON.parse(await h.downloads.at(-1).blob.text()).prompt,longBody);
  assert.equal(h.downloads.at(-1).name,'vividmuse-txt-selection-result.json');
  assert.ok(!all(panel).some(e=>e.tag==='a'),'download links must be removed');
  const clipboard=h.ctx.navigator.clipboard;h.ctx.navigator.clipboard=undefined;
  await button(panel,'复制抽中正文').click();assert.match(status(panel),/复制失败/);h.ctx.navigator.clipboard=clipboard;
  const BlobType=h.ctx.Blob;h.ctx.Blob=class {constructor(){throw Error('blob failed');}};
  await button(panel,'导出抽取记录').click();assert.match(status(panel),/导出失败/);h.ctx.Blob=BlobType;
  let stopped=0,prevented=0;
  for(const type of ['wheel','copy','cut','paste','keyup'])await panel.fire(type,{stopPropagation(){stopped++;}});
  assert.equal(stopped,5);
  await panel.fire('keydown',{key:'Escape',isComposing:true,stopPropagation(){stopped++;},preventDefault(){prevented++;}});
  assert.ok(panel.open);assert.equal(prevented,0);
  await panel.fire('keydown',{key:'Escape',stopPropagation(){stopped++;},preventDefault(){prevented++;}});
  assert.ok(panel.removed);assert.equal(prevented,1);
  for(let i=0;i<140;i++)await h.queue('bound-'+i);assert.ok(h.ctx.txt.submissions.size<=128);
}
console.log('PASS TXT results: backend fixtures, both observer orders, ownership/cache/races, snapshots, raw text, uint64, empty/invalid records, clipboard failure, download cleanup and no business-state mutation.');
