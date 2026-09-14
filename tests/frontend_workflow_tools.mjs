import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({console, setTimeout, clearTimeout});
context.app = {registerExtension(e) { this.extension = e; }, graph: {setDirtyCanvas() {}}};
const toolsSource=fs.readFileSync(new URL("../web/js/workflow_tools.js",import.meta.url),"utf8")
  .replace('import { app } from "../../scripts/app.js";',"").replaceAll("export function ","function ");
vm.runInContext(toolsSource + "\nglobalThis.api={capturePreset,validatePreset,applyUserPreset,lockFields,findConflicts};",context);
const api=context.api;
const widget=(name,value,choices)=>({name,value,options:choices?{values:choices}:{}});
const node={comfyClass:"VividMuse_ZImageChinesePromptBuilder",properties:{},
  widgets:[widget("预设","test",["test"]),widget("自由提示词","private custom text"),
    widget("拼接位置","结构化模块在前",["结构化模块在前","自由提示词在前"]),
    widget("写真大类","自然",["跟随预设","随机抽取","不使用","自然","城市"]),
    widget("写真主题","树林",["跟随预设","随机抽取","不使用","树林"]),
    widget("鞋履","靴子",["跟随预设","随机抽取","不使用","靴子"]),
    widget("景别","面部特写",["跟随预设","随机抽取","不使用","面部特写"]),
    {name:"button",value:null,serialize:false}],
  onConfigure(){this.configured=true;},setDirtyCanvas(){}};
context.__vividMuseZImagePromptData={PRESETS:{test:{"写真大类":"自然","写真主题":"树林"}},
  THEME_OPTIONS_BY_CATEGORY:{"自然":["树林"],"城市":["街道"]}};
const snapshot=api.capturePreset(node,"test preset");
node.widgets[1].value="changed";
api.applyUserPreset(node,JSON.parse(JSON.stringify(snapshot)));
assert.equal(node.widgets[1].value,"private custom text");
assert.ok(node.configured);
assert.equal(Object.hasOwn(snapshot.values,"button"),false);
const before=JSON.stringify(node.widgets);
assert.throws(()=>api.applyUserPreset(node,{...snapshot,values:{...snapshot.values,"景别":"invalid"}}));
assert.equal(JSON.stringify(node.widgets),before);
assert.throws(()=>api.applyUserPreset(node,{...snapshot,type:"Other"}));
api.lockFields(node,["写真主题"]);
assert.deepEqual(Array.from(node.properties.vividMuseRandomLocks).sort(),["写真主题","写真大类"].sort());
node.widgets[4].value="随机抽取";
assert.throws(()=>api.lockFields(node,["写真主题"]));
assert.ok(api.findConflicts(node).length);
node.widgets[4].value="树林";
node.widgets[4].value="跟随预设";
api.lockFields(node,["写真主题"]);
assert.equal(node.widgets[4].value,"树林");

// Real full-node randomization must preserve locked fields and free text.
const fullContext=vm.createContext({console,Math,Set,Map});
fullContext.app={registerExtension(){},graph:{setDirtyCanvas(){}}};
let fullSource=fs.readFileSync(new URL("../web/js/preset_sync.js",import.meta.url),"utf8")
  .replace('import { app } from "../../scripts/app.js";',"");
vm.runInContext(fullSource+"\nglobalThis.randomApi={prepareRandomCombination,FIELD_NAMES};",fullContext);
const randomNode={properties:{vividMuseRandomLocks:["鞋履"]},widgets:[
  widget("随机范围","跨风格混搭（全部字段）"),widget("随机种子",1),widget("自由提示词","keep me"),
  ...fullContext.randomApi.FIELD_NAMES.map(name=>widget(name,"不使用",["不使用","随机抽取","靴子"]))
],setDirtyCanvas(){}};
randomNode.widgets.find(w=>w.name==="鞋履").value="靴子";
fullContext.randomApi.prepareRandomCombination(randomNode);
assert.equal(randomNode.widgets.find(w=>w.name==="鞋履").value,"靴子");
assert.equal(randomNode.widgets.find(w=>w.name==="自由提示词").value,"keep me");
// A random structure may not erase a locked garment before backend resolution.
randomNode.properties.vividMuseRandomLocks = ["连衣裙类型", "连衣裙颜色"];
randomNode.widgets.find(w => w.name === "连衣裙类型").value = "修身晚礼服";
randomNode.widgets.find(w => w.name === "连衣裙颜色").value = "玄黑色";
fullContext.randomApi.prepareRandomCombination(randomNode);
assert.equal(randomNode.widgets.find(w => w.name === "穿搭结构").value, "随机抽取");
assert.equal(randomNode.widgets.find(w => w.name === "连衣裙类型").value, "修身晚礼服");
assert.equal(randomNode.widgets.find(w => w.name === "连衣裙颜色").value, "玄黑色");
const conflictNode = { properties: {}, widgets: [
  widget("穿搭结构", "随机抽取"), widget("连衣裙类型", "修身晚礼服"),
  widget("上装类型", "垂坠衬衫")
]};
assert.ok(api.findConflicts(conflictNode).some(message => message.includes("穿搭分支")));
conflictNode.widgets[1].value = "不使用";
assert.equal(api.findConflicts(conflictNode).some(message => message.includes("穿搭分支")), false);

