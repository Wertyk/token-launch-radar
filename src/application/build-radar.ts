import type { CensusRecord, HouseRuleCheck } from "../domain/census/census.ts";
import {
  boardEntries,
  buildCensus,
  checkHouseRule,
  houseRuleMembership,
} from "../domain/census/census.ts";
import { groupFamilies } from "../domain/census/families.ts";
import type { FarmEconomics } from "../domain/farming/economics.ts";
import { estimateFarmEconomics, renderEconomics } from "../domain/farming/economics.ts";
import type { FarmPlan } from "../domain/farming/plans.ts";
import { makeFarmPlan, renderFarmStep } from "../domain/farming/plans.ts";
import type { FarmTables } from "../domain/farming/playbook-data.ts";
import { farmTables } from "../domain/farming/playbook-data.ts";
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
  economics: FarmEconomics;
  farm_steps: string[];
}

export interface RadarResult {
  census: CensusRecord[];
  houseRule: HouseRuleCheck;
  board: RadarRow[];
  model: ValueModel & ModelValidation;
  rowDiagnostics: ReadonlyMap<string, ValueDiagnostics>;
  intervalCoverage: number | null;
  intervalCounts: ReturnType<typeof jackknifePlusCoverage>;
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
  launchClock: LaunchClock,
  tables: FarmTables,
) {
  const { protocols, watchlist, as_of } = snapshot;
  const entries = buildCensus(protocols, families);
  const model = fitValueModel(comparables, lambda);
  const candidates = boardEntries(entries, watchlist).map((entry) => {
    const { protocol } = entry;
    const age =
      protocol.listed_at === null
        ? (launchClock.medianAgeDays ?? 0)
        : Math.max(0, daysBetween(protocol.listed_at, as_of));
    return { ...entry, launchProbability12: launchProbability12(launchClock.points, age) };
  });
  const board = rankBoard(candidates, as_of, model).map((row) => {
    if (row.implied_value_usd === 0) {
      throw new Error(`${row.protocol.slug}: implied value rounds to $0`);
    }
    const { protocol, launch_value_usd, launchProbability12: p12 } = row;
    const plan = makeFarmPlan(protocol, tables);
    const economics = estimateFarmEconomics(plan, launch_value_usd, protocol.tvl_usd, p12);
    return {
      ...row,
      plan,
      economics,
      farm_steps: [...plan.steps.map(renderFarmStep), renderEconomics(economics)],
    };
  });
  return { entries, model, board };
}

export function buildRadar(snapshot: Snapshot, tables = farmTables()): RadarResult {
  const inputs = radarInputs(snapshot);
  const { as_of, protocols } = snapshot;
  const launchClock = fitLaunchClock(protocols, as_of);
  const { entries, model, board } = rankRadar(
    snapshot,
    inputs,
    selectLambda(inputs.comparables),
    launchClock,
    tables,
  );
  const validationRows = groupComparableCategories(inputs.comparables, inputs.families);
  const refits = leaveOneFamilyOut(inputs.comparables, model.lambda);
  const boardValues = describeBoardValues(board, inputs.comparables, refits, as_of);
  const coverage = jackknifePlusCoverage(inputs.comparables);
  const rowDiagnostics = new Map(
    boardValues.map(({ protocol: { slug }, diagnostics }) => [slug, diagnostics]),
  );
  return {
    census: entries.map(({ protocol: { slug, name, category, tvl_usd }, ...classification }) => ({
      slug,
      name,
      category,
      tvl_usd,
      ...classification,
    })),
    houseRule: checkHouseRule(snapshot),
    board,
    model: { ...model, ...validateModel(validationRows) },
    rowDiagnostics,
    intervalCounts: coverage,
    intervalCoverage: coverage ? coverage.covered / inputs.comparables.length : null,
    launchClock,
  };
}

export function recomputeRadar(
  snapshot: Snapshot,
  lambda: number,
  launchClock: LaunchClock,
  tables: FarmTables,
) {
  const inputs = radarInputs(snapshot);
  const { model, board } = rankRadar(snapshot, inputs, lambda, launchClock, tables);
  return { model, board, families: inputs.families, houseRule: houseRuleMembership(snapshot) };
}
