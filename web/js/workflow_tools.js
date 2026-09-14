import { app } from "../../scripts/app.js";

const STORE = "vividMuseUserPresets";
const LOCKS = "vividMuseRandomLocks";
const UI_KEYS = ["vividMuseActiveModule", "vividMuseOnlyEnabledModule"];
const STANDARD_MODULES = new Set(["画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现"]);
const typeOf = node => node.comfyClass || node.constructor?.type;
const text = (zh, en) => globalThis.__vividMuseZImageI18n?.activeLanguage() === "en" ? en : zh;
const widgets = node => (node.widgets || []).filter(w => w.serialize !== false && w.options?.serialize !== false);
const fields = node => widgets(node).filter(w => Array.isArray(w.options?.values) && w.options.values.includes("跟随预设"));
const clone = value => JSON.parse(JSON.stringify(value));
const dirty = node => { node.setDirtyCanvas?.(true, true); app.graph?.setDirtyCanvas?.(true, true); };
const presetData = node => globalThis.__vividMuseZImagePromptData?.PRESETS?.[
  node.widgets?.find(w => w.name === "预设")?.value
] || {};

export function capturePreset(node, name) {
  name = String(name).trim();
  if (!name || name.length > 80) throw new Error(text("名称需为 1–80 个字符。", "Use a name of 1–80 characters."));
  const values = Object.fromEntries(widgets(node).filter(w =>
    typeof w.value === "string" || typeof w.value === "number" || typeof w.value === "boolean"
  ).map(w => [w.name, w.value]));
  return { version: 1, type: typeOf(node), name, values, ui: Object.fromEntries(
    UI_KEYS.filter(k => node.properties?.[k] !== undefined).map(k => [k, node.properties[k]])
  ), locks: clone(node.properties?.[LOCKS] || []) };
}

export function validatePreset(entry, node) {
  if (!entry || entry.version !== 1 || entry.type !== typeOf(node) ||
      typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 80 ||
      !entry.values || typeof entry.values !== "object" || Array.isArray(entry.values)) {
    throw new Error(text("预设格式或节点类型不匹配。", "Invalid preset format or node type."));
  }
  const known = new Map(widgets(node).map(w => [w.name, w]));
  for (const [name, value] of Object.entries(entry.values)) {
    const w = known.get(name);
    if (!w) throw new Error(text("预设包含未知字段：", "Unknown field: ") + name);
    if (typeof value !== typeof w.value || (typeof value === "number" && !Number.isFinite(value)))
      throw new Error(text("字段类型不正确：", "Invalid value type: ") + name);
    if (name === "随机种子" && !Number.isInteger(value))
      throw new Error(text("随机种子必须是整数。", "Random seed must be an integer."));
    if (name === "尺寸对齐倍数" && (!Number.isInteger(value) || value % 4))
      throw new Error(text("对齐倍数必须是 4 的整数倍。", "Alignment must be an integer multiple of 4."));
    const choices = w.options?.values;
    // Dependent dropdowns are checked against the full built-in preset catalog as well.
    if (Array.isArray(choices) && !choices.includes(value)) {
      const original = w.__vividMuseAllValues || [];
      const data = globalThis.__vividMuseZImagePromptData || {};
      const dependent = {
        "写真主题": Object.values(data.THEME_OPTIONS_BY_CATEGORY || {}).flat(),
        "地域族裔分支": Object.values(data.ETHNICITY_BRANCHES_BY_CATEGORY || {}).flat(),
        "场景地点": Object.values(data.SCENE_LOCATIONS_BY_CATEGORY || {}).flat(),
      }[name] || original;
      if (!dependent.includes(value)) throw new Error(text("字段选项已失效：", "Unavailable option: ") + name);
    }
    if (typeof value === "number" && ((w.options?.min != null && value < w.options.min) ||
        (w.options?.max != null && value > w.options.max))) throw new Error(text("数值超出范围：", "Value out of range: ") + name);
  }
  const allowed = new Set(fields(node).map(w => w.name));
  if (entry.locks && (!Array.isArray(entry.locks) || entry.locks.some(k => !allowed.has(k))))
    throw new Error(text("锁定字段不正确。", "Invalid locked fields."));
  if (entry.ui !== undefined && (
      !entry.ui || typeof entry.ui !== "object" || Array.isArray(entry.ui) ||
      Object.entries(entry.ui).some(([key, value]) =>
        !UI_KEYS.includes(key) || typeof value !== "string" || !STANDARD_MODULES.has(value)))) {
    throw new Error(text("模块状态不正确。", "Invalid module state."));
  }
  return entry;
}

