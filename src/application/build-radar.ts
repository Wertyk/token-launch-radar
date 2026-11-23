import type { CensusRecord, HouseRuleCheck } from "../domain/census/census.ts";
import { boardEntries, buildCensus, checkHouseRule, classify } from "../domain/census/census.ts";
import { groupFamilies } from "../domain/census/families.ts";
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
  census: CensusRecord[];
  houseRule: HouseRuleCheck;
  model: ValueModel;
  board: RadarRow[];
}

export function buildRadar(snapshot: Snapshot): RadarResult {
  const { protocols, watchlist, as_of } = snapshot;
  const families = groupFamilies(protocols);
  const entries = buildCensus(protocols, families);
  // Fit one row per traded family using summed TVL.
  // The kit's traded families are all singletons, so this leaves its fit unchanged.
  const comparables = families.flatMap(({ key, representative, tvl_usd, mcap_usd }) =>
    mcap_usd === null
      ? []
      : [
          {
            protocol: { ...representative, tvl_usd, mcap_usd },
            familyKey: key,
            ...classify(representative, mcap_usd),
          },
        ],
  );
  const model = fitValueModel(comparables, as_of);
  const ranked = rankBoard(boardEntries(entries, watchlist), as_of, model);
  const board = ranked.map((row) => {
    const plan = makeFarmPlan(row.protocol);
    return { ...row, plan, farm_steps: plan.steps.map(renderFarmStep) };
  });
  const census = entries.map(
    ({ protocol: { slug, name, category, tvl_usd }, ...classification }) => ({
      slug,
      name,
      category,
      tvl_usd,
      ...classification,
    }),
  );
  return { census, houseRule: checkHouseRule(snapshot), model, board };
}
