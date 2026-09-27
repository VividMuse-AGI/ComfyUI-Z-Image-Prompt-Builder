import { app } from "../../scripts/app.js";

const CLASSES = {
  VividMuse_ZImageTxtPromptLibrary: "prompt",
  VividMuse_ZImageTxtModuleLibrary: "module",
};
const PROPERTY = { prompt: "vividMuseTxtPromptLibrary", module: "vividMuseTxtModuleLibrary" };
const widget = (node, name) => node.widgets?.find(w => w.name === name);
const randomMode = node => widget(node, "选择模式")?.value === "随机抽取";
const tr = text => globalThis.__vividMuseZImageI18n?.translateMessage?.(text) || text;

// Separate from each library's accordion: never undo the accordion's hidden state.
function visible(w, show) {
  if (!w) return;
  if (!show && !w.__txtSelectionHidden) {
    w.__txtSelectionOriginal = { type: w.type, computeSize: w.computeSize, hidden: w.hidden,
      optionHidden: w.options?.hidden };
    w.type = "hidden";
    w.computeSize = () => [0, -4];
    w.hidden = true;
    w.options ??= {};
    w.options.hidden = true;
    w.__txtSelectionHidden = true;
  } else if (show && w.__txtSelectionHidden) {
    const old = w.__txtSelectionOriginal;
    w.type = old.type;
    w.computeSize = old.computeSize;
    w.hidden = old.hidden;
    if (old.optionHidden === undefined) delete w.options.hidden;
    else w.options.hidden = old.optionHidden;
    w.__txtSelectionHidden = false;
  }
}

function payload(node, kind) {
  const entries = node.__vividMuseTxtSelectionEntries?.()
    || node.properties?.[PROPERTY[kind]]?.entries || [];
  return JSON.stringify({ version: 1, kind, entries });
}

function refresh(node, kind, resize = false) {
  const data = widget(node, "词库数据");
  if (!data) return;
  data.value = payload(node, kind);
  visible(data, false);
  const random = randomMode(node);
  visible(widget(node, "随机种子"), random);
  visible(widget(node, "control_after_generate"), random);
  visible(widget(node, kind === "prompt" ? "自由提示词" : "模块提示词"), !random);
  // Disable, rather than hide, accordion controls to avoid competing visibility owners.
  const controls = kind === "prompt" ? node.__vividMuseTxtLibraryControls : node.__vividMuseTxtModuleControls;
  for (const w of controls || []) {
    const manual = kind === "prompt"
      ? ["词库条目", "词库加入方式", "添加到自由提示词", "清空自由提示词"].includes(w.name)
      : w === node.__vividMuseTxtModuleEntryWidget || w === node.__vividMuseTxtModuleApplyButton
        || w.name === "清空当前用户模块";
    if (manual) { w.disabled = random; w.options ??= {}; w.options.disabled = random; }
  }
  // Module scope is required even when the library accordion is closed.
  if (kind === "module" && random) {
    const scope = widget(node, "模块类型");
    if (scope?.__vividMuseTxtModuleHidden) {
      scope.type = scope.__vividMuseTxtModuleOriginalType;
      scope.computeSize = scope.__vividMuseTxtModuleOriginalComputeSize;
      scope.hidden = false;
      scope.options.hidden = false;
      scope.__vividMuseTxtModuleHidden = false;
    }
  }
  if (node.__txtSelectionResultButton) {
    // Always historical: safe for queued results, cached replay and next-seed changes.
    node.__txtSelectionResultButton.label = node.__txtSelectionResultButton.__vividMuseDisplayText = node.__txtSelectionResult
      ? "上次随机结果（点击查看）" : "随机抽取：尚未执行";
  }
  globalThis.__vividMuseZImageI18n?.localizeNode?.(node);
  if (resize) {
    const marker = { name: "__txtSelectionRefresh", type: "hidden", hidden: true,
      options: { hidden: true, serialize: false } };
    node.widgets.push(marker); node.widgets.pop();
    const size = node.computeSize?.();
    if (size) node.setSize?.([Math.max(360, size[0]), size[1]]);
  }
  node.setDirtyCanvas?.(true, true);
}

