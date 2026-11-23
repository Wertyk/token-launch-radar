import type { CensusRecord, HouseRuleCheck } from "../domain/census/census.ts";
import { boardEntries, buildCensus, checkHouseRule } from "../domain/census/census.ts";
import { groupFamilies } from "../domain/census/families.ts";
import type { FarmPlan } from "../domain/farming/plans.ts";
import { makeFarmPlan, renderFarmStep } from "../domain/farming/plans.ts";
import type { LaunchClock } from "../domain/launch-clock/clock.ts";
import { fitLaunchClock, launchProbability12 } from "../domain/launch-clock/clock.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { daysBetween } from "../domain/snapshot.ts";
import { groupComparableCategories } from "../domain/valuation/categories.ts";
import { comparablesFromFamilies } from "../domain/valuation/comparables.ts";
import type { ValueDiagnostics } from "../domain/valuation/diagnostics.ts";
import { describeBoardValues } from "../domain/valuation/diagnostics.ts";
import { jackknifePlusCoverage, leaveOneFamilyOut } from "../domain/valuation/jackknife.ts";
import type { RankedRow, ValueModel } from "../domain/valuation/model.ts";
import { fitValueModel, rankBoard } from "../domain/valuation/model.ts";
import { selectLambda } from "../domain/valuation/selection.ts";
import type { ModelValidation } from "../domain/valuation/validation.ts";
import { validateModel } from "../domain/valuation/validation.ts";

export interface RadarRow extends RankedRow {
  plan: FarmPlan;
  farm_steps: string[];
}

interface RadarCore {
  census: CensusRecord[];
  houseRule: HouseRuleCheck;
  model: ValueModel;
  board: RadarRow[];
}

export interface RadarResult extends RadarCore {
  model: ValueModel & ModelValidation;
  rowDiagnostics: ReadonlyMap<string, ValueDiagnostics & { launch_p12: number }>;
  intervalCoverage: number | null;
  launchClock: LaunchClock;
}

function radarInputs({ protocols, as_of }: Snapshot) {
  const families = groupFamilies(protocols);
  return { families, comparables: comparablesFromFamilies(families, as_of) };
}

function rankRadar(
  snapshot: Snapshot,
  { families, comparables }: ReturnType<typeof radarInputs>,
  lambda: number,
): RadarCore {
  const { protocols, watchlist, as_of } = snapshot;
  const entries = buildCensus(protocols, families);
  const model = fitValueModel(comparables, lambda);
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

export function buildRadar(snapshot: Snapshot): RadarResult {
  const inputs = radarInputs(snapshot);
  const radar = rankRadar(snapshot, inputs, selectLambda(inputs.comparables));
  const validationRows = groupComparableCategories(inputs.comparables, inputs.families);
  const { as_of, protocols } = snapshot;
  const launchClock = fitLaunchClock(protocols, as_of);
  const refits = leaveOneFamilyOut(inputs.comparables, radar.model.lambda);
  const boardValues = describeBoardValues(radar.board, inputs.comparables, refits, as_of);
  const rowDiagnostics = new Map(
    boardValues.map(({ protocol: { slug, listed_at }, diagnostics }) => {
      const age =
        listed_at === null
          ? (launchClock.medianAgeDays ?? 0)
          : Math.max(0, daysBetween(listed_at, as_of));
      return [
        slug,
        { ...diagnostics, launch_p12: launchProbability12(launchClock.points, age) },
      ] as const;
    }),
  );
  return {
    ...radar,
    model: { ...radar.model, ...validateModel(validationRows) },
    rowDiagnostics,
    intervalCoverage: jackknifePlusCoverage(refits),
    launchClock,
  };
}

export function recomputeRadar(snapshot: Snapshot, lambda: number): RadarCore {
  return rankRadar(snapshot, radarInputs(snapshot), lambda);
}
