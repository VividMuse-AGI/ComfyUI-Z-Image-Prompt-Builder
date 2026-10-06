import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c", `
import json, nodes as n, modular_nodes as m
classes = {**n.NODE_CLASS_MAPPINGS, **{k:c for k,c in m.NODE_CLASS_MAPPINGS.items() if issubclass(c,m.ZImageModuleNodeBase)}}
print(json.dumps({k:c.INPUT_TYPES() for k,c in classes.items()}))
`], {cwd:root, encoding:"utf8"}));
const read = file => fs.readFileSync(new URL(`../web/js/${file}.js`, import.meta.url), "utf8");

for (const diagnosticsFirst of [true, false]) {
  const scheduled = [], extensions = [];
  const app = {graph: {_nodes: [], setDirtyCanvas() {}}, ui: {settings: {
    settingsLookup: {}, getSettingValue(_id, fallback) {return fallback;},
    addSetting(setting) {app.languageSetting = setting;},
  }}, registerExtension(ext) {extensions.push(ext);}};
  const context = vm.createContext({console, app, api: {addEventListener() {}},
    setTimeout(fn) {scheduled.push(fn);}, clearTimeout() {}});
  const evaluate = source => vm.runInContext(`(()=>{${source}\n})();`, context);
  evaluate(read("i18n_catalog").replace("export const EN_CATALOG =", "globalThis.englishCatalog ="));
  const files = ["preset_sync", "modular_nodes", "txt_library", "txt_module_library", "i18n"];
  diagnosticsFirst ? files.unshift("prompt_diagnostics") : files.push("prompt_diagnostics");
  for (const file of files) evaluate(read(file)
    .replace('import { app } from "../../scripts/app.js";', "")
    .replace('import { api } from "../../scripts/api.js";', "")
    .replace('import { EN_CATALOG } from "./i18n_catalog.js";', "const EN_CATALOG = globalThis.englishCatalog;"));
  for (const ext of extensions) ext.init?.();
  const flush = () => {let count = 0; while (scheduled.length) {
    assert.ok(++count < 200, "Refresh must not recurse indefinitely"); scheduled.shift()();
  }};

  for (const [key, schema] of Object.entries(fixture)) {
    const node = {comfyClass: key, widgets: [], properties: {}, size: [360, 400], inputs: [], outputs: [],
      addWidget(type, name, value, callback, options = {}) {
        const w = {type, name, value, callback, options}; this.widgets.push(w); return w;
      }, setDirtyCanvas() {}, setSize(size) {this.size = [...size];},
      computeSize() {return [360, 70 + this.widgets.reduce((h,w) => h + (w.computeSize?.(360)?.[1] ?? 24) + 4, 0)];},
    };
    for (const [name, [kind, options = {}]] of Object.entries({...schema.required, ...schema.optional})) {
      if (options.forceInput) continue;
      node.addWidget(Array.isArray(kind) ? "combo" : kind === "STRING" ? "text" : "number", name,
        options.default ?? (Array.isArray(kind) ? kind[0] : kind === "STRING" ? "" : 0), undefined,
        {...options, ...(Array.isArray(kind) ? {values: [...kind]} : {})});
      if (options.control_after_generate) node.addWidget("combo", "control_after_generate", "fixed", undefined,
        {values:["fixed", "randomize"]});
    }
    app.graph._nodes.push(node);
    for (const ext of extensions) await ext.nodeCreated?.(node);
    flush();
    const button = node.__vividMusePromptStatusButton;
    assert.ok(button);
    const random = node.__vividMuseRandomButton || node.__vividMuseModularRandomButton;
    assert.equal(node.widgets.indexOf(button), node.widgets.indexOf(random) + 1);
    assert.equal(node.widgets.filter(w => w.name === "随机状态与执行结果").length, 1);
    const count = node.widgets.length;
    for (const ext of extensions) ext.loadedGraphNode?.(node);
    flush();
    assert.equal(node.widgets.length, count);
    const w = name => node.widgets.find(w => w.name === name);
    const set = (name, value) => {const item = w(name); item.value = value; item.callback?.(value);};
    app.languageSetting.onChange("zh");
    assert.match(button.label, /随机未启用/);
    app.languageSetting.onChange("en");
    assert.match(button.label, /Random off/);
    assert.match(button.tooltip, /View random status/);
    app.languageSetting.onChange("zh");
    const structured = node.widgets.filter(w => Array.isArray(w.options?.values) && w.options.values.includes("跟随预设"));
    set(structured[0].name, "随机抽取");
    assert.match(button.label, /已启用随机/);
    if (key.endsWith("ChinesePromptBuilder")) {
      set("自由提示词", "自由文本必须保留");
      // Existing exclusive-module and random-lock behavior must remain authoritative.
      node.__vividMuseModuleWidget.value = "发型";
      set("发色", "深棕黑色");
      node.properties.vividMuseRandomLocks = ["发色"];
      node.__vividMuseEnableOnlyModuleButton.callback();
      node.__vividMuseRandomButton.callback();
      assert.equal(w("发色").value, "深棕黑色");
      assert.equal(w("鞋履").value, "不使用");
      assert.equal(w("自由提示词").value, "自由文本必须保留");
    }
    const info = {widgets_values: node.widgets.map(w => w.value), properties: node.properties};
    node.onSerialize(info);
    assert.deepEqual(JSON.parse(JSON.stringify(info.widgets_values)),
      node.widgets.filter(w => w.serialize !== false).map(w => w.value));
    assert.doesNotMatch(JSON.stringify(info), /vividMusePromptHistory|vividmuse_prompt_diagnostics/);
    // Modern hosts may already compact nonserialized helper slots before onSerialize.
    const compactInfo = {widgets_values: node.widgets.filter(w => w.serialize !== false).map(w => w.value),
      properties: node.properties};
    const expectedCompact = JSON.parse(JSON.stringify(compactInfo.widgets_values));
    node.onSerialize(compactInfo);
    assert.deepEqual(JSON.parse(JSON.stringify(compactInfo.widgets_values)), expectedCompact,
      "Already-compact host values must not be filtered by raw widget indices again");
    // Classic and Nodes 2.0 share the same small native helper: no DOM height.
    assert.equal(button.type, "button");
    assert.equal(button.serialize, false);
    assert.equal(button.options.serialize, false);
    assert.ok(node.size[1] < 1200, `Unexpected height: ${node.size[1]}`);
  }
}
console.log("PASS: diagnostics with real extension sources; 9 schemas, both load orders, localization, compact helper, workflow serialization and exclusive-module locks.");
