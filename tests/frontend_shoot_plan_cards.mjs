import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

// Exercise real registered schemas and scoped refresh hooks, without a host,
// image queue, browser storage, or duplicated lists of selectable values.
const root = fileURLToPath(new URL("..", import.meta.url));
const pythonEnv = {...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8"};
const fixture = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c", `
import json, nodes as n, modular_nodes as m
classes = {**n.NODE_CLASS_MAPPINGS, **m.NODE_CLASS_MAPPINGS}
print(json.dumps({"schemas": {k:c.INPUT_TYPES() for k,c in classes.items()},
                  "groups": m.MODULE_FIELD_GROUPS}))
`], {cwd: root, encoding: "utf8", env: pythonEnv}));
const extensions = [];
const app = {registerExtension(extension) { extensions.push(extension); }, graph: {setDirtyCanvas() {}}};
const ctx = vm.createContext({console, app, setTimeout() {}, clearTimeout() {}});
const exported = [
  "registerShootPlanSchema", "availableShootPlanModules", "validateShootPlan", "captureShootPlan",
  "saveShootPlan", "listShootPlans", "shootPlanCollectionStamp", "renameShootPlan", "deleteShootPlan",
  "planShootPlanApply", "commitShootPlanApply", "captureResultShootPlan", "validateShootPlanPack",
  "planShootPlanImport", "commitShootPlanImport",
];
for (const file of ["preset_sync", "modular_nodes", "shoot_plan_core"]) {
  const source = fs.readFileSync(new URL(`../web/js/${file}.js`, import.meta.url), "utf8")
    .replace('import { app } from "../../scripts/app.js";', "")
    .replaceAll("export function ", "function ").replaceAll("export const ", "const ");
  const bridge = file === "shoot_plan_core" ? `globalThis.shootPlan={${exported.join(",")}};`
    : file === "preset_sync" ? "globalThis.randomFull=prepareRandomCombination;"
    : "globalThis.randomModule=prepareModuleRandomCombination;";
  vm.runInContext(`(()=>{${source}\n${bridge}})();`, ctx, {filename: file});
}
const api = ctx.shootPlan;
for (const [name, input] of Object.entries(fixture.schemas)) api.registerShootPlanSchema({name, input});
const json = value => JSON.parse(JSON.stringify(value));
const groups = json(ctx.__vividMuseZImagePromptData.MODULE_FIELD_GROUPS);
const modules = ["场景", "摄影", "视觉表现"];
const fullType = "VividMuse_ZImageChinesePromptBuilder";
const ownTypes = {"场景": "VividMuse_ZImageSceneModule", "摄影": "VividMuse_ZImageCameraModule", "视觉表现": "VividMuse_ZImageVisualModule"};
const w = (node, name) => node.widgets.find(widget => widget.name === name);
const values = node => Object.fromEntries(node.widgets.filter(widget => widget.serialize !== false)
  .map(widget => [widget.name, widget.value]));
const state = node => JSON.stringify({values: values(node), properties: node.properties,
  inputs: node.inputs, history: node.__vividMusePromptHistory});
const make = async (type = fullType) => {
  const node = {comfyClass: type, widgets: [], properties: {}, inputs: [], size: [360, 400], graph: app.graph,
    addWidget(type, name, value, callback, options = {}) {
      const widget = {type, name, value, callback, options}; this.widgets.push(widget); return widget;
    },
    setDirtyCanvas() {}, setSize(size) { this.size = size; }, computeSize() { return [360, 400]; }};
  const schema = fixture.schemas[type];
  for (const [name, [kind, options = {}]] of Object.entries({...schema.required, ...schema.optional})) {
    if (options.forceInput) continue;
    node.addWidget(Array.isArray(kind) ? "combo" : "text", name,
      options.default ?? (Array.isArray(kind) ? kind[0] : kind === "STRING" ? "" : 0), undefined,
      {...options, ...(Array.isArray(kind) ? {values: [...kind]} : {})});
  }
  for (const extension of extensions) await extension.nodeCreated?.(node);
  return node;
};
const apply = (node, card, selected = Object.keys(card.modules), lock = false) =>
  api.commitShootPlanApply(node, api.planShootPlanApply(node, card, selected, lock));
const moduleValues = (node, module) => Object.fromEntries(groups[module].map(name => [name, w(node, name).value]));
const changeValue = (node, name) => {
  const widget = w(node, name);
  widget.value = widget.value === "不使用" ? "跟随预设" : "不使用";
};
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS shoot-plan: ${name}`); };
const sourceNode = await make();
const original = api.captureShootPlan(sourceNode, modules, "studio");

