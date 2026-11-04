// Pure organization helpers. Callers supply the COMPLETE validated node card
// collection (both stores), never a filtered list. No widgets, graph or DOM writes.
// Card content validation remains the responsibility of the existing v1 validators.
export const CARD_ORGANIZATION_PROPERTY = "vividMuseCardOrganization";
export const MAX_FAVORITES = 200;
const CONTENT = "vividmuse-content-card";
const SHOOT = "vividmuse-shoot-plan-card";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const validName = name => typeof name === "string" && name.trim() === name && name.length > 0 && name.length <= 80;

export function cardReference(card) {
  if (!object(card) || !validName(card.name)) throw new Error("Invalid card identity");
  if (card.kind === CONTENT && ["人物", "发型", "服装", "姿态动作"].includes(card.module))
    return {kind: CONTENT, module: card.module, name: card.name};
  if (card.kind === SHOOT) return {kind: SHOOT, name: card.name};
  throw new Error("Invalid card identity");
}

export function cardIdentity(card) {
  const ref = cardReference(card);
  return JSON.stringify([ref.kind, ref.module ?? null, ref.name]);
}

function collection(cards) {
  if (!Array.isArray(cards) || cards.length > MAX_FAVORITES) throw new Error("Invalid card collection");
  const map = new Map();
  for (const card of cards) {
    const key = cardIdentity(card);
    if (map.has(key)) throw new Error("Duplicate card identity");
    map.set(key, card);
  }
  return map;
}

// Missing data is a writable empty collection. Corrupt/future data degrades to
// empty read-only state; callers must show warning and require explicit reset.
export function readCardOrganization(raw, cards) {
  const live = collection(cards);
  const result = (favorites = [], writable = true, warning = null) => ({favorites, writable, warning});
  if (raw === undefined) return result();
  if (object(raw) && Object.hasOwn(raw, "version") && raw.version !== 1)
    return result([], false, "unsupported_version");
  if (!exact(raw, ["version", "favorites"]) || raw.version !== 1 || !Array.isArray(raw.favorites))
    return result([], false, "invalid_organization");
  const refs = new Map();
  try {
    for (const item of raw.favorites) {
      const ref = cardReference(item);
      if (!exact(item, Object.keys(ref))) throw new Error("Invalid favorite reference");
      refs.set(cardIdentity(ref), ref);
      if (refs.size > MAX_FAVORITES) throw new Error("Favorite limit exceeded");
    }
  } catch {
    return result([], false, "invalid_organization");
  }
  return result([...refs].filter(([key]) => live.has(key)).map(([, ref]) => ref));
}

function writableState(raw, cards) {
  const state = readCardOrganization(raw, cards);
  if (!state.writable) throw new Error(state.warning);
  return state;
}

export function resetCardOrganization() { return {version: 1, favorites: []}; }

export function setCardFavorite(raw, cards, card, favorite) {
  if (typeof favorite !== "boolean") throw new Error("Favorite must be boolean");
  const live = collection(cards), key = cardIdentity(card);
  if (!live.has(key)) throw new Error("Card no longer exists");
  const state = writableState(raw, cards);
  if (state.favorites.some(ref => cardIdentity(ref) === key) === favorite)
    return {version: 1, favorites: state.favorites};
  const favorites = state.favorites.filter(ref => cardIdentity(ref) !== key);
  if (favorite) favorites.push(cardReference(live.get(key)));
  return {version: 1, favorites};
}

// Calculate organization state alongside a proposed card transaction. The host
// must commit BOTH stores and this result atomically, with undo/redo support.
// Without rename, same-identity replacements retain favorites, deleted refs drop,
// and newly imported cards never revive stale refs from the old raw state.
export function reconcileCardOrganization(raw, before, after, rename = null) {
  const oldCards = collection(before), nextCards = collection(after);
  const state = writableState(raw, before);
  let favorites = state.favorites;
  if (rename !== null) {
    if (!exact(rename, ["from", "to"])) throw new Error("Invalid rename");
    const from = cardReference(rename.from), to = cardReference(rename.to);
    const fromKey = cardIdentity(from), toKey = cardIdentity(to);
    if (from.kind !== to.kind || from.module !== to.module || !oldCards.has(fromKey)
        || !nextCards.has(toKey) || (fromKey !== toKey && nextCards.has(fromKey)))
      throw new Error("Invalid rename transition");
    const wasFavorite = favorites.some(ref => cardIdentity(ref) === fromKey);
    favorites = favorites.filter(ref => ![fromKey, toKey].includes(cardIdentity(ref)));
    if (wasFavorite) favorites.push(to);
  }
  return {version: 1, favorites: favorites.filter(ref => nextCards.has(cardIdentity(ref)))};
}

export function organizeCards(cards, raw, options = {}) {
  collection(cards);
  const {query = "", favoritesOnly = false, sort = "default", locale = "zh-CN",
    module = null, moduleLabels = {}} = options;
  if (typeof query !== "string" || typeof favoritesOnly !== "boolean"
      || !["default", "name", "favorites"].includes(sort)) throw new Error("Invalid view options");
  const state = readCardOrganization(raw, cards);
  const favorites = new Set(state.favorites.map(cardIdentity));
  const search = query.trim().toLowerCase();
  const matches = cards.map((card, index) => ({card, index})).filter(({card}) => {
    const modules = card.kind === CONTENT ? [card.module] : Object.keys(card.modules || {});
    if (module !== null && !modules.includes(module)) return false;
    // Existing content-card search is name-only; shoot plans also search modules.
    const text = card.kind === CONTENT ? card.name
      : [card.name, ...modules, ...modules.map(m => moduleLabels[m] || m)].join(" ");
    return text.toLowerCase().includes(search) && (!favoritesOnly || favorites.has(cardIdentity(card)));
  });
  const collator = sort === "name" ? new Intl.Collator(locale, {sensitivity: "base"}) : null;
  matches.sort((a, b) => {
    const order = sort === "name" ? collator.compare(a.card.name, b.card.name)
      : sort === "favorites" ? Number(favorites.has(cardIdentity(b.card))) - Number(favorites.has(cardIdentity(a.card))) : 0;
    return order || a.index - b.index;
  });
  return {cards: matches.map(item => item.card), writable: state.writable, warning: state.warning};
}

