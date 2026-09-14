import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = file => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
const fixture = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c", `
import json, nodes as n, modular_nodes as m, resolution as r
classes = {"VividMuse_ZImageChinesePromptBuilder": n.ZImageChinesePromptBuilder, "VividMuse_ZImageCanvasModule": m.ZImageCanvasModule}
cases = [[a, mp, k, r.calculate_resolution(a, "按总像素计算", mp, k)] for a in r.ASPECT_RESOLUTIONS for mp in (0.1, 0.5, 1, 2, 4, 16) for k in range(8,129,4)]
pixel_cases = [[a, b, k, r.calculate_pixel_resolution(a, b, k)] for a in r.ASPECT_RESOLUTIONS for b in (10, 33.33, 100, 200, 300, 1600) for k in range(8,129,4)]
print(json.dumps({"schemas": {key: cls.INPUT_TYPES() for key, cls in classes.items()}, "cases": cases, "pixelCases": pixel_cases}))
`], { cwd: root, encoding: "utf8" }));

function makeContext(resolutionFirst) {
  const scheduled = [];
  const extensions = [];
  const app = { graph: { _nodes: [], setDirtyCanvas() {} },
    ui: { settings: { settingsLookup: {}, getSettingValue(_id, fallback) { return fallback; },
      addSetting(setting) { app.languageSetting = setting; } } },
    registerExtension(extension) { extensions.push(extension); } };
  const context = vm.createContext({ console, app, setTimeout(fn) { scheduled.push(fn); }, clearTimeout() {} });
  const evaluate = source => vm.runInContext("(() => {\n" + source + "\n})()", context);
  evaluate(read("web/js/resolution_catalog.js").replace("export const RESOLUTION_CATALOG =", "globalThis.resolutionCatalog ="));
  evaluate(read("web/js/i18n_catalog.js").replace("export const EN_CATALOG =", "globalThis.englishCatalog ="));
  const resolutionSource = read("web/js/resolution_selector.js")
    .replace('import { app } from "../../scripts/app.js";', "")
    .replace('import { RESOLUTION_CATALOG as CATALOG } from "./resolution_catalog.js";', "const CATALOG = globalThis.resolutionCatalog;")
    .replaceAll("export function ", "function ");
  const loadResolution = () => evaluate(resolutionSource + "\nglobalThis.resolutionTest = {calculateResolution, calculatePixelResolution, roundEven, previewResolution, visible};");
  if (resolutionFirst) loadResolution();
  for (const file of ["preset_sync", "modular_nodes", "workflow_tools", "i18n"]) {
    let source = read("web/js/" + file + ".js")
      .replace('import { app } from "../../scripts/app.js";', "")
      .replace('import { EN_CATALOG } from "./i18n_catalog.js";', "const EN_CATALOG = globalThis.englishCatalog;")
      .replaceAll("export function ", "function ");
    if (file === "workflow_tools") source += "\nglobalThis.workflowTest = {capturePreset,applyUserPreset,validatePreset};";
    evaluate(source);
  }
  if (!resolutionFirst) loadResolution();
  for (const extension of extensions) extension.init?.();
  const flush = () => { for (let count = 0; scheduled.length && count < 100; count++) scheduled.shift()(); };
  return { context, app, extensions, flush };
}

function makeNode(type) {
  const schema = fixture.schemas[type];
  const widgets = [];
  for (const [name, [kind, options = {}]] of Object.entries({ ...schema.required, ...schema.optional })) {
    if (options.forceInput) continue;
    widgets.push({ name, type: Array.isArray(kind) ? "combo" : kind === "STRING" ? "text" : "number",
      value: options.default ?? (Array.isArray(kind) ? kind[0] : kind === "STRING" ? "" : 0),
      options: { ...options, ...(Array.isArray(kind) ? {values: [...kind]} : {}) },
      computeSize() { return [360, 24]; } });
    if (options.control_after_generate) widgets.push({ name: "control_after_generate", type: "combo",
      value: "fixed", options: { values: ["fixed", "randomize"] }, computeSize() { return [360, 24]; } });
  }
  return { comfyClass: type, widgets, properties: {}, inputs: [], size: [360, 600],
    setDirtyCanvas() {}, setSize(size) { this.size = [...size]; },
    computeSize() { return [360, 80 + this.widgets.reduce((height, w) =>
      height + (w.computeSize ? w.computeSize(360)[1] : 20) + 4, 0)]; },
    addWidget(type, name, value, callback, options = {}) {
      // Native LiteGraph combo/number/button helpers have no custom computeSize.
      const w = { type, name, value, callback, options };
      this.widgets.push(w); return w;
    } };
}

for (const resolutionFirst of [false, true]) {
  const { context, app, extensions, flush } = makeContext(resolutionFirst);
  const api = context.resolutionTest;
  // Undefined is a valid native size hook, not an uncaptured original value.
  for (const originalSize of [undefined, () => [300, 32]]) {
    const widget = {type: "combo", options: {}, computeSize: originalSize};
    for (let cycle = 0; cycle < 5; cycle++) {
      api.visible(widget, false);
      assert.equal(widget.computeSize()[1], -4);
      api.visible(widget, true);
      assert.equal(widget.type, "combo");
      assert.equal(widget.hidden, false);
      assert.equal(widget.options.hidden, false);
      assert.equal(widget.computeSize, originalSize,
        "expanding must restore native height instead of retaining the hidden height");
    }
  }
  for (const [aspect, mp, align, expected] of fixture.cases)
    assert.deepEqual(Array.from(api.calculateResolution(aspect, "按总像素计算", mp, align)), expected);
  for (const [aspect, budget, align, expected] of fixture.pixelCases)
    assert.deepEqual(Array.from(api.calculatePixelResolution(aspect, budget, align)), expected);
  for (const budget of [true, null, "200", NaN, Infinity, 9.99, 1600.01])
    assert.throws(() => api.calculatePixelResolution("4:5竖构图", budget, 8));
  for (const [number, expected] of [[0.5,0], [1.5,2], [2.5,2], [3.5,4]]) assert.equal(api.roundEven(number), expected);

  for (const type of Object.keys(fixture.schemas)) {
    const node = makeNode(type);
    // Simulate the host's classic and Node 2.0 step conventions on the stored unit.
    const storedBudget = node.widgets.find(w => w.name === "目标总像素（万）");
    Object.assign(storedBudget.options, {step: 100, step2: 10});
    app.graph._nodes.push(node);
    const originalNames = node.widgets.map(w => w.name);
    for (const extension of extensions) await extension.nodeCreated?.(node);
    flush();
    const state = node.__vividMuseResolution;
    assert.ok(state);
    const find = name => node.widgets.find(w => w.name === name);
    const change = (widget, value) => { widget.value = value; widget.callback?.(value); flush(); };
    assert.equal(state.toggle.hidden, false);
    assert.equal(state.backing["分辨率模式"].value, "固定比例总像素");
    assert.equal(state.proxies["目标总像素（万）"].value, 1);
    assert.equal(state.proxies["目标总像素（万）"].hidden, false);
    assert.equal(state.proxies["分辨率模式"].hidden, true);
    const budget = state.proxies["目标总像素（万）"];
    assert.equal(budget.options.min, 0.1);
    assert.equal(budget.options.max, 16);
    assert.equal(budget.options.precision, 2);
    assert.equal(budget.options.step, 1);
    assert.equal(budget.options.step2, 0.1);
    assert.equal(storedBudget.options.step, 100);
    assert.equal(storedBudget.options.step2, 10);
    assert.equal(state.backing["目标总像素（万）"].options.min, 10);
    assert.equal(state.backing["目标总像素（万）"].options.max, 1600);
    assert.equal(state.proxies["尺寸对齐倍数"].hidden, false);
    assert.equal(state.proxies["尺寸对齐倍数"].value, 8);
    assert.equal(node.widgets.some(w => w.name === "分辨率高级设置"), false);
    for (const w of Object.values(state.backing)) {
      assert.equal(w.type, "hidden"); assert.equal(w.options.hidden, true);
      assert.equal(w.computeSize()[1], -4);
    }
    assert.ok(node.widgets.indexOf(state.toggle) > node.widgets.indexOf(find("画面比例")));
    assert.ok(node.widgets.indexOf(state.toggle) < node.widgets.indexOf(find("成像媒介")));
    change(find("画面比例"), "4:5竖构图");
    assert.match(state.toggle.label, /896 × 1120/);
    const divisor = state.proxies["尺寸对齐倍数"];
    assert.ok(node.widgets.indexOf(budget) < node.widgets.indexOf(divisor));
    assert.ok(node.widgets.indexOf(divisor) < node.widgets.indexOf(state.toggle));
    // Unit conversion covers fractions and boundaries without changing storage semantics.
    for (const mp of [0.1, 0.5, 1, 1.25, 2, 3, 16]) {
      change(budget, mp);
      assert.equal(state.backing["目标总像素（万）"].value, mp * 100);
      assert.equal(budget.value, mp);
      for (const multiple of [8, 16, 32, 64, 128]) {
        change(divisor, multiple);
        const size = Array.from(api.previewResolution(node).size);
        assert.deepEqual(size, Array.from(api.calculatePixelResolution("4:5竖构图", mp * 100, multiple)));
        assert.equal(size[0] % multiple, 0);
        assert.equal(size[1] % multiple, 0);
        assert.equal(size[0] * 5, size[1] * 4);
      }
    }
    change(divisor, 8);
    // Common pixel budget is editable without expanding or choosing a mode.
    change(state.proxies["目标总像素（万）"], 2);
    assert.equal(find("画面比例").value, "4:5竖构图");
    assert.match(state.toggle.label, /1280 × 1600.*2\.048 MP/);
    assert.equal(state.backing["分辨率模式"].value, "固定比例总像素");
    change(state.proxies["目标总像素（万）"], 1);
    const collapsedHeight = node.computeSize()[1];
    state.toggle.callback();
    assert.equal(node.computeSize()[1], collapsedHeight + 24,
      "compatibility mode must reserve its own native widget row");
    assert.equal(node.size[1], node.computeSize()[1]);
    assert.equal(state.proxies["分辨率模式"].computeSize, undefined);
    assert.equal(state.proxies["分辨率模式"].hidden, false);
    assert.equal(state.proxies["目标总像素"].hidden, true);
    change(state.proxies["分辨率模式"], "按总像素计算");
    change(state.proxies["目标总像素"], 2);
    assert.equal(state.backing["目标总像素"].value, 2);
    assert.equal(state.proxies["目标总像素"].hidden, false);
    assert.equal(state.proxies["尺寸对齐倍数"].hidden, false);
    assert.equal(state.proxies["尺寸对齐倍数"].computeSize, undefined);
    assert.equal(node.size[1], node.computeSize()[1]);
    change(state.proxies["尺寸对齐倍数"], 32);
    assert.equal(state.proxies["尺寸对齐倍数"].hidden, false);
    const expected = Array.from(api.calculateResolution("4:5竖构图", "按总像素计算", 2, 32));
    assert.match(state.toggle.label, new RegExp(expected.join(" × ")));

    // Helper controls do not move any serialized field, including old layout values.
    const serialized = {widgets_values: node.widgets.map(w => w.value)};
    node.onSerialize(serialized);
    assert.deepEqual(node.widgets.filter(w => w.serialize !== false).map(w => w.name), originalNames);
    assert.equal(serialized.widgets_values.length, originalNames.length);
    assert.deepEqual(serialized.widgets_values.slice(-4), ["按总像素计算", 2, 32, 100]);
    const saved = context.workflowTest.capturePreset(node, "resolution preset");
    change(state.proxies["目标总像素"], 4);
    context.workflowTest.applyUserPreset(node, saved);
    assert.equal(state.proxies["目标总像素"].value, 2);
    for (const invalid of [12.5, 9, -4, 132])
      assert.throws(() => context.workflowTest.validatePreset({...saved, values: {...saved.values, "尺寸对齐倍数": invalid}}, node));

    const legacy = structuredClone(saved);
    for (const name of Object.keys(state.backing)) delete legacy.values[name];
    context.workflowTest.applyUserPreset(node, legacy);
    assert.equal(state.backing["分辨率模式"].value, "原推荐尺寸");
    assert.equal(budget.value, 896 * 1120 / 1000000);
    change(divisor, 64);
    assert.equal(state.backing["分辨率模式"].value, "固定比例总像素");
    assert.equal(state.backing["目标总像素（万）"].value, 896 * 1120 / 10000);
    assert.ok(api.previewResolution(node).size.every(side => side % 64 === 0));
    change(state.proxies["分辨率模式"], "按总像素计算");
    node.onConfigure({widgets_values: serialized.widgets_values.slice(0, -4)});
    assert.equal(state.backing["分辨率模式"].value, "原推荐尺寸");
    // The immediately preceding version had three resolution fields: preserve its MP mode.
    change(state.proxies["分辨率模式"], "按总像素计算");
    change(state.proxies["目标总像素"], 2);
    state.backing["目标总像素（万）"].value = 300;
    node.onConfigure({widgets_values: serialized.widgets_values.slice(0, -1)});
    assert.equal(state.backing["分辨率模式"].value, "按总像素计算");
    assert.equal(state.backing["目标总像素"].value, 2);
    assert.equal(state.backing["目标总像素（万）"].value, 100);
    // A current workflow keeps the explicit settings on configure/clone.
    change(state.proxies["分辨率模式"], "按总像素计算");
    change(state.proxies["目标总像素"], 2);
    node.onConfigure({widgets_values: serialized.widgets_values});
    assert.equal(state.backing["分辨率模式"].value, "按总像素计算");

    change(find("画面比例"), "随机抽取");
    assert.equal(api.previewResolution(node).status, "random");
    assert.match(state.toggle.label, /随机|random/);
    change(find("画面比例"), "不使用");
    assert.equal(api.previewResolution(node).fallback, true);
    node.inputs = [{name:"画面比例", link: 1}];
    node.onConnectionsChange();
    assert.equal(api.previewResolution(node).status, "linked");
    node.inputs = [];
    node.onConnectionsChange();

    if (type.endsWith("ChinesePromptBuilder")) {
      change(find("当前编辑模块"), "人物");
      for (const w of [state.toggle, ...Object.values(state.proxies)]) {
        assert.equal(w.hidden, true); assert.equal(w.options.hidden, true);
      }
      change(find("当前编辑模块"), "画面基础");
      assert.equal(state.toggle.hidden, false);
      find("全部清空").callback();
    } else find("清空本模块").callback();
    assert.equal(state.backing["目标总像素"].value, 2); // clear text, not canvas settings

    // Editing the common budget upgrades a legacy node; preset/clone/clear preserve it.
    change(state.proxies["尺寸对齐倍数"], 8);
    change(find("画面比例"), "4:5竖构图");
    change(state.proxies["目标总像素（万）"], 2);
    assert.equal(state.backing["分辨率模式"].value, "固定比例总像素");
    assert.match(state.toggle.label, /1280 × 1600/);
    const pixelSaved = context.workflowTest.capturePreset(node, "pixel budget");
    change(state.proxies["目标总像素（万）"], 3);
    context.workflowTest.applyUserPreset(node, pixelSaved);
    assert.equal(state.proxies["目标总像素（万）"].value, 2);
    assert.equal(state.backing["分辨率模式"].value, "固定比例总像素");
    const current = {widgets_values: node.widgets.map(w => w.value)};
    node.onSerialize(current);
    assert.deepEqual(current.widgets_values.slice(-4), ["固定比例总像素", 2, 8, 200]);
    node.onConfigure(current);
    assert.equal(state.proxies["目标总像素（万）"].value, 2);
    for (const invalid of [9.9, 1600.1, "200", null])
      assert.throws(() => context.workflowTest.validatePreset(
        {...pixelSaved, values: {...pixelSaved.values, "目标总像素（万）": invalid}}, node));
    const random = node.widgets.find(w => w.name.includes("生成随机组合"));
    random?.callback();
    assert.equal(state.backing["目标总像素（万）"].value, 200);
    assert.equal(state.backing["分辨率模式"].value, "固定比例总像素");
    (find("全部清空") || find("清空本模块")).callback();
    assert.equal(state.backing["目标总像素（万）"].value, 200);
    assert.equal(state.backing["分辨率模式"].value, "固定比例总像素");

    change(find("画面比例"), "4:5竖构图");
    app.languageSetting.onChange("en");
    assert.match(state.toggle.label, /^Resolution:/);
    assert.equal(state.proxies["分辨率模式"].label, "Resolution Mode");
    assert.equal(state.proxies["目标总像素（万）"].label, "Megapixels (MP)");
    assert.equal(state.proxies["尺寸对齐倍数"].label, "Divisible By");
    assert.equal(state.proxies["目标总像素"].label, "Legacy Megapixels");
    assert.equal(state.proxies["分辨率模式"].options.getOptionLabel("固定比例总像素"), "Fixed Ratio / Pixel Budget");
    assert.match(state.toggle.label, /2.048 MP/);
    assert.equal(state.proxies["分辨率模式"].options.getOptionLabel("按总像素计算"), "Calculate from Megapixels");
    app.languageSetting.onChange("zh");
    assert.match(state.toggle.label, /^分辨率:/);
    const beforeCount = node.widgets.length;
    for (const extension of extensions) extension.loadedGraphNode?.(node);
    flush();
    assert.equal(node.widgets.length, beforeCount);
    state.toggle.callback();
    assert.ok(node.size[1] < 1000, "compact node must not acquire hidden-widget height");
  }
}
console.log("resolution selector: backend parity, compact/Node 2.0 flags, serialization, legacy, language and locks OK");