await test("28 canonical fields; capture resolves preset values without mutating inputs", async () => {
  assert.deepEqual(json(api.availableShootPlanModules(sourceNode)), modules);
  assert.deepEqual(Object.fromEntries(modules.map(module => [module, groups[module].length])),
    {"场景": 9, "摄影": 7, "视觉表现": 12});
  for (const module of modules) assert.deepEqual(groups[module], fixture.groups[module]);
  const before = state(sourceNode);
  const card = api.captureShootPlan(sourceNode, ["视觉表现", "场景", "摄影"], "  reusable  ");
  assert.equal(card.name, "reusable");
  assert.equal(card.kind, "vividmuse-shoot-plan-card");
  assert.equal(card.version, 1);
  assert.deepEqual(Object.keys(card).sort(), ["kind", "modules", "name", "version"]);
  assert.deepEqual(Object.keys(card.modules), modules);
  assert.equal(Object.values(card.modules).reduce((count, fields) => count + Object.keys(fields).length, 0), 28);
  const preset = ctx.__vividMuseZImagePromptData.PRESETS[w(sourceNode, "预设").value];
  for (const module of modules) for (const [name, value] of Object.entries(card.modules[module])) {
    assert.ok(!["随机抽取", "跟随预设"].includes(value));
    const input = w(sourceNode, name).value;
    assert.equal(value, input === "跟随预设" ? preset[name] : input);
  }
  assert.equal(state(sourceNode), before);
});

await test("strict single-card shape, complete modules, concrete options and scene dependency", async () => {
  const base = json(original), field = groups["摄影"][0];
  const malformed = [null, [], {...base, kind: "vividmuse-content-card"}, {...base, version: 2},
    {...base, extra: 1}, {...base, name: " "}, {...base, name: " padded "}, {...base, name: "x".repeat(81)},
    {...base, modules: {}}, {...base, modules: []}, {...base, modules: {...base.modules, "人物": {}}},
    {...base, modules: {...base.modules, "摄影": {}}},
    {...base, modules: {...base.modules, "摄影": {...base.modules["摄影"], unknown: "不使用"}}},
    ...[null, {}, 1, "unknown", "随机抽取", "跟随预设"].map(value => ({...base,
      modules: {...base.modules, "摄影": {...base.modules["摄影"], [field]: value}}})),
    {...base, modules: {"摄影": Object.fromEntries(groups["摄影"].map(name => [name, "不使用"]))}},
    JSON.parse(JSON.stringify(base).replace('"modules":{', '"modules":{"__proto__":{},')),
  ];
  const missing = json(base); delete missing.modules["摄影"][field]; malformed.push(missing);
  const catalogs = ctx.__vividMuseZImagePromptData.SCENE_LOCATIONS_BY_CATEGORY;
  const category = Object.keys(catalogs).find(key => catalogs[key].length);
  const otherLocation = Object.values(catalogs).flat().find(value => !catalogs[category].includes(value));
  assert.ok(otherLocation, "Fixture needs two distinct scene categories");
  malformed.push({...base, modules: {...base.modules, "场景": {...base.modules["场景"],
    "场景大类": category, "场景地点": otherLocation}}});
  for (const entry of malformed) {
    const before = state(sourceNode);
    assert.throws(() => api.validateShootPlan(entry, sourceNode));
    assert.equal(state(sourceNode), before);
  }
  assert.throws(() => api.captureShootPlan(sourceNode, [], "empty selection"));
  assert.throws(() => api.captureShootPlan(sourceNode, ["摄影", "摄影"], "duplicate selection"));
  assert.throws(() => api.captureShootPlan(sourceNode, ["人物"], "wrong scope"));
});

