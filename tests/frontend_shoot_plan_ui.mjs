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
const extensions = [], registry = new Map(), downloads = [], blobs = new Map();
const app = {registerExtension(extension) { extensions.push(extension); }, graph: {setDirtyCanvas() {}}};
class Element {
  constructor(tag) {
    this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {};
    this.style = {}; this.textContent = ""; this.value = ""; this.disabled = false;
  }
  append(...items) {
    for (const item of items) {
      this.children.push(item); item.parent = this;
      if (this.tag === "select" && !this.value) this.value = item.value;
    }
  }
  replaceChildren(...items) { this.children = []; this.value = ""; this.append(...items); }
  get options() { return this.children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  async fire(type, event = {}) { for (const fn of this.listeners[type] || []) await fn(event); }
  click() {
    if (this.tag === "a") downloads.push({name: this.download, blob: blobs.get(this.href)});
    return this.disabled ? undefined : this.fire("click");
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  showModal() { this.open = true; }
  close() { this.open = false; return this.fire("close"); }
}
let language = "zh", confirmed = true, confirmHook = null;
const ctx = vm.createContext({console, app, Blob,
  URL: {createObjectURL(blob) {const url = `blob:${blobs.size}`; blobs.set(url, blob); return url;}, revokeObjectURL(url) {blobs.delete(url);}},
  setTimeout(fn) { fn(); }, clearTimeout() {},
  document: {createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element("text"), {textContent: text}), body: new Element("body")},
  window: {confirm() { confirmHook?.(); return confirmed; }},
});
ctx.__vividMuseZImageI18n = {activeLanguage: () => language, localizeNode() {}, translateMessage: value => value};
for (const file of ["preset_sync", "modular_nodes", "workflow_tools", "shoot_plan_core", "shoot_plan_cards"]) {
  const original = fs.readFileSync(new URL(`../web/js/${file}.js`, import.meta.url), "utf8");
  if (file === "shoot_plan_cards") assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(original));
  let code = original.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];/g, "")
    .replaceAll("export function ", "function ").replaceAll("export const ", "const ");
  const names = [...original.matchAll(/export (?:function|const) (\w+)/g)].map(match => match[1]);
  if (file === "shoot_plan_cards") code = `const {${Object.keys(ctx.shootCore).join(",")}} = globalThis.shootCore;\n${code}`;
  const expose = file === "shoot_plan_core" ? `globalThis.shootCore = {${names.join(",")}};` : "";
  vm.runInContext(`(()=>{${code}\n${expose}})()`, ctx, {filename: file});
}
for (const [name, input] of Object.entries(schemas)) {
  const Type = class {};
  registry.set(name, Type);
  for (const extension of extensions) extension.beforeRegisterNodeDef?.(Type, {name, input});
}
const create = async (suffix = "ChinesePromptBuilder") => {
  const key = `VividMuse_ZImage${suffix}`, schema = schemas[key];
  const node = Object.assign(new (registry.get(key))(), {comfyClass: key, widgets: [], inputs: [], properties: {}, size: [360, 400],
    addWidget(type, name, value, callback, options = {}) { const widget = {type, name, value, callback, options}; this.widgets.push(widget); return widget; },
    setDirtyCanvas() {}, setSize() {}, computeSize() { return [360, 400]; },
  });
  for (const [name, [kind, options = {}]] of Object.entries({...schema.required, ...schema.optional})) {
    if (options.forceInput) continue;
    node.addWidget(Array.isArray(kind) ? "combo" : "text", name,
      options.default ?? (Array.isArray(kind) ? kind[0] : kind === "STRING" ? "" : 0), null,
      {...options, ...(Array.isArray(kind) ? {values: [...kind]} : {})});
  }
  for (const extension of extensions) await extension.nodeCreated?.(node);
  return node;
};
const api = ctx.shootCore, open = node => ctx.__vividMuseShootPlanCards.openPanel(node);
const clone = value => JSON.parse(JSON.stringify(value));
const flatten = element => [element, ...element.children.flatMap(flatten)];
const button = (panel, label) => {
  const match = flatten(panel).find(item => item.tag === "button" && item.textContent === label);
  assert.ok(match, `missing button ${label}`); return match;
};
const input = (panel, label) => {
  const match = flatten(panel).find(item => item.attributes["aria-label"] === label);
  assert.ok(match, `missing control ${label}`); return match;
};
const status = panel => flatten(panel).find(item => item.attributes.role === "status").textContent;
const sectionChecks = (panel, index) => flatten(flatten(panel).filter(item => item.tag === "section")[index])
  .filter(item => item.type === "checkbox");
