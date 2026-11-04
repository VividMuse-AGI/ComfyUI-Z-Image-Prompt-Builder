import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const schemas = JSON.parse(execFileSync(process.env.PYTHON || "python", ["-c", `
import json, nodes as n, modular_nodes as m
print(json.dumps({k:c.INPUT_TYPES() for k,c in {**n.NODE_CLASS_MAPPINGS, **m.NODE_CLASS_MAPPINGS}.items()}))
`], {cwd: root, encoding: "utf8", env: {...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8"}}));
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.style = {}; this.textContent = ""; this.value = ""; this.disabled = false; }
  append(...items) { for (const item of items) { this.children.push(item); item.parent = this; if (this.tag === "select" && !this.value) this.value = item.value; } }
  replaceChildren(...items) { this.children = []; this.value = ""; this.append(...items); }
  get options() { return this.children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  async fire(type, event = {}) { for (const fn of this.listeners[type] || []) await fn(event); }
  click() { return this.disabled ? undefined : this.fire("click"); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  showModal() { this.open = true; }
  close() { this.open = false; return this.fire("close"); }
}
const extensions = [], registry = new Map();
const app = {registerExtension(e) { extensions.push(e); }, graph: {setDirtyCanvas() {}}};
const ctx = vm.createContext({console, app, setTimeout() {}, clearTimeout() {},
  document: {createElement: tag => new Element(tag), body: new Element("body")}});
ctx.modules = {};
function load(name) {
  if (ctx.modules[name]) return ctx.modules[name];
  const raw = fs.readFileSync(new URL(`../web/js/${name}.js`, import.meta.url), "utf8");
  if (name === "card_combination_ui") assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(raw));
  const exports = [...raw.matchAll(/export (?:function|const) (\w+)/g)].map(m => m[1]);
  const code = raw.replace('import { app } from "../../scripts/app.js";', "")
    .replace(/import\s*\{([^}]+)\}\s*from\s*["']\.\/([\w_]+)\.js["'];/g, (_, names, file) => {
      load(file); return `const {${names}} = globalThis.modules.${file};`;
    }).replaceAll("export function ", "function ").replaceAll("export const ", "const ");
  vm.runInContext(`(()=>{${code}\nglobalThis.modules.${name}={${exports.join(",")}};})()`, ctx, {filename: name});
  return ctx.modules[name];
}
load("preset_sync"); load("modular_nodes"); load("shoot_plan_cards");
const cards = load("workflow_tools"), shoot = load("shoot_plan_core"), ui = load("card_combination_ui");
const catalog = load("i18n_catalog").EN_CATALOG;
let language = "zh";
ctx.__vividMuseZImageI18n = {activeLanguage: () => language, localizeNode() {},
  translateMessage: name => language === "en" ? catalog.widgetLabels[name] || catalog.moduleLabels[name] || name : name};
for (const [name, input] of Object.entries(schemas)) {
  const Type = class {}; registry.set(name, Type);
  for (const extension of extensions) extension.beforeRegisterNodeDef?.(Type, {name, input});
}
const clone = x => JSON.parse(JSON.stringify(x));
const w = (node, name) => node.widgets.find(w => w.name === name);
const state = node => JSON.stringify({values: node.widgets.map(w => [w.name, w.value]), properties: node.properties});
const flatten = e => [e, ...e.children.flatMap(flatten)];
const allText = panel => flatten(panel).map(e => e.textContent).join("\n");
const button = (panel, name) => {
  const result = flatten(panel).find(e => e.tag === "button" && e.textContent === name);
  assert.ok(result, `Missing button: ${name}`); return result;
};
const control = (panel, name) => {
  const result = flatten(panel).find(e => e.attributes["aria-label"] === name);
  assert.ok(result, `Missing control: ${name}`); return result;
};
const status = panel => flatten(panel).find(e => e.attributes.role === "status").textContent;
const select = async (panel, name, value) => { const e = control(panel, name); e.value = value; await e.fire("change"); };
const check = async (panel, name, checked) => { const e = control(panel, name); e.checked = checked; await e.fire("change"); };
async function make(type = "VividMuse_ZImageChinesePromptBuilder", populated = true) {
  const node = Object.assign(new (registry.get(type))(), {id: 17, comfyClass: type, widgets: [], inputs: [], properties: {}, size: [360, 400],
    addWidget(type, name, value, callback, options = {}) { const widget = {type, name, value, callback, options}; this.widgets.push(widget); return widget; },
    setDirtyCanvas() {}, setSize() {}, computeSize() { return [360, 400]; }});
  const schema = schemas[type];
  for (const [name, [kind, options = {}]] of Object.entries({...schema.required, ...schema.optional})) {
    if (options.forceInput) continue;
    node.addWidget(Array.isArray(kind) ? "combo" : "text", name,
      options.default ?? (Array.isArray(kind) ? kind[0] : kind === "STRING" ? "" : 0), null,
      {...options, ...(Array.isArray(kind) ? {values: [...kind]} : {}),
        getOptionLabel: value => language === "en" ? catalog.optionLabels[name]?.[value] || value : value});
  }
  for (const extension of extensions) await extension.nodeCreated?.(node);
  node.graph = {getNodeById: id => id === node.id ? node : null, setDirtyCanvas() {}, beforeChange() {}, afterChange() {}};
  app.graph = node.graph;
  if (populated) {
    node.properties.vividMuseContentCards = [cards.captureCard(node, "人物", "Person A"), cards.captureCard(node, "服装", "Outfit A")];
    node.properties.vividMuseShootPlanCards = [shoot.captureShootPlan(node, ["场景", "摄影", "视觉表现"], "Studio A")];
  }
  return node;
}
let passed = 0;
async function test(name, run) { language = "zh"; await run(); passed++; console.log(`PASS combination UI: ${name}`); }

await test("full-node entry opens one dialog; standalone nodes have no entry", async () => {
  const node = await make(), before = state(node), main = cards.openCardsPanel(node);
  await button(main, "卡片快捷组合").click();
  assert.equal(main.open, false); const panel = node.__vividMuseCardsDialog;
  assert.ok(panel.open); assert.equal(state(node), before);
  for (const name of ["人物卡", "穿搭卡", "拍摄方案卡"]) assert.equal(control(panel, name).value, "");
  assert.ok(button(panel, "预览组合").disabled); assert.ok(button(panel, "确认应用").disabled);
  await button(panel, "返回卡片管理").click(); assert.equal(panel.open, false);
  assert.ok(node.__vividMuseCardsDialog.open); await button(node.__vividMuseCardsDialog, "关闭").click();
  for (const type of Object.keys(schemas).filter(k => /^VividMuse_ZImage(?:Canvas|Person|Hair|Clothing|Pose|Scene|Camera|Visual)Module$/.test(k))) {
    const own = await make(type, false), ownPanel = cards.openCardsPanel(own);
    assert.ok(!flatten(ownPanel).some(e => e.textContent === "卡片快捷组合"));
    assert.throws(() => ui.openCardCombinationPanel(own)); await ownPanel.close();
  }
});

await test("empty and damaged libraries show guidance without modifying node", async () => {
  const node = await make(undefined, false), before = state(node), panel = ui.openCardCombinationPanel(node);
  assert.match(allText(panel), /尚无卡片/); assert.equal(state(node), before); await panel.close();
  node.properties.vividMuseShootPlanCards = {version: 99};
  node.properties.vividMuseContentCards = [cards.captureCard(node, "人物", "valid")];
  const damaged = ui.openCardCombinationPanel(node); assert.match(allText(damaged), /格式异常/);
  await select(damaged, "人物卡", "0"); await button(damaged, "预览组合").click();
  assert.equal(button(damaged, "确认应用").disabled, false); await damaged.close();
});

await test("selection and locks require explicit preview; partial shoot application preserves other values", async () => {
  const node = await make(), before = state(node), panel = ui.openCardCombinationPanel(node);
  await select(panel, "人物卡", "0"); await select(panel, "穿搭卡", "0"); await select(panel, "拍摄方案卡", "0");
  assert.ok(control(panel, "应用场景").checked); assert.ok(control(panel, "应用摄影").checked);
  await check(panel, "应用场景", false); await check(panel, "应用视觉表现", false);
  await select(panel, "人物锁定策略", "lock"); await select(panel, "摄影锁定策略", "lock");
  assert.ok(control(panel, "场景锁定策略").disabled); assert.equal(state(node), before);
  assert.ok(button(panel, "确认应用").disabled); await button(panel, "预览组合").click();
  assert.match(status(panel), /核对差异/); assert.equal(state(node), before);
  assert.match(allText(panel), /修改.*字段/);
  await button(panel, "确认应用").click(); assert.match(status(panel), /组合已应用/);
  assert.ok(button(panel, "确认应用").disabled);
  const old = JSON.parse(before), groups = ctx.__vividMuseZImagePromptData.MODULE_FIELD_GROUPS;
  const affected = [...groups["人物"], ...groups["服装"], ...groups["摄影"]];
  for (const [name, value] of old.values) if (!affected.includes(name)) assert.deepEqual(w(node, name).value, value);
  assert.deepEqual(clone(node.properties.vividMuseRandomLocks), [...groups["人物"], ...groups["摄影"]]);
  await button(panel, "预览组合").click(); assert.match(status(panel), /无需应用/); assert.ok(button(panel, "确认应用").disabled);
  await panel.close();
});

await test("keep-current and unchecked modules discard pending application and ignore disabled locks", async () => {
  const node = await make(), panel = ui.openCardCombinationPanel(node);
  await select(panel, "人物卡", "0"); await select(panel, "人物锁定策略", "lock");
  await button(panel, "预览组合").click(); assert.ok(!button(panel, "确认应用").disabled);
  await select(panel, "人物卡", ""); assert.ok(button(panel, "确认应用").disabled); assert.ok(control(panel, "人物锁定策略").disabled);
  await select(panel, "拍摄方案卡", "0");
  for (const module of ["场景", "摄影", "视觉表现"]) await check(panel, `应用${module}`, false);
  assert.ok(button(panel, "预览组合").disabled);
  await select(panel, "穿搭卡", "0"); await button(panel, "预览组合").click(); await button(panel, "确认应用").click();
  assert.match(status(panel), /已应用/); assert.equal(node.properties.vividMuseRandomLocks, undefined);
  await panel.close();
});

await test("stale previews and TXT blocking never apply other selected modules", async () => {
  const node = await make(), panel = ui.openCardCombinationPanel(node);
  await select(panel, "人物卡", "0"); await select(panel, "穿搭卡", "0");
  await button(panel, "预览组合").click(); w(node, "自由提示词").value = "external edit";
  let before = state(node); await button(panel, "确认应用").click(); assert.equal(state(node), before);
  assert.match(status(panel), /变化/); assert.ok(button(panel, "确认应用").disabled);
  w(node, "用户服装片段").value = "TXT"; before = state(node);
  await button(panel, "预览组合").click(); assert.match(status(panel), /服装.*TXT/); assert.equal(state(node), before);
  await select(panel, "穿搭卡", ""); await button(panel, "预览组合").click();
  await button(panel, "确认应用").click(); assert.match(status(panel), /已应用/);
  assert.equal(w(node, "用户服装片段").value, "TXT"); await panel.close();
});

await test("source replacement requires refreshing lists with explicit reselection", async () => {
  const node = await make(), panel = ui.openCardCombinationPanel(node);
  await select(panel, "人物卡", "0"); await button(panel, "预览组合").click();
  node.properties.vividMuseContentCards[0].name = "Renamed";
  const before = state(node); await button(panel, "确认应用").click(); assert.equal(state(node), before);
  assert.match(status(panel), /变化/);
  await button(panel, "刷新卡片列表").click(); assert.equal(control(panel, "人物卡").value, "");
  assert.ok(control(panel, "人物卡").options.some(e => e.textContent === "Renamed"));
  assert.ok(button(panel, "确认应用").disabled); assert.equal(state(node), before); await panel.close();
});

await test("closing discards choices; reopening restores defaults without writes", async () => {
  const node = await make(), before = state(node), panel = ui.openCardCombinationPanel(node);
  await select(panel, "人物卡", "0"); await select(panel, "人物锁定策略", "lock");
  await button(panel, "预览组合").click(); await button(panel, "关闭").click();
  assert.equal(state(node), before); await button(panel, "确认应用").fire("click"); assert.equal(state(node), before);
  const reopened = ui.openCardCombinationPanel(node);
  assert.equal(control(reopened, "人物卡").value, ""); assert.equal(control(reopened, "人物锁定策略").value, "preserve");
  assert.ok(button(reopened, "预览组合").disabled); await reopened.close();
});

await test("session, node removal, configure and root changes block detached actions", async () => {
  for (const mutation of [n => n.onConfigure?.({}), n => n.onRemoved?.(),
    n => { n.graph.getNodeById = () => null; }, n => { app.graph = {}; }]) {
    const node = await make(), panel = ui.openCardCombinationPanel(node);
    await select(panel, "人物卡", "0"); await button(panel, "预览组合").click(); mutation(node);
    const before = state(node); await button(panel, "确认应用").fire("click"); assert.equal(state(node), before); await panel.close();
  }
});

await test("IME composition blocks activation and Escape; keyboard events stay within the dialog", async () => {
  const node = await make(), panel = ui.openCardCombinationPanel(node), before = state(node);
  await select(panel, "人物卡", "0"); await panel.fire("compositionstart");
  await button(panel, "预览组合").click(); assert.ok(button(panel, "确认应用").disabled);
  let stopped = 0, prevented = 0;
  const event = {key: "Escape", isComposing: true, keyCode: 229, stopPropagation() {stopped++;}, preventDefault() {prevented++;}};
  await panel.fire("keydown", event); assert.ok(panel.open); await panel.fire("cancel", event); assert.equal(prevented, 1);
  await panel.fire("compositionend");
  await panel.fire("keydown", {...event, key: "Enter", isComposing: false, keyCode: 13});
  assert.equal(state(node), before);
  for (const type of ["keyup", "copy", "cut", "paste", "wheel"]) await panel.fire(type, event);
  await panel.fire("keydown", {...event, isComposing: false, keyCode: 27}); assert.equal(panel.open, false);
  assert.equal(stopped, 8); assert.equal(state(node), before);
});

await test("long malicious-looking names are plain text and not used as selector identities", async () => {
  const node = await make(), name = '<img src=x onerror=alert(1)>★' + '很长'.repeat(20);
  node.properties.vividMuseContentCards[0].name = name;
  const panel = ui.openCardCombinationPanel(node), option = control(panel, "人物卡").options[1];
  assert.equal(option.textContent, name); assert.equal(option.value, "0"); assert.equal(option.children.length, 0);
  await select(panel, "人物卡", "0"); await button(panel, "预览组合").click();
  assert.ok(allText(panel).includes(name)); await panel.close();
});

await test("English controls and preview use translated catalog values with canonical writes", async () => {
  language = "en"; const node = await make(), panel = ui.openCardCombinationPanel(node);
  for (const name of ["Person Card", "Outfit Card", "Shoot Plan Card"]) assert.equal(control(panel, name).options[0].textContent, "Keep Current");
  await select(panel, "Person Card", "0"); await select(panel, "Outfit Card", "0"); await select(panel, "Shoot Plan Card", "0");
  await select(panel, "Camera lock policy", "lock");
  await button(panel, "Preview Combination").click(); assert.match(status(panel), /Review/);
  assert.ok(!/[\u3400-\u9fff]/u.test(allText(panel)), "English interface leaked canonical Chinese text");
  await button(panel, "Confirm Apply").click(); assert.match(status(panel), /Combination applied/);
  assert.ok(node.properties.vividMuseRandomLocks.includes("景别")); await panel.close();
});

await test("invalid shoot cards clear old module choices and cannot apply a prior preview", async () => {
  const node = await make(); node.properties.vividMuseShootPlanCards.push({name: "Invalid", version: 99});
  const panel = ui.openCardCombinationPanel(node), before = state(node);
  await select(panel, "拍摄方案卡", "0"); await button(panel, "预览组合").click();
  await select(panel, "拍摄方案卡", "1"); assert.match(status(panel), /格式/);
  assert.ok(button(panel, "确认应用").disabled);
  for (const module of ["场景", "摄影", "视觉表现"]) {
    assert.ok(control(panel, `应用${module}`).disabled); assert.equal(control(panel, `应用${module}`).checked, false);
  }
  assert.equal(state(node), before); await panel.close();
});

await test("changed selectors without a change event still require a fresh preview", async () => {
  const node = await make(), panel = ui.openCardCombinationPanel(node), before = state(node);
  await select(panel, "人物卡", "0"); await button(panel, "预览组合").click();
  control(panel, "人物锁定策略").value = "lock";
  await button(panel, "确认应用").click(); assert.match(status(panel), /重新预览/);
  assert.equal(state(node), before); assert.ok(button(panel, "确认应用").disabled); await panel.close();
});

await test("application failure is visible and does not leave partial fields or enabled confirm", async () => {
  const node = await make(), panel = ui.openCardCombinationPanel(node);
  await select(panel, "人物卡", "0"); await select(panel, "穿搭卡", "0");
  await button(panel, "预览组合").click(); const before = state(node);
  node.__vividMuseRefreshCardScope = () => {throw new Error("test refresh failure");};
  await button(panel, "确认应用").click(); assert.match(status(panel), /test refresh failure/);
  assert.equal(state(node), before); assert.ok(button(panel, "确认应用").disabled); await panel.close();
});

console.log(`PASS ${passed} combination UI groups; DOM simulation only, real Classic / Nodes 2.0 acceptance pending.`);