await test("all three standalone scopes and unsupported nodes", async () => {
  for (const [module, type] of Object.entries(ownTypes)) {
    const node = await make(type);
    assert.deepEqual(json(api.availableShootPlanModules(node)), [module]);
    const ownCard = api.captureShootPlan(node, [module], module);
    assert.deepEqual(Object.keys(ownCard.modules), [module]);
    api.validateShootPlan(original, node); // Portable validation of complete data is not projection.
    api.saveShootPlan(node, original);
    assert.deepEqual(json(api.listShootPlans(node)[0]), json(original));
    apply(node, original, [module], true);
    assert.deepEqual(json(moduleValues(node, module)), json(original.modules[module]));
    const before = state(node);
    assert.throws(() => apply(node, original, modules));
    assert.equal(state(node), before);
    ctx.randomModule(node);
    assert.deepEqual(json(moduleValues(node, module)), json(original.modules[module]));
  }
  for (const type of ["VividMuse_ZImagePersonModule", "VividMuse_ZImagePoseModule", "VividMuse_ZImageCanvasModule"]) {
    const node = await make(type);
    assert.deepEqual(json(api.availableShootPlanModules(node)), []);
    assert.throws(() => api.captureShootPlan(node, ["摄影"], "unsupported"));
    assert.throws(() => apply(node, original, ["摄影"]));
  }
});

await test("random, connected inputs and TXT replacements block capture and application with no writes", async () => {
  for (const module of modules) {
    const node = await make();
    const field = groups[module][0];
    for (const input of [field, `用户${module}片段`]) {
      node.inputs = [{name: input, link: 17}];
      const before = state(node);
      assert.throws(() => api.captureShootPlan(node, [module], "linked"));
      assert.throws(() => api.planShootPlanApply(node, original, modules, true));
      assert.equal(state(node), before);
    }
    node.inputs = [];
    w(node, `用户${module}片段`).value = "user replacement";
    const before = state(node);
    assert.throws(() => api.captureShootPlan(node, [module], "replaced"));
    assert.throws(() => api.planShootPlanApply(node, original, modules, true));
    assert.equal(state(node), before);
    w(node, `用户${module}片段`).value = "";
    w(node, field).value = "随机抽取";
    assert.throws(() => api.captureShootPlan(node, [module], "unresolved"));
    for (const name of groups[module]) w(node, name).value = "不使用";
    assert.throws(() => api.captureShootPlan(node, [module], "empty module"));
  }
});

await test("selective apply clears explicit empty values but leaves omitted modules and all unrelated inputs intact", async () => {
  const node = await make();
  const card = json(original);
  card.modules["摄影"][groups["摄影"][1]] = "不使用";
  w(node, "自由提示词").value = "keep custom text";
  w(node, "随机种子").value = 1234567;
  node.properties.vividMuseActiveModule = "服装";
  node.properties.vividMuseRandomLocks = ["年龄阶段", "景别"];
  node.__vividMusePromptHistory = [{data: {seed: "42", zh: "keep result"}}];
  const history = node.__vividMusePromptHistory;
  const before = values(node), locks = json(node.properties.vividMuseRandomLocks);
  node.onConfigure = () => { throw Error("Full reconfigure is forbidden"); };
  const plan = api.planShootPlanApply(node, card, ["摄影"], false);
  assert.equal(state(node), JSON.stringify({values: before, properties: node.properties, inputs: node.inputs, history}));
  assert.equal(plan.rows.length, 7);
  assert.equal(plan.lock, false);
  api.commitShootPlanApply(node, plan);
  assert.deepEqual(json(moduleValues(node, "摄影")), card.modules["摄影"]);
  for (const [name, value] of Object.entries(before)) if (!groups["摄影"].includes(name)) assert.equal(w(node, name).value, value, name);
  assert.deepEqual(json(node.properties.vividMuseRandomLocks), locks);
  assert.equal(node.properties.vividMuseActiveModule, "服装");
  assert.equal(node.__vividMusePromptHistory, history);
  assert.throws(() => api.commitShootPlanApply(node, plan), "Applied plans cannot be replayed");
});

await test("scene refresh keeps chosen category and location; apply-and-lock unions locks and survives randomization", async () => {
  const node = await make();
  node.properties.vividMuseRandomLocks = ["年龄阶段"];
  const card = json(original);
  const catalogs = ctx.__vividMuseZImagePromptData.SCENE_LOCATIONS_BY_CATEGORY;
  const category = Object.keys(catalogs).find(key => key !== card.modules["场景"]["场景大类"] && catalogs[key].length);
  card.modules["场景"]["场景大类"] = category;
  card.modules["场景"]["场景地点"] = catalogs[category][0];
  const plan = api.planShootPlanApply(node, card, modules, true);
  assert.deepEqual(new Set(plan.newLocks), new Set(modules.flatMap(module => groups[module])));
  api.commitShootPlanApply(node, plan);
  assert.equal(w(node, "场景大类").value, category);
  assert.equal(w(node, "场景地点").value, catalogs[category][0]);
  assert.ok(w(node, "场景地点").options.values.includes(catalogs[category][0]));
  assert.deepEqual(new Set(node.properties.vividMuseRandomLocks), new Set(["年龄阶段", ...modules.flatMap(module => groups[module])]));
  w(node, "随机范围").value = "跨风格混搭（全部字段）";
  ctx.randomFull(node);
  for (const module of modules) assert.deepEqual(json(moduleValues(node, module)), card.modules[module]);
});

