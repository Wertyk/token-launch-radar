import type { BoardRows, RadarRow } from "../../application/browser-api.ts";

type Economics = RadarRow["economics"];
type RankedFields = Pick<
  RadarRow,
  "rank" | "launch_value_usd" | "implied_value_usd" | "farm_steps"
>;
export type RecomputedRow = RankedFields & {
  protocol: Pick<RadarRow["protocol"], "slug">;
  plan: Pick<
    RadarRow["plan"],
    "chain" | "oneTimeCostUsd" | "recurringCostUsd" | "totalCostUsd" | "totalMinutes"
  >;
  economics: Omit<Economics, "deposits"> & { deposits: Readonly<Economics["deposits"]> };
};
export type CheckRow = RankedFields &
  Pick<
    BoardRows["rows"][number],
    | "plan_chain"
    | "plan_one_time_cost_usd"
    | "plan_recurring_cost_usd"
    | "plan_total_cost_usd"
    | "plan_total_minutes"
  > & {
    slug: string;
    launch_p12: number;
    airdrop_yield_apr: number;
    farm_economics: Pick<Economics, "breakEvenDepositUsd" | "launchProbability12"> & {
      deposits: readonly Economics["deposits"][number][];
    };
  };

function matchesFields(expected: unknown, actual: unknown): boolean {
  if (!expected || typeof expected !== "object") return expected === actual;
  if (!actual || typeof actual !== "object") return false;
  if (Array.isArray(expected) && (!Array.isArray(actual) || expected.length !== actual.length)) {
    return false;
  }
  return Object.entries(expected).every(([key, value]) =>
    matchesFields(value, (actual as Record<string, unknown>)[key]),
  );
}

export function boardMismatches(
  computed: readonly RecomputedRow[],
  published: readonly (CheckRow | null)[],
): string[] {
  const slugs = published
    .slice(computed.length)
    .map((row) => (typeof row?.slug === "string" ? row.slug : "(missing slug)"));
  for (const [index, row] of computed.entries()) {
    const {
      protocol: { slug },
      rank,
      launch_value_usd,
      implied_value_usd,
      plan,
      economics,
      farm_steps,
    } = row;
    const { airdropYieldApr: airdrop_yield_apr, ...farm_economics } = economics;
    const expected: CheckRow = {
      slug,
      rank,
      launch_value_usd,
      implied_value_usd,
      farm_steps,
      airdrop_yield_apr,
      launch_p12: farm_economics.launchProbability12,
      plan_chain: plan.chain,
      plan_one_time_cost_usd: plan.oneTimeCostUsd,
      plan_recurring_cost_usd: plan.recurringCostUsd,
      plan_total_cost_usd: plan.totalCostUsd,
      plan_total_minutes: plan.totalMinutes,
      farm_economics,
    };
    if (!matchesFields(expected, published[index])) slugs.push(slug);
  }
  return slugs;
}
