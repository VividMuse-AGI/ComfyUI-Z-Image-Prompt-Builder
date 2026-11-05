import { buildCardSummary, formatCardSummary } from "./card_summary.js";
import { EN_CATALOG } from "./i18n_catalog.js";

// Display adapter only: no widget values, writes, or random resolution.
export function cardSummaryText(card, validate, hiddenField = () => false, selectedModules) {
  const language = globalThis.__vividMuseZImageI18n?.activeLanguage() || "zh";
  const summary = buildCardSummary(card, {validate, hiddenField, selectedModules,
    fieldGroups: globalThis.__vividMuseZImagePromptData?.MODULE_FIELD_GROUPS});
  return formatCardSummary(summary, {language,
    fieldLabel: field => language === "en" ? EN_CATALOG.widgetLabels[field] || field : field,
    valueLabel: (field, value) => language === "en" ? EN_CATALOG.optionLabels[field]?.[value] || value : value});
}

export function createCardSummaryElement(el) {
  const area = el("pre");
  area.setAttribute("data-vividmuse-card-summary", "true");
  area.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:200px;overflow:auto;min-width:0";
  return area;
}
