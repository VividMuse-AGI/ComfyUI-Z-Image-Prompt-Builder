import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";

const read = name => fs.readFileSync(new URL(`../web/js/${name}.js`, import.meta.url), "utf8");
const context = vm.createContext({crypto: webcrypto, TextEncoder, console});
vm.runInContext(read("library_discovery_core").replaceAll("export ", "")
  + "\nglobalThis.core={filterRecords,makeTxtRecords,LibraryPreferences,PREFERENCE_KEY};", context);
const {filterRecords, makeTxtRecords, LibraryPreferences, PREFERENCE_KEY} = context.core;
const asJson = x => JSON.parse(JSON.stringify(x));
const data = [
  {id:"b:pose:a", module:"姿态动作",field:"手部动作", title:"托腮",titleEn:"Resting cheek",zh:"手掌轻托脸颊",en:"hand supporting cheek",aliases:["托下巴"],tags:["柔和"]},
  {id:"b:clothing:a", module:"服装",field:"上装类型", title:"衬衫",titleEn:"Shirt",zh:"白色棉质衬衫",en:"white cotton shirt",tags:["日常"]},
  {id:"b:camera:a", module:"摄影",field:"机位", title:"平视",titleEn:"Eye Level",zh:"平视机位",en:"eye-level camera",tags:[]},
];
assert.deepEqual(asJson(filterRecords(data,{query:"  HAND cheek  "})), [data[0]]);
assert.deepEqual(asJson(filterRecords(data,{query:"托下巴"})), [data[0]]);
assert.equal(filterRecords(data,{query:"衬衫",module:"姿态动作"}).length,0);
assert.equal(filterRecords(data,{query:"[.*(+"}).length,0);
assert.equal(filterRecords(data,{query:"不存在"}).length,0);
assert.equal(filterRecords(data,{query:"  "}).length,3);
assert.equal(filterRecords(data,{tags:["柔和","日常"]}).length,2);
assert.equal(filterRecords(data,{tags:["日常"],untagged:true}).length,2);
assert.deepEqual(asJson(filterRecords(data,{tags:["日常"],query:"white",module:"服装"})),[data[1]]);
const before = JSON.stringify(data);
filterRecords(data,{view:"recent",recent:[data[1].id,data[0].id]});
assert.equal(JSON.stringify(data),before, "Filtering must not change input/random candidate order");

const entries = [{title:"相同",prompt:"正文甲",tags:["一"]},{title:"相同",prompt:"正文乙",tags:[]},
  {module:"人物",title:"相同",prompt:"正文甲",tags:["一"]}];
const records = await makeTxtRecords("module","sample.txt",entries);
assert.equal(new Set(records.map(r=>r.id)).size,3);
assert.deepEqual(asJson(records.map(r=>r.id)),asJson((await makeTxtRecords("module","sample.txt",entries)).map(r=>r.id)));
assert.deepEqual(asJson(records.map(r=>r.id).sort()),asJson((await makeTxtRecords("module","sample.txt",[...entries].reverse())).map(r=>r.id).sort()));
assert.notEqual(records[0].id,(await makeTxtRecords("module","other.txt",entries))[0].id);
assert.notEqual(records[0].id,(await makeTxtRecords("prompt","sample.txt",entries))[0].id);
assert.notEqual(records[0].id,(await makeTxtRecords("module","sample.txt",[{...entries[0],prompt:"修改"},...entries.slice(1)]))[0].id);
assert.equal(new Set((await makeTxtRecords("prompt","same.txt",[entries[0],entries[0]])).map(r=>r.id)).size,2);

