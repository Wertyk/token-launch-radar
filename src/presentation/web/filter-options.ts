import type { escapeHtml } from "./format.ts";

export function options(values: readonly string[], esc: typeof escapeHtml): string {
  return [...new Set(values)]
    .sort()
    .map((value) => {
      const label = esc(value);
      return `<option value="${label}">${label}</option>`;
    })
    .join("");
}