export function applyUserPreset(node, entry) {
  validatePreset(entry, node); // Validate the whole entry before changing any value.
  const values = entry.values;
  // Restore parent controls before dependent fields and before onConfigure refresh.
  for (const w of widgets(node)) if (Object.hasOwn(values, w.name)) w.value = values[w.name];
  for (const [name, value] of Object.entries(globalThis.__vividMuseResolution?.defaults || {})) {
    const widget = widgets(node).find(w => w.name === name);
    if (widget && !Object.hasOwn(values, name)) widget.value = value;
  }
  node.properties ??= {};
  for (const key of UI_KEYS) {
    delete node.properties[key];
    if (entry.ui?.[key] !== undefined) node.properties[key] = entry.ui[key];
  }
  node.properties[LOCKS] = clone(entry.locks || []);
  node.onConfigure?.({});
  globalThis.__vividMuseZImageI18n?.localizeNode(node);
  dirty(node);
}

export function lockFields(node, names) {
  const requested = new Set(names);
  if (names.some(name => /^(上装|下装|连衣裙|连体服)/.test(name))) requested.add("穿搭结构");
  for (const [parent, children] of [
    ["写真大类", ["写真主题"]],
    ["族裔大类", ["地域族裔分支"]],
    ["场景大类", ["场景地点"]],
    ["穿搭结构", ["上装类型", "下装类型", "连衣裙类型", "连体服类型"]],
    ["妆容模式", ["整体妆容预设", "底妆质感", "眼影色系", "眼线造型", "唇妆颜色", "唇面质感"]],
    ["发色模式", ["发色色调", "染色方式"]],
  ]) if (children.some(child => requested.has(child))) requested.add(parent);
  const selected = fields(node).filter(w => requested.has(w.name));
  const preset = presetData(node);
  for (const w of selected) {
    if (w.value === "随机抽取") throw new Error(text(
      "请先为随机字段选择具体值，再锁定：", "Choose a concrete value before locking: ") + w.name);
    if (w.value === "跟随预设" && preset[w.name] === undefined) throw new Error("Missing preset value: " + w.name);
  }
  for (const w of selected) if (w.value === "跟随预设") w.value = preset[w.name];
  node.properties ??= {};
  node.properties[LOCKS] = selected.map(w => w.name);
  dirty(node);
}

