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
  parseTxtModuleLibrary, importTxtModuleFile, applySelectedModuleEntry,
  clearCurrentModule, clearModuleLibrary,
};
`;
vm.runInThisContext(source, { filename: sourcePath.pathname });
const api = globalThis.__txtModuleLibraryApi;
assert.ok(extension);

const modules = ["画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现"];
const inputModules = ["基础画面", "人物设定", "头发", "穿搭", "动作", "环境", "镜头", "光影色彩"];
const targets = {
  "画面基础": "用户画面基础片段",
  "人物": "用户人物片段",
  "发型": "用户发型片段",
  "服装": "用户服装片段",
  "姿态动作": "用户姿态动作片段",
  "场景": "用户场景片段",
  "摄影": "用户摄影片段",
  "视觉表现": "用户视觉表现片段",
};
const text = inputModules.map((moduleName, index) => `
## ${modules[index]}测试条目
模块：${moduleName}
标签：测试, ${modules[index]}
这是${modules[index]}自定义内容。
---`).join("\n");

function backendWidget(name) {
  return { name, type: "text", value: "", options: {}, computeSize() { return [360, 24]; } };
}
function makeNode() {
  return {
    comfyClass: "VividMuse_ZImageChinesePromptBuilder",
    properties: {},
    widgets: [backendWidget("自由提示词"), ...Object.values(targets).map(backendWidget)],
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

const parsed = api.parseTxtModuleLibrary(text);
assert.deepEqual(parsed.map((entry) => entry.module), modules);
assert.throws(() => api.parseTxtModuleLibrary("每行一条不适用于模块词库"), /分块格式/);
assert.throws(() => api.parseTxtModuleLibrary("## 缺少模块\n正文"), /缺少有效/);
assert.throws(() => api.parseTxtModuleLibrary("## 错误模块\n模块：声音\n正文"), /缺少有效/);

const node = makeNode();
extension.nodeCreated(node);
for (const name of [
  "🧩 TXT模块词库（全模块）", "导入结构化模块TXT词库", "词库模块",
  "模块词库条目", "应用到画面基础模块（当前：未设置）",
  "清空当前用户模块", "清除模块词库",
]) {
  const helper = widget(node, name);
  assert.equal(helper.serialize, false);
  assert.equal(helper.options.serialize, false);
}
for (const targetName of Object.values(targets)) {
  assert.equal(widget(node, targetName).hidden, true);
  assert.equal(widget(node, targetName).serialize, undefined);
}

await api.importTxtModuleFile(node, {
  name: "摄影师全模块词库.txt", size: 1024, async text() { return text; },
});
assert.equal(node.properties.vividMuseTxtModuleLibrary.entries.length, 8);
const moduleWidget = widget(node, "词库模块");
for (const moduleName of modules) {
  moduleWidget.value = moduleName;
  moduleWidget.callback(moduleName);
  assert.deepEqual(widget(node, "模块词库条目").options.values, [`${moduleName}测试条目`]);
  api.applySelectedModuleEntry(node);
  assert.equal(widget(node, targets[moduleName]).value, `这是${moduleName}自定义内容。`);
  assert.match(node.__vividMuseTxtModuleApplyButton.name, new RegExp(moduleName));
}

moduleWidget.value = "摄影";
moduleWidget.callback("摄影");
api.clearCurrentModule(node);
assert.equal(widget(node, targets["摄影"]).value, "");
assert.notEqual(widget(node, targets["人物"]).value, "");
api.clearModuleLibrary(node);
assert.equal(node.properties.vividMuseTxtModuleLibrary, undefined);
assert.notEqual(widget(node, targets["人物"]).value, "");
console.log("frontend TXT full module library ok");
