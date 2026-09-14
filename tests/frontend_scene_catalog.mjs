import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function load(file, exports, extra = {}) {
  let source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  source = source.replace('import { app } from "../../scripts/app.js";',
    "const app = { registerExtension() {} };");
  const context = vm.createContext({ ...extra });
  vm.runInContext(source + "\nglobalThis.testApi = {" + exports + "};", context);
  return context;
}
const full = load("../web/js/preset_sync.js", "syncSceneLocationOptions, SCENE_LOCATIONS_BY_CATEGORY, SCENE_LOCATION_VALUES");
const modular = load("../web/js/modular_nodes.js", "syncSceneOptions", {
  __vividMuseZImagePromptData: full.__vividMuseZImagePromptData,
});
const categories = full.testApi.SCENE_LOCATIONS_BY_CATEGORY;
assert.equal(Object.values(categories).flat().length, 105);
for (const sync of [
  node => full.testApi.syncSceneLocationOptions(node),
  node => modular.testApi.syncSceneOptions(node, false, false),
]) {
  for (const category of ["居住空间", "跟随预设", "不使用"]) {
    for (const value of ["临街咖啡馆窗景", "沙滩", "公园草地", "复古会所", "工业地下通道", "不使用", "随机抽取"]) {
      const node = { widgets: [
        { name: "场景大类", value: category },
        { name: "场景地点", value, options: {} },
      ] };
      const widgets = node.widgets;
      sync(node);
      sync(node);
      assert.equal(node.widgets, widgets, "Node 2.0 reactive array must stay intact");
      assert.equal(node.widgets.length, 2);
      assert.equal(node.widgets[1].value, value, value);
      assert.ok(node.widgets[1].options.values.includes(value));
      assert.equal(new Set(node.widgets[1].options.values).size, node.widgets[1].options.values.length);
    }
  }
  const invalid = { widgets: [{ name: "场景大类", value: "居住空间" },
    { name: "场景地点", value: "invalid imported location", options: {} }] };
  sync(invalid);
  assert.equal(invalid.widgets[1].value, "跟随预设");
}
for (const sync of [
  node => full.testApi.syncSceneLocationOptions(node, true),
  node => modular.testApi.syncSceneOptions(node, true, false),
]) {
  const node = { widgets: [{ name: "场景大类", value: "居住空间" },
    { name: "场景地点", value: "临街咖啡馆窗景", options: {} }] };
  sync(node);
  assert.equal(node.widgets[1].value, categories["居住空间"][0]);
  assert.ok(!node.widgets[1].options.values.includes("临街咖啡馆窗景"));
}
console.log("frontend scene catalogs and legacy selection preservation ok");
