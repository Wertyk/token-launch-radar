import type { CensusRecord, HouseRuleCheck } from "../domain/census/census.ts";
import { checkHouseRule } from "../domain/census/census.ts";
import { farmTables } from "../domain/farming/playbook-data.ts";
import type { OddsModel } from "../domain/launch-odds/model.ts";
import { fitOddsModel, PENALTY, PRIOR_STRENGTH } from "../domain/launch-odds/model.ts";
import { growthPlacebo } from "../domain/launch-odds/placebo.ts";
import { validateOdds } from "../domain/launch-odds/validation.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { groupComparableCategories } from "../domain/valuation/categories.ts";
import { categoryDesign } from "../domain/valuation/category-design.ts";
import { selectCategoryFit } from "../domain/valuation/category-model.ts";
import type { ValueDiagnostics } from "../domain/valuation/diagnostics.ts";
import { describeBoardValues } from "../domain/valuation/diagnostics.ts";
import {
  jackknifePlusBands,
  leaveOneFamilyOut,
  MIN_BAND_FAMILIES,
  rangeHonesty,
} from "../domain/valuation/jackknife.ts";
import type { Prediction } from "../domain/valuation/metrics.ts";
import type { ValueModel } from "../domain/valuation/model.ts";
import { selectLambda } from "../domain/valuation/selection.ts";
import type { ModelValidation } from "../domain/valuation/validation.ts";
import { validateModel } from "../domain/valuation/validation.ts";
import type { ValueFit } from "../domain/valuation/value-fit.ts";
import { refitValue, refitValueSubset, tuneValueFit } from "../domain/valuation/value-fit.ts";
import { selectValueTerms, type ValueTrialFit } from "../domain/valuation/value-selection.ts";
import { bootstrapRadar, EVIDENCE_REPLICATES } from "./bootstrap-radar.ts";
import type { RadarRow } from "./recompute-radar.ts";
import { radarInputs, rankRadar } from "./recompute-radar.ts";

export type { RadarRow } from "./recompute-radar.ts";
export { recomputeRadar } from "./recompute-radar.ts";

export interface RadarResult {
  census: CensusRecord[];
  houseRule: HouseRuleCheck;
  board: RadarRow[];
  model: ValueModel & ModelValidation & { fit: ValueFit; trialFit: ValueTrialFit };
  rowDiagnostics: ReadonlyMap<string, ValueDiagnostics>;
  looScatter: (Prediction & Record<"p10" | "p25" | "p75" | "p90", number | null>)[] | null;
  rangeHonesty: ReturnType<typeof rangeHonesty>;
  bootstrap: { replicates: number; valueErrors: Record<string, number | null> };
  rankRanges: ReturnType<typeof bootstrapRadar>["ranks"];
  placebo: ReturnType<typeof growthPlacebo>;
  odds: OddsModel & {
    names: string[];
    standardErrors: (number | null)[];
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
  const lambda = selectLambda(comparables, []);
  const categoryTrial = selectCategoryFit(comparables, ["category"]);
  const trialFit = { lambda, categoryTrial };
  const selection = selectValueTerms(comparables, trialFit);
  const { looPredictions, ...validation } = validateModel(comparables, selection);
  const fit = {
    terms: selection.terms,
    lambda,
    ...(selection.terms.includes("category") && {
      ...categoryTrial,
      category: categoryDesign(comparables, categoryTrial),
    }),
  };
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
  const { ranks, replicates, valueErrors, oddsErrors } = bootstrapRadar(
    board,
    comparables,
    population,
    model,
    fit,
    odds,
    snapshot.as_of,
  );
  const looScatter =
    bands &&
    looPredictions.flatMap((point) => {
      const band = bands.get(point.slug);
      if (!band) return [];
      const finite = (value: number) => (Number.isFinite(value) ? value : null);
      return [
        {
          ...point,
          p10: finite(band.p10),
          p25: finite(band.p25),
          p75: finite(band.p75),
          p90: finite(band.p90),
        },
      ];
    });
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
    model: { ...model, ...validation, fit, trialFit },
    rowDiagnostics,
    looScatter,
    rangeHonesty: rangeHonesty(looScatter ?? []),
    bootstrap: { replicates, valueErrors },
    rankRanges: ranks,
    placebo: growthPlacebo(population, odds.terms, EVIDENCE_REPLICATES),
    odds: {
      ...odds,
      standardErrors: oddsErrors,
      names: ["intercept", "logit(S(a))", ...odds.terms],
      penalty: PENALTY,
      priorStrength: PRIOR_STRENGTH,
      validation: oddsValidation,
    },
  };
}
