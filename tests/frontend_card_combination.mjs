import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c", `
import json, nodes as n, modular_nodes as m
print(json.dumps({k:c.INPUT_TYPES() for k,c in {**n.NODE_CLASS_MAPPINGS, **m.NODE_CLASS_MAPPINGS}.items()}))
`], {cwd: root, encoding: "utf8", env: {...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8"}}));
const extensions = [];
const app = {registerExtension(extension) { extensions.push(extension); }, graph: {setDirtyCanvas() {}}};
const ctx = vm.createContext({console, app, setTimeout() {}, clearTimeout() {}});
ctx.modules = {};
function load(name) {
  if (ctx.modules[name]) return ctx.modules[name];
  const raw = fs.readFileSync(new URL(`../web/js/${name}.js`, import.meta.url), "utf8");
  const exports = [...raw.matchAll(/export (?:function|const) (\w+)/g)].map(m => m[1]);
  const code = raw.replace('import { app } from "../../scripts/app.js";', "")
    .replace(/import\s*\{([^}]+)\}\s*from\s*["']\.\/([\w_]+)\.js["'];/g, (_, names, file) => {
      load(file); return `const {${names}} = globalThis.modules.${file};`;
    }).replaceAll("export function ", "function ").replaceAll("export const ", "const ");
  vm.runInContext(`(()=>{${code}\nglobalThis.modules.${name}={${exports.join(",")}};})()`, ctx, {filename: name});
  return ctx.modules[name];
}
load("preset_sync"); load("modular_nodes");
const cards = load("workflow_tools"), shoot = load("shoot_plan_core"), api = load("card_combination_core");
for (const [name, input] of Object.entries(fixture)) shoot.registerShootPlanSchema({name, input});
for (const [name, input] of Object.entries(fixture)) for (const ext of extensions)
  ext.beforeRegisterNodeDef?.(class {}, {name, input});
const clone = x => JSON.parse(JSON.stringify(x));
const fullType = "VividMuse_ZImageChinesePromptBuilder";
const groups = ctx.__vividMuseZImagePromptData.MODULE_FIELD_GROUPS;
const w = (node, name) => node.widgets.find(w => w.name === name);
const values = node => Object.fromEntries(node.widgets.map(w => [w.name, w.value]));
const snapshot = node => clone({values: values(node), properties: node.properties, size: node.size});
const state = node => JSON.stringify(snapshot(node));
const restore = (node, snap) => {
  for (const [name, value] of Object.entries(snap.values)) w(node, name).value = value;
  node.properties = clone(snap.properties); node.size = [...snap.size];
};
async function make(type = fullType) {
  const node = {id: 17, comfyClass: type, widgets: [], properties: {}, inputs: [], size: [360, 400],
    addWidget(type, name, value, callback, options = {}) {
      const control = {type, name, value, callback, options}; this.widgets.push(control); return control;
    }, setDirtyCanvas() {}, setSize(size) { this.size = size; }, computeSize() { return [360, 400]; }};
  const schema = fixture[type];
  for (const [name, [kind, options = {}]] of Object.entries({...schema.required, ...schema.optional})) {
    if (options.forceInput) continue;
    node.addWidget(Array.isArray(kind) ? "combo" : "text", name,
      options.default ?? (Array.isArray(kind) ? kind[0] : kind === "STRING" ? "" : 0), undefined,
      {...options, ...(Array.isArray(kind) ? {values: [...kind]} : {})});
  }
  for (const extension of extensions) await extension.nodeCreated?.(node);
  const history = [], redo = []; let before;
  node.graph = {getNodeById: id => id === node.id ? node : null, setDirtyCanvas() {},
    beforeChange() { before = snapshot(node); },
    afterChange() { const after = snapshot(node); if (JSON.stringify(before) !== JSON.stringify(after)) history.push([before, after]); },
    undo() { const pair = history.pop(); if (pair) { restore(node, pair[0]); redo.push(pair); } },
    redo() { const pair = redo.pop(); if (pair) { restore(node, pair[1]); history.push(pair); } }};
  node.history = history;
  return node;
}
const source = await make();
const person = cards.captureCard(source, "人物", "同名卡");
const outfit = cards.captureCard(source, "服装", "同名卡");
const planCard = shoot.captureShootPlan(source, ["场景", "摄影", "视觉表现"], "同名卡");
async function target() {
  const node = await make();
  node.properties.vividMuseContentCards = clone([person, outfit]);
  node.properties.vividMuseShootPlanCards = clone([planCard]);
  node.properties.vividMuseActiveModule = "发型";
  w(node, "自由提示词").value = "保留自由提示词";
  return node;
}
const selection = {person, outfit, shootPlan: planCard, shootModules: ["场景", "摄影"], lockModules: ["人物", "服装"]};
const commit = (node, selected = selection) => api.commitCardCombination(node, api.planCardCombination(node, selected));
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS combination: ${name}`); };

