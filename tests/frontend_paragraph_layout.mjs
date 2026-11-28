import assert from "node:assert/strict";
import { createVmContext, loadLibModule } from "./vm_loader.mjs";

const context = createVmContext({ app: { registerExtension() {} } });
const preset = loadLibModule("preset_sync", context, {
  expose: ["installCompactWidgetConfigure"],
});
context.install = preset.installCompactWidgetConfigure;
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