const widget = (node, name) => node.widgets.find(item => item.name === name);
const values = node => JSON.stringify(node.widgets.map(item => [item.name, item.value]));
const state = node => JSON.stringify({values: JSON.parse(values(node)), properties: node.properties, inputs: node.inputs});
const search = async (panel, query) => { const control = input(panel, "搜索名称或模块"); control.value = query; await control.fire("input"); };
const changeCheck = async (check, checked) => { check.checked = checked; await check.fire("change"); };
const full = await create();
let panel = ctx.__vividMuseContentCards.openCardsPanel(full);
await button(panel, "拍摄方案卡（场景 / 摄影 / 视觉表现）").click();
assert.equal(panel.open, false); panel = full.__vividMuseCardsDialog;
assert.ok(panel.open);
assert.equal(sectionChecks(panel, 0).length, 3);
assert.ok(sectionChecks(panel, 0).every(check => check.checked && !check.disabled));
assert.ok(button(panel, "应用所选模块").disabled);
assert.match(flatten(panel).map(item => item.textContent).join("\n"), /导入只加入卡片库/);
const initial = values(full), initialProperties = clone(full.properties);
input(panel, "卡片名称（最多 80 个字符）").value = "窗边 Summer";
await button(panel, "保存为拍摄方案卡").click();
assert.equal(api.listShootPlans(full).length, 1, status(panel));
assert.equal(values(full), initial); assert.deepEqual(full.properties.vividMuseRandomLocks, initialProperties.vividMuseRandomLocks);
const card = clone(api.listShootPlans(full)[0]);
assert.deepEqual(Object.keys(card.modules), ["场景", "摄影", "视觉表现"]);
assert.equal(Object.values(card.modules).reduce((sum, module) => sum + Object.keys(module).length, 0), 28);
assert.equal(button(panel, "应用所选模块").disabled, false);
// Apply just Camera, retaining every other widget and the current editing module.
for (const check of sectionChecks(panel, 1)) if (check.value !== "摄影") await changeCheck(check, false);
const otherBefore = JSON.stringify(full.widgets.filter(item => !Object.hasOwn(card.modules["摄影"], item.name)).map(item => [item.name, item.value]));
await button(panel, "应用并锁定").click();
for (const [name, value] of Object.entries(card.modules["摄影"])) assert.equal(widget(full, name).value, value);
assert.equal(JSON.stringify(full.widgets.filter(item => !Object.hasOwn(card.modules["摄影"], item.name)).map(item => [item.name, item.value])), otherBefore);
assert.equal(full.properties.vividMuseRandomLocks.length, 7);
// A stale preview requires a second explicit click after differences refresh.
widget(full, "景别").value = "不使用";
let before = state(full);
await button(panel, "应用所选模块").click(); assert.equal(state(full), before); assert.match(status(panel), /变化/);
await button(panel, "应用所选模块").click(); assert.equal(widget(full, "景别").value, card.modules["摄影"]["景别"]);
// TXT replacement and linked targets block apply and capture without touching any fields.
widget(full, "用户摄影片段").value = "TXT override";
await button(panel, "刷新差异预览").click(); assert.ok(button(panel, "应用所选模块").disabled);
await button(panel, "刷新可保存模块").click(); assert.ok(sectionChecks(panel, 0).find(check => check.value === "摄影").disabled);
assert.match(flatten(panel).map(item => item.textContent).join("\n"), /TXT/);
widget(full, "用户摄影片段").value = ""; full.inputs = [{name: "景别", link: 1}];
await button(panel, "刷新差异预览").click(); assert.ok(button(panel, "应用所选模块").disabled);
full.inputs = []; await button(panel, "刷新差异预览").click(); assert.ok(!button(panel, "应用所选模块").disabled);
// Search matches names case-insensitively as well as module coverage.
await search(panel, "SUMMER"); assert.equal(input(panel, "已保存拍摄方案卡").options.length, 1);
assert.deepEqual(sectionChecks(panel, 1).filter(check => check.checked).map(check => check.value), ["摄影"],
  "Filtering without changing the selected card must preserve its module selection");
