import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

for (const modular of [false, true]) {
  const file = modular ? "txt_module_library.js" : "txt_library.js";
  const parser = modular ? "parseTxtModuleLibrary" : "parseTxtPromptLibrary";
  const reader = modular ? "moduleEntries" : "libraryEntries";
  const apply = modular ? "applySelectedModuleEntry" : "applySelectedTxtPrompt";
  let source = fs.readFileSync(new URL("../web/js/" + file, import.meta.url), "utf8")
    .replace('import { app } from "../../scripts/app.js";', "");
  // Only omit repainting: exercise the real parser, stored-library reader and Apply action.
  source += "\n" + (modular ? "syncModuleLibraryControls" : "syncTxtLibraryControls") + " = () => {};";
  source += "\nglobalThis.api = { parse:" + parser + ", read:" + reader + ", apply:" + apply + ", key: LIBRARY_PROPERTY };";
  const context = { app: { registerExtension() {}, graph: { setDirtyCanvas() {} } } };
  vm.createContext(context);
  vm.runInContext(source, context);
  const api = context.api;
  const titles = ["A", "A", "A（2）", "A（3）", "A（2）", "A（2）（2）"];
  const input = titles.map((title, i) =>
    "## " + title + "\n" + (modular ? "模块：人物\n" : "") + "正文" + i).join("\n");
  const parsed = api.parse(input);
  assert.equal(new Set(parsed.map(e => e.title)).size, titles.length);
  assert.equal(parsed[0].title, "A");
  assert.equal(parsed[2].title, "A（2）");
  assert.equal(parsed[3].title, "A（3）");
  const target = { name: modular ? "用户人物片段" : "自由提示词", value: "" };
  const node = { properties: {}, widgets: [target], setDirtyCanvas() {} };
  node.__vividMuseTxtModuleModuleWidget = { value: "人物" };
  node.__vividMuseTxtModuleEntryWidget = { value: "" };
  node.__vividMuseTxtLibraryEntryWidget = { value: "" };
  node.__vividMuseTxtLibraryModeWidget = { value: "替换自由提示词" };
  const selection = modular ? node.__vividMuseTxtModuleEntryWidget : node.__vividMuseTxtLibraryEntryWidget;
  for (const entries of [
    parsed,
    // Previously saved workflows may already contain colliding titles.
    parsed.map((e, i) => ({ ...e, title: ["A", "A（2）", "A（2）"][i % 3] })),
  ]) {
    node.properties[api.key] = { entries };
    const before = JSON.stringify(node.properties);
    const loaded = api.read(node);
    assert.equal(new Set(loaded.map(e => e.title)).size, entries.length);
    for (const entry of loaded) {
      selection.value = entry.title;
      assert.equal(api.apply(node), true);
      assert.equal(target.value, entry.prompt);
    }
    assert.equal(JSON.stringify(node.properties[api.key]), JSON.stringify({ entries }));
    const reloaded = api.read(node);
    assert.deepEqual(Array.from(reloaded, e => e.title), Array.from(loaded, e => e.title));
    assert.ok(before);
  }
  if (modular) {
    const two = api.parse("## A\n模块：人物\n人物正文\n## A\n模块：场景\n场景正文");
    assert.deepEqual(Array.from(two, e => e.title), ["A", "A"]);
  }
}
console.log("TXT title collisions: import, legacy reload and exact entry application OK");
