import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const catalogPath = new URL("../web/js/i18n_catalog.js", import.meta.url);
const sourcePath = new URL("../web/js/i18n.js", import.meta.url);
let extension = null;
let languageSetting = null;
const graph = { _nodes: [], setDirtyCanvas() {} };
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
extension.beforeRegisterNodeDef({}, nodeData);
assert.equal(nodeData.display_name, "Z-Image Person");
assert.equal(nodeData.category, "VividMuse/Z-Image/Modules");
assert.equal(nodeData.input.required["年龄阶段"][1].display_name, "Age Range");

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
];
const node = {
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
assert.equal(widgets[1].options.getOptionLabel("20–29岁"), "Around 25 years old");
assert.equal(widgets[1].value, "20–29岁");
assert.equal(widgets[2].label, "Apply to Person Module (Current: Not Set)");
assert.equal(node.inputs[0].label, "Previous Prompt");
assert.equal(node.outputs[0].label, "Combined Prompt");
assert.equal(node.outputs[1].label, "English Prompt");
const englishOptionLabeler = widgets[1].options.getOptionLabel;

languageSetting.onChange("zh");
assert.equal(node.title, "Z-Image 人物");
assert.equal(widgets[0].label, "预设");
assert.notEqual(widgets[1].options.getOptionLabel, englishOptionLabeler);
assert.equal(widgets[0].options.getOptionLabel(widgets[0].value), widgets[0].value);
assert.equal(widgets[1].value, "20–29岁");
assert.equal(nodeData.display_name, "Z-Image 人物");
assert.equal(nodeData.input.required["年龄阶段"][1].display_name, undefined);

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
assert.equal(
  globalThis.__vividMuseZImageI18n.translateMessage("条目“Lighting”没有提示词正文。"),
  "Entry 'Lighting' has no prompt body.",
);

console.log("frontend i18n ok");
