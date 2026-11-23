export function formatInteger(value: number | null): string {
  return value === null ? "—" : value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  const magnitude = Math.abs(value).toFixed(1);
  const sign = magnitude === "0.0" ? "" : value < 0 ? "−" : "+";
  return `${sign}${magnitude}%`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
