import { app } from "../../scripts/app.js";

const TARGETS = new Set([
  "ChinesePromptBuilder", "CanvasModule", "PersonModule", "HairModule", "ClothingModule", "PoseModule",
  "SceneModule", "CameraModule", "VisualModule", "TxtPromptLibrary", "TxtModuleLibrary",
].map(name => "VividMuse_ZImage" + name));

function restoreLegacyLayout(node, info) {
  if (!Array.isArray(info?.widgets_values)) return;
  const widgets = (node.widgets || []).filter(widget =>
    widget.serialize !== false && widget.options?.serialize !== false);
  const index = widgets.findIndex(widget => widget.name === "输出排版");
  if (index >= info.widgets_values.length) widgets[index].value = "连续拼接";
  const framingIndex = widgets.findIndex(widget => widget.name === "构图适配");
  if (framingIndex >= info.widgets_values.length) widgets[framingIndex].value = "保持当前规则";
}

app.registerExtension({
  name: "VividMuse.ZImageModuleOutputLayout",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!TARGETS.has(nodeData.name)) return;
    const original = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const result = original?.apply(this, arguments);
      restoreLegacyLayout(this, info);
      return result;
    };
  },
});
