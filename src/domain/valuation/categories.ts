import type { ProtocolFamily } from "../census/families.ts";
import type { Comparable } from "./comparables.ts";

// Valuation keeps bridges distinct and groups missing or unlisted labels as other.
// Risk Curators and Onchain Capital Allocator use yield farm playbooks and map to other here.
const categories = {
  dex: ["dex", "dexs", "liquidity manager"],
  lending: ["lending", "uncollateralized lending", "cdp", "cdp manager", "collateral markets"],
  staking: ["liquid staking", "staking pool", "restaking", "liquid restaking", "restaked btc"],
  yield: ["yield", "yield aggregator", "leveraged farming", "farm"],
  derivatives: [
    "derivatives",
    "interest rate derivatives",
    "basis trading",
    "options",
    "options vault",
  ],
  rwa: ["rwa"],
  bridge: ["bridge", "canonical bridge", "cross chain bridge"],
  other: [],
} as const;

export type CategoryGroup = keyof typeof categories;

export function categoryGroup(category: string | null): CategoryGroup {
  const label = category?.trim().toLowerCase() ?? "";
  for (const [group, labels] of Object.entries(categories)) {
    if ((labels as readonly string[]).includes(label)) return group as CategoryGroup;
  }
  return "other";
}

export function categoryTotals(): Record<CategoryGroup, number> {
  return Object.fromEntries(Object.keys(categories).map((group) => [group, 0])) as Record<
    CategoryGroup,
    number
  >;
}

export interface CategoryComparable extends Comparable {
  category: CategoryGroup;
}

export function groupComparableCategories(
  rows: readonly Comparable[],
  families: readonly ProtocolFamily[],
): CategoryComparable[] {
  const groups = new Map(
    families.map(({ key, representative }) => [key, categoryGroup(representative.category)]),
  );
  return rows.map((row) => ({ ...row, category: groups.get(row.familyKey) ?? "other" }));
}
