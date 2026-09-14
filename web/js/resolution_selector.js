import { app } from "../../scripts/app.js";
import { RESOLUTION_CATALOG as CATALOG } from "./resolution_catalog.js";

const FULL = "VividMuse_ZImageChinesePromptBuilder";
const CANVAS = "VividMuse_ZImageCanvasModule";
const EXPANDED = "vividMuseResolutionExpanded";
const DEFAULTS = CATALOG.defaults;
const PIXEL_MODE = CATALOG.pixelMode;
const BUDGET_FIELD = "目标总像素（万）";
const byName = (node, name) => node.widgets?.find(w => w.name === name);
const typeOf = node => node.comfyClass || node.constructor?.type;
const language = () => globalThis.__vividMuseZImageI18n?.activeLanguage() || "zh";
const text = (zh, en, lang = language()) => lang === "en" ? en : zh;

// Python uses ties-to-even; Math.round alone would disagree at exact halves.
export function roundEven(value) {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? floor + floor % 2 : Math.round(value);
}

export function calculateResolution(aspect, mode, mp, multiple) {
  if (!Object.hasOwn(CATALOG.sizes, aspect)) throw new Error("aspect");
  if (mode === "原推荐尺寸") return [...CATALOG.sizes[aspect]];
  if (mode !== "按总像素计算" || typeof mp !== "number" || !Number.isFinite(mp)
      || mp < 0.1 || mp > 16 || !Number.isInteger(multiple)
      || multiple < 8 || multiple > 128 || multiple % 4) throw new Error("resolution");
  const [, w, h] = /^(\d+):(\d+)/u.exec(aspect).map(Number);
  const scale = Math.sqrt(mp * 1024 * 1024 / (w * h));
  return [roundEven(w * scale / multiple) * multiple, roundEven(h * scale / multiple) * multiple];
}

export function calculatePixelResolution(aspect, budget, multiple) {
  if (!Object.hasOwn(CATALOG.sizes, aspect) || typeof budget !== "number"
      || !Number.isFinite(budget) || budget < 10 || budget > 1600
      || !Number.isInteger(multiple) || multiple < 8 || multiple > 128 || multiple % 4)
    throw new Error("pixel budget");
  let [, w, h] = /^(\d+):(\d+)/u.exec(aspect).map(Number);
  let a = w, b = h;
  while (b) [a, b] = [b, a % b];
  const wu = w / a * multiple, hu = h / a * multiple;
  const target = budget * 10000, unitArea = wu * hu;
  const lower = Math.max(1, Math.floor(Math.sqrt(target / unitArea)));
  const upper = lower + 1;
  const count = Math.abs(lower * lower * unitArea - target) <= Math.abs(upper * upper * unitArea - target)
    ? lower : upper;
  return [wu * count, hu * count];
}

export function previewResolution(node) {
  const backing = node.__vividMuseResolution?.backing;
  const value = name => (backing?.[name] || byName(node, name))?.value ?? DEFAULTS[name];
  if ((node.inputs || []).some(input => input.link != null &&
      ["画面比例", "预设", ...Object.keys(DEFAULTS)].includes(input.name))) return { status: "linked" };
  let aspect = byName(node, "画面比例")?.value;
  if (aspect === "随机抽取") return { status: "random" };
  let preset = byName(node, "预设")?.value || CATALOG.defaultPreset;
  preset = CATALOG.legacyPresets[preset] || preset;
  let fallback = false;
  if (aspect === "跟随预设" || aspect == null) {
    aspect = CATALOG.presetAspects[preset] || CATALOG.presetAspects[CATALOG.defaultPreset];
  } else if (!Object.hasOwn(CATALOG.sizes, aspect)) {
    fallback = true;
    // Preserve each node's existing empty-canvas resolution contract.
    aspect = CATALOG.presetAspects[typeOf(node) === CANVAS ? CATALOG.defaultPreset : preset]
      || CATALOG.presetAspects[CATALOG.defaultPreset];
  }
  try {
    const mode = value("分辨率模式");
    const size = mode === PIXEL_MODE
      ? calculatePixelResolution(aspect, value(BUDGET_FIELD), value("尺寸对齐倍数"))
      : calculateResolution(aspect, mode, value("目标总像素"), value("尺寸对齐倍数"));
    return { status: "ready", fallback, size, legacy: mode !== PIXEL_MODE };
  } catch { return { status: "invalid" }; }
}

