import { type CategoryComparable, type CategoryGroup, categoryTotals } from "./categories.ts";
import type { CategoryDesign } from "./model.ts";

export interface CategoryParameters {
  lambda: number;
  categoryPenaltyMultiple: number;
}

export function categoryDesign(
  rows: readonly CategoryComparable[],
  penalty: number,
): CategoryDesign {
  const counts = categoryTotals();
  for (const { category } of rows) counts[category]++;
  const groups = (Object.keys(counts) as CategoryGroup[]).filter((key) => counts[key] > 0);
  const shares = groups.map((category) => counts[category] / rows.length);
  const groupBySlug = new Map<string, number>();
  for (const { slug, category } of rows) groupBySlug.set(slug, groups.indexOf(category));

  // Use a separate unpenalized intercept and K−1 treatment contrasts. The
  // penalty applies to deviations from the family-weighted intercept.
  const contrastShares = shares.slice(1);
  return {
    groups,
    groupBySlug,
    contrastShares,
    penalty: contrastShares.map((left, i) =>
      contrastShares.map(
        (right, j) => penalty * ((i === j ? 1 : 0) + shares.length * left * right - left - right),
      ),
    ),
  };
}
