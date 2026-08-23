import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/txt_module_library.js", import.meta.url);
let extension = null;
globalThis.__txtModuleControlsApp = {
  graph: { setDirtyCanvas() {} },
  registerExtension(value) { extension = value; },
};
const source = fs.readFileSync(sourcePath, "utf8").replace(
  'import { app } from "../../scripts/app.js";',
  "const app = globalThis.__txtModuleControlsApp;",
);
vm.runInThisContext(source, { filename: sourcePath.pathname });

const modules = ["画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现"];
const targets = [
  "用户画面基础片段", "用户人物片段", "用户发型片段", "用户服装片段",
  "用户姿态动作片段", "用户场景片段", "用户摄影片段", "用户视觉表现片段",
  "用户自定义片段",
];
const baseWidget = (name, type = "text") => ({
  name, type, value: "", options: {}, computeSize() { return [360, 24]; },
});
const node = {
  comfyClass: "VividMuse_ZImageChinesePromptBuilder",
  properties: {},
  widgets: [
    baseWidget("自由提示词"), ...targets.map((name) => baseWidget(name)),
    baseWidget("清空结构化模块", "button"), baseWidget("全部清空", "button"),
    baseWidget("仅启用当前模块", "button"),
  ],
  __vividMuseModuleWidget: { value: "人物" },
  addWidget(type, name, value, callback, options = {}) {
    const widget = { type, name, value, callback, options, computeSize() { return [360, 24]; } };
    this.widgets.push(widget);
    return widget;
  },
  computeSize() { return [360, 400]; }, setSize() {}, setDirtyCanvas() {},
};
const widget = (name) => node.widgets.find((item) => item.name === name);
const fillTargets = () => targets.forEach((name, index) => { widget(name).value = `模块${index}`; });

extension.nodeCreated(node);
fillTargets();
widget("仅启用当前模块").callback();
assert.equal(widget("用户人物片段").value, "模块1");
for (const name of targets.filter((item) => item !== "用户人物片段")) {
  assert.equal(widget(name).value, "");
}

for (const moduleName of modules) {
  fillTargets();
  node.__vividMuseModuleWidget.value = moduleName;
  widget("仅启用当前模块").callback();
  assert.equal(targets.filter((name) => widget(name).value !== "").length, 1);
}
fillTargets();
widget("清空结构化模块").callback();
assert.equal(targets.every((name) => widget(name).value === ""), true);
fillTargets();
widget("全部清空").callback();
assert.equal(targets.every((name) => widget(name).value === ""), true);
console.log("frontend TXT full module control integration ok");
