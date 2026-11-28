import { app } from "../../../scripts/app.js";

export function widgetByName(node, name) {
  return node?.widgets?.find((widget) => widget.name === name);
}

export function addHelperWidget(node, type, name, value, callback, options = {}) {
  const widget = node.addWidget(type, name, value, callback, {
    ...options,
    serialize: false,
  });
  widget.serialize = false;
  widget.options ??= {};
  widget.options.serialize = false;
  return widget;
}

export function installCompactWidgetSerialization(node) {
  if (!node || node.__vividMuseCompactSerialization) return;
  const originalOnSerialize = node.onSerialize;
  node.onSerialize = function (info) {
    const result = originalOnSerialize?.apply(this, arguments);
    if (
      Array.isArray(info?.widgets_values)
      && info.widgets_values.length !== (node.widgets || []).filter((widget) => widget.serialize !== false).length
    ) {
      info.widgets_values = (node.widgets || []).flatMap((widget, index) => (
        widget.serialize === false ? [] : [info.widgets_values[index]]
      ));
    }
    return result;
  };
  node.__vividMuseCompactSerialization = true;
}

export function setWidgetVisibilityReason(widget, reason, visible) {
  if (!widget) return false;
  widget.__vividMuseHiddenReasons ??= new Set();
  if (visible) widget.__vividMuseHiddenReasons.delete(reason);
  else widget.__vividMuseHiddenReasons.add(reason);

  const shouldHide = widget.__vividMuseHiddenReasons.size > 0;
  const changed = Boolean(widget.__vividMuseHidden) !== shouldHide;
  if (shouldHide && !widget.__vividMuseHidden) {
    if (!Object.hasOwn(widget, "__vividMuseOriginalType")) {
      widget.__vividMuseOriginalType = widget.type;
      widget.__vividMuseOriginalComputeSize = widget.computeSize;
      widget.__vividMuseOriginalOptionsHidden = widget.options?.hidden;
    }
    widget.options ??= {};
    widget.options.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
  } else if (!shouldHide && widget.__vividMuseHidden) {
    widget.type = widget.__vividMuseOriginalType;
    widget.computeSize = widget.__vividMuseOriginalComputeSize;
    if (widget.options) {
      if (widget.__vividMuseOriginalOptionsHidden === undefined) {
        delete widget.options.hidden;
      } else {
        widget.options.hidden = widget.__vividMuseOriginalOptionsHidden;
      }
    }
  }
  widget.__vividMuseHidden = shouldHide;
  widget.hidden = shouldHide;
  return changed;
}

export function refreshNode2Widgets(node) {
  const widgets = node?.widgets;
  if (!Array.isArray(widgets)) return;
  const marker = {
    name: "__vividMuseNode2RefreshMarker",
    type: "hidden",
    hidden: true,
    options: { hidden: true, serialize: false },
  };
  widgets.push(marker);
  widgets.pop();
}

export function moveWidgetBefore(node, widget, targetWidget) {
  if (!widget || !targetWidget || !Array.isArray(node?.widgets)) return;
  const oldIndex = node.widgets.indexOf(widget);
  if (oldIndex >= 0) node.widgets.splice(oldIndex, 1);
  const targetIndex = node.widgets.indexOf(targetWidget);
  if (targetIndex >= 0) node.widgets.splice(targetIndex, 0, widget);
}

export function resizeNode(node, minWidth = 360) {
  if (!node) return;
  refreshNode2Widgets(node);
  const computed = node.computeSize?.();
  if (computed) node.setSize?.([Math.max(computed[0], minWidth), computed[1]]);
}

export function notifyUserError(errorOrMessage, summary = "Z-Image Prompt Builder") {
  const raw = errorOrMessage && typeof errorOrMessage === "object" && typeof errorOrMessage.message === "string"
    ? errorOrMessage.message
    : String(errorOrMessage);
  const message = globalThis.__vividMuseZImageI18n?.translateMessage?.(raw) || raw;
  console.error(`${summary}:`, errorOrMessage);
  try {
    if (typeof app?.extensionManager?.toast?.add === "function") {
      app.extensionManager.toast.add({
        severity: "error",
        summary,
        detail: message,
        life: 6000,
      });
      return message;
    }
  } catch (_) {
    // Fall back to non-blocking DOM toast below.
  }
  const doc = globalThis.document;
  if (doc?.createElement && doc?.body?.append) {
    const toast = doc.createElement("div");
    toast.setAttribute("role", "alert");
    toast.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:99999",
      "max-width:420px", "padding:12px 16px", "border-radius:8px",
      "background:#3a1d1d", "color:#ffd7d7", "border:1px solid #a84848",
      "box-shadow:0 6px 20px rgba(0,0,0,0.45)", "font-size:14px",
    ].join(";");
    toast.textContent = message;
    doc.body.append(toast);
    globalThis.setTimeout?.(() => toast.remove?.(), 6000);
  }
  return message;
}
