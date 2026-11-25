import type { BoardRows, browserApi, RadarRow } from "../../application/browser-api.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";
import type { BoardRow } from "./board.ts";

type Economics = RadarRow["economics"];
type RankRange = Pick<BoardRows["rows"][number], "rank_p10" | "rank_p90">;
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

// Different engines round transcendental functions differently, including capital carry in costUsd.
// Plan fees use exact cents and must match exactly.
const tolerance = 1e-9;

export function matchesFields(a: unknown, b: unknown, field = "", scores = false): boolean {
  if (a === b) return true;
  if (
    typeof a === "number" &&
    typeof b === "number" &&
    (scores || !Number.isInteger(a)) &&
    !/^plan_/.test(field)
  ) {
    const delta = Math.abs(a - b);
    return Number.isFinite(delta) && delta <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) && (!Array.isArray(b) || a.length !== b.length)) return false;
  return Object.entries(a).every(([key, value]) =>
    matchesFields(value, (b as Record<string, unknown>)[key], key, scores),
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
      rank,
      launch_value_usd,
      implied_value_usd,
      plan,
      protocol: { slug },
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
  { board, families, comparables }: ReturnType<typeof browserApi.buildRadar>,
  published: readonly ((CheckRow & ValueDiagnostics & RankRange) | null)[],
  watchlist: readonly string[],
  age: (date: string) => number,
  steps?: (row: RadarRow) => string[],
) {
  const evidence = new Map(published.flatMap((row) => (row ? [[row.slug, row]] : [])));
  const comparableKeys = new Set(comparables.map(({ familyKey }) => familyKey));
  return {
    diagnostics: evidence,
    families: new Map(
      families
        .filter(({ key }) => comparableKeys.has(key))
        .map((family) => [family.representative.slug, family]),
    ),
    protocols: new Map(board.map((row) => [row.protocol.slug, row])),
    mismatches: boardMismatches(board, published, steps),
    rows: boardViewRows(board, evidence, watchlist, age),
  };
}

function boardViewRows(
  board: readonly RadarRow[],
  evidence: ReadonlyMap<string, Interval & RankRange>,
  watchlist: readonly string[],
  age: (date: string) => number,
): BoardRow[] {
  const watchlisted = new Set(watchlist);
  return board.map(
    ({
      protocol,
      rank,
      implied_value_usd: value,
      launch_value_usd: launchValue,
      launchProbability12: odds,
      plan,
      economics,
    }) => {
      const { slug, name, tvl_usd, change_7d, category, chains, listed_at } = protocol;
      const saved = evidence.get(slug);
      const { rank_p10: low, rank_p90: high } = saved ?? {};
      const rankRange =
        low != null &&
        high != null &&
        Number.isInteger(low) &&
        Number.isInteger(high) &&
        low >= 1 &&
        low <= high &&
        high <= board.length
          ? ([low, high] as const)
          : null;
      const deposit = economics.deposits.find(({ depositUsd }) => depositUsd === 10_000);
      if (!deposit) throw new Error("Missing $10K farm economics.");
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
        interval: boardInterval(saved),
        rankRange,
        age: listed_at ? age(listed_at) : null,
        cost: plan.totalCostUsd,
        time: plan.totalMinutes,
        verdict: deposit.verdict,
        netPerHour: deposit.netPerHourUsd,
        watchlist: watchlisted.has(slug),
      };
    },
  );
}