function showResult(node) {
  const result = node.__txtSelectionResult;
  if (!result) { globalThis.alert?.(tr("随机抽取：尚未执行")); return; }
  const status = result.status === "empty" ? tr("当前范围没有候选") : tr("已抽取");
  const text = `${tr("上次随机结果（点击查看）")}\n${status}\n${tr("随机种子")}: ${result.seed}`
    + `\n${tr("候选数量")}: ${result.count}\n${tr(result.module || "")}\n${result.title}\n\n${result.prompt}`;
  // A one-line button opens an ephemeral read-only dialog; never expands node height.
  if (!globalThis.document?.createElement) { globalThis.alert?.(text); return; }
  const dialog = document.createElement("dialog");
  const body = document.createElement("pre");
  body.textContent = text;
  body.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-width:70vw;max-height:65vh;overflow:auto";
  const close = document.createElement("button");
  close.textContent = tr("关闭");
  close.onclick = () => dialog.close();
  dialog.append(body, close);
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}

function install(node) {
  const kind = CLASSES[node.comfyClass || node.constructor?.type];
  if (!kind || node.__txtSelectionInstalled || !widget(node, "选择模式")) return;
  node.__txtSelectionInstalled = true;
  node.__vividMuseTxtSelectionRefresh = () => refresh(node, kind);
  const data = widget(node, "词库数据");
  // Real backend input: intentionally serializable even while hidden.
  data.serialize = true;
  data.options ??= {};
  data.options.serialize = true;
  data.serializeValue = () => { data.value = payload(node, kind); return data.value; };
  const seed = widget(node, "随机种子");
  if (seed) {
    seed.options ??= {};
    // JS cannot losslessly represent all uint64 values. API still accepts full uint64.
    seed.options.max = Number.MAX_SAFE_INTEGER;
    seed.options.min = 0;
    const oldSerializeValue = seed.serializeValue;
    seed.serializeValue = function () {
      if (randomMode(node) && (!Number.isSafeInteger(seed.value) || seed.value < 0)) {
        throw new Error(tr("界面种子须为0至9007199254740991的整数；更大整数请使用API。"));
      }
      return oldSerializeValue ? oldSerializeValue.apply(this, arguments) : seed.value;
    };
  }
  const button = node.addWidget("button", "随机抽取：尚未执行", null, () => showResult(node), { serialize: false });
  button.serialize = false;
  node.__txtSelectionResultButton = button;
  const mode = widget(node, "选择模式");
  const original = mode.callback;
  let previousMode = mode.value;
  mode.callback = function () {
    const result = original?.apply(this, arguments);
    node.properties ??= {};
    if (kind === "module" && previousMode !== mode.value) {
      const scope = widget(node, "模块类型");
      if (randomMode(node)) node.properties.vividMuseTxtManualModule = scope?.value;
      else if (scope && node.properties.vividMuseTxtManualModule) {
        // Preserve the manual draft's module when leaving a random-only scope.
        scope.value = node.properties.vividMuseTxtManualModule;
        node.properties.vividMuseTxtModuleSelectedModule = scope.value;
      }
    }
    previousMode = mode.value;
    node.__vividMuseTxtSelectionRestoreControls?.();
    refresh(node, kind, true);
    return result;
  };
  const oldConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    const result = oldConfigure?.apply(this, arguments);
    // Inputs were appended. Missing fields in known older positional layouts get defaults.
    const saved = info?.widgets_values;
    const serialized = (node.widgets || []).filter(w => w.serialize !== false);
    if (Array.isArray(saved)) {
      for (const [name, value] of [["选择模式", "手动选择"], ["随机种子", 0], ["词库数据", ""]]) {
        const w = widget(node, name);
        if (serialized.indexOf(w) >= saved.length) w.value = value;
      }
    }
    previousMode = mode.value;
    node.__txtSelectionResult = null;
    refresh(node, kind, true);
    return result;
  };
  const oldSerialize = node.onSerialize;
  node.onSerialize = function (info) {
    refresh(node, kind);
    // LiteGraph may have copied values before onSerialize. Update that raw slot
    // before the existing helper compaction guard, in either extension order.
    if (Array.isArray(info.widgets_values)) info.widgets_values[node.widgets.indexOf(data)] = data.value;
    return oldSerialize?.apply(this, arguments);
  };
  const oldExecuted = node.onExecuted;
  node.onExecuted = function (message) {
    const result = oldExecuted?.apply(this, arguments);
    const selected = message?.vividmuse_txt_selection?.[0];
    if (selected) node.__txtSelectionResult = selected;
    refresh(node, kind, true);
    return result;
  };
  refresh(node, kind, true);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.TxtSelection",
  nodeCreated: install,
  loadedGraphNode(node) {
    install(node);
    const kind = CLASSES[node.comfyClass || node.constructor?.type];
    if (kind && node.__txtSelectionInstalled) refresh(node, kind, true);
  },
});
