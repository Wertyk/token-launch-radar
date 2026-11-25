export function formatUsd(value: number): string {
  const amount = Math.abs(value).toFixed(2).replace(/\.00$/, "");
  return `${value < 0 ? "-" : ""}$${amount.replace(/\B(?=(\d{3})+(?:\.|$))/g, ",")}`;
}
