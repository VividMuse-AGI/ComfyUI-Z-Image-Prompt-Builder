import { buildCardSummary, formatCardSummary } from "./card_summary.mjs";

// Display adapter only: no widget values, writes, or random resolution.
export function cardSummaryText(card, validate, hiddenField = () => false, selectedModules) {
  const i18n = globalThis.__vividMuseZImageI18n;
  const language = i18n?.activeLanguage() || "zh";
  const catalog = i18n?.getCatalog?.() || {};
  const summary = buildCardSummary(card, {
    validate,
    hiddenField,
    selectedModules,
    fieldGroups: globalThis.__vividMuseZImagePromptData?.MODULE_FIELD_GROUPS,
  });
  return formatCardSummary(summary, {
    language,
    fieldLabel: (field) => (language === "en" ? catalog.widgetLabels?.[field] || field : field),
    valueLabel: (field, value) => (language === "en" ? catalog.optionLabels?.[field]?.[value] || value : value),
  });
}

export function createCardSummaryElement(el) {
  const area = el("pre");
  area.setAttribute("data-vividmuse-card-summary", "true");
  area.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:200px;overflow:auto;min-width:0";
  return area;
}
