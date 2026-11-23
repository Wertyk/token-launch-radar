import type { CensusEntry } from "../domain/census/census.ts";
import { boardEntries, buildCensus } from "../domain/census/census.ts";
import type { FarmPlan } from "../domain/farming/plans.ts";
import { makeFarmPlan, renderFarmStep } from "../domain/farming/plans.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import type { RankedRow, ValueModel } from "../domain/valuation/model.ts";
import { fitValueModel, rankBoard } from "../domain/valuation/model.ts";

export interface RadarRow extends RankedRow {
  plan: FarmPlan;
  farm_steps: string[];
}

export interface RadarResult {
  census: CensusEntry[];
  model: ValueModel;
  board: RadarRow[];
}

export function buildRadar(snapshot: Snapshot): RadarResult {
  const { protocols, watchlist, as_of } = snapshot;
  const census = buildCensus(protocols);
  const model = fitValueModel(census, as_of);
  const ranked = rankBoard(boardEntries(census, watchlist), as_of, model);
  const board = ranked.map((row) => {
    const plan = makeFarmPlan(row.protocol);
    return { ...row, plan, farm_steps: plan.steps.map(renderFarmStep) };
  });
  return { census, model, board };
}
