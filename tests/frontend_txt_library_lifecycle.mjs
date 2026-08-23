import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/txt_library.js", import.meta.url);
let extension = null;
globalThis.__txtLifecycleApp = {
  graph: { setDirtyCanvas() {} },
  registerExtension(value) { extension = value; },
};
const source = fs.readFileSync(sourcePath, "utf8").replace(
  'import { app } from "../../scripts/app.js";',
  "const app = globalThis.__txtLifecycleApp;",
);
vm.runInThisContext(source, { filename: sourcePath.pathname });
assert.ok(extension);

const node = {
  comfyClass: "VividMuse_ZImageChinesePromptBuilder",
  properties: {
    vividMuseTxtLibraryExpanded: true,
    vividMuseTxtPromptLibrary: {
      version: 1,
      fileName: "工作流内词库.txt",
      entries: [{ title: "已保存条目", tags: ["测试"], prompt: "已保存的中文提示词" }],
    },
  },
  widgets: [{ name: "自由提示词", type: "text", value: "", options: {} }],
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

extension.nodeCreated(node);
assert.equal(widget("词库条目").value, "已保存条目");
assert.equal(widget("导入TXT词库").hidden, false);
node.properties.vividMuseTxtLibraryExpanded = false;
node.onConfigure({});
assert.equal(widget("导入TXT词库").hidden, true);
extension.loadedGraphNode(node);
assert.equal(widget("自由提示词").hidden, undefined);
assert.equal(widget("词库条目").serialize, false);

console.log("frontend TXT prompt library lifecycle ok");