await test("empty selections and unsupported nodes never write", async () => {
  const node = await target(), before = state(node);
  for (const invalid of [{}, {shootPlan: planCard, shootModules: []}, {lockModules: ["人物"]},
    {person: outfit}, {person, lockModules: ["场景"]}, {person, lockModules: ["人物", "人物"]},
    {shootPlan: planCard, shootModules: ["人物"]}, {person, unexpected: true}, {person, shootModules: ["场景"]}]) {
    assert.throws(() => api.planCardCombination(node, invalid)); assert.equal(state(node), before);
  }
  const own = await make("VividMuse_ZImagePersonModule");
  assert.throws(() => api.planCardCombination(own, {person}));
  assert.throws(() => api.commitCardCombination(node, {}));
});

await test("preview is read-only, canonical and immutable, with explicit source names", async () => {
  const node = await target(), before = state(node);
  w(node, groups["人物"][0]).value = "随机抽取";
  const expected = state(node), plan = api.planCardCombination(node, selection);
  assert.equal(state(node), expected);
  assert.deepEqual(clone(plan.modules), ["人物", "服装", "场景", "摄影"]);
  assert.equal(plan.rows.length, 57);
  assert.ok(plan.rows.every(row => row.source === "同名卡"));
  assert.equal(plan.rows.find(row => row.name === groups["人物"][0]).current, "随机抽取");
  assert.throws(() => { plan.rows[0].target = "不使用"; });
  assert.throws(() => { plan.modules.push("发型"); });
  assert.notEqual(before, expected);
});

await test("three card types apply in one undo unit; unrelated content and card stores preserved", async () => {
  const node = await target(); node.properties.vividMuseRandomLocks = [groups["发型"][0]];
  const before = snapshot(node), plan = api.planCardCombination(node, selection);
  const result = api.commitCardCombination(node, plan);
  assert.ok(result.changed); assert.equal(node.history.length, 1);
  for (const row of plan.rows) assert.equal(w(node, row.name).value, row.target);
  const touched = new Set(plan.rows.map(row => row.name));
  for (const [name, value] of Object.entries(before.values)) if (!touched.has(name)) assert.deepEqual(w(node, name).value, value, name);
  assert.deepEqual(clone(node.properties.vividMuseRandomLocks), [...before.properties.vividMuseRandomLocks, ...groups["人物"], ...groups["服装"]]);
  for (const [name, value] of Object.entries(before.properties)) if (name !== "vividMuseRandomLocks") assert.deepEqual(clone(node.properties[name]), value);
  const after = snapshot(node); node.graph.undo(); assert.deepEqual(snapshot(node), before);
  node.graph.redo(); assert.deepEqual(snapshot(node), after);
  assert.throws(() => api.commitCardCombination(node, plan));
});

await test("single card and partial shoot selection preserve current locks, including selected-module locks", async () => {
  for (const selected of [{person}, {outfit}, {shootPlan: planCard, shootModules: ["摄影"]}]) {
    const node = await target(); node.properties.vividMuseRandomLocks = [groups["人物"][0], groups["摄影"][0]];
    const before = snapshot(node), plan = api.planCardCombination(node, selected);
    api.commitCardCombination(node, plan);
    assert.deepEqual(clone(node.properties.vividMuseRandomLocks), before.properties.vividMuseRandomLocks);
    const names = plan.rows.map(row => row.name);
    for (const [name, value] of Object.entries(before.values)) if (!names.includes(name)) assert.deepEqual(w(node, name).value, value);
  }
});

