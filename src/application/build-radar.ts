import type { CensusRecord, HouseRuleCheck } from "../domain/census/census.ts";
import { censusRecords, checkHouseRule } from "../domain/census/census.ts";
import { farmTables } from "../domain/farming/playbook-data.ts";
import type { OddsModel } from "../domain/launch-odds/model.ts";
import {
  baseRate,
  fitOddsModel,
  LOGISTIC_PENALTY,
  PRIOR_STRENGTH,
} from "../domain/launch-odds/model.ts";
import { growthPlacebo } from "../domain/launch-odds/placebo.ts";
import { validateOdds } from "../domain/launch-odds/validation.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import type { ValueDiagnostics } from "../domain/valuation/diagnostics.ts";
import { describeBoardValues } from "../domain/valuation/diagnostics.ts";
import { impliedValueEffects, summarizeEffects } from "../domain/valuation/input-effects.ts";
import {
  jackknifePlusBands,
  leaveOneFamilyOut,
  MIN_BAND_FAMILIES,
  rangeHonesty,
} from "../domain/valuation/jackknife.ts";
import type { Prediction } from "../domain/valuation/metrics.ts";
import type { ValueModel } from "../domain/valuation/model.ts";
import type { ValueTerm } from "../domain/valuation/selection.ts";
import type { ModelValidation } from "../domain/valuation/validation.ts";
import { validateModel } from "../domain/valuation/validation.ts";
import {
  refitValue,
  VALUE_CATEGORY_PENALTY,
  VALUE_RIDGE_LAMBDA,
} from "../domain/valuation/value-fit.ts";
import { bootstrapRadar, EVIDENCE_REPLICATES } from "./bootstrap-radar.ts";
import type { RadarRow } from "./recompute-radar.ts";
import { radarInputs, rankRadar } from "./recompute-radar.ts";

export type { RadarRow } from "./recompute-radar.ts";
export { recomputeRadar } from "./recompute-radar.ts";

export interface RadarResult {
  census: CensusRecord[];
  houseRule: HouseRuleCheck;
  board: RadarRow[];
  model: ValueModel &
    ModelValidation & {
      fit: { terms: readonly ValueTerm[]; lambda: number; categoryPenalty: number };
    };
  rowDiagnostics: ReadonlyMap<string, ValueDiagnostics>;
  looScatter: (Prediction & Record<"p10" | "p25" | "p75" | "p90", number | null>)[] | null;
  rangeHonesty: ReturnType<typeof rangeHonesty>;
  bootstrap: Pick<ReturnType<typeof bootstrapRadar>, "replicates" | "seeds" | "valueErrors">;
  effectMedians: number[];
  rankRanges: ReturnType<typeof bootstrapRadar>["ranks"];
  placebo: ReturnType<typeof growthPlacebo>;
  odds: OddsModel & {
    names: string[];
    standardErrors: (number | null)[];
    penalty: number;
    baseRate: number;
    priorStrength: number;
    validation: ReturnType<typeof validateOdds>;
  };
}

export function buildRadar(snapshot: Snapshot, tables = farmTables()): RadarResult {
  const { entries, comparables, population } = radarInputs(snapshot);
  const oddsValidation = validateOdds(population);
  const odds = fitOddsModel(population, oddsValidation.selection.terms);
  const { looPredictions, looTerms, ...validation } = validateModel(comparables);
  const { terms } = validation.selection;
  const fit = { terms, lambda: VALUE_RIDGE_LAMBDA, categoryPenalty: VALUE_CATEGORY_PENALTY };
  const model = refitValue(comparables, terms);
  const board = rankRadar(snapshot, entries, model, odds, tables);
  const refits = leaveOneFamilyOut(comparables, (train) => refitValue(train, terms));
  const boardValues = describeBoardValues(board, comparables, refits, snapshot.as_of);
  const bands =
    model.n < MIN_BAND_FAMILIES
      ? null
      : jackknifePlusBands(comparables, (_, { slug }) => {
          const selected = looTerms.get(slug);
          if (!selected) throw new Error(`Missing held-out terms for ${slug}.`);
          return (train) => refitValue(train, selected);
        });
  const rowDiagnostics = new Map(
    boardValues.map(({ protocol: { slug }, diagnostics }) => [slug, diagnostics]),
  );
  const { ranks, oddsErrors, ...bootstrap } = bootstrapRadar(
    board,
    comparables,
    population,
    model,
    terms,
    odds,
    snapshot.as_of,
  );
  const effectMedians = summarizeEffects(
    new Map(
      board.map(({ protocol }) => [
        protocol.slug,
        impliedValueEffects(protocol, snapshot.as_of, model, odds),
      ]),
    ),
  ).map(([median]) => median);
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
    census: censusRecords(entries),
    houseRule: checkHouseRule(snapshot),
    board,
    model: { ...model, ...validation, fit },
    rowDiagnostics,
    looScatter,
    rangeHonesty: rangeHonesty(looScatter ?? []),
    bootstrap,
    effectMedians,
    rankRanges: ranks,
    placebo: growthPlacebo(population, odds.terms, EVIDENCE_REPLICATES),
    odds: {
      ...odds,
      standardErrors: oddsErrors,
      names: ["intercept", "logit(S(a))", ...odds.terms],
      penalty: LOGISTIC_PENALTY,
      baseRate: baseRate(population),
      priorStrength: PRIOR_STRENGTH,
      validation: oddsValidation,
    },
  };
}