await search(panel, "场景"); assert.equal(input(panel, "已保存拍摄方案卡").options.length, 1);
await search(panel, "missing"); assert.equal(input(panel, "已保存拍摄方案卡").options.length, 0); assert.ok(button(panel, "应用并锁定").disabled);
await search(panel, "");
// Save, rename and delete confirmations cannot mutate on cancellation.
input(panel, "卡片名称（最多 80 个字符）").value = card.name;
await button(panel, "刷新可保存模块").click();
confirmed = false; before = state(full); await button(panel, "保存为拍摄方案卡").click(); assert.equal(state(full), before);
confirmed = true;
api.saveShootPlan(full, {...card, name: "Second"}); await search(panel, "");
input(panel, "卡片名称（最多 80 个字符）").value = "Second";
confirmed = false; before = state(full); await button(panel, "使用上方名称重命名").click(); assert.equal(state(full), before);
confirmed = true; await button(panel, "使用上方名称重命名").click();
assert.equal(api.listShootPlans(full).length, 1); assert.equal(api.listShootPlans(full)[0].name, "Second");
confirmed = false; before = state(full); await button(panel, "删除卡片").click(); assert.equal(state(full), before);
confirmed = true; const currentValues = values(full); await button(panel, "删除卡片").click();
assert.equal(api.listShootPlans(full).length, 0); assert.equal(values(full), currentValues);
// Card names are literal text; no new DOM nodes are parsed from them.
const literal = {...card, name: "<img src=x onerror=alert(1)>"}; api.saveShootPlan(full, literal); await search(panel, "");
assert.equal(input(panel, "已保存拍摄方案卡").options[0].textContent, literal.name);
assert.equal(flatten(panel).filter(item => ["img", "script"].includes(item.tag)).length, 0);
// Concurrent mutation during confirmation is preserved rather than overwritten.
api.saveShootPlan(full, {...card, name: "Second"}); await search(panel, "");
input(panel, "卡片名称（最多 80 个字符）").value = "Second";
let duringConfirm;
confirmHook = () => { api.saveShootPlan(full, {...card, name: "Concurrent"}); duringConfirm = state(full); };
await button(panel, "使用上方名称重命名").click(); confirmHook = null;
assert.equal(state(full), duringConfirm); assert.match(status(panel), /变化/);
await panel.close();
// Each independent node applies only its own module, retaining the complete card.
for (const [suffix, own] of [["SceneModule", "场景"], ["CameraModule", "摄影"], ["VisualModule", "视觉表现"]]) {
  const node = await create(suffix); api.saveShootPlan(node, card); panel = open(node);
  assert.equal(sectionChecks(panel, 0).filter(check => !check.disabled).length, 1);
  assert.deepEqual(sectionChecks(panel, 1).filter(check => check.checked).map(check => check.value), [own]);
  assert.equal(sectionChecks(panel, 1).filter(check => check.disabled).length, 2);
  before = values(node); await button(panel, "应用并锁定").click();
  for (const [name, value] of Object.entries(card.modules[own])) assert.equal(widget(node, name).value, value);
  assert.equal(node.properties.vividMuseRandomLocks.length, Object.keys(card.modules[own]).length);
  assert.deepEqual(clone(api.listShootPlans(node)[0]), card);
  await panel.close();
}
for (const suffix of ["PersonModule", "HairModule", "TxtPromptLibrary"]) {
  const node = await create(suffix); assert.throws(() => open(node));
  assert.equal(ctx.__vividMuseShootPlanCards.availableModules(node).length, 0);
}
// Capture disabled reasons are visible for unresolved random and all-empty modules.
const blocked = await create(); widget(blocked, "景别").value = "随机抽取";
for (const name of Object.keys(card.modules["场景"])) widget(blocked, name).value = "不使用";
panel = open(blocked);
assert.ok(sectionChecks(panel, 0).find(check => check.value === "摄影").disabled);
assert.ok(sectionChecks(panel, 0).find(check => check.value === "场景").disabled);
assert.ok(!sectionChecks(panel, 0).find(check => check.value === "视觉表现").disabled);
await panel.close();
// IME composition cannot trigger application or close the dialog via Escape.
panel = open(full);
for (const check of sectionChecks(panel, 1)) if (check.value !== "摄影") await changeCheck(check, false);
before = state(full); await panel.fire("compositionstart", {target: input(panel, "卡片名称（最多 80 个字符）")});
await button(panel, "应用所选模块").click(); assert.equal(state(full), before);
let prevented = false;
await panel.fire("keydown", {key: "Escape", stopPropagation() {}, preventDefault() { prevented = true; }});
assert.ok(panel.open && !prevented);
await panel.fire("compositionend", {target: input(panel, "卡片名称（最多 80 个字符）")});
assert.deepEqual(sectionChecks(panel, 1).filter(check => check.checked).map(check => check.value), ["摄影"],
  "Confirming Chinese text must not silently reselect previously excluded apply modules");
