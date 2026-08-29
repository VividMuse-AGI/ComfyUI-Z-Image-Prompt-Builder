import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function backendWidget(name, value = "") {
  return {
    name,
    type: name === "模块类型" || name === "拼接位置" ? "combo" : "text",
    value,
    options: {},
    computeSize() { return [360, 24]; },
  };
}

function makeNode(comfyClass, widgets) {
  return {
    comfyClass,
    properties: {},
    widgets,
    size: [360, 260],
    addWidget(type, name, value, callback, options = {}) {
      const widget = {
        type, name, value, callback, options,
        computeSize() { return [360, 24]; },
      };
      this.widgets.push(widget);
      return widget;
    },
    computeSize() {
      return [360, this.widgets.filter((item) => !item.hidden).length * 24 + 60];
    },
    setSize(size) { this.size = size; },
    setDirtyCanvas() {},
  };
}

function widget(node, name) {
  const found = node.widgets.find((item) => item.name === name);
  assert.ok(found, `missing widget: ${name}`);
  return found;
}

async function loadScript(fileName, appName, apiSource) {
  const sourcePath = new URL(`../web/js/${fileName}`, import.meta.url);
  let extension = null;
  globalThis[appName] = {
    graph: { setDirtyCanvas() {} },
    registerExtension(value) { extension = value; },
  };
  let source = fs.readFileSync(sourcePath, "utf8").replace(
    'import { app } from "../../scripts/app.js";',
    `const app = globalThis.${appName};`,
  );
  source = `(function () {\n${source}\n${apiSource}\n})();`;
  vm.runInThisContext(source, { filename: sourcePath.pathname });
  assert.ok(extension);
  return extension;
}

const txtExtension = await loadScript(
  "txt_library.js",
  "__standaloneTxtApp",
  `globalThis.__standaloneTxtApi = { importTxtPromptFile, applySelectedTxtPrompt, clearFreePrompt };`,
);
const txtNode = makeNode("VividMuse_ZImageTxtPromptLibrary", [
  backendWidget("自由提示词"),
  backendWidget("拼接位置", "添加到前置提示词后"),
]);
txtExtension.nodeCreated(txtNode);
assert.ok(txtNode.__vividMuseTxtLibraryToggle);
assert.ok(
  txtNode.widgets.indexOf(txtNode.__vividMuseTxtLibraryToggle)
    < txtNode.widgets.indexOf(widget(txtNode, "自由提示词")),
);
const txtSerialized = { widgets_values: [] };
for (const [index, item] of txtNode.widgets.entries()) {
  if (item.serialize !== false) txtSerialized.widgets_values[index] = item.value;
}
txtNode.onSerialize(txtSerialized);
assert.deepEqual(txtSerialized.widgets_values, ["", "添加到前置提示词后"]);

await globalThis.__standaloneTxtApi.importTxtPromptFile(txtNode, {
  name: "个人提示词.txt",
  size: 64,
  async text() { return "第一条完整提示词\n第二条完整提示词"; },
});
widget(txtNode, "词库条目").value = "第二条完整提示词";
globalThis.__standaloneTxtApi.applySelectedTxtPrompt(txtNode);
assert.equal(widget(txtNode, "自由提示词").value, "第二条完整提示词");
globalThis.__standaloneTxtApi.clearFreePrompt(txtNode);
assert.equal(widget(txtNode, "自由提示词").value, "");

const moduleExtension = await loadScript(
  "txt_module_library.js",
  "__standaloneModuleApp",
  `globalThis.__standaloneModuleApi = {
    importTxtModuleFile, applySelectedModuleEntry, clearCurrentModule, clearModuleLibrary,
  };`,
);
const moduleNode = makeNode("VividMuse_ZImageTxtModuleLibrary", [
  backendWidget("模块类型", "人物"),
  backendWidget("模块提示词"),
  backendWidget("拼接位置", "添加到前置提示词后"),
]);
moduleExtension.nodeCreated(moduleNode);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.ok(moduleNode.__vividMuseTxtModuleToggle);
assert.equal(moduleNode.__vividMuseTxtModuleModuleWidget, widget(moduleNode, "模块类型"));
assert.equal(moduleNode.widgets.some((item) => item.name === "词库模块"), false);
assert.notEqual(widget(moduleNode, "模块提示词").hidden, true);

const moduleSerialized = { widgets_values: [] };
for (const [index, item] of moduleNode.widgets.entries()) {
  if (item.serialize !== false) moduleSerialized.widgets_values[index] = item.value;
}
moduleNode.onSerialize(moduleSerialized);
assert.deepEqual(
  moduleSerialized.widgets_values,
  ["人物", "", "添加到前置提示词后"],
);

const moduleText = `
## 清透人物
模块：人物
标签：女性, 清透
一位二十岁左右的东亚成年女性，神态自然。
---
## 自然坐姿
模块：动作
标签：坐姿
身体微微侧转，双手自然放在膝上。
`;
await globalThis.__standaloneModuleApi.importTxtModuleFile(moduleNode, {
  name: "结构化模块.txt",
  size: 128,
  async text() { return moduleText; },
});
assert.deepEqual(widget(moduleNode, "模块词库条目").options.values, ["清透人物"]);
globalThis.__standaloneModuleApi.applySelectedModuleEntry(moduleNode);
assert.equal(
  widget(moduleNode, "模块提示词").value,
  "一位二十岁左右的东亚成年女性，神态自然。",
);
assert.equal(
  moduleNode.properties.vividMuseTxtModuleAppliedTitles?.["人物"],
  "清透人物",
);
widget(moduleNode, "模块提示词").value = "用户手动修改的人物描述。";
widget(moduleNode, "模块提示词").callback?.("用户手动修改的人物描述。");
assert.equal(
  moduleNode.properties.vividMuseTxtModuleAppliedTitles?.["人物"],
  undefined,
);
assert.match(moduleNode.__vividMuseTxtModuleApplyButton.name, /已有内容/u);

const moduleType = widget(moduleNode, "模块类型");
moduleType.value = "姿态动作";
moduleType.callback("姿态动作");
assert.equal(widget(moduleNode, "模块提示词").value, "");
assert.equal(
  moduleNode.properties.vividMuseTxtModuleAppliedTitles?.["人物"],
  undefined,
);
assert.deepEqual(widget(moduleNode, "模块词库条目").options.values, ["自然坐姿"]);
globalThis.__standaloneModuleApi.applySelectedModuleEntry(moduleNode);
assert.equal(
  widget(moduleNode, "模块提示词").value,
  "身体微微侧转，双手自然放在膝上。",
);
globalThis.__standaloneModuleApi.clearCurrentModule(moduleNode);
assert.equal(widget(moduleNode, "模块提示词").value, "");
globalThis.__standaloneModuleApi.clearModuleLibrary(moduleNode);
assert.equal(moduleNode.properties.vividMuseTxtModuleLibrary, undefined);

console.log("frontend standalone TXT nodes ok");