const storage = {getItem() {return this.value},setItem(key,value) {assert.equal(key,PREFERENCE_KEY); this.value=value}};
const p = new LibraryPreferences(storage);
p.toggle(records[0].id); assert.equal(p.favorites.length,1);
p.toggle(records[0].id); assert.equal(p.favorites.length,0);
p.toggle(records[0].id); p.used(data[0].id);p.used(data[1].id);p.used(data[0].id);
assert.deepEqual(asJson(p.recent),[data[0].id,data[1].id]);
for (let i=0;i<25;i++) p.used(`b:field:value${i}`);
assert.equal(p.recent.length,20);
assert.equal(p.recent[0],"b:field:value24");
const restored = new LibraryPreferences(storage);
assert.deepEqual(asJson(restored.favorites),asJson(p.favorites));
const exported = p.exportFavorites();
assert.ok(!exported.includes("正文") && !exported.includes("sample.txt"), "Export must contain opaque references only");
const imported = new LibraryPreferences(null);imported.importFavorites(exported);
assert.deepEqual(asJson(imported.favorites),asJson(p.favorites));
for (const raw of ["broken",JSON.stringify({version:2,kind:"vividmuse-favorites",favorites:[]}),
  JSON.stringify({version:1,kind:"vividmuse-favorites",favorites:["bad"]}),
  JSON.stringify({version:1,kind:"vividmuse-favorites",favorites:[],body:"private"})]) {
  const old = JSON.stringify(imported.favorites); assert.throws(()=>imported.importFavorites(raw));
  assert.equal(JSON.stringify(imported.favorites),old);
}
const denied = new LibraryPreferences({getItem(){throw Error("denied")},setItem(){throw Error("denied")}});
denied.toggle(data[0].id);denied.used(data[0].id); assert.equal(denied.warning,true);
assert.equal(denied.favorites.length,1); assert.equal(denied.recent.length,1);
assert.equal(filterRecords(records,{view:"favorites",favorites:["b:obsolete:value"]}).length,0);

// Exercise real catalog and widget callbacks, not a second implementation of the mapper.
context.app = {registerExtension(ext){this.extension=ext}};
vm.runInContext(read("i18n_catalog").replace("export const EN_CATALOG", "globalThis.EN_CATALOG"),context);
vm.runInContext(read("library_catalog").replace("export const LIBRARY_CATALOG", "globalThis.LIBRARY_CATALOG"),context);
context.setTimeout = () => {};
vm.runInContext(read("library_discovery").replace(/^import .*;\r?\n/gmu, "").replaceAll("export ","")
  + "\nglobalThis.discovery={builtinRecords,applyRecord};",context);
for (const [module, fields] of Object.entries(context.LIBRARY_CATALOG.modules)) {
  const node={comfyClass:"VividMuse_ZImageChinesePromptBuilder", __vividMuseModuleWidget:{value:module},widgets:[]};
  let callbacks=0;
  node.widgets=fields.map(name=>({name,value:"不使用",options:{values:context.LIBRARY_CATALOG.fields[name].map(r=>r.value)},callback(){callbacks++}}));
  const records=context.discovery.builtinRecords(node);
  assert.ok(records.length,module);
  const selected=records.at(-1), orig=node.widgets.map(w=>w.value);
  assert.equal(context.discovery.applyRecord(node,selected),true);
  assert.equal(callbacks,1);
  for(let i=0;i<node.widgets.length;i++) assert.equal(node.widgets[i].value,node.widgets[i].name===selected.field?selected.value:orig[i]);
  node.widgets.find(w=>w.name===selected.field).hidden=true;
  assert.equal(context.discovery.applyRecord(node,selected),false);
}
const serialNode={comfyClass:"VividMuse_ZImageCameraModule",widgets:[{name:"机位",value:"平视",serialize:true,options:{values:["平视"]}}],
  addWidget(type,name,value,callback,options){const w={type,name,value,callback,options};this.widgets.push(w);return w}};