await panel.fire("keydown", {key: "Escape", stopPropagation() {}, preventDefault() {}});
assert.equal(panel.open, false);
// Closed, removed, reconfigured or graph-switched panels cannot write.
for (const invalidate of [p => p.close(), (_p, n) => n.onRemoved?.(), (_p, n) => n.onConfigure?.({}), () => { app.graph = {}; }]) {
  const node = await create(); api.saveShootPlan(node, card); panel = open(node);
  const lateApply = button(panel, "应用并锁定"); await invalidate(panel, node);
  before = state(node); await lateApply.fire("click"); assert.equal(state(node), before);
  await panel.close();
}
// Corrupt persisted collections remain untouched and show a closable error dialog.
for (const corrupt of [{unexpected: "not an array"}, [{kind: "broken"}]]) {
  const node = await create(); node.properties.vividMuseShootPlanCards = clone(corrupt);
  before = state(node); panel = open(node);
  assert.ok(panel.open, "An initialization failure must still show the dialog");
  assert.equal(node.__vividMuseCardsDialog, panel);
  assert.ok(status(panel), "Initialization errors must be visible");
  for (const label of ["保存为拍摄方案卡", "应用所选模块", "应用并锁定", "使用上方名称重命名", "删除卡片"])
    assert.ok(button(panel, label).disabled, `${label} must not mutate a corrupt collection`);
  assert.equal(state(node), before);
  const searchInput = input(panel, "搜索名称或模块");
  await panel.fire("compositionstart", {target: searchInput});
  searchInput.value = "窗边";
  await assert.doesNotReject(panel.fire("compositionend", {target: searchInput}),
    "A corrupt library must not throw from the search IME completion handler");
  assert.ok(status(panel), "Search IME errors must remain visible in the dialog");
  assert.equal(state(node), before, "Search IME must not rewrite a corrupt library");
  await button(panel, "关闭").click();
  assert.equal(panel.open, false); assert.equal(node.__vividMuseCardsDialog, null);
  assert.ok(!ctx.document.body.children.includes(panel), "Closed error dialogs must leave no orphan DOM");
  assert.equal(state(node), before);
}
// Load the real translation catalog and extension, not a fake English label map.
const catalogSource = fs.readFileSync(new URL("../web/js/i18n_catalog.js", import.meta.url), "utf8").replace("export const EN_CATALOG", "const EN_CATALOG");
vm.runInContext(`(()=>{${catalogSource}\nglobalThis.testEnglishCatalog = EN_CATALOG;})()`, ctx);
const i18nSource = fs.readFileSync(new URL("../web/js/i18n.js", import.meta.url), "utf8")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];/g, "");
vm.runInContext(`(()=>{const EN_CATALOG = globalThis.testEnglishCatalog;\n${i18nSource}})()`, ctx);
// English action names, field labels and values use the same handlers and persistence.
language = "en"; const english = await create(); panel = open(english);
input(panel, "Card name (up to 80 characters)").value = "English plan";
await button(panel, "Save Shoot Plan Card").click(); assert.equal(api.listShootPlans(english).length, 1);
await button(panel, "Apply & Lock").click(); assert.equal(english.properties.vividMuseRandomLocks.length, 28);
assert.match(status(panel), /Selected modules applied and locked/);
assert.ok(flatten(panel).filter(item => item.tag === "button").every(item => !/[\u3400-\u9fff]/u.test(item.textContent)));
assert.ok(flatten(panel).filter(item => item.tag === "pre").every(item => !/[\u3400-\u9fff]/u.test(item.textContent)),
  "English previews must translate both field names and values using the actual catalog");