await test("explicit unused clears; locks-only changes count; exact no-op has no history", async () => {
  const node = await target(), blank = clone(person);
  blank.values["脸型"] = "不使用"; node.properties.vividMuseContentCards[0] = blank;
  commit(node, {person: blank}); assert.equal(w(node, "脸型").value, "不使用");
  const size = node.history.length;
  const noop = api.planCardCombination(node, {person: blank}); assert.equal(noop.changed, false);
  assert.equal(api.commitCardCombination(node, noop).changed, false); assert.equal(node.history.length, size);
  assert.throws(() => api.commitCardCombination(node, noop));
  const locks = api.planCardCombination(node, {person: blank, lockModules: ["人物"]});
  assert.ok(locks.changed); assert.ok(locks.rows.every(row => !row.changed));
  api.commitCardCombination(node, locks); assert.equal(node.history.length, size + 1);
});

await test("selected links and TXT block atomically; unrelated sources are permitted", async () => {
  for (const module of ["人物", "服装", "场景", "摄影"]) {
    for (const mode of ["field", "snippet-link", "snippet"]) {
      const node = await target();
      if (mode === "snippet") w(node, `用户${module}片段`).value = "自定义替代";
      else node.inputs = [{name: mode === "field" ? groups[module][0] : `用户${module}片段`, link: 0}];
      const before = state(node);
      assert.throws(() => api.planCardCombination(node, selection), new RegExp(module));
      assert.equal(state(node), before); assert.equal(node.history.length, 0);
    }
  }
  const node = await target(); w(node, "用户场景片段").value = "用户场景";
  node.inputs = [{name: groups["视觉表现"][0], link: 3}];
  commit(node, {person, shootPlan: planCard, shootModules: ["摄影"]});
  assert.equal(w(node, "用户场景片段").value, "用户场景");
});

await test("stale values, source cards, dependencies, locks and ownership reject with no writes", async () => {
  for (const mutate of [
    n => { w(n, groups["人物"][0]).value = "不使用"; },
    n => { n.properties.vividMuseContentCards[0].name = "renamed"; },
    n => { n.properties.vividMuseContentCards.shift(); },
    n => { n.properties.vividMuseContentCards[0].values["脸型"] = "不使用"; },
    n => { n.properties.vividMuseShootPlanCards[0].name = "renamed shoot"; },
    n => { n.properties.vividMuseRandomLocks = ["脸型"]; },
    n => { n.inputs = [{name: "用户人物片段", link: 7}]; },
    n => { w(n, "用户人物片段").value = "replacement"; },
    n => { w(n, "预设").value = "different"; },
    n => { w(n, "脸型").options.values = ["不使用"]; },
    n => { n.widgets[n.widgets.indexOf(w(n, "脸型"))] = {...w(n, "脸型")}; },
    n => { n.__vividMuseCardsGeneration = 1; },
    n => { n.graph = {}; }, n => { n.graph.getNodeById = () => null; },
    n => { n.properties = clone(n.properties); },
  ]) {
    const node = await target(), plan = api.planCardCombination(node, selection); mutate(node);
    const before = state(node); assert.throws(() => api.commitCardCombination(node, plan));
    assert.equal(state(node), before); assert.equal(node.history.length, 0);
  }
});

await test("invalid or non-library cards rejected; unrelated damaged library does not block person", async () => {
  const node = await target();
  for (const bad of [{...person, name: "not saved"}, {...person, values: {...person.values, "脸型": "bad"}}]) {
    assert.throws(() => api.planCardCombination(node, {person: bad}));
  }
  const missing = clone(person); delete missing.values["脸型"];
  node.properties.vividMuseContentCards[0] = missing;
  assert.throws(() => api.planCardCombination(node, {person: missing}));
  node.properties.vividMuseContentCards[0] = clone(person);
  node.properties.vividMuseShootPlanCards = {version: 99};
  commit(node, {person}); assert.deepEqual(node.properties.vividMuseShootPlanCards, {version: 99});
});

