import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const visibilityFiles = [
  "../web/js/lib/preset_sync.mjs",
  "../web/js/lib/txt_library.mjs",
  "../web/js/lib/txt_module_library.mjs",
];

for (const relativePath of visibilityFiles) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(
    source,
    /from\s*["']\.\/widget_utils\.mjs["']/,
    `${relativePath} must import shared helpers from ./widget_utils.mjs`,
  );
  assert.doesNotMatch(
    source,
    /node\.widgets\s*=\s*\[\.\.\.node\.widgets\]/u,
    `${relativePath} must mutate the Node 2.0 reactive array instead of replacing it`,
  );
}

const widgetUtilsSource = fs.readFileSync(
  new URL("../web/js/lib/widget_utils.mjs", import.meta.url),
  "utf8",
);
assert.match(widgetUtilsSource, /widget\.type = "hidden";/);
assert.doesNotMatch(
  widgetUtilsSource,
  /node\.widgets\s*=\s*\[\.\.\.node\.widgets\]/u,
);

const presetSource = fs.readFileSync(
  new URL("../web/js/lib/preset_sync.mjs", import.meta.url),
  "utf8",
);
assert.match(presetSource, /spacer\.options\.hidden = true;/);
assert.match(presetSource, /spacer\.type = "hidden";/);

function extractFunction(source, functionName) {
  const start = source.indexOf(`export function ${functionName}(`);
  assert.notEqual(start, -1, `missing ${functionName}`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, "");
  }
  throw new Error(`unterminated ${functionName}`);
}

{
  const fnSource = extractFunction(widgetUtilsSource, "setWidgetVisibilityReason");
  const context = {};
  vm.runInNewContext(
    `${fnSource}\nthis.setWidgetVisibilityReason = setWidgetVisibilityReason;`,
    context,
  );
  const originalComputeSize = () => [320, 20];
  const widget = { type: "combo", computeSize: originalComputeSize, options: {} };
  context.setWidgetVisibilityReason(widget, "test", false);
  assert.equal(widget.type, "hidden");
  assert.equal(widget.hidden, true);
  assert.equal(widget.options.hidden, true);

  context.setWidgetVisibilityReason(widget, "test", true);
  assert.equal(widget.type, "combo");
  assert.equal(widget.hidden, false);
  assert.equal(widget.computeSize, originalComputeSize);
  assert.equal(Object.prototype.hasOwnProperty.call(widget.options, "hidden"), false);
}

{
  const refreshFunctionSource = extractFunction(widgetUtilsSource, "refreshNode2Widgets");
  const functionSource = extractFunction(widgetUtilsSource, "resizeNode");
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
