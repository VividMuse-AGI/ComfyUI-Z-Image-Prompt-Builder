import assert from "node:assert/strict";
import { loadLibModule } from "./vm_loader.mjs";

globalThis.app = { graph: { setDirtyCanvas() {} }, registerExtension() {} };
globalThis.__dependentOptionsApi = loadLibModule("preset_sync", null, {
  expose: ["syncThemeOptions", "syncEthnicityBranchOptions", "syncSceneLocationOptions"],
});

const cases = [
  {
    functionName: "syncThemeOptions",
    categoryName: "写真大类",
    categoryValue: "自然户外",
    dependentName: "写真主题",
    expectedFirst: "日系森系夏日写真",
  },
  {
    functionName: "syncEthnicityBranchOptions",
    categoryName: "族裔大类",
    categoryValue: "欧洲裔",
    dependentName: "地域族裔分支",
    expectedFirst: "大类通用外观",
  },
  {
    functionName: "syncSceneLocationOptions",
    categoryName: "场景大类",
    categoryValue: "自然户外",
    dependentName: "场景地点",
    expectedFirst: "夏日庭院",
  },
];

for (const testCase of cases) {
  const categoryWidget = { name: testCase.categoryName, value: testCase.categoryValue };
  const dependentWidget = {
    name: testCase.dependentName,
    value: "旧选项",
    options: { values: ["旧选项"] },
  };
  const originalWidgets = [categoryWidget, dependentWidget];
  let arrayMutations = 0;
  const reactiveWidgets = new Proxy(originalWidgets, {
    set(target, key, value) {
      arrayMutations += 1;
      return Reflect.set(target, key, value);
    },
  });
  let widgetAssignments = 0;
  const node = {};
  Object.defineProperty(node, "widgets", {
    get: () => reactiveWidgets,
    set: () => {
      widgetAssignments += 1;
    },
  });

  globalThis.__dependentOptionsApi[testCase.functionName](node, true);

  assert.equal(widgetAssignments, 0);
  assert.ok(arrayMutations > 0, testCase.functionName + " must refresh Node 2.0 widgets");
  assert.deepEqual(reactiveWidgets.map((widget) => widget.name), originalWidgets.map((widget) => widget.name));
  assert.equal(dependentWidget.value, testCase.expectedFirst);
  assert.ok(dependentWidget.options.values.includes(testCase.expectedFirst));
  assert.equal(dependentWidget.options.values.includes("旧选项"), false);
}

console.log("frontend Node 2.0 dependent combo refresh ok");