function previewLabel(node, lang) {
  const preview = previewResolution(node);
  const prefix = text("分辨率", "Resolution", lang);
  const suffix = node.properties?.[EXPANDED] ? " ▾" : " ▸";
  if (preview.status === "random") return prefix + text("：随机比例，运行后确定", ": random aspect; resolved on run", lang) + suffix;
  if (preview.status === "linked") return prefix + text("：使用连接输入", ": using connected inputs", lang) + suffix;
  if (preview.status === "invalid") return prefix + text("：参数无效", ": invalid settings", lang) + suffix;
  const actual = preview.size[0] * preview.size[1] / 1000000;
  const pixelText = actual.toFixed(3) + " MP";
  return prefix + ": " + preview.size.join(" × ") + " · " + pixelText +
    (preview.legacy ? text("（旧）", " (legacy)", lang) : "") +
    (preview.fallback ? text("（预设比例兜底）", " (preset fallback)", lang) : "") + suffix;
}

function visible(widget, show) {
  if (!widget) return false;
  const hidden = !show;
  if (widget.__resolutionHidden === hidden) return false;
  // Native widgets legitimately have no computeSize hook. Capture that undefined
  // once; using ??= on show would save the temporary hidden-size hook instead.
  if (!Object.hasOwn(widget, "__resolutionOriginalSize")) {
    widget.__resolutionOriginalType = widget.type;
    widget.__resolutionOriginalSize = widget.computeSize;
  }
  widget.options ??= {};
  widget.hidden = hidden;
  widget.options.hidden = hidden;
  widget.type = hidden ? "hidden" : widget.__resolutionOriginalType;
  widget.computeSize = hidden ? () => [0, -4] : widget.__resolutionOriginalSize;
  widget.__resolutionHidden = hidden;
  return true;
}