export function retainVisibleCardSelection(cards, selectedIdentity) {
  return cards.some(card => cardIdentity(card) === selectedIdentity) ? selectedIdentity : null;
}

// Host adapter: existing card validators must validate proposed content first.
// This layer coordinates card metadata only; it never applies prompt fields.
export const CONTENT_CARD_STORE = "vividMuseContentCards";
export const SHOOT_CARD_STORE = "vividMuseShootPlanCards";
const plans = new WeakMap();
const copy = value => JSON.parse(JSON.stringify(value));
const stale = () => new Error("Card state changed; preview again");

export function nodeOrganizationCards(node) {
  const content = node.properties?.[CONTENT_CARD_STORE] ?? [];
  const shoots = node.properties?.[SHOOT_CARD_STORE] ?? [];
  if (!Array.isArray(content) || !Array.isArray(shoots) || content.length > 100 || shoots.length > 100
      || content.some(c => c?.kind !== CONTENT) || shoots.some(c => c?.kind !== SHOOT))
    throw new Error("Invalid node card stores");
  const cards = [...content, ...shoots]; collection(cards); return cards;
}

function issueOrganizationPlan(node, patch) {
  const plan = Object.freeze({changed: Object.keys(patch).some(key =>
    JSON.stringify(node.properties?.[key]) !== JSON.stringify(patch[key]))});
  plans.set(plan, {node, graph: node.graph, properties: node.properties,
    generation: node.__vividMuseCardsGeneration, base: JSON.stringify(node.properties), patch: copy(patch)});
  return plan;
}

export function planNodeFavorite(node, card, favorite) {
  const cards = nodeOrganizationCards(node);
  const value = setCardFavorite(node.properties?.[CARD_ORGANIZATION_PROPERTY], cards, card, favorite);
  return issueOrganizationPlan(node, {[CARD_ORGANIZATION_PROPERTY]: value});
}

export function planNodeOrganizationReset(node) {
  // Caller must explicitly ask the user before resetting corrupt/future data.
  return issueOrganizationPlan(node, {[CARD_ORGANIZATION_PROPERTY]: resetCardOrganization()});
}

export function planNodeCardCollection(node, store, proposedCards, rename = null) {
  if (![CONTENT_CARD_STORE, SHOOT_CARD_STORE].includes(store)) throw new Error("Invalid card store");
  // Preserve the original independent-store behavior. A damaged OTHER library
  // must not block valid card edits; organization stays read-only until repaired.
  nodeOrganizationCards({properties: {[store]: node.properties?.[store]}});
  nodeOrganizationCards({properties: {[store]: proposedCards}});
  let before;
  try { before = nodeOrganizationCards(node); }
  catch { return issueOrganizationPlan(node, {[store]: proposedCards}); }
  const after = nodeOrganizationCards({properties: {...node.properties, [store]: proposedCards}});
  if (rename && ((store === CONTENT_CARD_STORE && rename.from?.kind !== CONTENT)
      || (store === SHOOT_CARD_STORE && rename.from?.kind !== SHOOT))) throw new Error("Wrong rename store");
  const raw = node.properties?.[CARD_ORGANIZATION_PROPERTY];
  const state = readCardOrganization(raw, before);
  const patch = {[store]: proposedCards};
  // Corrupt/future metadata must not block ordinary card operations or be lost.
  // Keep it untouched until an explicit reset; the panel shows its warning.
  if (raw !== undefined && state.writable)
    patch[CARD_ORGANIZATION_PROPERTY] = reconcileCardOrganization(raw, before, after, rename);
  return issueOrganizationPlan(node, patch);
}

export function commitNodeCardOrganization(node, plan) {
  const issued = plans.get(plan);
  const unchanged = () => issued && issued.node === node && issued.graph === node.graph
    && issued.properties === node.properties && issued.generation === node.__vividMuseCardsGeneration
    && issued.base === JSON.stringify(node.properties)
    && (!node.graph?.getNodeById || node.graph.getNodeById(node.id) === node);
  if (!unchanged()) throw stale();
  plans.delete(plan); // A preview is one-shot, including failed or no-op commits.
  if (!plan.changed) return false;
  const graph = node.graph;
  if (Boolean(graph?.beforeChange) !== Boolean(graph?.afterChange))
    throw new Error("Incomplete graph transaction hooks");
  const previous = node.properties;
  const next = {...previous, ...copy(issued.patch)};
  let began = false, attemptedWrite = false;
  try {
    graph?.beforeChange?.(); began = true;
    if (!unchanged()) throw stale();
    attemptedWrite = true;
    node.properties = next;
  } catch (error) {
    // Handles setters that assigned and then threw, as well as normal failures.
    if (attemptedWrite) node.properties = previous;
    if (began) graph?.afterChange?.();
    throw error;
  }
  try {
    graph?.afterChange?.();
  } catch (error) {
    node.properties = previous;
    throw error;
  }
  // Notification failures must not turn a committed undo record into an error.
  try { node.setDirtyCanvas?.(true, true); graph?.setDirtyCanvas?.(true, true); } catch { /* committed */ }
  return true;
}
