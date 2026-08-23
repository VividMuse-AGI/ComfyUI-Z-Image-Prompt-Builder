import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const visibilityFiles = [
  "../web/js/preset_sync.js",
  "../web/js/txt_library.js",
  "../web/js/txt_module_library.js",
];

for (const relativePath of visibilityFiles) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(
    source,
    /widget\.type = "hidden";/,
    `${relativePath} must use the Node 2.0 zero-height widget type`,
  );
}

const presetSource = fs.readFileSync(
  new URL("../web/js/preset_sync.js", import.meta.url),
  "utf8",
);
assert.match(presetSource, /spacer\.options\.hidden = true;/);
assert.match(presetSource, /spacer\.type = "hidden";/);

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing ${functionName}`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${functionName}`);
}

const behaviorCases = [
  {
    relativePath: "../web/js/preset_sync.js",
    functionName: "setWidgetVisibilityReason",
    hide(fn, widget) { fn(widget, "test", false); },
    show(fn, widget) { fn(widget, "test", true); },
  },
  {
    relativePath: "../web/js/txt_library.js",
    functionName: "setWidgetVisible",
    hide(fn, widget) { fn(widget, false); },
    show(fn, widget) { fn(widget, true); },
  },
  {
    relativePath: "../web/js/txt_module_library.js",
    functionName: "setWidgetVisible",
    hide(fn, widget) { fn(widget, false); },
    show(fn, widget) { fn(widget, true); },
  },
];

for (const testCase of behaviorCases) {
  const sourcePath = new URL(testCase.relativePath, import.meta.url);
  const source = fs.readFileSync(sourcePath, "utf8");
  const functionSource = extractFunction(source, testCase.functionName);
  const context = {};
  vm.runInNewContext(
    `${functionSource}\nthis.visibilityFunction = ${testCase.functionName};`,
    context,
  );

  const originalComputeSize = () => [320, 20];
  const widget = { type: "combo", computeSize: originalComputeSize, options: {} };
  testCase.hide(context.visibilityFunction, widget);
  assert.equal(widget.type, "hidden");
  assert.equal(widget.hidden, true);
  assert.equal(widget.options.hidden, true);

  testCase.show(context.visibilityFunction, widget);
  assert.equal(widget.type, "combo");
  assert.equal(widget.hidden, false);
  assert.equal(widget.computeSize, originalComputeSize);
  assert.equal(Object.prototype.hasOwnProperty.call(widget.options, "hidden"), false);
}

for (const relativePath of visibilityFiles) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(
    source,
    /node\.widgets\s*=\s*\[\.\.\.node\.widgets\]/u,
    relativePath + " must mutate the Node 2.0 reactive array instead of replacing it",
  );
  const refreshFunctionSource = extractFunction(source, "refreshNode2Widgets");
  const functionSource = extractFunction(source, "resizeNode");
  const context = {};
  vm.runInNewContext(
    `${refreshFunctionSource}\n${functionSource}\nthis.resizeNode = resizeNode;`,
    context,
  );

  const originalWidgets = [{ name: "toggle" }, { name: "control" }];
  let arrayMutations = 0;
  const reactiveWidgets = new Proxy(originalWidgets, {
    set(target, key, value) {
      arrayMutations += 1;
      return Reflect.set(target, key, value);
    },
  });
  let widgetAssignments = 0;
  let appliedSize;
  const node = {
    computeSize: () => [320, 123],
    setSize: (size) => { appliedSize = Array.from(size); },
  };
  Object.defineProperty(node, "widgets", {
    get: () => reactiveWidgets,
    set: () => {
      widgetAssignments += 1;
    },
  });

  context.resizeNode(node);
  assert.equal(widgetAssignments, 0);
  assert.ok(arrayMutations > 0);
  assert.deepEqual(reactiveWidgets.map((widget) => widget.name), ["toggle", "control"]);
  assert.deepEqual(appliedSize, [360, 123]);
}

console.log("frontend Node 2.0 hidden widget layout ok");
