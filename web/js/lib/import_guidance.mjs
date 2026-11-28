// Read-only import guidance. A declaration match is NEVER schema validation.
export const IMPORT_MAX_BYTES = 1024 * 1024;
const KINDS = new Map([
  ["vividmuse-content-card", ["content-card", "内容卡片", "Content Card"]],
  ["vividmuse-content-card-pack", ["content-pack", "内容卡片包", "Content Card Pack"]],
  ["vividmuse-shoot-plan-card", ["shoot-plan", "拍摄方案卡", "Shoot Plan Card"]],
  ["vividmuse-shoot-plan-card-pack", ["shoot-plan", "拍摄方案卡包", "Shoot Plan Card Pack"]],
  ["vividmuse-favorites", ["favorites", "素材收藏", "Material Favorites"]],
  ["vividmuse-prompt-result", [null, "提示词结果记录", "Prompt Result Record"]],
  ["vividmuse-txt-selection-result", [null, "TXT 抽取结果记录", "TXT Selection Result Record"]],
]);
const ENTRIES = new Map([
  ["content-card", ["内容卡片", "Content Cards", "卡片管理 / 模块锁定 → 导入卡片", "Cards / Module Locks → Import Card"]],
  ["content-pack", ["内容卡片包", "Content Card Packs", "卡片管理 / 模块锁定 → 导入卡片包", "Cards / Module Locks → Import Card Pack"]],
  ["shoot-plan", ["拍摄方案卡或卡片包", "Shoot Plan Cards or Packs", "卡片管理 / 模块锁定 → 拍摄方案卡 → 导入卡片或卡片包", "Cards / Module Locks → Shoot Plan Cards → Import Card or Pack"]],
  ["favorites", ["素材收藏", "Material Favorites", "素材搜索与收藏 → 导入收藏", "Search & Favorites → Import Favorites"]],
  ["preset", ["用户预设", "User Presets", "用户预设 / 随机锁定 / 组合检查 → 导入预设", "User Presets / Random Locks / Combination Check → Import"]],
]);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const checkEntry = entry => { if (!ENTRIES.has(entry)) throw new TypeError("Unknown import entry"); };

export function inspectImportText(raw, entry, {stripBom = false} = {}) {
  checkEntry(entry);
  const result = status => ({status, entry});
  if (typeof raw !== "string") return result("invalid-json");
  if (new Blob([raw]).size > IMPORT_MAX_BYTES) return result("too-large");
  let data;
  try { data = JSON.parse(stripBom ? raw.replace(/^\uFEFF/, "") : raw); }
  catch { return result("invalid-json"); }
  if (!record(data)) return result("unknown-format");
  const declared = KINDS.get(data.kind);
  const possiblePreset = !own(data, "kind") && own(data, "version")
    && typeof data.type === "string" && typeof data.name === "string" && record(data.values);
  if (declared) {
    const [expected] = declared;
    if (!expected) return {...result("result-record"), kind: data.kind};
    if (entry !== expected) return {...result("wrong-entry"), kind: data.kind, expected};
  } else if (possiblePreset && entry !== "preset") {
    return {...result("wrong-entry"), expected: "preset", possiblePreset: true};
  } else if (entry !== "preset") {
    return result("unknown-format");
  }
  // The legacy preset validator permits extra keys, including an unknown kind.
  // Do not reject those files here; known declarations above still guide users.
  // Invalid/missing version types stay with the original schema validator.
  if (Number.isInteger(data.version) && data.version !== 1) return result("unsupported-version");
  return {...result("needs-validation"), data};
}

