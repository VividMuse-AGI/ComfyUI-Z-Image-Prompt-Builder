import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const catalogPath = new URL("../web/js/i18n_catalog.js", import.meta.url);
const sourcePath = new URL("../web/js/i18n.js", import.meta.url);
let extension = null;
let languageSetting = null;
const graph = { _nodes: [], setDirtyCanvas() {} };
const slotRefreshes = [];
graph.trigger = (event, detail) => {
  assert.equal(event, "node:slot-label:changed");
  const changedNode = graph._nodes.find((item) => item.id === detail.nodeId);
  slotRefreshes.push({
    ...detail,
    inputs: changedNode.inputs.map((slot) => slot.label),
    outputs: changedNode.outputs.map((slot) => slot.label),
  });
};
let libraryDefinitions = [];
let libraryRefreshes = 0;
globalThis.__i18nTestApp = {
  graph,
  ui: {
    settings: {
      settingsLookup: {},
      getSettingValue(id, fallback) {
        if (id === "Comfy.Locale") return "en";
        return fallback;
      },
      addSetting(setting) {
        languageSetting = setting;
        this.settingsLookup[setting.id] = setting;
      },
    },
  },
  registerExtension(value) { extension = value; },
  updateVueAppNodeDefs(defs) {
    const entries = Object.values(defs);
    extension.beforeRegisterVueAppNodeDefs(entries);
    // Vue's registry copies definitions: mutating the hook's raw object is not enough.
    libraryDefinitions = entries.map((def) => ({ ...def }));
    libraryRefreshes++;
  },
};

const catalogSource = fs.readFileSync(catalogPath, "utf8").replace(
  "export const EN_CATALOG =",
  "const EN_CATALOG =",
) + "\nglobalThis.__i18nTestCatalog = EN_CATALOG;";
const extensionSource = fs.readFileSync(sourcePath, "utf8")
  .replace('import { app } from "../../scripts/app.js";', "const app = globalThis.__i18nTestApp;")
  .replace('import { EN_CATALOG } from "./i18n_catalog.js";', "");
vm.runInThisContext(`${catalogSource}\n${extensionSource}`, {
  filename: sourcePath.pathname,
});

assert.ok(extension);
const catalog = globalThis.__i18nTestCatalog;
const translatedOptionCount = Object.values(catalog.optionLabels)
  .reduce((total, values) => total + Object.keys(values).length, 0);
assert.ok(translatedOptionCount > 1800);
for (const values of Object.values(catalog.optionLabels)) {
  for (const label of Object.values(values)) {
    assert.doesNotMatch(label, /[\u3400-\u9fff]/u);
  }
}
extension.init();
assert.ok(languageSetting);
assert.deepEqual(
  languageSetting.options.map((item) => item.value),
  ["auto", "zh", "en"],
);

const nodeData = {
  name: "VividMuse_ZImagePersonModule",
  display_name: "Z-Image 人物",
  description: "中文说明",
  category: "VividMuse/Z-Image/模块",
  input: {
    required: {
      "预设": [["日系草地单车夏日柔光写真"], {}],
      "年龄阶段": [["跟随预设", "20–29岁"], {}],
    },
    optional: { "前置提示词": ["STRING", { forceInput: true }] },
  },
};
const nodeType = {};
extension.beforeRegisterNodeDef(nodeType, nodeData);
assert.equal(nodeData.display_name, "Z-Image Person");
assert.equal(nodeData.category, "VividMuse/Z-Image/Modules");
assert.equal(nodeData.input.required["年龄阶段"][1].display_name, "Age Range");
const foreignDefinition = { name: "ForeignNode", display_name: "Foreign Title", category: "Other" };
const foreignSnapshot = JSON.stringify(foreignDefinition);

const widgets = [
  {
    name: "预设",
    type: "combo",
    value: "日系草地单车夏日柔光写真",
    options: { values: ["日系草地单车夏日柔光写真"] },
  },
  {
    name: "年龄阶段",
    type: "combo",
    value: "20–29岁",
    options: { values: ["跟随预设", "20–29岁"] },
  },
  {
    name: "应用到人物模块（当前：未设置）",
    type: "button",
    value: null,
    options: {},
  },
  {
    name: "自由提示词", type: "customtext", value: "用户输入，必须保留。",
    options: {}, inputEl: { placeholder: "自由提示词", value: "用户输入，必须保留。" },
  },
  {
    name: "自由提示词", type: "customtext", value: "custom",
    options: {}, inputEl: { placeholder: "User-defined hint", value: "custom" },
  },
];
const node = {
  id: 42,
  graph,
  comfyClass: "VividMuse_ZImagePersonModule",
  title: "Z-Image 人物",
  widgets,
  inputs: [{ name: "前置提示词" }],
  outputs: [{ name: "组合提示词" }, { name: "英文提示词" }],
  setDirtyCanvas() {},
};
graph._nodes.push(node);
extension.nodeCreated(node);