export function findConflicts(node) {
  const preset = presetData(node);
  const values = Object.fromEntries(widgets(node).map(w => [w.name,
    w.value === "跟随预设" ? preset[w.name] : w.value]));
  const results = [];
  const close = ["面部特写", "头肩近景", "胸部以上"].includes(values["景别"]);
  if (close && values["鞋履"] && !["不使用", "随机抽取"].includes(values["鞋履"]))
    results.push(text("近景中通常看不到鞋履；标准/精简输出会省略鞋袜，详细输出保留。", "Footwear is usually outside a close portrait; concise/standard omit legwear and shoes, detailed keeps them."));
  if (/坐|跪|卧/.test(values["基础姿态"] || "") && values["腿部动作"] === "自然迈步")
    results.push(text("坐姿、跪姿或卧姿与自然迈步可能冲突。", "A seated, kneeling or lying pose may conflict with walking."));
  if (/站立/.test(values["基础姿态"] || "") && /坐姿|盘腿/.test(values["腿部动作"] || ""))
    results.push(text("站立姿态与坐姿腿部动作可能冲突。", "Standing may conflict with a seated leg action."));
  if (["随机抽取", "不使用"].includes(values["穿搭结构"])) {
    const selected = prefix => ["类型", "颜色", "材质", "图案"].some(suffix =>
      values[prefix + suffix] && !["不使用", "随机抽取", "跟随预设"].includes(values[prefix + suffix]));
    const branches = [selected("连衣裙"), selected("连体服"), selected("上装") || selected("下装")];
    if (branches.filter(Boolean).length > 1)
      results.push(text(
        "不同穿搭分支同时有已选衣物，请确认是否为有意叠穿。随机穿搭结构时会保留这些选择，不追加其他随机衣物。",
        "Selections span incompatible outfit branches; check whether layering is intentional. A random structure will keep these selections without adding other random garments."));
  }
  const locked = new Set(node.properties?.[LOCKS] || []);
  for (const [parent, child, table] of [
    ["写真大类", "写真主题", "THEME_OPTIONS_BY_CATEGORY"],
    ["族裔大类", "地域族裔分支", "ETHNICITY_BRANCHES_BY_CATEGORY"],
    ["场景大类", "场景地点", "SCENE_LOCATIONS_BY_CATEGORY"],
  ]) {
    const allowed = globalThis.__vividMuseZImagePromptData?.[table]?.[values[parent]];
    if (allowed && values[child] && !["不使用", "随机抽取"].includes(values[child]) && !allowed.includes(values[child]))
      results.push(text("分类与子选项不一致：", "Category and selection differ: ") + parent + " / " + child +
        (locked.has(child) ? text("（子选项已锁定）", " (selection locked)") : ""));
  }
  if (Object.values(values).includes("随机抽取"))
    results.push(text("随机字段尚未解析；这里只检查当前明确选项。", "Random values are unresolved; only current concrete selections are checked."));
  return results;
}