// Reserved structured choices must not bypass unrelated combo schemas.
for (const [name, value, choices] of [
  ["输出排版", "按模块分段", ["按模块分段", "连续拼接"]],
  ["预设", "test", ["test"]],
  ["提示词密度", "标准", ["精简", "标准", "详细"]],
  ["拼接位置", "结构化模块在前", ["结构化模块在前", "自由提示词在前"]],
]) {
  const target = { comfyClass: node.comfyClass, properties: {},
    widgets: [widget(name, value, choices)], onConfigure() {}, setDirtyCanvas() {} };
  const entry = api.capturePreset(target, "validation");
  for (const invalid of ["跟随预设", "随机抽取", "不使用"]) {
    const original = JSON.stringify(target);
    assert.throws(() => api.applyUserPreset(target, { ...entry, values: { [name]: invalid } }));
    assert.equal(JSON.stringify(target), original);
  }
  for (const valid of choices) {
    api.applyUserPreset(target, { ...entry, values: { [name]: valid } });
    assert.equal(target.widgets[0].value, valid);
  }
}
for (const special of ["跟随预设", "随机抽取", "不使用"]) {
  api.validatePreset({ ...snapshot, values: { "写真主题": special } }, node);
}
api.validatePreset({ ...snapshot, values: { "写真大类": "城市", "写真主题": "街道" } }, node);
const seedNode = {
  comfyClass: node.comfyClass, properties: {}, setDirtyCanvas() {}, onConfigure() {},
  widgets: [ { name: "随机种子", value: 0, options: { min: 0, max: Number.MAX_SAFE_INTEGER } } ],
};
const seedEntry = api.capturePreset(seedNode, "seed");
for (const value of [0.5, -1, NaN, Infinity, -Infinity, "1", Number.MAX_SAFE_INTEGER + 1]) {
  const before = JSON.stringify(seedNode);
  assert.throws(() => api.applyUserPreset(seedNode, { ...seedEntry, values: { "随机种子": value } }));
  assert.equal(JSON.stringify(seedNode), before);
}
for (const value of [0, 1, Number.MAX_SAFE_INTEGER]) {
  api.applyUserPreset(seedNode, { ...seedEntry, values: { "随机种子": value } });
  assert.equal(seedNode.widgets[0].value, value);
}
for (const ui of [null, false, [], "人物", { unknown: "人物" },
  { vividMuseActiveModule: [] }, { vividMuseOnlyEnabledModule: {} },
  { vividMuseActiveModule: "不存在" }, { vividMuseOnlyEnabledModule: "自定义" }]) {
  const before = JSON.stringify(seedNode);
  assert.throws(() => api.applyUserPreset(seedNode, { ...seedEntry, ui }));
  assert.equal(JSON.stringify(seedNode), before);
}
for (const name of ["画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现"]) {
  const ui = { vividMuseActiveModule: name, vividMuseOnlyEnabledModule: name };
  api.applyUserPreset(seedNode, { ...seedEntry, ui });
  assert.equal(seedNode.properties.vividMuseActiveModule, name);
  assert.equal(seedNode.properties.vividMuseOnlyEnabledModule, name);
}
api.applyUserPreset(seedNode, { ...seedEntry, ui: {} });
api.applyUserPreset(seedNode, { ...seedEntry, ui: undefined });
console.log("workflow tools: preset restore/import validation, locks and conflict checks ok");
