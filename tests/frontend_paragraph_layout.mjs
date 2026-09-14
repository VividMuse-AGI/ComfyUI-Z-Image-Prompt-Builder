import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

let source = fs.readFileSync(new URL("../web/js/preset_sync.js", import.meta.url), "utf8");
source = source.replace('import { app } from "../../scripts/app.js";',
  "const app = { registerExtension() {} };");
source += "\nensureConfiguredNode = () => {}; globalThis.install = installCompactWidgetConfigure;";
const context = { };
vm.createContext(context);
vm.runInContext(source, context);
const layout = { name: "输出排版", value: "按模块分段" };
const node = { widgets: [
  { name: "预设", value: "自定义组合" },
  { name: "当前编辑模块", serialize: false },
  { name: "自由提示词", value: "原文" },
  layout
]};
context.install(node);
node.onConfigure({ widgets_values: ["自定义组合", "原文"] });
assert.equal(layout.value, "连续拼接");
layout.value = "按模块分段";
node.onConfigure({ widgets_values: ["自定义组合", "原文", "按模块分段"] });
assert.equal(layout.value, "按模块分段");
node.onConfigure({});
assert.equal(layout.value, "按模块分段");
assert.equal(node.widgets[2].value, "原文");
console.log("paragraph layout: legacy workflow migration and new settings preserved");