assert.ok(Object.hasOwn(api.listShootPlans(english)[0].modules, "场景"), "Display translation must preserve canonical stored keys");
await button(panel, "Close").click(); assert.equal(panel.open, false);
// Portable imports preview before writing and never apply; exports retain all modules.
// Restore Chinese with the real extension's settings callback.
const realI18n = ctx.__vividMuseZImageI18n;
ctx.__vividMuseZImageI18n = {...realI18n, activeLanguage: () => "zh"};
const libraryNode = await create("CameraModule"); panel = open(libraryNode);
const importFile = async (value, size) => {
  await button(panel, "导入卡片或卡片包").click();
  const fileInput = flatten(panel).filter(e => e.type === "file").at(-1);
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  fileInput.files = [{size: size ?? new Blob([raw]).size, text: async () => raw}];
  await fileInput.fire("change"); return fileInput;
};
const libraryValues = values(libraryNode), portable = {...card, name: "portable"};
await importFile("\uFEFF" + JSON.stringify(portable));
assert.equal(api.listShootPlans(libraryNode).length, 0, "Reading file must only preview");
await button(panel, "确认导入").click();
assert.deepEqual(clone(api.listShootPlans(libraryNode)[0]), portable);
assert.equal(values(libraryNode), libraryValues);
await button(panel, "导出选中卡片").click();
assert.deepEqual(JSON.parse(await downloads.at(-1).blob.text()), portable);
assert.equal(downloads.at(-1).name, "vividmuse-shoot-plan-card.json"); assert.equal(blobs.size, 0);
await button(panel, "导出卡片包").click(); await button(panel, "确认导出卡片包").click();
assert.equal(JSON.parse(await downloads.at(-1).blob.text()).cards[0].modules["场景"]["天气状态"], portable.modules["场景"]["天气状态"]);
const replacement = clone(portable); replacement.modules["摄影"]["景别"] = "面部特写";
await importFile(replacement); before = state(libraryNode);
await button(panel, "确认导入").click(); assert.equal(state(libraryNode), before, "Default skips duplicates");
await importFile(replacement); const strategy = input(panel, "同名冲突处理"); strategy.value = "replace"; await strategy.fire("change");
confirmed = false; before = state(libraryNode); await button(panel, "确认导入").click(); assert.equal(state(libraryNode), before);
confirmed = true; await button(panel, "确认导入").click();
assert.equal(api.listShootPlans(libraryNode)[0].modules["摄影"]["景别"], "面部特写"); assert.equal(values(libraryNode), libraryValues);
await importFile({...portable, name: "after-preview"}); api.saveShootPlan(libraryNode, {...portable, name: "concurrent-import"});
before = state(libraryNode); await button(panel, "确认导入").click(); assert.equal(state(libraryNode), before); assert.match(status(panel), /变化/);
await button(panel, "确认导入").click(); assert.ok(api.listShootPlans(libraryNode).some(c => c.name === "after-preview"));
for (const invalid of ["{broken", {...portable, version: 999}, {kind: "vividmuse-shoot-plan-card-pack", version: 1, cards: [portable, {...portable, name: "bad", modules: {}}]}]) {
  before = state(libraryNode); await importFile(invalid); assert.equal(state(libraryNode), before); assert.ok(status(panel));
  assert.ok(!flatten(panel).some(e => e.tag === "button" && e.textContent === "确认导入"));
}
await importFile(portable, 1024 * 1024 + 1); assert.match(status(panel), /1 MiB/);
// Declared length cannot bypass the byte-length check, including non-ASCII text.
await importFile('中'.repeat(400000), 0); assert.match(status(panel), /1 MiB/);
// In-flight reads do not cross panel close or a newer file selection.
await button(panel, "导入卡片或卡片包").click();
let fileInput = flatten(panel).filter(e => e.type === "file").at(-1), releaseRead;
fileInput.files = [{size: 1, text: () => new Promise(resolve => {releaseRead = resolve;})}];
let read = fileInput.fire("change"); await button(panel, "导出卡片包").click(); releaseRead(JSON.stringify({...portable, name: "late"})); await read;
assert.ok(!flatten(panel).some(e => e.tag === "button" && e.textContent === "确认导入"));
await button(panel, "导入卡片或卡片包").click(); fileInput = flatten(panel).filter(e => e.type === "file").at(-1);
fileInput.files = [{size: 1, text: () => new Promise(resolve => {releaseRead = resolve;})}];
read = fileInput.fire("change"); before = state(libraryNode); await panel.close(); releaseRead(JSON.stringify(portable)); await read;
assert.equal(state(libraryNode), before);
console.log("PASS shoot plan UI: phase1 guards plus phase2 import/export, complete standalone roundtrip, preview conflicts/races, byte limits, BOM, async cancellation; mock DOM, not browser acceptance.");
