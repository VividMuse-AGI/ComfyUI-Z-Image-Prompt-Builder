import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { createDefaultFetch, createVmContext, loadLibModule } from "./vm_loader.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

// 1. Single ComfyUI startup entry under web/js/
{
  const jsFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".js")) {
        jsFiles.push(path.relative(root, full).replaceAll("\\", "/"));
      }
    }
  }
  walk(path.join(root, "web", "js"));
  assert.deepEqual(jsFiles, ["web/js/index.js"]);

  const indexSource = fs.readFileSync(path.join(root, "web", "js", "index.js"), "utf8");
  const expectedExtensions = [
    "preset_sync.mjs",
    "modular_nodes.mjs",
    "resolution_selector.mjs",
    "txt_library.mjs",
    "txt_module_library.mjs",
    "txt_selection.mjs",
    "prompt_diagnostics.mjs",
    "workflow_tools.mjs",
    "shoot_plan_cards.mjs",
    "library_discovery.mjs",
    "output_layout.mjs",
    "i18n.mjs",
  ];
  for (const mod of expectedExtensions) {
    assert.ok(indexSource.includes(`./lib/${mod}`), `web/js/index.js must import ./lib/${mod}`);
  }
}

// 2. Lazy-loading library_catalog.json only when openDiscovery() is called
{
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.style = {};
      this.attrs = {};
      this.events = {};
      this.value = "";
      this.textContent = "";
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    append(...children) {
      for (const c of children) {
        c.parent = this;
        this.children.push(c);
        if (this.tagName === "select" && this.children.length === 1) this.value = c.value;
      }
    }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(n, fn) { this.events[n] = fn; }
    showModal() { this.open = true; }
    close() { this.open = false; this.onclose?.(); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
    focus() {}
    click() { this.onclick?.(); }
  }
  const realFetch = createDefaultFetch();
  const fetchedUrls = [];
  const extensions = [];
  const app = { graph: { setDirtyCanvas() {} }, registerExtension(e) { extensions.push(e); } };
  const ctx = createVmContext({
    app,
    crypto: webcrypto,
    TextEncoder,
    Blob,
    document: { body: new Element("body"), createElement: (t) => new Element(t), createTextNode: (s) => ({ textContent: s }) },
    fetch: async (url) => {
      fetchedUrls.push(String(url));
      return realFetch(url);
    },
  });
  const discovery = loadLibModule("library_discovery", ctx, { expose: ["openDiscovery"] });
  const node = {
    comfyClass: "VividMuse_ZImageCameraModule",
    widgets: [{ name: "机位", type: "combo", value: "平视", options: { values: ["平视"] }, serialize: true }],
    properties: {},
    addWidget(type, name, value, callback, options = {}) {
      const w = { type, name, value, callback, options };
      this.widgets.push(w);
      return w;
    },
  };
  extensions[0].nodeCreated(node);
  assert.equal(fetchedUrls.length, 0, "nodeCreated must NOT fetch library_catalog.json eagerly");
  const d1 = await discovery.openDiscovery(node);
  assert.equal(fetchedUrls.length, 1, "openDiscovery must fetch library_catalog.json on demand");
  assert.match(fetchedUrls[0], /library_catalog\.json$/);
  d1.close();
  const d2 = await discovery.openDiscovery(node);
  assert.equal(fetchedUrls.length, 1, "subsequent openDiscovery calls must reuse cached library_catalog.json");
  d2.close();
}

// 3. Lazy-loading i18n_catalog.json only when English locale is active
{
  const realFetch = createDefaultFetch();
  const fetchedUrls = [];
  let settingObj = null;
  let ext = null;
  const app = {
    graph: { _nodes: [], setDirtyCanvas() {} },
    ui: {
      settings: {
        settingsLookup: {},
        getSettingValue(id, fallback) {
          return id === "Comfy.Locale" ? "zh-CN" : fallback;
        },
        addSetting(s) {
          settingObj = s;
          this.settingsLookup[s.id] = s;
        },
      },
    },
    registerExtension(e) { ext = e; },
  };
  const ctx = createVmContext({
    app,
    fetch: async (url) => {
      fetchedUrls.push(String(url));
      return realFetch(url);
    },
  });
  loadLibModule("i18n", ctx);
  await ext.init();
  assert.equal(fetchedUrls.length, 0, "Chinese locale startup must NOT fetch i18n_catalog.json");
  await settingObj.onChange("en");
  assert.equal(fetchedUrls.length, 1, "Switching to English must fetch i18n_catalog.json on demand");
  assert.match(fetchedUrls[0], /i18n_catalog\.json$/);
  await settingObj.onChange("zh");
  await settingObj.onChange("en");
  assert.equal(fetchedUrls.length, 1, "i18n_catalog.json must be cached after first load");
}