await test("refresh failure restores fields, dependent options, visibility, size and lock absence", async () => {
  const node = await target(), before = snapshot(node), options = clone(w(node, "场景地点").options.values);
  const hidden = Object.getOwnPropertyDescriptor(w(node, "脸型"), "hidden");
  const oldHook = node.__vividMuseRefreshCardScope;
  node.__vividMuseRefreshCardScope = module => {
    oldHook(module);
    if (module === "摄影") {
      w(node, "场景地点").options.values = ["bad"];
      w(node, "脸型").hidden = true; node.size[1] += 100;
      throw new Error("injected refresh failure");
    }
  };
  const plan = api.planCardCombination(node, selection);
  assert.throws(() => api.commitCardCombination(node, plan), /injected refresh failure/);
  assert.deepEqual(snapshot(node), before); assert.deepEqual(clone(w(node, "场景地点").options.values), options);
  assert.deepEqual(Object.getOwnPropertyDescriptor(w(node, "脸型"), "hidden"), hidden);
  assert.equal(node.history.length, 0); assert.throws(() => api.commitCardCombination(node, plan));
});

await test("setter failure after an earlier module write restores reactive backing values", async () => {
  const node = await target(), control = w(node, groups["服装"][0]), initial = control.value;
  let backing = initial, fail = true;
  Object.defineProperty(control, "value", {configurable: true, enumerable: true, get() {return backing;},
    set(value) { backing = value; if (fail && value !== initial) { fail = false; throw new Error("setter failure"); } }});
  const before = state(node), plan = api.planCardCombination(node, selection);
  assert.throws(() => api.commitCardCombination(node, plan), /setter failure/);
  assert.equal(state(node), before); assert.equal(node.history.length, 0);
});

await test("transaction hooks and notification failures do not leave partial writes", async () => {
  for (const mode of ["before", "after", "incomplete", "before-mutation"]) {
    const node = await target(), plan = api.planCardCombination(node, selection), before = state(node);
    if (mode === "before") node.graph.beforeChange = () => { throw new Error("before failure"); };
    if (mode === "after") node.graph.afterChange = () => { throw new Error("after failure"); };
    if (mode === "incomplete") delete node.graph.afterChange;
    if (mode === "before-mutation") node.graph.beforeChange = () => { w(node, "自由提示词").value = "external edit"; };
    assert.throws(() => api.commitCardCombination(node, plan));
    if (mode === "before-mutation") {
      assert.equal(w(node, "自由提示词").value, "external edit");
      w(node, "自由提示词").value = "保留自由提示词";
    }
    assert.equal(state(node), before);
  }
  const node = await target(), afterChange = node.graph.afterChange;
  node.graph.afterChange = () => {
    afterChange(); node.setDirtyCanvas = () => { throw new Error("notification"); };
  };
  assert.ok(commit(node).changed); assert.equal(node.history.length, 1);
});

await test("only-module and existing-lock warnings are non-mutating; English feedback available", async () => {
  const node = await target();
  for (const [module, names] of Object.entries(groups)) if (module !== "人物") for (const name of names) w(node, name).value = "不使用";
  node.properties.vividMuseOnlyEnabledModule = "人物";
  node.properties.vividMuseRandomLocks = ["脸型"];
  const before = state(node), plan = api.planCardCombination(node, selection);
  assert.ok(plan.warnings.some(w => w.includes("有效模块")));
  assert.ok(plan.warnings.some(w => w.includes("锁定"))); assert.equal(state(node), before);
  ctx.__vividMuseZImageI18n = {activeLanguage: () => "en"};
  assert.throws(() => api.planCardCombination(node, {}), /Select/);
  ctx.__vividMuseZImageI18n = undefined;
});

await test("all five modules and independent shoot locks; cancelled shoot selection keeps current", async () => {
  const node = await target();
  const plan = api.planCardCombination(node, {person, outfit, shootPlan: planCard, lockModules: ["人物", "摄影"]});
  assert.equal(plan.rows.length, 69); assert.equal(plan.modules.length, 5);
  api.commitCardCombination(node, plan);
  assert.deepEqual(clone(node.properties.vividMuseRandomLocks), [...groups["人物"], ...groups["摄影"]]);
  const other = await target();
  const partial = api.planCardCombination(other, {person, shootPlan: planCard, shootModules: []});
  assert.deepEqual(clone(partial.modules), ["人物"]);
  api.commitCardCombination(other, partial);
});