await test("stale target, locks, connections, replacement, preset and card prevent commit without writes", async () => {
  const mutations = [
    node => changeValue(node, "景别"),
    node => { node.properties.vividMuseRandomLocks = ["年龄阶段"]; },
    node => { node.inputs = [{name: "景别", link: 7}]; },
    node => { w(node, "用户摄影片段").value = "new user snippet"; },
    node => { const widget = w(node, "预设"); widget.value = widget.options.values.find(value => value !== widget.value); },
    (_node, card) => { card.name = "changed card"; },
    (_node, card) => { card.modules["摄影"]["画面布局"] = "不使用"; },
  ];
  for (const mutate of mutations) {
    const node = await make(), card = json(original);
    const plan = api.planShootPlanApply(node, card, ["摄影"], true);
    mutate(node, card);
    const before = state(node);
    assert.throws(() => api.commitShootPlanApply(node, plan));
    assert.equal(state(node), before);
  }
  const node = await make(), other = await make();
  const plan = api.planShootPlanApply(node, original, ["摄影"], false);
  const before = state(other);
  assert.throws(() => api.commitShootPlanApply(other, plan));
  assert.equal(state(other), before);
  const tampered = api.planShootPlanApply(node, original, ["摄影"], false);
  assert.throws(() => { tampered.lock = true; }, "Issued preview plans are immutable");
  assert.throws(() => api.commitShootPlanApply(node, {...tampered, lock: true}), "Copied or forged plans are not trusted");
});

await test("refresh failure restores all selected values, options and prior lock presence", async () => {
  for (const haveLocks of [false, true]) {
    const node = await make();
    const reactive = w(node, "景别");
    let backingValue = reactive.value;
    Object.defineProperty(reactive, "value", {configurable: true, enumerable: true,
      get() { return backingValue; }, set(value) { backingValue = value; }});
    if (haveLocks) node.properties.vividMuseRandomLocks = ["年龄阶段"];
    node.__vividMusePromptHistory = [{data: {seed: "42"}}];
    const snapshot = () => JSON.stringify({state: state(node), options: node.widgets.map(widget => widget.options), size: node.size});
    const before = snapshot();
    const actualRefresh = node.__vividMuseRefreshCardScope;
    node.__vividMuseRefreshCardScope = module => {
      actualRefresh?.(module);
      w(node, "场景地点").options.values = ["damaged temporary option"];
      throw Error("simulated scoped refresh failure");
    };
    const plan = api.planShootPlanApply(node, original, modules, true);
    assert.throws(() => api.commitShootPlanApply(node, plan));
    assert.equal(snapshot(), before, "Failed multi-module writes must not leave fields, options or locks behind");
  }
});

await test("reactive setter failure rolls back prior module writes and partially assigned value", async () => {
  const node = await make();
  const control = w(node, "景别"), target = original.modules["摄影"]["景别"];
  let backing = control.value, rejectOnce = true;
  Object.defineProperty(control, "value", {enumerable: true, configurable: true,
    get() { return backing; },
    set(value) {
      backing = value; // A reactive component can change state before an observer throws.
      if (rejectOnce && value === target) { rejectOnce = false; throw Error("reactive observer failure"); }
    }});
  const before = state(node), plan = api.planShootPlanApply(node, original, modules, true);
  assert.throws(() => api.commitShootPlanApply(node, plan));
  assert.equal(state(node), before);
});

await test("only-enabled warning adds no new activation state and never switches the editor", async () => {
  const node = await make();
  for (const [module, names] of Object.entries(groups)) if (module !== "人物") for (const name of names) w(node, name).value = "不使用";
  node.properties.vividMuseOnlyEnabledModule = "人物";
  node.properties.vividMuseActiveModule = "人物";
  const before = moduleValues(node, "人物");
  const plan = api.planShootPlanApply(node, original, ["场景"], true);
  assert.ok(plan.warnings.length, "Adding a nonempty module must explain random-scope changes");
  api.commitShootPlanApply(node, plan);
  assert.equal(node.properties.vividMuseActiveModule, "人物");
  assert.deepEqual(moduleValues(node, "人物"), before);
  assert.deepEqual(json(moduleValues(node, "场景")), json(original.modules["场景"]));
});