assert.equal(node.title, "Z-Image Person");
assert.equal(widgets[0].label, "Preset");
assert.equal(widgets[0].options.getOptionLabel(widgets[0].value), "Japanese Summer Bicycle Soft-light Portrait");
assert.equal(widgets[1].label, "Age Range");
assert.equal(widgets[1].options.getOptionLabel("跟随预设"), "Follow Preset");
assert.equal(widgets[1].options.getOptionLabel("20–29岁"), "Around 20 years old");
assert.equal(widgets[1].value, "20–29岁");
assert.equal(widgets[2].label, "Apply to Person Module (Current: Not Set)");
assert.equal(node.inputs[0].label, "Previous Prompt");
assert.equal(node.outputs[0].label, "Combined Prompt");
assert.equal(node.outputs[1].label, "English Prompt");
const englishOptionLabeler = widgets[1].options.getOptionLabel;
assert.equal(widgets[3].inputEl.placeholder, "Free Prompt");
assert.equal(widgets[4].inputEl.placeholder, "User-defined hint");
assert.deepEqual(slotRefreshes.at(-1).outputs, ["Combined Prompt", "English Prompt"]);
const originalInputs = [...node.inputs];
const originalOutputs = [...node.outputs];
node.inputs[0].link = 123;
node.outputs[0].links = [456];
const originalOutputLinks = node.outputs[0].links;
globalThis.__i18nTestApp.updateVueAppNodeDefs({ [nodeData.name]: nodeData, ForeignNode: foreignDefinition });

languageSetting.onChange("zh");
assert.equal(node.title, "Z-Image 人物");
assert.equal(widgets[0].label, "预设");
assert.notEqual(widgets[1].options.getOptionLabel, englishOptionLabeler);
assert.equal(widgets[0].options.getOptionLabel(widgets[0].value), widgets[0].value);
assert.equal(widgets[1].value, "20–29岁");
assert.equal(nodeData.display_name, "Z-Image 人物");
assert.equal(nodeData.input.required["年龄阶段"][1].display_name, undefined);
assert.equal(widgets[3].inputEl.placeholder, "自由提示词");
assert.deepEqual(slotRefreshes.at(-1).inputs, ["前置提示词"]);
assert.deepEqual(slotRefreshes.at(-1).outputs, ["组合提示词", "英文提示词"]);
assert.equal(libraryDefinitions.find((def) => def.name === nodeData.name).display_name, "Z-Image 人物");
assert.equal(libraryDefinitions.find((def) => def.name === nodeData.name).category, "VividMuse/Z-Image/模块");
assert.equal(nodeType.title, "Z-Image 人物");
assert.equal(nodeType.category, "VividMuse/Z-Image/模块");

node.title = "My Portrait Node";
languageSetting.onChange("en");
assert.equal(node.title, "My Portrait Node");
const customTitleNode = {
  comfyClass: "VividMuse_ZImagePersonModule",
  title: "Saved Custom Title",
  widgets: [], inputs: [], outputs: [], setDirtyCanvas() {},
};
extension.nodeCreated(customTitleNode);
assert.equal(customTitleNode.title, "Saved Custom Title");
assert.equal(widgets[1].label, "Age Range");
assert.equal(widgets[1].value, "20–29岁");
assert.equal(widgets[3].inputEl.placeholder, "Free Prompt");
assert.equal(widgets[3].value, "用户输入，必须保留。");
assert.equal(widgets[3].inputEl.value, "用户输入，必须保留。");
assert.equal(widgets[3].name, "自由提示词");
assert.equal(node.inputs[0], originalInputs[0]);
assert.equal(node.outputs[0], originalOutputs[0]);
assert.equal(node.inputs[0].link, 123);
assert.equal(node.outputs[0].links, originalOutputLinks);
assert.deepEqual(originalOutputLinks, [456]);
assert.equal(libraryDefinitions.find((def) => def.name === nodeData.name).display_name, "Z-Image Person");
assert.equal(libraryDefinitions.find((def) => def.name === nodeData.name).category, "VividMuse/Z-Image/Modules");
assert.equal(nodeType.title, "Z-Image Person");
assert.equal(nodeType.category, "VividMuse/Z-Image/Modules");
assert.equal(JSON.stringify(libraryDefinitions.find((def) => def.name === "ForeignNode")), foreignSnapshot);
assert.equal(JSON.stringify(foreignDefinition), foreignSnapshot);
assert.equal(libraryRefreshes, 3);
const refreshCount = slotRefreshes.length;
globalThis.__vividMuseZImageI18n.localizeNode(node);
assert.equal(slotRefreshes.length, refreshCount, "Unchanged labels should not rebuild Nodes 2.0 slot data");
assert.equal(
  globalThis.__vividMuseZImageI18n.translateMessage("条目“Lighting”没有提示词正文。"),
  "Entry 'Lighting' has no prompt body.",
);
assert.equal(
  globalThis.__vividMuseZImageI18n.translateMessage("请先导入并选择一条提示词。"),
  "Import a TXT prompt library and select an entry first.",
);
assert.equal(
  globalThis.__vividMuseZImageI18n.translateMessage("请先导入并选择当前模块的一条提示词。"),
  "Import a TXT module library and select an entry for the current module first.",
);

const deeplyNestedNode = {
  comfyClass: "VividMuse_ZImagePersonModule",
  title: "Z-Image 人物",
  widgets: [], inputs: [], outputs: [], setDirtyCanvas() {},
};
graph._nodes.push({
  subgraph: {
    _nodes: [{
      graphData: { _nodes: [deeplyNestedNode] },
    }],
  },
});
languageSetting.onChange("en");
assert.equal(deeplyNestedNode.title, "Z-Image Person");

// Legacy frontends with neither registry-refresh nor graph-trigger API still localize safely.
delete globalThis.__i18nTestApp.updateVueAppNodeDefs;
delete graph.trigger;
languageSetting.onChange("zh");
assert.equal(node.outputs[0].label, "组合提示词");
assert.equal(widgets[3].inputEl.placeholder, "自由提示词");

console.log("frontend i18n ok");
