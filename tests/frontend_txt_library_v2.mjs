import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/txt_library.js", import.meta.url);
let registeredExtension = null;
globalThis.__txtTestApp = {
  graph: { setDirtyCanvas() {} },
  registerExtension(extension) { registeredExtension = extension; },
};
let source = fs.readFileSync(sourcePath, "utf8").replace(
  'import { app } from "../../scripts/app.js";',
  "const app = globalThis.__txtTestApp;",
);
source += `
globalThis.__txtLibraryApi = {
  parseTxtPromptLibrary,
  installTxtLibraryWidgets,
  importTxtPromptFile,
  applySelectedTxtPrompt,
  setTxtLibraryExpanded,
  clearFreePrompt,
  clearTxtPromptLibrary,
};
`;
vm.runInThisContext(source, { filename: sourcePath.pathname });
const api = globalThis.__txtLibraryApi;
assert.ok(registeredExtension);

function makeNode() {
  return {
    properties: {}, size: [360, 400],
    widgets: [{ name: "自由提示词", type: "text", value: "", options: {} }],
    addWidget(type, name, value, callback, options = {}) {
      const widget = { type, name, value, callback, options, computeSize() { return [360, 24]; } };
      this.widgets.push(widget); return widget;
    },
    computeSize() { return [360, 400]; },
    setSize(size) { this.size = size; },
    setDirtyCanvas() {},
  };
}
function widget(node, name) {
  const found = node.widgets.find((item) => item.name === name);
  assert.ok(found, `missing widget: ${name}`); return found;
}

assert.deepEqual(api.parseTxtPromptLibrary(`
## 日系森系夏日少女
标签：人像, 森系, 夏日

2:3竖构图，真实写实日系森系夏日少女写真。
保留自然绿意与柔和逆光。
---
## 暖调咖啡馆近景
标签: 人像,咖啡馆
3:4竖构图，真实写实暖调咖啡馆近景人像。
`), [
  { title: "日系森系夏日少女", tags: ["人像", "森系", "夏日"], prompt: "2:3竖构图，真实写实日系森系夏日少女写真。\n保留自然绿意与柔和逆光。" },
  { title: "暖调咖啡馆近景", tags: ["人像", "咖啡馆"], prompt: "3:4竖构图，真实写实暖调咖啡馆近景人像。" },
]);
assert.deepEqual(
  api.parseTxtPromptLibrary("# 注释\n第一条完整中文提示词\n\n第二条完整中文提示词")
    .map((entry) => entry.prompt),
  ["第一条完整中文提示词", "第二条完整中文提示词"],
);
assert.deepEqual(
  api.parseTxtPromptLibrary("## 同名\n第一条\n---\n## 同名\n第二条")
    .map((entry) => entry.title),
  ["同名", "同名（2）"],
);

const node = makeNode();
api.installTxtLibraryWidgets(node);
for (const name of ["📚 TXT用户词库", "导入TXT词库", "词库条目", "词库加入方式", "添加到自由提示词", "清空自由提示词", "清除已导入词库"]) {
  const helper = widget(node, name);
  assert.equal(helper.serialize, false);
  assert.equal(helper.options.serialize, false);
}
assert.equal(widget(node, "导入TXT词库").hidden, true);
assert.equal(widget(node, "自由提示词").hidden, undefined);

await api.importTxtPromptFile(node, {
  name: "摄影师私人词库.txt", size: 128,
  async text() { return "第一条完整中文提示词\n第二条完整中文提示词"; },
});
assert.equal(node.properties.vividMuseTxtPromptLibrary.entries.length, 2);
assert.deepEqual(widget(node, "词库条目").options.values, ["第一条完整中文提示词", "第二条完整中文提示词"]);
assert.match(node.__vividMuseTxtLibraryToggle.name, /2条/);
api.setTxtLibraryExpanded(node, true);
assert.equal(widget(node, "导入TXT词库").hidden, false);

const freePrompt = widget(node, "自由提示词");
const entryWidget = widget(node, "词库条目");
const modeWidget = widget(node, "词库加入方式");
freePrompt.value = "用户原有内容";
entryWidget.value = "第一条完整中文提示词";
modeWidget.value = "添加到后面";
api.applySelectedTxtPrompt(node);
assert.equal(freePrompt.value, "用户原有内容；第一条完整中文提示词");
freePrompt.value = "用户原有内容。";
modeWidget.value = "添加到前面";
api.applySelectedTxtPrompt(node);
assert.equal(freePrompt.value, "第一条完整中文提示词；用户原有内容。");
modeWidget.value = "替换自由提示词";
api.applySelectedTxtPrompt(node);
assert.equal(freePrompt.value, "第一条完整中文提示词");
api.clearFreePrompt(node);
assert.equal(freePrompt.value, "");
assert.equal(node.properties.vividMuseTxtPromptLibrary.entries.length, 2);

const restored = makeNode();
restored.properties.vividMuseTxtPromptLibrary = structuredClone(node.properties.vividMuseTxtPromptLibrary);
api.installTxtLibraryWidgets(restored);
assert.equal(widget(restored, "词库条目").options.values.length, 2);
restored.widgets.find((item) => item.name === "自由提示词").value = "不能被清除";
api.clearTxtPromptLibrary(restored);
assert.equal(restored.properties.vividMuseTxtPromptLibrary, undefined);
assert.equal(widget(restored, "自由提示词").value, "不能被清除");
assert.deepEqual(widget(restored, "词库条目").options.values, ["请先导入TXT词库"]);

await assert.rejects(api.importTxtPromptFile(node, { name: "错误.json", size: 2, async text() { return "{}"; } }), /只支持.*\.txt/);
await assert.rejects(api.importTxtPromptFile(node, { name: "空.txt", size: 0, async text() { return ""; } }), /没有可用的提示词/);
console.log("frontend TXT prompt library scenario ok");