await test("empty node with an only-enabled hint warns when the applied module changes random scope", async () => {
  const node = await make();
  for (const names of Object.values(groups)) for (const name of names) w(node, name).value = "不使用";
  node.properties.vividMuseOnlyEnabledModule = "人物";
  node.properties.vividMuseActiveModule = "人物";
  const before = state(node);
  const plan = api.planShootPlanApply(node, original, ["摄影"], false);
  assert.ok(plan.warnings.length, "The fallback only-enabled hint changes too when fields were all empty");
  assert.equal(state(node), before);
  api.commitShootPlanApply(node, plan);
  assert.equal(node.properties.vividMuseActiveModule, "人物");
  assert.deepEqual(json(moduleValues(node, "摄影")), json(original.modules["摄影"]));
  for (const [module, names] of Object.entries(groups)) if (module !== "摄影") {
    for (const name of names) assert.equal(w(node, name).value, "不使用");
  }
});

await test("saved card removal or rename invalidates an already-open apply preview", async () => {
  for (const operation of ["delete", "rename"]) {
    const node = await make();
    api.saveShootPlan(node, original);
    const saved = api.listShootPlans(node)[0];
    const plan = api.planShootPlanApply(node, saved, modules, true);
    if (operation === "delete") api.deleteShootPlan(node, saved);
    else api.renameShootPlan(node, saved, "renamed while previewing");
    const before = state(node);
    assert.throws(() => api.commitShootPlanApply(node, plan));
    assert.equal(state(node), before);
  }
});

await test("saved cards are independent snapshots with separate quota and JSON workflow persistence", async () => {
  const node = await make();
  node.properties.vividMuseContentCards = [{kind: "old-format-sentinel"}];
  const card = json(original), beforeValues = JSON.stringify(values(node));
  api.saveShootPlan(node, card);
  card.modules["摄影"]["景别"] = "mutated external object";
  assert.equal(JSON.stringify(values(node)), beforeValues);
  const saved = json(api.listShootPlans(node)[0]);
  assert.deepEqual(saved, json(original));
  assert.deepEqual(node.properties.vividMuseContentCards, [{kind: "old-format-sentinel"}]);
  assert.throws(() => api.saveShootPlan(node, original));
  api.saveShootPlan(node, original, true);
  assert.equal(api.listShootPlans(node).length, 1);
  const restored = await make(); restored.properties = json(node.properties);
  api.validateShootPlan(api.listShootPlans(restored)[0], restored);
  assert.deepEqual(json(api.listShootPlans(restored)[0]), json(original));
  for (let index = 1; index < 100; index++) api.saveShootPlan(node, {...original, name: `plan ${index}`});
  const before = JSON.stringify(node.properties);
  assert.throws(() => api.saveShootPlan(node, {...original, name: "overflow"}));
  assert.equal(JSON.stringify(node.properties), before);
  api.saveShootPlan(node, original, true);
  assert.equal(api.listShootPlans(node).length, 100);
  const stamp = api.shootPlanCollectionStamp(node);
  api.deleteShootPlan(node, api.listShootPlans(node)[0], stamp);
  assert.throws(() => api.saveShootPlan(node, {...original, name: "stale save"}, false, stamp));
});

const pack = cards => ({kind: "vividmuse-shoot-plan-card-pack", version: 1, cards});
await test("portable packs validate all cards atomically including inapplicable modules", async () => {
  const node = await make(ownTypes["摄影"]), before = state(node);
  const scene = {...json(original), name: "scene", modules: {"场景": json(original.modules["场景"])}};
  const plan = api.planShootPlanImport(node, pack([original, scene]));
  assert.deepEqual(json(plan.added), [original.name]); assert.deepEqual(json(plan.inapplicable), ["scene"]);
  assert.equal(state(node), before);
  const broken = json(scene); broken.modules["场景"]["天气状态"] = "bogus";
  for (const invalid of [pack([]), pack([original, original]), pack([original, broken]),
    {...pack([original]), version: 2}, {...pack([original]), extra: true},
    {kind: "vividmuse-prompt-result", version: 1},
    pack(Array.from({length: 101}, (_, i) => ({...original, name: `overflow${i}`}))),
    JSON.parse(JSON.stringify(pack([original])).replace('"cards":', '"__proto__":{},"cards":'))]) {
    assert.throws(() => api.planShootPlanImport(node, invalid)); assert.equal(state(node), before);
  }
  const result = api.commitShootPlanImport(node, plan);
  assert.equal(result.added.length, 1);
  assert.deepEqual(json(api.listShootPlans(node)[0]), json(original), "Own node must retain complete portable card");
  assert.equal(api.validateShootPlanPack(pack(api.listShootPlans(node)), node).cards[0].modules["场景"]["天气状态"], original.modules["场景"]["天气状态"]);
  assert.throws(() => api.commitShootPlanImport(node, plan), "Consumed import plans cannot replay");
});

