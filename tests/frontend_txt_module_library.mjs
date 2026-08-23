import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/txt_module_library.js", import.meta.url);
let extension = null;
globalThis.__txtModuleTestApp = {
  graph: { setDirtyCanvas() {} },
  registerExtension(value) { extension = value; },
};
let source = fs.readFileSync(sourcePath, "utf8").replace(
  'import { app } from "../../scripts/app.js";',
  "const app = globalThis.__txtModuleTestApp;",
);
source += `
globalThis.__txtModuleLibraryApi = {
  parseTxtModuleLibrary,
  importTxtModuleFile,
  applySelectedModuleEntry,
  clearCurrentModule,
  clearModuleLibrary,
  syncModuleLibraryControls,
};
`;
vm.runInThisContext(source, { filename: sourcePath.pathname });
const api = globalThis.__txtModuleLibraryApi;
assert.ok(extension);

function makeNode() {
  const makeBackendWidget = (name) => ({
    name,
    type: "text",
    value: "",
    options: {},
    computeSize() { return [360, 24]; },
  });
  return {
    comfyClass: "VividMuse_ZImageChinesePromptBuilder",
    properties: {},
    widgets: [
      makeBackendWidget("自由提示词"),
      makeBackendWidget("用户人物片段"),
      makeBackendWidget("用户姿态动作片段"),
    ],
    addWidget(type, name, value, callback, options = {}) {
      const widget = { type, name, value, callback, options, computeSize() { return [360, 24]; } };
      this.widgets.push(widget);
      return widget;
    },
    computeSize() { return [360, 400]; },
    setSize() {},
    setDirtyCanvas() {},
  };
}

function widget(node, name) {
  const found = node.widgets.find((item) => item.name === name);
  assert.ok(found, `missing widget: ${name}`);
  return found;
}

const text = `
## 清透日系女性
模块：人物
标签：东亚, 清透
一位20岁左右的东亚成年女性，清透裸粉妆。
---
## 成熟都市女性
模块：人物设定
一位30岁左右的东亚成年女性，妆容克制精致。
---
## 倚靠窗边回望
模块：姿态动作
人物侧身倚靠窗边，头部回转看向镜头。
---
## 坐姿前倾交流
模块：动作
人物坐在座椅边缘，身体轻微向镜头前倾。
`;
const parsed = api.parseTxtModuleLibrary(text);
assert.equal(parsed.length, 4);
assert.deepEqual(parsed.map((entry) => entry.module), ["人物", "人物", "姿态动作", "姿态动作"]);
assert.deepEqual(parsed[0].tags, ["东亚", "清透"]);
assert.throws(() => api.parseTxtModuleLibrary("每行一条不适用于模块词库"), /分块格式/);
assert.throws(() => api.parseTxtModuleLibrary("## 缺少模块\n正文"), /缺少有效/);
assert.throws(() => api.parseTxtModuleLibrary("## 错误模块\n模块：摄影\n正文"), /缺少有效/);

const node = makeNode();
extension.nodeCreated(node);
for (const name of [
  "🧩 TXT模块词库（人物/动作）",
  "导入人物/动作TXT词库",
  "词库模块",
  "模块词库条目",
  "应用到人物模块（当前：未设置）",
  "清空当前用户模块",
  "清除模块词库",
]) {
  const helper = widget(node, name);
  assert.equal(helper.serialize, false);
  assert.equal(helper.options.serialize, false);
}
assert.equal(widget(node, "用户人物片段").hidden, true);
assert.equal(widget(node, "用户人物片段").serialize, undefined);
assert.equal(widget(node, "用户姿态动作片段").hidden, true);
assert.equal(widget(node, "导入人物/动作TXT词库").hidden, true);

await api.importTxtModuleFile(node, {
  name: "摄影师人物动作库.txt",
  size: 256,
  async text() { return text; },
});
assert.equal(node.properties.vividMuseTxtModuleLibrary.entries.length, 4);
assert.deepEqual(widget(node, "模块词库条目").options.values, ["清透日系女性", "成熟都市女性"]);
widget(node, "模块词库条目").value = "成熟都市女性";
api.applySelectedModuleEntry(node);
assert.equal(widget(node, "用户人物片段").value, "一位30岁左右的东亚成年女性，妆容克制精致。");
assert.match(node.__vividMuseTxtModuleApplyButton.name, /成熟都市女性/);

const moduleWidget = widget(node, "词库模块");
moduleWidget.value = "姿态动作";
moduleWidget.callback(moduleWidget.value);
assert.deepEqual(widget(node, "模块词库条目").options.values, ["倚靠窗边回望", "坐姿前倾交流"]);
widget(node, "模块词库条目").value = "坐姿前倾交流";
api.applySelectedModuleEntry(node);
assert.equal(widget(node, "用户姿态动作片段").value, "人物坐在座椅边缘，身体轻微向镜头前倾。");
assert.equal(widget(node, "用户人物片段").value.includes("30岁左右"), true);

api.clearCurrentModule(node);
assert.equal(widget(node, "用户姿态动作片段").value, "");
assert.notEqual(widget(node, "用户人物片段").value, "");
api.clearModuleLibrary(node);
assert.equal(node.properties.vividMuseTxtModuleLibrary, undefined);
assert.notEqual(widget(node, "用户人物片段").value, "");

await assert.rejects(
  api.importTxtModuleFile(node, { name: "错误.json", size: 2, async text() { return "{}"; } }),
  /只支持.*\.txt/,
);
console.log("frontend TXT person/action module library ok");
