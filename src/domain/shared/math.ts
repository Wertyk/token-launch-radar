import { compareText } from "./order.ts";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function median(
  observations: readonly { value: number; slug: string }[],
): number | undefined {
  const sorted = [...observations].sort((a, b) => a.value - b.value || compareText(a.slug, b.slug));
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  const lower = sorted[mid - 1];
  if (!upper) return undefined;
  return sorted.length % 2 === 0 && lower ? (lower.value + upper.value) / 2 : upper.value;
}
