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

const baseWidget = (name, type = "text", callback = undefined) => ({
  name,
  type,
  value: "",
  callback,
  options: {},
  computeSize() { return [360, 24]; },
});
const node = {
  comfyClass: "VividMuse_ZImageChinesePromptBuilder",
  properties: { vividMuseTxtModuleAppliedTitles: { "人物": "人物A", "姿态动作": "动作A" } },
  widgets: [
    baseWidget("自由提示词"),
    baseWidget("用户人物片段"),
    baseWidget("用户姿态动作片段"),
    baseWidget("清空结构化模块", "button"),
    baseWidget("全部清空", "button"),
    baseWidget("仅启用当前模块", "button"),
  ],
  __vividMuseModuleWidget: { value: "人物" },
  addWidget(type, name, value, callback, options = {}) {
    const widget = { type, name, value, callback, options, computeSize() { return [360, 24]; } };
    this.widgets.push(widget);
    return widget;
  },
  computeSize() { return [360, 400]; },
  setSize() {},
  setDirtyCanvas() {},
};
const widget = (name) => node.widgets.find((item) => item.name === name);
const setTargets = () => {
  widget("用户人物片段").value = "用户人物";
  widget("用户姿态动作片段").value = "用户动作";
  node.properties.vividMuseTxtModuleAppliedTitles = { "人物": "人物A", "姿态动作": "动作A" };
};

extension.nodeCreated(node);
setTargets();
widget("仅启用当前模块").callback();
assert.equal(widget("用户人物片段").value, "用户人物");
assert.equal(widget("用户姿态动作片段").value, "");

setTargets();
node.__vividMuseModuleWidget.value = "场景";
widget("仅启用当前模块").callback();
assert.equal(widget("用户人物片段").value, "");
assert.equal(widget("用户姿态动作片段").value, "");

setTargets();
widget("清空结构化模块").callback();
assert.equal(widget("用户人物片段").value, "");
assert.equal(widget("用户姿态动作片段").value, "");

setTargets();
widget("全部清空").callback();
assert.equal(widget("用户人物片段").value, "");
assert.equal(widget("用户姿态动作片段").value, "");
console.log("frontend TXT module control integration ok");