await test("refresh side-effects outside selected fields and diagnostic failures roll back", async () => {
  for (const mode of ["unselected", "selected", "diagnostic"]) {
    const node = await target(), before = state(node), hook = node.__vividMuseRefreshCardScope;
    node.__vividMuseRefreshCardScope = module => {
      hook(module);
      if (mode === "unselected") w(node, "自由提示词").value = "unexpected";
      if (mode === "selected") w(node, "脸型").value = "不使用";
    };
    if (mode === "diagnostic") ctx.__vividMusePromptDiagnostics = {refresh() {throw new Error("diagnostic failure");}};
    assert.throws(() => commit(node)); assert.equal(state(node), before); assert.equal(node.history.length, 0);
    ctx.__vividMusePromptDiagnostics = undefined;
  }
});

await test("stale previews stay consumed; malformed locks and duplicate source identities are rejected", async () => {
  const node = await target(), plan = api.planCardCombination(node, {person});
  const old = w(node, "自由提示词").value; w(node, "自由提示词").value = "edit";
  assert.throws(() => api.commitCardCombination(node, plan)); w(node, "自由提示词").value = old;
  assert.throws(() => api.commitCardCombination(node, plan));
  for (const bad of ["脸型", ["unknown"], [1]]) {
    node.properties.vividMuseRandomLocks = bad;
    assert.throws(() => api.planCardCombination(node, {person}));
  }
  delete node.properties.vividMuseRandomLocks;
  node.properties.vividMuseContentCards.push(clone(person));
  assert.throws(() => api.planCardCombination(node, {person}));
});

await test("hair and pose join all seven modules without changing canvas or free text", async () => {
  const hair = cards.captureCard(source, "发型", "同名卡"), pose = cards.captureCard(source, "姿态动作", "同名卡");
  const node = await target(); node.properties.vividMuseContentCards.push(clone(hair), clone(pose));
  const before = snapshot(node);
  const plan = api.planCardCombination(node, {person, hair, outfit, pose, shootPlan: planCard, lockModules: ["发型", "姿态动作"]});
  assert.equal(plan.rows.length, 88);
  assert.deepEqual(clone(plan.modules), ["人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现"]);
  assert.ok(plan.rows.find(row => row.name === "发色色调").hidden);
  api.commitCardCombination(node, plan);
  assert.equal(node.history.length, 1);
  assert.deepEqual(clone(node.properties.vividMuseRandomLocks), [...groups["发型"], ...groups["姿态动作"]]);
  for (const name of [...groups["画面基础"], "自由提示词", "随机种子"]) assert.equal(w(node, name).value, before.values[name]);
  const after = state(node); node.graph.undo(); assert.deepEqual(snapshot(node), before);
  node.graph.redo(); assert.equal(state(node), after);
});

await test("four single card types share undo, no-op detection and rollback", async () => {
  for (const [module, suffix] of [["人物", "Person"], ["发型", "Hair"], ["服装", "Clothing"], ["姿态动作", "Pose"]]) {
    const entry = cards.captureCard(source, module, "single");
    for (const type of [fullType, `VividMuse_ZImage${suffix}Module`]) {
      const node = await make(type), before = snapshot(node);
      assert.ok(cards.applyCard(node, entry, true).changed);
      assert.equal(node.history.length, 1);
      const after = state(node); node.graph.undo(); assert.deepEqual(snapshot(node), before);
      node.graph.redo(); assert.equal(state(node), after);
      assert.equal(cards.applyCard(node, entry, true).changed, false); assert.equal(node.history.length, 1);
    }
    for (const mode of ["refresh", "setter", "unrelated", "after", "incomplete"]) {
      const node = await make(), before = state(node);
      if (mode === "refresh") node.__vividMuseRefreshCardScope = () => {node.size[1] = 900; throw Error("refresh");};
      if (mode === "unrelated") node.__vividMuseRefreshCardScope = () => {w(node, "自由提示词").value = "bad";};
      if (mode === "after") node.graph.afterChange = () => {throw Error("after");};
      if (mode === "incomplete") delete node.graph.afterChange;
      if (mode === "setter") {
        const control = w(node, groups[module][1]); let value = control.value, fail = true;
        Object.defineProperty(control, "value", {configurable: true, enumerable: true, get: () => value,
          set(v) {value = v; if (fail) {fail = false; throw Error("setter");}}});
      }
      assert.throws(() => cards.applyCard(node, entry, true)); assert.equal(state(node), before);
      assert.equal(node.history.length, 0);
    }
  }
});