context.app.extension.nodeCreated(serialNode);
context.app.extension.loadedGraphNode(serialNode);
assert.equal(serialNode.widgets.length,2,"Helper must not be duplicated");
const raw={widgets_values:serialNode.widgets.map(w=>w.value)};serialNode.onSerialize(raw);
assert.deepEqual(asJson(raw.widgets_values),["平视"]);
const compact={widgets_values:["平视"]};serialNode.onSerialize(compact);
assert.deepEqual(asJson(compact.widgets_values),["平视"]);
const large=Array.from({length:500},(_,i)=>({title:`条目${i}`,prompt:`窗边自然光${i}`,tags:["测试"]}));
const largeRecords=await makeTxtRecords("prompt","500.txt",large);
assert.equal(filterRecords(largeRecords,{query:"自然光499"})[0].title,"条目499");
// Test the actual dialog implementation with a DOM double that rejects HTML writes.
class Element {
  constructor(tag) { this.tagName=tag; this.children=[];this.style={};this.attrs={};this.events={};this.value="";this.textContent=""; }
  set innerHTML(_) { throw Error("User text must not be interpreted as HTML"); }
  setAttribute(key,value) {this.attrs[key]=value}
  append(...children) { for(const child of children) {child.parent=this;this.children.push(child);if(this.tagName==="select" && this.children.length===1)this.value=child.value} }
  replaceChildren(...children) {this.children=[];this.append(...children)}
  addEventListener(name,fn) {this.events[name]=fn}
  showModal() {this.open=true}
  close() {this.open=false;this.onclose?.()}
  remove() {if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this)}
  focus() {}
}
const body=new Element("body");
context.document={body,createElement:tag=>new Element(tag),createTextNode:content=>({textContent:content})};
const descendants=root=>[root,...(root.children||[]).flatMap(descendants)];
const byLabel=(root,label)=>descendants(root).find(e=>e.attrs?.["aria-label"]===label);
const byText=(root,label)=>descendants(root).find(e=>e.tagName==="button" && e.textContent===label);
const dialogNode={comfyClass:"VividMuse_ZImageCameraModule",widgets:[{name:"机位",value:"不使用",options:{values:context.LIBRARY_CATALOG.fields["机位"].map(r=>r.value)},callback(){this.calls=(this.calls||0)+1}}],
  __vividMusePromptDiscovery:{entries:()=>[{title:'<img src=x onerror=alert(1)>',prompt:"真实测试正文",tags:["标签甲"]}],fileName:()=>"public-fixture.txt",apply:()=>false}};
let dialog=await context.openDiscovery(dialogNode);
const saved=JSON.stringify(dialogNode.widgets.map(w=>w.value));
const query=byLabel(dialog,"搜索词");query.value="不存在 [.*(+";query.oninput();
assert.equal(JSON.stringify(dialogNode.widgets.map(w=>w.value)),saved);
assert.ok(byText(dialog,"应用所选条目").disabled);
query.value="平视";query.oninput();
const row=byText(dialog,"机位 · 平视");assert.ok(row);row.onclick();
assert.equal(JSON.stringify(dialogNode.widgets.map(w=>w.value)),saved,"Selecting previews only");
byText(dialog,"应用所选条目").onclick();
assert.equal(dialogNode.widgets[0].value,"平视");assert.equal(dialogNode.widgets[0].calls,1);
const source=byLabel(dialog,"素材来源"); source.value="prompt";await source.onchange();
query.value="";query.oninput();
assert.ok(byText(dialog,'<img src=x onerror=alert(1)>'));
byText(dialog,'<img src=x onerror=alert(1)>').onclick();byText(dialog,"应用所选条目").onclick();
assert.ok(byLabel(dialog,"搜索结果"));
let stopped=false,prevented=false;
dialog.events.keydown({key:"Escape",isComposing:true,stopPropagation(){stopped=true},preventDefault(){throw Error("Do not interrupt IME composition")}});
assert.equal(dialog.open,true);
for(const name of ["copy","cut","paste"]) {
  let isolated=false;dialog.events[name]({stopPropagation(){isolated=true}});assert.equal(isolated,true);
}
dialog.events.keydown({key:"Escape",stopPropagation(){stopped=true},preventDefault(){prevented=true}});
assert.ok(stopped && prevented);assert.equal(body.children.length,0);
// An async refresh finishing after close must not resurrect a modal or write inputs.
dialog=await context.openDiscovery(dialogNode);byLabel(dialog,"素材来源").value="prompt";
const pending=byLabel(dialog,"素材来源").onchange();dialog.close();await pending;
assert.equal(body.children.length,0);assert.equal(dialogNode.widgets[0].calls,1);
dialog=await context.openDiscovery(serialNode);serialNode.onRemoved();
assert.equal(body.children.length,0,"Removing the owning node closes its panel");
const t0=performance.now();
for(let i=0;i<100;i++) filterRecords(largeRecords,{query:`自然光${i%10}`,tags:["测试"]});
console.log(`500-entry pure-filter mean: ${((performance.now()-t0)/100).toFixed(2)} ms (not browser paint latency)`);
console.log("Library discovery: bilingual queries, tag combinations, stable TXT identity, preferences, eight-module callbacks, serialization, dialog apply/cancel, literal HTML, close races, owner removal and 500 entries OK");
