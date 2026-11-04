import assert from "node:assert/strict";
import fs from "node:fs";

// Import the actual pure ES module without requiring a package.json type change.
const source = fs.readFileSync(new URL("../web/js/card_organization.js", import.meta.url), "utf8");
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const content = (name, module = "人物") => ({kind: "vividmuse-content-card", version: 1, module, name, values: {fixture: "kept"}});
const shoot = name => ({kind: "vividmuse-shoot-plan-card", version: 1, name, modules: {摄影: {fixture: "kept"}}});
const a = content("共同名称"), b = content("共同名称", "服装"), c = shoot("共同名称");
const cards = [a, b, c];
const key = api.cardIdentity;
const org = favorites => ({version: 1, favorites: favorites.map(api.cardReference)});
const clone = value => JSON.parse(JSON.stringify(value));
let groups = 0;
function test(name, fn) { fn(); groups++; console.log("PASS " + name); }

test("legacy read has no writes; structured identities separate kinds and modules", () => {
  const node = {properties: {}, cards: clone(cards)};
  const before = JSON.stringify(node);
  assert.deepEqual(api.readCardOrganization(undefined, cards), {favorites: [], writable: true, warning: null});
  assert.equal(JSON.stringify(node), before);
  assert.equal(new Set(cards.map(key)).size, 3);
  assert.notEqual(key(content('a|服装|b')), key(content('b', '服装')));
});
test("favorites are independent snapshots without editing v1 cards", () => {
  const before = JSON.stringify(cards), empty = org([]);
  const next = api.setCardFavorite(empty, cards, a, true);
  assert.deepEqual(next, org([a]));
  next.favorites[0].name = "changed";
  assert.equal(JSON.stringify(cards), before);
  assert.deepEqual(empty, org([]));
  assert.deepEqual(api.setCardFavorite(org([a, b]), cards, a, false), org([b]));
});
test("malformed and future data degrade read-only; reset is explicit", () => {
  for (const raw of [null, [], {}, {version: 1, favorites: 'x'}, {version: 1, favorites: [null]},
    {version: 1, favorites: [{...api.cardReference(a), extra: true}]}, {version: 1, favorites: [], extra: 1},
    {version: 2, favorites: []}]) {
    const before = JSON.stringify(raw);
    assert.equal(api.readCardOrganization(raw, cards).writable, false);
    assert.deepEqual(api.readCardOrganization(raw, cards).favorites, []);
    assert.throws(() => api.setCardFavorite(raw, cards, a, true));
    assert.equal(JSON.stringify(raw), before);
  }
  assert.deepEqual(api.resetCardOrganization(), org([]));
});
test("capacity, duplicate refs, orphan cleanup and safe special names", () => {
  const all = Array.from({length: 100}, (_, i) => content(String(i))).concat(
    Array.from({length: 100}, (_, i) => shoot(String(i))));
  assert.equal(api.readCardOrganization(org(all), all).favorites.length, 200);
  assert.equal(api.readCardOrganization(org([...all, all[0]]), all).favorites.length, 200);
  assert.equal(api.readCardOrganization(org([...all, shoot('overflow')]), all).writable, false);
  const special = content('__proto__');
  assert.deepEqual(api.setCardFavorite(undefined, [special], special, true), org([special]));
  assert.deepEqual(api.readCardOrganization(org([a, content('gone'), a]), cards).favorites, org([a]).favorites);
  assert.deepEqual(api.setCardFavorite(org([a, content('gone')]), cards, b, true), org([a, b]));
  assert.throws(() => api.cardReference(content(' ')));
  assert.throws(() => api.cardReference(content('😀'.repeat(41))));
  assert.throws(() => api.setCardFavorite(undefined, cards, content('missing'), true));
});
test("filter is intersection; module names canonical and translated; no auto selection", () => {
  assert.deepEqual(api.organizeCards(cards, org([b]), {query: '共同', favoritesOnly: true}).cards, [b]);
  assert.deepEqual(api.organizeCards(cards, undefined, {module: '摄影'}).cards, [c]);
  assert.deepEqual(api.organizeCards(cards, undefined, {query: 'camera', moduleLabels: {摄影: 'Camera'}}).cards, [c]);
  assert.deepEqual(api.organizeCards(cards, undefined, {query: '人物'}).cards, []);
  assert.equal(api.retainVisibleCardSelection([b, c], key(a)), null);
  assert.equal(api.retainVisibleCardSelection([c, b], key(b)), key(b));
  assert.equal(api.retainVisibleCardSelection(cards, null), null);
  const unfavorited = api.setCardFavorite(org([a]), cards, a, false);
  assert.deepEqual(api.organizeCards(cards, unfavorited, {favoritesOnly: true}).cards, []);
});
test("stable locale sort, favorites-first and default leave original arrays unchanged", () => {
  const list = [content('z'), content('A'), content('a', '服装'), shoot('窗边'), shoot('花园')];
  const before = JSON.stringify(list);
  assert.deepEqual(api.organizeCards(list, org([list[3]]), {sort: 'favorites'}).cards,
    [list[3], ...list.filter((_, i) => i !== 3)]);
  for (const locale of ['en', 'zh-CN']) {
    const compare = new Intl.Collator(locale, {sensitivity:'base'}).compare;
    const expected = list.map((card, i) => ({card,i})).sort((a,b) => compare(a.card.name,b.card.name) || a.i-b.i).map(x=>x.card);
    assert.deepEqual(api.organizeCards(list, undefined, {sort:'name',locale}).cards, expected);
  }
  assert.deepEqual(api.organizeCards(list, undefined).cards, list);
  assert.equal(JSON.stringify(list), before);
});
test("rename source wins over target favorite; type/module cannot change", () => {
  const renamed = {...a, name:'new'}, target = content('new');
  assert.deepEqual(api.reconcileCardOrganization(org([a]), cards, [renamed,b,c], {from:a,to:renamed}), org([renamed]));
  assert.deepEqual(api.reconcileCardOrganization(org([target]), [...cards,target], [renamed,b,c], {from:a,to:renamed}), org([]));
  assert.deepEqual(api.reconcileCardOrganization(org([a,target]), [...cards,target], [renamed,b,c], {from:a,to:renamed}), org([renamed]));
  assert.throws(() => api.reconcileCardOrganization(org([a]), cards, cards, {from:a,to:b}));
  assert.throws(() => api.reconcileCardOrganization(org([a]), cards, [...cards,renamed], {from:a,to:renamed}));
});
test("delete, same-name replacement and import do not revive orphan favorites", () => {
  const incoming = content('incoming');
  assert.deepEqual(api.reconcileCardOrganization(org([a,b]), cards, [b,c]), org([b]));
  assert.deepEqual(api.reconcileCardOrganization(org([a]), cards, [{...a,values:{fixture:'changed'}},b,c]), org([a]));
  assert.deepEqual(api.reconcileCardOrganization(org([a,incoming]), cards, [...cards,incoming]), org([a]));
  assert.deepEqual(api.reconcileCardOrganization(org([a]), cards, cards), org([a]));
});
test("invalid requests do not mutate any input; pure helpers cannot touch node state", () => {
  const raw = org([a]); const before = JSON.stringify({raw,cards});
  assert.throws(() => api.setCardFavorite(raw,cards,a,'yes'));
  assert.throws(() => api.organizeCards([...cards,a],raw));
  assert.throws(() => api.organizeCards(cards,raw,{sort:'random'}));
  assert.throws(() => api.reconcileCardOrganization(raw,cards,[b,c],{from:a,to:a}));
  assert.equal(JSON.stringify({raw,cards}), before);
  assert.deepEqual(api.organizeCards([],undefined).cards, []);
});
test("workflow JSON roundtrip preserves sidecar, portable card JSON unchanged", () => {
  const props = {[api.CARD_ORGANIZATION_PROPERTY]: api.setCardFavorite(undefined,cards,a,true), cards:clone(cards), seed:42, locks:['x'], free:'keep'};
  const read = clone(props);
  assert.deepEqual(api.readCardOrganization(read[api.CARD_ORGANIZATION_PROPERTY], read.cards).favorites, org([a]).favorites);
  assert.deepEqual(read.cards,cards);
  assert.equal(read.seed,42); assert.deepEqual(read.locks,['x']); assert.equal(read.free,'keep');
  assert.equal(JSON.stringify(read.cards),JSON.stringify(cards));
});
test("hair/pose identities coexist with old names and retain favorites through rename", () => {
  const hair = content("共同名称", "发型"), pose = content("共同名称", "姿态动作");
  const all = [...cards, hair, pose];
  assert.equal(new Set(all.map(key)).size, 5);
  const favorite = api.setCardFavorite(undefined, all, hair, true);
  const renamed = {...hair, name: "新发型"};
  const next = all.map(c => c === hair ? renamed : c);
  const migrated = api.reconcileCardOrganization(favorite, all, next, {from: hair, to: renamed});
  assert.deepEqual(api.readCardOrganization(migrated, next).favorites, [api.cardReference(renamed)]);
  assert.throws(() => key(content("unknown", "未知")));
});
console.log(`PASS ${groups} organization core groups; no UI integration or host undo/redo claimed.`);
