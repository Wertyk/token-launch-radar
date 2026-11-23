import { compareText } from "../shared/order.ts";
import type { CategoryComparable, CategoryGroup } from "./categories.ts";

interface Ratio {
  slug: string;
  logRatio: number;
}

function logMedianRatio(ratios: readonly Ratio[]): number {
  const mid = Math.floor(ratios.length / 2);
  const upper = ratios[mid]?.logRatio;
  const lower = ratios[mid - 1]?.logRatio;
  if (upper === undefined) throw new Error("A multiple needs at least one traded comparable.");
  // Average the middle two raw ratios without first exponentiating the log ratios.
  return ratios.length % 2 === 0 && lower !== undefined
    ? upper + Math.log1p(Math.exp(lower - upper)) - Math.LN2
    : upper;
}

export function fitMultiples(rows: readonly CategoryComparable[]) {
  const sorted = rows
    .map((row) => ({
      slug: row.slug,
      category: row.category,
      logRatio: row.target - row.lnTvl,
    }))
    .sort((a, b) => a.logRatio - b.logRatio || compareText(a.slug, b.slug));
  const groups = new Map<CategoryGroup, Ratio[]>();
  for (const row of sorted) {
    const group = groups.get(row.category);
    if (group) group.push(row);
    else groups.set(row.category, [row]);
  }
  const category: Partial<Record<CategoryGroup, number>> = {};
  for (const [key, rows] of groups) category[key] = logMedianRatio(rows);
  return { flat: logMedianRatio(sorted), category };
}
