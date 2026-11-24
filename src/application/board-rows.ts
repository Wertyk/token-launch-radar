import type { RadarResult } from "./build-radar.ts";

export function toBoardRows(result: Pick<RadarResult, "board" | "houseRule">) {
  const slugsWithLikelyParent = new Set(result.houseRule.falsePositives.map(({ slug }) => slug));
  const rows = result.board.map((row) => ({
    slug: row.protocol.slug,
    name: row.protocol.name,
    rank: row.rank,
    launch_value_usd: row.launch_value_usd,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
    category: row.protocol.category,
    chains: row.protocol.chains,
    tvl_usd: row.protocol.tvl_usd,
    change_7d: row.protocol.change_7d,
    listed_at: row.protocol.listed_at,
    status: row.status,
    board_reasons: row.boardReasons,
    flags: [
      ...row.flags,
      ...(slugsWithLikelyParent.has(row.protocol.slug) ? ["parent-protocol-likely" as const] : []),
      ...row.plan.flags,
    ],
    decomposition: row.decomposition,
    plan_chain: row.plan.chain,
    plan_one_time_cost_usd: row.plan.oneTimeCostUsd,
    plan_recurring_cost_usd: row.plan.recurringCostUsd,
    plan_total_cost_usd: row.plan.totalCostUsd,
    plan_total_minutes: row.plan.totalMinutes,
    airdrop_yield_apr: row.economics.airdropYieldApr,
    farm_economics: {
      launchProbability12: row.economics.launchProbability12,
      deposits: row.economics.deposits,
      breakEvenDepositUsd: row.economics.breakEvenDepositUsd,
    },
  }));
  return { rows };
}

export type BoardRows = ReturnType<typeof toBoardRows>;
