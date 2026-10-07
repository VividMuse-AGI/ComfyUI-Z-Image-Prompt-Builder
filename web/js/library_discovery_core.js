// View-only search and user preferences. No random/output state is stored here.
export const PREFERENCE_KEY = "VividMuse.ZImage.LibraryPreferences.v1";
const MAX_FAVORITES = 5000;
const normalize = value => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en");

export function filterRecords(records, {query = "", module = "", field = "", tags = [],
  untagged = false, view = "all", favorites = [], recent = []} = {}) {
  const words = normalize(query).split(/\s+/u).filter(Boolean);
  const tagSet = new Set(tags.map(normalize));
  const favoriteSet = new Set(favorites);
  const recentOrder = new Map(recent.map((id, index) => [id, index]));
  const selected = records.filter(record => {
    if (module && record.module !== module || field && record.field !== field) return false;
    if (view === "favorites" && !favoriteSet.has(record.id)) return false;
    if (view === "recent" && !recentOrder.has(record.id)) return false;
    const recordTags = record.tags || [];
    if ((tagSet.size || untagged) && !(untagged && recordTags.length === 0)
        && !recordTags.some(tag => tagSet.has(normalize(tag)))) return false;
    const haystack = normalize([record.title, record.titleEn, record.value,
      record.field, record.fieldEn, record.module, record.moduleEn,
      record.zh, record.en, ...(record.aliases || []), ...recordTags].join(" "));
    return words.every(word => haystack.includes(word));
  });
  if (view === "recent") selected.sort((a, b) => recentOrder.get(a.id) - recentOrder.get(b.id));
  return selected;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function makeTxtRecords(kind, fileName, entries) {
  const identity = entry => JSON.stringify([entry.module || "", entry.title, entry.prompt, entry.tags || []]);
  const scope = await digest(JSON.stringify([kind, fileName, entries.map(identity).sort()]));
  const counts = new Map();
  const keyed = entries.map(entry => {
    const key = identity(entry), occurrence = counts.get(key) || 0;
    counts.set(key, occurrence + 1);
    return {entry, key, occurrence};
  });
  return Promise.all(keyed.map(async ({entry, key, occurrence}) => ({
    id: `t:${scope}:${await digest(key)}:${occurrence}`, kind,
    module: entry.module || "", title: entry.title, zh: entry.prompt,
    tags: [...(entry.tags || [])], entry,
  })));
}

const validId = id => typeof id === "string" && id.length <= 2048 && (
  /^t:[a-f0-9]{64}:[a-f0-9]{64}:\d{1,4}$/u.test(id)
  || /^b:[^:\s]+:[^:\s]+$/u.test(id)
);
function validateIds(ids, max) {
  if (!Array.isArray(ids) || ids.length > max || !ids.every(validId)) throw new Error("Invalid preferences");
  return [...new Set(ids)];
}

export class LibraryPreferences {
  constructor(storage) {
    this.storage = storage;
    this.favorites = [];
    this.recent = [];
    this.warning = false;
    try {
      const raw = storage?.getItem(PREFERENCE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version !== 1) throw new Error("Unsupported preferences");
        this.favorites = validateIds(data.favorites, MAX_FAVORITES);
        this.recent = validateIds(data.recent, 20);
      }
      if (!storage) this.warning = true;
    } catch (_) { this.favorites = []; this.recent = []; this.warning = true; }
  }
  persist() {
    try {
      if (!this.storage) throw new Error("No storage");
      this.storage.setItem(PREFERENCE_KEY, JSON.stringify({version: 1, favorites: this.favorites, recent: this.recent}));
      this.warning = false;
    } catch (_) { this.warning = true; }
  }
  toggle(id) {
    if (!validId(id)) throw new Error("Invalid identity");
    if (this.favorites.includes(id)) this.favorites = this.favorites.filter(value => value !== id);
    else {
      if (this.favorites.length >= MAX_FAVORITES) throw new Error("Favorite limit reached");
      this.favorites.push(id);
    }
    this.persist();
  }
  used(id) {
    if (!validId(id)) throw new Error("Invalid identity");
    this.recent = [id, ...this.recent.filter(value => value !== id)].slice(0, 20);
    this.persist();
  }
  exportFavorites() {
    return JSON.stringify({version: 1, kind: "vividmuse-favorites", favorites: this.favorites}, null, 2);
  }
  importFavorites(raw) {
    if (typeof raw !== "string" || raw.length > 1024 * 1024) throw new Error("Invalid preference file");
    const data = JSON.parse(raw);
    if (data.version !== 1 || data.kind !== "vividmuse-favorites"
        || Object.keys(data).some(key => !["version", "kind", "favorites"].includes(key))) throw new Error("Invalid preference file");
    const imported = validateIds(data.favorites, MAX_FAVORITES);
    const merged = [...new Set([...this.favorites, ...imported])];
    if (merged.length > MAX_FAVORITES) throw new Error("Favorite limit reached");
    this.favorites = merged;
    this.persist();
  }
}
