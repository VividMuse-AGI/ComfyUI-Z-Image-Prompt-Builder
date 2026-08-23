import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/preset_sync.js", import.meta.url);
let source = fs.readFileSync(sourcePath, "utf8").replace(
  'import { app } from "../../scripts/app.js";',
  "const app = { graph: { setDirtyCanvas() {} }, registerExtension() {} };",
);
source += "\nglobalThis.__layoutApi = { placeStructuredActionsBeforePromptLibraries };\n";
vm.runInThisContext(source, { filename: sourcePath.pathname });

const named = (name) => ({ name });
const field = named("当前模块最后一个字段");
const spacer = named("__vividMuseFreePromptSpacer");
const moduleLibrary = named("🧩 TXT模块词库（全模块）");
const fullLibrary = named("📚 TXT用户词库");
const freePrompt = named("自由提示词");
const random = named("🎲 生成随机组合");
const enableOnly = named("仅启用当前模块");
const clearStructured = named("清空结构化模块");
const clearEverything = named("全部清空");
const node = {
  widgets: [
    field, spacer, moduleLibrary, fullLibrary, freePrompt,
    random, enableOnly, clearStructured, clearEverything,
  ],
  __vividMuseFreePromptSpacer: spacer,
  __vividMuseRandomButton: random,
  __vividMuseEnableOnlyModuleButton: enableOnly,
  __vividMuseClearStructuredButton: clearStructured,
  __vividMuseClearEverythingButton: clearEverything,
};

globalThis.__layoutApi.placeStructuredActionsBeforePromptLibraries(node);
globalThis.__layoutApi.placeStructuredActionsBeforePromptLibraries(node);
assert.deepEqual(node.widgets.map((widget) => widget.name), [
  "当前模块最后一个字段",
  "🎲 生成随机组合",
  "仅启用当前模块",
  "清空结构化模块",
  "全部清空",
  "__vividMuseFreePromptSpacer",
  "🧩 TXT模块词库（全模块）",
  "📚 TXT用户词库",
  "自由提示词",
]);
console.log("frontend structured actions layout order ok");
