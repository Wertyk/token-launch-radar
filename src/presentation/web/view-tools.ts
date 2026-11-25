import { growthText } from "./board-view.ts";
import { escapeHtml, formatInteger, formatOdds } from "./format.ts";
import { svg, table } from "./render.ts";
import { statusLabels } from "./state.ts";

export const viewTools = {
  escapeHtml,
  formatInteger,
  formatOdds,
  growthText,
  statusLabels,
  svg,
  table,
};

export type ViewTools = typeof viewTools;
