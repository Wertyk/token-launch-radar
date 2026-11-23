import type { RadarResult } from "./build-radar.ts";

export function toBoardRows(result: RadarResult) {
  const rows = result.board.map((row) => ({
    slug: row.protocol.slug,
    name: row.protocol.name,
    rank: row.rank,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
    category: row.protocol.category,
    chains: row.protocol.chains,
    tvl_usd: row.protocol.tvl_usd,
    change_7d: row.protocol.change_7d,
    listed_at: row.protocol.listed_at,
    status: row.status,
    board_reasons: row.boardReasons,
    flags: row.flags,
    decomposition: row.decomposition,
    plan_chain: row.plan.chain,
    plan_total_cost_usd: row.plan.totalCostUsd,
    plan_total_minutes: row.plan.totalMinutes,
  }));
  return { rows };
}

export type BoardRows = ReturnType<typeof toBoardRows>;
