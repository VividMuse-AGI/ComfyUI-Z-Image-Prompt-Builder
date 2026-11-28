import assert from "node:assert/strict";
import { loadLibModule } from "./vm_loader.mjs";

globalThis.app = { graph: { setDirtyCanvas() {} }, registerExtension() {} };
const preset = loadLibModule("preset_sync", null, {
  expose: ["placeStructuredActionsBeforePromptLibraries"],
});
globalThis.__layoutApi = {
  placeStructuredActionsBeforePromptLibraries: preset.placeStructuredActionsBeforePromptLibraries,
};

const named = (name) => ({ name });
const field = named("当前模块最后一个字段");
const spacer = named("__vividMuseFreePromptSpacer");
const moduleLibrary = named("🧩 TXT模块词库（全模块）");
const fullLibrary = named("📚 TXT用户词库");
const freePrompt = named("自由提示词");
const random = named("🎲 生成随机组合");
const enableOnly = named("仅启用当前模块");
const clearContents = named("清空内容…");
const node = {
  widgets: [
    field, spacer, moduleLibrary, fullLibrary, freePrompt,
    random, enableOnly, clearContents,
  ],
  __vividMuseFreePromptSpacer: spacer,
  __vividMuseRandomButton: random,
  __vividMuseEnableOnlyModuleButton: enableOnly,
  __vividMuseClearContentsButton: clearContents,
};

globalThis.__layoutApi.placeStructuredActionsBeforePromptLibraries(node);
globalThis.__layoutApi.placeStructuredActionsBeforePromptLibraries(node);
assert.deepEqual(node.widgets.map((widget) => widget.name), [
  "当前模块最后一个字段",
  "🎲 生成随机组合",
  "仅启用当前模块",
  "清空内容…",
  "__vividMuseFreePromptSpacer",
  "🧩 TXT模块词库（全模块）",
  "📚 TXT用户词库",
  "自由提示词",
]);

const actionWidgets = [random, enableOnly, clearContents];
const promptLibraryWidgets = [moduleLibrary, fullLibrary];
const libraryAnchorPermutations = [
  [spacer, moduleLibrary, fullLibrary],
  [spacer, fullLibrary, moduleLibrary],
  [moduleLibrary, spacer, fullLibrary],
  [moduleLibrary, fullLibrary, spacer],
  [fullLibrary, spacer, moduleLibrary],
  [fullLibrary, moduleLibrary, spacer],
];

for (const anchors of libraryAnchorPermutations) {
  const permutationNode = {
    widgets: [field, ...anchors, freePrompt, ...actionWidgets],
    __vividMuseFreePromptSpacer: spacer,
    __vividMuseTxtModuleToggle: moduleLibrary,
    __vividMuseTxtLibraryToggle: fullLibrary,
    __vividMuseRandomButton: random,
    __vividMuseEnableOnlyModuleButton: enableOnly,
    __vividMuseClearContentsButton: clearContents,
  };
  globalThis.__layoutApi.placeStructuredActionsBeforePromptLibraries(permutationNode);
  globalThis.__layoutApi.placeStructuredActionsBeforePromptLibraries(permutationNode);
  const lastActionIndex = Math.max(...actionWidgets.map(widget => permutationNode.widgets.indexOf(widget)));
  assert.ok(promptLibraryWidgets.every(widget => lastActionIndex < permutationNode.widgets.indexOf(widget)));
  assert.deepEqual(permutationNode.widgets.slice(1, 4), actionWidgets);
}

console.log("frontend structured actions layout order ok");
