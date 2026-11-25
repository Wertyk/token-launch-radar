import {
  bootstrapProbability12,
  fitOddsModel,
  type OddsModel,
  protocolOdds,
  type TokenStatusRow,
} from "../domain/launch-odds/model.ts";
import { mulberry32 } from "../domain/shared/prng.ts";
import { bootstrapSummary, resample } from "../domain/valuation/bootstrap.ts";
import type { CategoryComparable } from "../domain/valuation/categories.ts";
import { rankBoard, type ValueModel } from "../domain/valuation/model.ts";
import type { ValueTerm } from "../domain/valuation/selection.ts";
import { refitValue } from "../domain/valuation/value-fit.ts";
import type { RadarRow } from "./recompute-radar.ts";

export const EVIDENCE_REPLICATES = 200;
export const BOOTSTRAP_SEEDS = [0x29b1, 0x29b2] as const;

export function bootstrapRadar(
  board: readonly RadarRow[],
  comparables: readonly CategoryComparable[],
  population: readonly TokenStatusRow[],
  model: ValueModel,
  terms: readonly ValueTerm[],
  odds: OddsModel,
  asOf: string,
  replicates = EVIDENCE_REPLICATES,
  seeds: readonly [number, number] = BOOTSTRAP_SEEDS,
) {
  const [valueSeed, oddsSeed] = seeds;
  const valueRandom = mulberry32(valueSeed);
  const oddsRandom = mulberry32(oddsSeed);
  const valueNames = Object.keys(model.coefficients) as (keyof ValueModel["coefficients"])[];
  const categoryNames = Object.keys(model.categoryEffects ?? {}) as (keyof NonNullable<
    ValueModel["categoryEffects"]
  >)[];
  const { ranks, standardErrors } = bootstrapSummary(
    Array.from({ length: replicates }, () => {
      const value = refitValue(resample(comparables, valueRandom), terms);
      const status = fitOddsModel(resample(population, oddsRandom), odds.terms);
      const candidates = board.map(
        ({ protocol, status: classification, boardReasons, reason, familyKey }) => ({
          protocol,
          status: classification,
          boardReasons,
          reason,
          familyKey,
          launchProbability12: protocolOdds(status, protocol, asOf, bootstrapProbability12)
            .launchProbability12,
        }),
      );
      return {
        ranked: rankBoard(candidates, asOf, value).map(({ protocol }) => protocol.slug),
        coefficients: [
          ...valueNames.map((name) => value.coefficients[name]),
          ...categoryNames.map((name) => value.categoryEffects?.[name] ?? 0),
          ...status.coefficients,
        ],
      };
    }),
  );
  const categoryEnd = valueNames.length + categoryNames.length;
  return {
    ranks,
    replicates,
    seeds,
    valueErrors: Object.fromEntries(
      [...valueNames, ...categoryNames].map((name, i) => [name, standardErrors[i] ?? null]),
    ),
    oddsErrors: standardErrors.slice(categoryEnd),
  };
}
