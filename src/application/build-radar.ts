import type { CensusRecord, HouseRuleCheck } from "../domain/census/census.ts";
import { checkHouseRule } from "../domain/census/census.ts";
import { farmTables } from "../domain/farming/playbook-data.ts";
import type { OddsModel } from "../domain/launch-odds/model.ts";
import { fitOddsModel, PENALTY, PRIOR_STRENGTH } from "../domain/launch-odds/model.ts";
import { validateOdds } from "../domain/launch-odds/validation.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { groupComparableCategories } from "../domain/valuation/categories.ts";
import type { ValueDiagnostics } from "../domain/valuation/diagnostics.ts";
import { describeBoardValues } from "../domain/valuation/diagnostics.ts";
import {
  jackknifePlusBands,
  leaveOneFamilyOut,
  MIN_BAND_FAMILIES,
} from "../domain/valuation/jackknife.ts";
import type { Prediction } from "../domain/valuation/metrics.ts";
import type { ValueModel } from "../domain/valuation/model.ts";
import type { ModelValidation } from "../domain/valuation/validation.ts";
import { validateModel } from "../domain/valuation/validation.ts";
import type { ValueFit } from "../domain/valuation/value-fit.ts";
import { refitValue, refitValueSubset, tuneValueFit } from "../domain/valuation/value-fit.ts";
import type { RadarRow } from "./recompute-radar.ts";
import { radarInputs, rankRadar } from "./recompute-radar.ts";

export type { RadarRow } from "./recompute-radar.ts";
export { recomputeRadar } from "./recompute-radar.ts";

export interface RadarResult {
  census: CensusRecord[];
  houseRule: HouseRuleCheck;
  board: RadarRow[];
  model: ValueModel & ModelValidation & { fit: ValueFit };
  rowDiagnostics: ReadonlyMap<string, ValueDiagnostics>;
  looScatter: (Prediction & { p10: number | null; p90: number | null })[] | null;
  odds: OddsModel & {
    names: string[];
    penalty: number;
    priorStrength: number;
    validation: ReturnType<typeof validateOdds>;
  };
}

export function buildRadar(snapshot: Snapshot, tables = farmTables()): RadarResult {
  const { entries, families, comparables: rows, population } = radarInputs(snapshot);
  const comparables = groupComparableCategories(rows, families);
  const oddsValidation = validateOdds(population);
  const odds = fitOddsModel(population, oddsValidation.terms);
  const { looPredictions, ...validation } = validateModel(comparables);
  const fit = tuneValueFit(comparables, validation.selection.terms);
  const model = refitValue(comparables, fit);
  const board = rankRadar(snapshot, entries, model, odds, tables);
  const refits = leaveOneFamilyOut(comparables, (train) => refitValueSubset(train, fit));
  const boardValues = describeBoardValues(board, comparables, refits, snapshot.as_of);
  const bands =
    model.n < MIN_BAND_FAMILIES
      ? null
      : jackknifePlusBands(comparables, (rows) => {
          const fit = tuneValueFit(rows, validation.selection.terms);
          return (train) => refitValueSubset(train, fit);
        });
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
    model: { ...model, ...validation, fit },
    rowDiagnostics,
    looScatter:
      bands &&
      looPredictions.flatMap((point) => {
        const band = bands.get(point.slug);
        if (!band) return [];
        return [
          {
            ...point,
            p10: Number.isFinite(band.p10) ? band.p10 : null,
            p90: Number.isFinite(band.p90) ? band.p90 : null,
          },
        ];
      }),
    odds: {
      ...odds,
      names: ["intercept", "logit(S(a))", ...odds.terms],
      penalty: PENALTY,
      priorStrength: PRIOR_STRENGTH,
      validation: oddsValidation,
    },
  };
}