await test("new card previews reject stale sources, links and TXT without partial writes", async () => {
  const hair = cards.captureCard(source, "发型", "hair"), pose = cards.captureCard(source, "姿态动作", "pose");
  for (const module of ["发型", "姿态动作"]) {
    const node = await target(); node.properties.vividMuseContentCards.push(clone(hair), clone(pose));
    const selected = {hair, pose}, plan = api.planCardCombination(node, selected);
    node.properties.vividMuseContentCards.find(c => c.module === module).name = "changed";
    const before = state(node); assert.throws(() => api.commitCardCombination(node, plan)); assert.equal(state(node), before);
    node.properties.vividMuseContentCards = clone([hair, pose]);
    node.inputs = [{name: groups[module][0], link: 1}];
    assert.throws(() => api.planCardCombination(node, selected)); node.inputs = [];
    w(node, `用户${module}片段`).value = "TXT";
    assert.throws(() => api.planCardCombination(node, selected));
    // The other module alone remains writable.
    assert.ok(api.planCardCombination(node, module === "发型" ? {pose} : {hair}));
  }
});

await test("four-type packs validate inapplicable cards and share one 100-card quota", async () => {
  const hair = cards.captureCard(source, "发型", "同名卡"), pose = cards.captureCard(source, "姿态动作", "同名卡");
  const pack = {kind: "vividmuse-content-card-pack", version: 1, cards: [person, hair, outfit, pose]};
  for (const [module, suffix] of [["发型", "Hair"], ["姿态动作", "Pose"]]) {
    const node = await make(`VividMuse_ZImage${suffix}Module`), before = state(node);
    const broken = clone(pack); delete broken.cards.find(c => c.module !== module).values["年龄阶段"];
    assert.throws(() => cards.planCardPack(node, broken)); assert.equal(state(node), before);
    const plan = cards.planCardPack(node, pack);
    assert.equal(plan.added.length, 1); assert.equal(plan.inapplicable.length, 3);
    cards.commitCardPack(node, plan); assert.equal(node.properties.vividMuseContentCards[0].module, module);
  }
  const node = await make();
  node.properties.vividMuseContentCards = Array.from({length: 100}, (_, i) => ({...clone(pack.cards[i % 4]), name: `card ${i}`}));
  const before = state(node); assert.throws(() => cards.saveCard(node, hair)); assert.equal(state(node), before);
  cards.saveCard(node, {...hair, name: "card 1"}, true); assert.equal(node.properties.vividMuseContentCards.length, 100);
});

await test("hair hidden editor values survive capture, but historical cards use only recorded candidates", async () => {
  const node = await make();
  for (const field of ["发色色调", "染色方式"]) w(node, field).value = w(node, field).options.values.find(v => !["跟随预设", "随机抽取", "不使用"].includes(v));
  w(node, "发色模式").value = "基础发色";
  const hair = cards.captureCard(node, "发型", "hidden");
  const target = await make("VividMuse_ZImageHairModule"); cards.applyCard(target, hair);
  for (const field of groups["发型"]) assert.equal(w(target, field).value, hair.values[field]);
  for (const module of ["发型", "姿态动作"]) {
    const entry = cards.captureCard(source, module, "history");
    const record = {version: 1, scope: "全部模块", modules: [{name: module, source: "builtin", zh: "历史", en: ""}],
      card_candidates: {version: 1, modules: {[module]: {available: true, reason: null, values: entry.values}}}};
    w(node, `用户${module}片段`).value = "CURRENT TXT"; node.inputs = [{name: groups[module][0], link: 1}];
    const before = state(node);
    assert.deepEqual(clone(cards.captureResultCard(node, record, module, "history")), clone(entry));
    assert.equal(state(node), before);
    const legacy = clone(record); delete legacy.card_candidates.modules[module];
    assert.throws(() => cards.captureResultCard(node, legacy, module, "bad"));
    const incomplete = clone(record); delete incomplete.card_candidates.modules[module].values[groups[module][0]];
    assert.throws(() => cards.captureResultCard(node, incomplete, module, "bad"));
  }
});

console.log(`PASS ${passed} card combination core groups; simulated transactions only, live UI acceptance pending.`);