export async function readImportFile(file, entry, {stripBom = false, isCurrent = () => true} = {}) {
  checkEntry(entry);
  const result = status => ({status, entry});
  if (!file) return result("cancelled");
  if (!isCurrent()) return result("stale");
  if (!Number.isFinite(file.size) || file.size < 0) return result("read-failed");
  if (file.size > IMPORT_MAX_BYTES) return result("too-large");
  if (typeof file.text !== "function") return result("read-failed");
  let raw;
  try { raw = await file.text(); }
  catch { return result(isCurrent() ? "read-failed" : "stale"); }
  if (!isCurrent()) return result("stale");
  return inspectImportText(raw, entry, {stripBom});
}

// Return data only for the original validator. Stale/cancelled reads are silent.
export function readImportData(file, entry, options = {}) {
  return readImportFile(file, entry, options).then(result => {
    if (["cancelled", "stale"].includes(result.status)) return null;
    if (result.status !== "needs-validation") throw new Error(importGuidanceMessage(result,
      globalThis.__vividMuseZImageI18n?.activeLanguage() || "zh"));
    return result.data;
  });
}

export function createImportSession(node, host, isOpen) {
  const root = host.rootGraph || host.graph, owner = node.graph;
  const generation = node.__vividMuseCardsGeneration || 0;
  let ticket = 0;
  const belongs = (graph, seen = new Set()) => {
    if (!graph || seen.has(graph)) return false;
    seen.add(graph);
    return graph.getNodeById?.(node.id) === node || (graph._nodes || []).some(child => child.subgraph && belongs(child.subgraph, seen));
  };
  const live = () => isOpen() && (host.rootGraph || host.graph) === root && node.graph === owner
    && (node.__vividMuseCardsGeneration || 0) === generation
    && (!owner?.getNodeById || owner.getNodeById(node.id) === node)
    && (!root?.getNodeById || belongs(root));
  return {start() { const current = ++ticket; return () => current === ticket && live(); }, live};
}

// Return plain text only. UI callers must render via textContent, never HTML.
export function importGuidanceMessage(result, language = "zh") {
  const en = language === "en";
  const text = (zh, english) => en ? english : zh;
  if (["cancelled", "stale", "needs-validation"].includes(result.status)) return "";
  const unchanged = text("已有数据未改变。", "Existing data is unchanged.");
  const target = ENTRIES.get(result.entry);
  const expectedLabel = target?.[en ? 1 : 0] || text("本入口支持的文件", "files supported by this entry");
  let message;
  switch (result.status) {
    case "too-large": message = text("文件不能超过 1 MiB（1,048,576 字节）。", "File must be at most 1 MiB (1,048,576 bytes)."); break;
    case "invalid-json": message = text("文件为空或无法读取为有效 JSON。", "The file is empty or cannot be parsed as valid JSON."); break;
    case "read-failed": message = text("无法读取文件，请重新选择。", "Could not read the file. Select it again."); break;
    case "unsupported-version": message = text("此入口暂不支持该文件版本；不会自动转换。", "This file version is not supported by this entry; no automatic conversion is performed."); break;
    case "result-record": message = text("文件声明为执行结果记录，不是可还原导入的卡片。可查看或复用其中的提示词文本。", "The file declares an execution result record, not an importable card. You can view or reuse its prompt text."); break;
    case "wrong-entry": {
      const type = KINDS.get(result.kind)?.[en ? 2 : 1];
      const destination = ENTRIES.get(result.expected)?.[en ? 3 : 2];
      if (!destination) break;
      const declaration = result.possiblePreset
        ? text("文件疑似用户预设", "The file appears to be a User Preset")
        : text(`文件声明为“${type}”`, `The file declares ${type}`);
      message = text(`${declaration}，当前入口用于“${expectedLabel}”。请在完整节点中打开 ${destination}；目标入口仍会校验文件内容。`,
        `${declaration}, but this entry imports ${expectedLabel}. On the full builder, open ${destination}; the destination still validates the file contents.`);
      break;
    }
  }
  return (message || text(`无法识别文件格式；当前入口需要${expectedLabel}。`, `Unrecognized file format; this entry expects ${expectedLabel}.`)) + " " + unchanged;
}