function openPanel(node) {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "max-width:640px;width:85vw;max-height:85vh;overflow:auto;background:#242424;color:#eee;border:1px solid #777;border-radius:10px;padding:20px";
  const title = document.createElement("h3");
  title.textContent = text("用户预设、随机锁定与组合检查", "User Presets, Random Locks & Checks");
  dialog.append(title);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const guarded = fn => async () => { try { await fn(); } catch(e) { status.textContent = e.message; } };
  const row = () => { const el=document.createElement("div"); el.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"; dialog.append(el); return el; };
  const button = (parent, zh, en, fn) => {
    const b=document.createElement("button"); b.type="button"; b.textContent=text(zh,en);
    b.addEventListener("click", guarded(fn)); parent.append(b); return b;
  };
  const name = document.createElement("input");
  name.placeholder=text("输入预设名称", "Preset name"); name.maxLength=80;
  const select=document.createElement("select");
  const saved = () => Array.isArray(node.properties?.[STORE]) ? node.properties[STORE] : [];
  const refresh = () => {
    select.replaceChildren();
    for (const entry of saved()) { const o=document.createElement("option"); o.value=entry.name; o.textContent=entry.name; select.append(o); }
  };
  const saveEntry = entry => {
    validatePreset(entry,node);
    node.properties ??= {};
    const entries=saved();
    if (entries.length >= 100 && !entries.some(p=>p.name===entry.name)) throw new Error(text("最多保存100套预设。","Maximum 100 saved presets."));
    node.properties[STORE]=[...entries.filter(p=>p.name!==entry.name),clone(entry)];
    refresh(); select.value=entry.name; dirty(node);
  };
  row().append(name,select);
  const actions=row();
  button(actions,"保存当前状态","Save Current",()=>{
    const entry=capturePreset(node,name.value);
    if(saved().some(p=>p.name===entry.name) && !window.confirm(text("覆盖同名预设？","Replace this saved preset?"))) return;
    saveEntry(entry); status.textContent=text("已保存到本节点，保存工作流后会保留。","Saved in this node; save the workflow to keep it.");
  });
  button(actions,"应用选中预设","Apply",()=>{
    const entry=saved().find(p=>p.name===select.value);
    if(!entry) throw new Error(text("先选择预设。","Select a preset first."));
    applyUserPreset(node,entry); renderLocks(); status.textContent=text("已恢复字段、自由文本和模块状态。","Fields, free text and module state restored.");
  });
  button(actions,"导出选中预设","Export",()=>{
    const entry=saved().find(p=>p.name===select.value);
    if(!entry) throw new Error(text("先选择预设。","Select a preset first."));
    const url=URL.createObjectURL(new Blob([JSON.stringify(entry,null,2)],{type:"application/json"}));
    const a=document.createElement("a"); a.href=url; a.download="zimage-user-preset.json"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const file=document.createElement("input"); file.type="file"; file.accept=".json,application/json"; file.hidden=true; dialog.append(file);
  button(actions,"导入预设","Import",()=>file.click());
  file.addEventListener("change",guarded(async()=>{
    const selected=file.files?.[0]; if(!selected)return;
    if(selected.size>1024*1024)throw new Error(text("文件不能超过1MB。","File must be at most 1 MB."));
    const entry=validatePreset(JSON.parse(await selected.text()),node);
    if(saved().some(p=>p.name===entry.name) && !window.confirm(text("覆盖同名预设？","Replace this saved preset?"))) return;
    saveEntry(entry); file.value=""; status.textContent=text("导入完成；点击应用后生效。","Imported; click Apply to use it.");
  }));
  button(actions,"删除选中预设","Delete",()=>{
    if(!select.value || !window.confirm(text("删除选中的已保存预设？","Delete the selected saved preset?"))) return;
    node.properties[STORE]=saved().filter(p=>p.name!==select.value);refresh();dirty(node);
  });
  const hint=document.createElement("p");
  hint.textContent=text("随机锁定只约束随机按钮；手动编辑、切换预设和清空仍然有效。勾选字段后点击保存锁定。跟随预设会固定为当前预设值；随机字段需先选具体值。","Locks affect random buttons only. Manual edits, preset changes and clearing remain available. Check fields and save locks. Follow Preset becomes a concrete value; choose a concrete value before locking a Random field.");
  dialog.append(hint);
  const locks=document.createElement("div"); locks.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:220px;overflow:auto";dialog.append(locks);
  const renderLocks=()=>{
    locks.replaceChildren();
    for(const w of fields(node)) {
      const label=document.createElement("label"), check=document.createElement("input");check.type="checkbox";check.value=w.name;
      check.checked=(node.properties?.[LOCKS]||[]).includes(w.name);
      label.append(check,document.createTextNode(w.label||w.name)); locks.append(label);
    }
  };
  button(row(),"保存锁定","Save Locks",()=>{
    lockFields(node,[...locks.querySelectorAll("input:checked")].map(e=>e.value));
    renderLocks();
    status.textContent=text("随机锁定已保存。","Random locks saved.");
  });
  button(row(),"检查当前组合","Check Combination",()=>{
    status.textContent=findConflicts(node).join("\n") || text("未发现已知的明显冲突；这不代表生图效果已验证。","No known obvious conflicts found; image quality is not verified.");
  });
  status.style.whiteSpace="pre-wrap";dialog.append(status);
  button(row(),"关闭","Close",()=>dialog.close());
  refresh();renderLocks();
  dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();
}

app.registerExtension({
  name:"VividMuse.ZImagePromptBuilder.WorkflowTools",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if(nodeData.name !== "VividMuse_ZImageChinesePromptBuilder" && !/^VividMuse_ZImage(?:Canvas|Person|Hair|Clothing|Pose|Scene|Camera|Visual)Module$/.test(nodeData.name)) return;
    const previous=nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions=function(_,options) {
      const result=previous?.apply(this,arguments);
      options.push({content:text("用户预设 / 随机锁定 / 组合检查","User Presets / Random Locks / Checks"),callback:()=>openPanel(this)});
      return result;
    };
  },
});