function invalidate(node, resize) {
  const marker = { name: "__resolutionRefresh", type: "hidden", hidden: true,
    options: { hidden: true, serialize: false } };
  node.widgets.push(marker);
  node.widgets.pop();
  if (resize) {
    const size = node.computeSize?.();
    if (size) node.setSize?.([Math.max(size[0], typeOf(node) === FULL ? 360 : 300), size[1]]);
  }
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

export function refreshResolution(node, resize = true) {
  const state = node.__vividMuseResolution;
  if (!state) return;
  const active = typeOf(node) === CANVAS || !node.properties?.vividMuseActiveModule
    || node.properties.vividMuseActiveModule === "画面基础";
  const expanded = active && Boolean(node.properties?.[EXPANDED]);
  const mode = state.backing["分辨率模式"].value;
  const calculated = mode === "按总像素计算";
  const preview = previewResolution(node);
  let changed = false;
  for (const [name, widget] of Object.entries(state.backing)) {
    changed = visible(widget, false) || changed;
    // Old workflows keep their calculation until the user edits the budget.
    // Keep serialized budgets in the old unit (10,000 pixels); only the UI uses MP.
    state.proxies[name].value = name === BUDGET_FIELD
      ? (mode !== PIXEL_MODE && preview.status === "ready"
        ? preview.size[0] * preview.size[1] / 1000000 : widget.value / 100)
      : widget.value;
  }
  for (const [widget, show] of [
    [state.proxies[BUDGET_FIELD], active], [state.proxies["尺寸对齐倍数"], active],
    [state.toggle, active], [state.proxies["分辨率模式"], expanded],
    [state.proxies["目标总像素"], expanded && calculated],
  ]) changed = visible(widget, show) || changed;
  const label = previewLabel(node, language());
  if (state.toggle.label !== label) { state.toggle.label = label; changed = true; }
  if (changed) {
    globalThis.__vividMuseZImageI18n?.localizeNode(node);
    invalidate(node, resize);
  }
}

function helper(node, type, name, value, callback, options = {}) {
  const widget = node.addWidget(type, name, value, callback, { ...options, serialize: false });
  widget.serialize = false;
  widget.options ??= {};
  widget.options.serialize = false;
  return widget;
}

export function installResolution(node) {
  if (![FULL, CANVAS].includes(typeOf(node)) || node.__vividMuseResolution) return;
  const backing = Object.fromEntries(Object.keys(DEFAULTS).map(name => [name, byName(node, name)]));
  if (Object.values(backing).some(w => !w)) return;
  node.properties ??= {};
  const proxies = {};
  const toggle = helper(node, "button", "分辨率设置", null, () => {
    node.properties[EXPANDED] = !node.properties[EXPANDED];
    refreshResolution(node);
  });
  toggle.__vividMuseDynamicLabel = lang => previewLabel(node, lang);
  toggle.tooltip = "显示实际宽高和百万像素；点击可查看旧版兼容模式。修改百万像素会启用固定比例计算。宽高需连接实际 latent，TXT 比例不自动解析。";
  for (const [name, display, type] of [
    ["分辨率模式", "尺寸模式", "combo"],
    ["目标总像素", "旧版总像素（MP）", "number"],
    ["尺寸对齐倍数", "尺寸整除倍数", "number"],
    [BUDGET_FIELD, "百万像素（MP）", "number"],
  ]) {
    const options = { ...backing[name].options };
    delete options.hidden;
    if (name === BUDGET_FIELD) {
      // Scale both classic (step) and Node 2.0 (step2) number-widget options.
      for (const key of ["min", "max", "step", "step2", "default"]) {
        if (typeof options[key] === "number") options[key] /= 100;
      }
      options.precision = 2;
      options.round = 0.01;
      options.tooltip = "1 MP = 100 万像素，输入 1、2、3 或 0.5。范围 0.1–16 MP；保持画面比例，整除后实际像素可能略有偏差。";
    } else if (name === "尺寸对齐倍数") {
      options.tooltip = "宽度和高度都能被此数整除，例如 8、16、32、64。默认 8，支持 8–128 内的 4 的倍数；倍数越大，总像素偏差可能越大。编辑旧固定尺寸的此项会启用固定比例计算。";
    }
    proxies[name] = helper(node, type, display,
      name === BUDGET_FIELD ? backing[name].value / 100 : backing[name].value, value => {
      if (name === "尺寸对齐倍数" && backing["分辨率模式"].value === "原推荐尺寸") {
        // Editing a divisor must take effect even on legacy fixed-size workflows.
        const previous = previewResolution(node);
        if (previous.status === "ready")
          backing[BUDGET_FIELD].value = previous.size[0] * previous.size[1] / 10000;
        backing["分辨率模式"].value = PIXEL_MODE;
      }
      const storedValue = name === BUDGET_FIELD ? value * 100 : value;
      backing[name].value = storedValue;
      if (name === BUDGET_FIELD) backing["分辨率模式"].value = PIXEL_MODE;
      backing[name].callback?.(storedValue);
      refreshResolution(node);
    }, options);
    proxies[name].tooltip = options.tooltip || backing[name].tooltip;
  }
  node.__vividMuseResolution = { backing, proxies, toggle };
  // Only helpers move. Serialized inputs stay appended to preserve
  // old positional widgets_values and the existing serialization guards.
  const anchor = byName(node, "成像媒介");
  if (anchor) for (const widget of [proxies[BUDGET_FIELD], proxies["尺寸对齐倍数"], toggle, proxies["分辨率模式"], proxies["目标总像素"]]) {
    node.widgets.splice(node.widgets.indexOf(widget), 1);
    node.widgets.splice(node.widgets.indexOf(anchor), 0, widget);
  }
  for (const name of ["画面比例", "预设", ...Object.keys(DEFAULTS)]) {
    const widget = byName(node, name);
    if (!widget) continue;
    const original = widget.callback;
    widget.callback = function () {
      const result = original?.apply(this, arguments);
      refreshResolution(node);
      return result;
    };
  }
  const configure = node.onConfigure;
  node.onConfigure = function (info) {
    const result = configure?.apply(this, arguments);
    if (Array.isArray(info?.widgets_values)) {
      const serialized = node.widgets.filter(w => w.serialize !== false && w.options?.serialize !== false);
      for (const [name, widget] of Object.entries(backing))
        if (serialized.indexOf(widget) >= info.widgets_values.length) widget.value = DEFAULTS[name];
    }
    refreshResolution(node);
    return result;
  };
  const connections = node.onConnectionsChange;
  node.onConnectionsChange = function () {
    const result = connections?.apply(this, arguments);
    refreshResolution(node);
    return result;
  };
  refreshResolution(node);
}

globalThis.__vividMuseResolution = { refresh: refreshResolution, defaults: DEFAULTS };
app.registerExtension({
  name: "VividMuse.ZImageResolutionSelector",
  nodeCreated: installResolution,
  loadedGraphNode(node) { installResolution(node); refreshResolution(node); },
});
