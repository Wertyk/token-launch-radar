export function formatUsd(value: number): string {
  const [whole = "0", cents] = Math.abs(value).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = cents && cents !== "00" ? `.${cents}` : "";
  return `${value < 0 ? "-" : ""}$${grouped}${fraction}`;
}
