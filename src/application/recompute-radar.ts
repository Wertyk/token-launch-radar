import { boardEntries, buildCensus, houseRuleMembership } from "../domain/census/census.ts";
import { groupFamilies } from "../domain/census/families.ts";
import type { FarmEconomics } from "../domain/farming/economics.ts";
import { estimateFarmEconomics } from "../domain/farming/economics.ts";
import { farmExitThresholds, farmGroup } from "../domain/farming/exit-rules.ts";
import type { FarmPlan } from "../domain/farming/plans.ts";
import { makeFarmPlan } from "../domain/farming/plans.ts";
import type { FarmTables } from "../domain/farming/playbook-data.ts";
import type { OddsModel, OddsTerm } from "../domain/launch-odds/model.ts";
import {
  checkClockCoefficient,
  fitOddsModel,
  oddsPopulation,
  protocolOdds,
} from "../domain/launch-odds/model.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { comparablesFromFamilies } from "../domain/valuation/comparables.ts";
import type { RankedRow, ValueModel } from "../domain/valuation/model.ts";
import { rankBoard } from "../domain/valuation/model.ts";
import type { ValueFit } from "../domain/valuation/value-fit.ts";
import { refitValue } from "../domain/valuation/value-fit.ts";

export interface RadarRow extends RankedRow, ReturnType<typeof protocolOdds> {
  plan: FarmPlan;
  economics: FarmEconomics;
}

export function radarInputs({ protocols, as_of }: Snapshot) {
  const families = groupFamilies(protocols);
  const entries = buildCensus(protocols, families);
  const comparables = comparablesFromFamilies(families, as_of);
  return { families, entries, comparables, population: oddsPopulation(entries, as_of) };
}

export function rankRadar(
  { watchlist, as_of }: Snapshot,
  entries: ReturnType<typeof buildCensus>,
  model: ValueModel,
  odds: OddsModel,
  tables: FarmTables,
): RadarRow[] {
  checkClockCoefficient(odds.coefficients[1]);
  const candidates = boardEntries(entries, watchlist).map((entry) => ({
    ...entry,
    ...protocolOdds(odds, entry.protocol, as_of),
  }));
  const thresholds = farmExitThresholds(entries, tables.playbooks);
  return rankBoard(candidates, as_of, model).map((row) => {
    const { protocol, launch_value_usd, launchProbability12: p12 } = row;
    const plan = makeFarmPlan(protocol, tables, {
      launchProbability12: p12,
      exitThreshold: thresholds.get(farmGroup(protocol.category, tables.playbooks)) ?? null,
    });
    return {
      ...row,
      plan,
      economics: estimateFarmEconomics(plan, launch_value_usd, protocol.tvl_usd, p12),
    };
  });
}

export function recomputeRadar(
  snapshot: Snapshot,
  valueFit: ValueFit,
  oddsTerms: readonly OddsTerm[],
  tables: FarmTables,
) {
  const { families, entries, comparables, population } = radarInputs(snapshot);
  const model = refitValue(comparables, valueFit);
  const odds = fitOddsModel(population, oddsTerms);
  return {
    model,
    odds,
    board: rankRadar(snapshot, entries, model, odds, tables),
    families,
    comparables,
    population,
    houseRule: houseRuleMembership(snapshot),
  };
}
