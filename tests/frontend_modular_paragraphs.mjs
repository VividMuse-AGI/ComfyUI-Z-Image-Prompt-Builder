import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
let extension;
const source = fs.readFileSync(new URL("../web/js/output_layout.js", import.meta.url), "utf8")
  .replace('import { app } from "../../scripts/app.js";', "");
vm.runInNewContext(source, { app: { registerExtension(value) { extension = value; } } });
for (const name of ["CanvasModule", "PersonModule", "HairModule", "ClothingModule",
  "PoseModule", "SceneModule", "CameraModule", "VisualModule", "TxtPromptLibrary", "TxtModuleLibrary"]) {
  class Node { onConfigure() { this.called = true; } }
  await extension.beforeRegisterNodeDef(Node, { name: "VividMuse_ZImage" + name });
  const node = new Node();
  const layout = { name: "输出排版", value: "按模块分段" };
  node.widgets = [{ name: "field", value: "原文" },
    { name: "helper", options: { serialize: false } }, layout];
  node.onConfigure({ widgets_values: ["原文"] });
  assert.equal(layout.value, "连续拼接");
  assert.equal(node.called, true);
  layout.value = "按模块分段";
  node.onConfigure({ widgets_values: ["原文", "按模块分段"] });
  node.onConfigure({});
  assert.equal(layout.value, "按模块分段");
}
console.log("all ten modular nodes: layout migration OK");