// 4. Multi-reason setWidgetVisibilityReason avoids competing visibility owners
{
  const ctx = createVmContext({ app: { registerExtension() {} } });
  const utils = loadLibModule("widget_utils", ctx);
  const originalComputeSize = () => [320, 22];
  const widget = { name: "腿部动作", type: "combo", computeSize: originalComputeSize, options: {} };
  utils.setWidgetVisibilityReason(widget, "module", false);
  utils.setWidgetVisibilityReason(widget, "dependency", false);
  assert.equal(widget.hidden, true);
  assert.equal(widget.type, "hidden");
  utils.setWidgetVisibilityReason(widget, "module", true);
  assert.equal(widget.hidden, true, "Clearing one reason must keep widget hidden while another reason remains");
  assert.equal(widget.type, "hidden");
  utils.setWidgetVisibilityReason(widget, "dependency", true);
  assert.equal(widget.hidden, false);
  assert.equal(widget.type, "combo");
  assert.equal(widget.computeSize, originalComputeSize);
  assert.equal(Object.hasOwn(widget.options, "hidden"), false);
}

// 5. Non-blocking notifyUserError (toast or DOM alert role) without calling globalThis.alert
{
  let alertCalls = 0;
  const toasts = [];
  const ctx = createVmContext({
    alert() { alertCalls += 1; },
    app: {
      graph: { setDirtyCanvas() {} },
      extensionManager: { toast: { add(t) { toasts.push(t); } } },
      registerExtension() {},
    },
  });
  const utils = loadLibModule("widget_utils", ctx);
  loadLibModule("txt_library", ctx, { expose: ["chooseTxtPromptFile"] });
  utils.notifyUserError(new Error("测试错误提示"), "Test Summary");
  assert.equal(alertCalls, 0);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].severity, "error");
  assert.equal(toasts[0].detail, "测试错误提示");

  // Also test DOM fallback when toast API is unavailable
  const appended = [];
  const domCtx = createVmContext({
    alert() { alertCalls += 1; },
    app: { registerExtension() {} },
    setTimeout() {},
    document: {
      createElement(tag) {
        return {
          tag,
          attrs: {},
          style: {},
          textContent: "",
          setAttribute(k, v) { this.attrs[k] = v; },
        };
      },
      body: { append(el) { appended.push(el); } },
    },
  });
  const domUtils = loadLibModule("widget_utils", domCtx);
  domUtils.notifyUserError("回退提示", "DOM Fallback");
  assert.equal(alertCalls, 0);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].attrs.role, "alert");
  assert.equal(appended[0].textContent, "回退提示");
}

// 6. Result panel token estimation & 512-token truncation warning
{
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attrs = {};
      this.style = {};
      this.events = {};
      this.textContent = "";
      this.value = "";
      this.hidden = false;
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    append(...children) {
      for (const c of children) {
        c.parent = this;
        this.children.push(c);
      }
    }
    addEventListener(k, fn) { this.events[k] = fn; }
    showModal() { this.open = true; }
    close() { this.onclose?.(); }
    remove() { this.removed = true; }
  }
  const flatten = (el) => [el, ...el.children.flatMap(flatten)];
  let lang = "zh";
  const ctx = createVmContext({
    app: { graph: { setDirtyCanvas() {} }, registerExtension() {} },
    api: {},
    document: { body: new Element("body"), createElement: (t) => new Element(t) },
    __vividMuseZImageI18n: { activeLanguage: () => lang, translateMessage: (s) => s },
  });
  const diag = loadLibModule("prompt_diagnostics", ctx, { expose: ["acceptResult", "showDetails"] });
  assert.equal(diag.estimatePromptTokens(""), 0);
  const shortMetrics = diag.formatPromptMetrics("短文本", "short prompt", "zh");
  assert.equal(shortMetrics.exceedsLimit, false);
  const longEn = Array.from({ length: 420 }, (_, i) => `word${i}`).join(" ");
  const longMetrics = diag.formatPromptMetrics("短中文", longEn, "zh");
  assert.equal(longMetrics.exceedsLimit, true);
  assert.match(longMetrics.warningText, /512/);

  const node = {
    comfyClass: "VividMuse_ZImageChinesePromptBuilder",
    widgets: [],
    properties: {},
    addWidget(type, name, value, callback, options = {}) {
      const w = { type, name, value, callback, options };
      this.widgets.push(w);
      return w;
    },
    setDirtyCanvas() {},
  };
  const payload = (zh, en) => ({
    version: 1,
    scope: "全部模块",
    seed: "1",
    settings: {},
    context: {},
    resolved: {},
    modules: [],
    random_fields: [],
    zh,
    en,
  });
  diag.acceptResult(node, payload("短文本", "short prompt"));
  diag.showDetails(node);
  let all = flatten(node.__vividMusePromptDialog);
  assert.match(all.find((e) => e.attrs["aria-label"] === "中文长度与 Token 估算").textContent, /约 \d+ tokens/);
  assert.equal(all.find((e) => e.attrs["aria-label"] === "Token 上限提示").hidden, true);
  node.__vividMusePromptDialog.close();

  diag.acceptResult(node, payload("长中文".repeat(250), longEn));
  lang = "en";
  diag.showDetails(node);
  all = flatten(node.__vividMusePromptDialog);
  const warningEl = all.find((e) => e.attrs["aria-label"] === "Token Limit Warning");
  assert.equal(warningEl.hidden, false);
  assert.match(warningEl.textContent, /512-token truncation limit/);
  assert.match(all.find((e) => e.attrs["aria-label"] === "English Length and Token Estimate").textContent, /~\d+ tokens/);
  node.__vividMusePromptDialog.close();
}

console.log("PASS: audit improvements (single index.js, lazy catalogs, multi-reason visibility, non-blocking error toast, token counts & 512 warning).");