await test("import skip, replacement, stale previews, capacity and tamper protection", async () => {
  const node = await make(); api.saveShootPlan(node, original);
  const changedCard = json(original); changedCard.modules["摄影"]["景别"] = "面部特写";
  let plan = api.planShootPlanImport(node, changedCard);
  let before = state(node); assert.equal(plan.skipped.length, 1);
  api.commitShootPlanImport(node, plan); assert.equal(state(node), before);
  plan = api.planShootPlanImport(node, changedCard, "replace");
  const beforeValues = JSON.stringify(values(node)); api.commitShootPlanImport(node, plan);
  assert.equal(api.listShootPlans(node)[0].modules["摄影"]["景别"], "面部特写");
  assert.equal(JSON.stringify(values(node)), beforeValues);
  plan = api.planShootPlanImport(node, pack([{...original, name: "later"}]));
  api.saveShootPlan(node, {...original, name: "concurrent"}); before = state(node);
  assert.throws(() => api.commitShootPlanImport(node, plan)); assert.equal(state(node), before);
  assert.throws(() => api.commitShootPlanImport(node, {...plan}));
  const incoming = {...json(original), name: "immutable input"}; plan = api.planShootPlanImport(node, incoming);
  incoming.modules["摄影"]["景别"] = "tampered"; api.commitShootPlanImport(node, plan);
  assert.equal(api.listShootPlans(node).find(c => c.name === "immutable input").modules["摄影"]["景别"], original.modules["摄影"]["景别"]);
  node.properties.vividMuseShootPlanCards = Array.from({length: 100}, (_, i) => ({...json(original), name: `full${i}`}));
  before = state(node); assert.throws(() => api.planShootPlanImport(node, original)); assert.equal(state(node), before);
  plan = api.planShootPlanImport(node, {...original, name: "full0"}, "replace");
  api.commitShootPlanImport(node, plan); assert.equal(api.listShootPlans(node).length, 100);
});

await test("actual result capture uses complete historical values and never current editor fallbacks", async () => {
  const result = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c", `
import json,nodes as n
print(json.dumps(n.ZImageChinesePromptBuilder().build_prompt(unique_id='1')['ui']['vividmuse_prompt_diagnostics'][0]))
`], {cwd: root, encoding: "utf8", env: pythonEnv}));
  const node = await make(); w(node, "景别").value = "随机抽取";
  w(node, "用户摄影片段").value = "current TXT"; node.inputs = [{name: "景别", link: 7}];
  const before = state(node), card = api.captureResultShootPlan(node, result, modules, "history");
  assert.equal(state(node), before);
  for (const module of modules) assert.deepEqual(json(card.modules[module]), result.shoot_plan_candidates.modules[module].values);
  assert.throws(() => api.planShootPlanApply(node, card, ["摄影"]), "Saving history is allowed, current apply is blocked");
  for (const invalid of [undefined, {...result, shoot_plan_candidates: undefined}, {...result, scope: "人物"},
    {...result, modules: []}, ...["user_replaced", "empty_module", "incomplete_fields", "incompatible_scene"].map(reason => ({...result,
      shoot_plan_candidates: {version: 1, modules: {"摄影": {available: false, reason}}}}))]) {
    assert.throws(() => api.captureResultShootPlan(node, invalid, ["摄影"], "invalid")); assert.equal(state(node), before);
  }
  const malformed = json(result); delete malformed.shoot_plan_candidates.modules["摄影"].values["景别"];
  assert.throws(() => api.captureResultShootPlan(node, malformed, ["摄影"], "missing"));
});

console.log(`PASS shoot-plan phases 1–2: ${passed} core regression groups; no host execution or images.`);
