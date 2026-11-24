export function formatInteger(value: number | null): string {
  return value === null ? "—" : value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatCompactUsd(value: number): string {
  const scale = Math.min(4, Math.floor(Math.log10(value) / 3));
  return scale < 1 ? `$${value}` : `$${(value / 1000 ** scale).toFixed(2)}${" KMBT"[scale]}`;
}

export function signedTerm(value: number, decimals = 3): string {
  return `${value < 0 ? "−" : "+"} ${Math.abs(value).toFixed(decimals)}`;
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
