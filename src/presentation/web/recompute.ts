import type { BoardRows, buildRadar, RadarRow } from "../../application/browser-api.ts";
import type { Protocol } from "../../domain/snapshot.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";
import type { BoardRow } from "./board.ts";

type Economics = RadarRow["economics"];
type Interval = Pick<ValueDiagnostics, "interval_p10_usd" | "interval_p90_usd">;
type RankedFields = Pick<RadarRow, "rank" | "launch_value_usd" | "implied_value_usd">;
export type RecomputedRow = RankedFields & {
  farm_steps?: readonly string[];
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
    farm_steps: readonly string[];
    launch_p12: number;
    airdrop_yield_apr: number;
    farm_economics: Pick<Economics, "breakEvenDepositUsd" | "launchProbability12"> & {
      deposits: readonly Economics["deposits"][number][];
    };
  };

// Different engines round transcendental functions differently in the last ulp.
const tolerance = 1e-9;

function matchesFields(a: unknown, b: unknown, field = ""): boolean {
  if (a === b) return true;
  if (
    typeof a === "number" &&
    typeof b === "number" &&
    !Number.isInteger(a) &&
    !/cost/i.test(field)
  ) {
    const delta = Math.abs(a - b);
    return Number.isFinite(delta) && delta <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) && (!Array.isArray(b) || a.length !== b.length)) return false;
  return Object.entries(a).every(([key, value]) =>
    matchesFields(value, (b as Record<string, unknown>)[key], key),
  );
}

export function boardInterval(row: Interval | null | undefined) {
  if (!row) return null;
  const { interval_p10_usd: low, interval_p90_usd: high } = row;
  return Number.isInteger(low) && Number.isInteger(high) && low > 0 && low <= high
    ? ([low, high] as const)
    : null;
}

export function boardMismatches<Row extends RecomputedRow>(
  computed: readonly Row[],
  published: readonly (CheckRow | null)[],
  steps?: (row: Row) => string[],
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
    } = row;
    const saved = published[index];
    const farm_steps = steps?.(row) ?? row.farm_steps ?? saved?.farm_steps;
    const { airdropYieldApr: airdrop_yield_apr, ...farm_economics } = row.economics;
    const expected: Omit<CheckRow, keyof Interval | "farm_steps"> & {
      farm_steps: typeof farm_steps;
    } = {
      slug,
      rank,
      launch_value_usd,
      implied_value_usd,
      airdrop_yield_apr,
      launch_p12: farm_economics.launchProbability12,
      plan_chain: plan.chain,
      plan_one_time_cost_usd: plan.oneTimeCostUsd,
      plan_recurring_cost_usd: plan.recurringCostUsd,
      plan_total_cost_usd: plan.totalCostUsd,
      plan_total_minutes: plan.totalMinutes,
      farm_economics,
      farm_steps,
    };
    if (!boardInterval(saved) || !Array.isArray(farm_steps) || !matchesFields(expected, saved))
      slugs.push(slug);
  }
  return slugs;
}

export function prepareBoard(
  { board, families }: ReturnType<typeof buildRadar>,
  published: readonly ((CheckRow & ValueDiagnostics) | null)[],
  watchlist: readonly string[],
  age: (row: Protocol) => number | null,
  steps?: (row: RadarRow) => string[],
) {
  const evidence = new Map(published.flatMap((row) => (row ? [[row.slug, row]] : [])));
  return {
    diagnostics: evidence,
    families: new Map(families.map((family) => [family.representative.slug, family])),
    protocols: new Map(board.map((row) => [row.protocol.slug, row])),
    mismatches: boardMismatches(board, published, steps),
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
        interval: boardInterval(evidence.get(slug)),
        age: status === "traded" || status === "token-unpriced" ? null : age(protocol),
        cost: plan.totalCostUsd,
        time: plan.totalMinutes,
        watchlist: watchlisted.has(slug),
      };
    },
  );
}
