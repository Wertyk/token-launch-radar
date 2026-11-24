import type { BoardRows, buildRadar, RadarRow } from "../../application/browser-api.ts";
import type { Protocol } from "../../domain/snapshot.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";
import type { BoardRow } from "./board.ts";

type Economics = RadarRow["economics"];
type Interval = Pick<ValueDiagnostics, "interval_p10_usd" | "interval_p90_usd">;
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
  Interval &
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

export function boardInterval(row: Interval | null | undefined) {
  if (!row) return null;
  const { interval_p10_usd: low, interval_p90_usd: high } = row;
  return Number.isFinite(low) && Number.isFinite(high) && low <= high
    ? ([low, high] as const)
    : null;
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
    const expected: Omit<CheckRow, keyof Interval> = {
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
    if (!boardInterval(published[index]) || !matchesFields(expected, published[index]))
      slugs.push(slug);
  }
  return slugs;
}

export function prepareBoard(
  { board, families }: ReturnType<typeof buildRadar>,
  published: readonly ((CheckRow & ValueDiagnostics) | null)[],
  watchlist: readonly string[],
  age: (row: Protocol) => number | null,
) {
  const evidence = new Map(published.flatMap((row) => (row ? [[row.slug, row]] : [])));
  return {
    diagnostics: evidence,
    families: new Map(families.map((family) => [family.representative.slug, family])),
    protocols: new Map(board.map((row) => [row.protocol.slug, row])),
    mismatches: boardMismatches(board, published),
    rows: boardViewRows(board, evidence, watchlist, age),
  };
}

function boardViewRows(
  board: readonly RadarRow[],
  evidence: ReadonlyMap<string, Interval>,
  watchlist: readonly string[],
  age: (row: Protocol) => number | null,
): BoardRow[] {
  const watchlisted = new Set(watchlist);
  return board.map(
    ({
      protocol,
      rank,
      status,
      implied_value_usd: value,
      launch_value_usd: launchValue,
      launchProbability12: odds,
      plan,
    }) => {
      const { slug, name, tvl_usd, change_7d, category, chains } = protocol;
      const diagnostics = evidence.get(slug);
      return {
        slug,
        name,
        rank,
        category,
        chains,
        value,
        launchValue,
        odds,
        tvl: tvl_usd,
        growth: change_7d,
        interval: boardInterval(diagnostics),
        age: status === "traded" || status === "token-unpriced" ? null : age(protocol),
        cost: plan.totalCostUsd,
        time: plan.totalMinutes,
        watchlist: watchlisted.has(slug),
      };
    },
  );
}
