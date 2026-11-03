import {
  CARD_ORGANIZATION_PROPERTY, cardIdentity, nodeOrganizationCards, readCardOrganization,
  organizeCards, planNodeFavorite, planNodeOrganizationReset, commitNodeCardOrganization,
} from "./card_organization.js";

// Panel-local controls. No view preferences are serialized into workflow/cards.
export function createOrganizationControls({node, parent, el, text, button, guarded,
  requireLive, onChange, onResetFilters, moduleLabels = {}}) {
  const row = el("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0";
  const label = el("label"), only = el("input"); only.type = "checkbox"; only.checked = false;
  only.setAttribute("aria-label", text("仅收藏", "Favorites only"));
  label.append(only, el("span", text("仅收藏", "Favorites only")));
  const sort = el("select"); sort.setAttribute("aria-label", text("卡片排序", "Card sort order"));
  for (const [value, zh, en] of [["default", "默认顺序", "Default order"], ["name", "名称排序", "Name order"], ["favorites", "收藏优先", "Favorites first"]]) {
    const option = el("option", text(zh, en)); option.value = value; sort.append(option);
  }
  sort.value = "default";
  row.append(label, sort); parent.append(row);
  const warning = el("p"); warning.setAttribute("role", "note"); warning.setAttribute("aria-live", "polite"); parent.append(warning);
  const state = () => {
    try { return readCardOrganization(node.properties?.[CARD_ORGANIZATION_PROPERTY], nodeOrganizationCards(node)); }
    catch { return {favorites: [], writable: false, warning: "invalid_card_store"}; }
  };
  let selected = null;
  const toggle = button(row, "收藏卡片", "Favorite Card", () => {
    if (!selected) return;
    const favorite = state().favorites.some(ref => cardIdentity(ref) === cardIdentity(selected));
    commitNodeCardOrganization(node, planNodeFavorite(node, selected, !favorite)); onChange();
    feedback.textContent = favorite && only.checked ? text(
      "已取消收藏，此卡片已从收藏筛选中隐藏，卡片本身未删除。",
      "Unfavorited. The card is hidden by the favorites filter, not deleted.") : text(
      "收藏已更新，请保存工作流以保留。", "Favorites updated. Save the workflow to keep them.");
  });
  const reset = button(row, "重置收藏数据", "Reset Favorites Data", () => {
    const plan = planNodeOrganizationReset(node);
    if (!window.confirm(text("重置无法读取的收藏数据？卡片内容保持不变。", "Reset unreadable favorites data? Card contents will be kept."))) return;
    requireLive(); commitNodeCardOrganization(node, plan); onChange();
  });
  const feedback = el("p"); feedback.setAttribute("aria-live", "polite"); parent.append(feedback);
  button(row, "重置筛选", "Reset Filters", () => {
    only.checked = false; sort.value = "default"; onResetFilters?.(); feedback.textContent = ""; onChange();
  });
  for (const control of [only, sort]) control.addEventListener("change", guarded(() => { feedback.textContent = ""; onChange(); }));
  return {
    label(card) {
      return state().favorites.some(ref => cardIdentity(ref) === cardIdentity(card)) ? `★ ${card.name}` : card.name;
    },
    matches(cards, query, module = null) {
      const keys = new Set(cards.map(cardIdentity));
      let all;
      try { all = nodeOrganizationCards(node); } catch { all = cards; }
      return organizeCards(all, state().warning === "invalid_card_store" ? undefined : node.properties?.[CARD_ORGANIZATION_PROPERTY], {
        query, module, moduleLabels, favoritesOnly: only.checked, sort: sort.value,
        locale: text("zh-CN", "en"),
      }).cards.filter(card => keys.has(cardIdentity(card)));
    },
    refresh(entry) {
      selected = entry || null;
      const current = state();
      const favorite = entry && current.favorites.some(ref => cardIdentity(ref) === cardIdentity(entry));
      toggle.textContent = favorite ? text("取消收藏", "Unfavorite Card") : text("收藏卡片", "Favorite Card");
      toggle.disabled = !entry || !current.writable;
      reset.hidden = current.writable || current.warning === "invalid_card_store";
      warning.hidden = !current.warning;
      warning.textContent = current.warning === "invalid_card_store" ? text(
        "另一类卡片库数据异常，收藏暂不可编辑；当前卡片仍可使用。",
        "Another card store is invalid. Favorites are read-only; current cards remain usable.") : current.warning ? text(
        "收藏数据异常或来自不支持的版本，暂按无收藏显示。卡片仍可使用；确认重置后才能修改收藏。",
        "Favorites data is invalid or from an unsupported version. Cards remain usable; reset favorites explicitly to edit them.") : "";
    },
  };
}

// Selection is independent of filtering. Exporters still own stale-library and
// v1 schema checks. All text, including user card names, is rendered as text.
export function createCardPackPicker({node, parent, cards, el, text, button, guarded,
  labelFor, moduleLabels = {}}) {
  const search = el("input"); search.type = "search";
  search.placeholder = text("筛选导出卡片", "Filter export cards"); search.setAttribute("aria-label", search.placeholder);
  search.style.cssText = "box-sizing:border-box;width:100%;padding:6px;margin:8px 0";
  const only = el("input"); only.type = "checkbox"; only.checked = false;
  only.setAttribute("aria-label", text("导出仅看收藏", "Show favorite export cards only"));
  const label = el("label"); label.append(only, el("span", text("仅显示收藏", "Show favorites only")));
  parent.append(el("p", text("默认勾选全部候选卡片。筛选不改变已勾选项；JSON 不包含收藏信息。",
    "All candidate cards start selected. Filtering keeps selections; JSON excludes favorites.")), search, label);
  const list = el("div"); list.style.cssText = "max-height:200px;overflow:auto";
  const actions = el("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:8px 0";
  const count = el("p"), names = el("pre"); names.style.cssText = "white-space:pre-wrap;max-height:160px;overflow:auto";
  parent.append(actions, list, count, el("p", text("将导出的全部卡片：", "All cards to export:")), names);
  const selected = new Set(cards.map(cardIdentity));
  let composing = false, confirm = null;
  const visible = () => {
    const keys = new Set(cards.map(cardIdentity));
    let all, raw = node.properties?.[CARD_ORGANIZATION_PROPERTY];
    try { all = nodeOrganizationCards(node); } catch { all = cards; raw = undefined; }
    return organizeCards(all, raw, {
      query: search.value, favoritesOnly: only.checked, moduleLabels,
    }).cards.filter(c => keys.has(cardIdentity(c)));
  };
  const selection = () => cards.filter(card => selected.has(cardIdentity(card)));
  const updateCount = () => {
    const chosen = selection();
    count.textContent = text(`已选择 ${chosen.length} / ${cards.length} 张；当前可见 ${visible().length} 张`,
      `${chosen.length} / ${cards.length} selected; ${visible().length} visible`);
    names.textContent = chosen.map(labelFor).join("\n");
    if (confirm) confirm.disabled = chosen.length === 0;
  };
  const render = () => {
    list.replaceChildren();
    for (const card of visible()) {
      const label = el("label"), check = el("input"); check.type = "checkbox";
      check.checked = selected.has(cardIdentity(card)); check.setAttribute("aria-label", labelFor(card));
      label.style.display = "block"; label.append(check, el("span", labelFor(card))); list.append(label);
      check.addEventListener("change", guarded(() => {
        check.checked ? selected.add(cardIdentity(card)) : selected.delete(cardIdentity(card)); updateCount();
      }));
    }
    updateCount();
  };
  button(actions, "选择筛选结果", "Select Matches", () => { visible().forEach(c => selected.add(cardIdentity(c))); render(); });
  button(actions, "取消筛选结果", "Deselect Matches", () => { visible().forEach(c => selected.delete(cardIdentity(c))); render(); });
  button(actions, "清空勾选", "Clear Selection", () => { selected.clear(); render(); });
  search.addEventListener("compositionstart", () => { composing = true; });
  search.addEventListener("compositionend", () => { composing = false; });
  search.addEventListener("input", guarded(() => { if (!composing) render(); }));
  only.addEventListener("change", guarded(render));
  render();
  return {selection, refresh: render, bindConfirm(control) { confirm = control; updateCount(); }};
}
