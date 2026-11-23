import type { Comparable } from "./comparables.ts";
import type { Fold } from "./folds.ts";
import { seededFolds, splitFolds } from "./folds.ts";
import type { Prediction } from "./metrics.ts";
import { medianLogError } from "./metrics.ts";
import type { ValueModel } from "./model.ts";
import { fitValueModel, logValue } from "./model.ts";

// Visit stronger penalties first to resolve equal validation errors.
export const LAMBDAS = [64, 16, 4, 1, 0.1, 0.01] as const;

type ModelTerm = "tvl" | "age" | "momentum";

export function predictionsFor<Row extends Comparable>(
  rows: readonly Row[],
  predict: (row: Row) => number,
): Prediction[] {
  return rows.map((row) => ({ slug: row.slug, actual: row.target, predicted: predict(row) }));
}

export function modelFeatures(row: Comparable, medianLnAge: number, drop?: ModelTerm) {
  return {
    lnTvl: row.lnTvl,
    growth: drop === "momentum" ? 0 : row.growth,
    lnAge: row.lnAge ?? medianLnAge,
  };
}

export function modelPredictions(rows: readonly Comparable[], model: ValueModel, drop?: ModelTerm) {
  return predictionsFor(rows, (row) =>
    logValue(modelFeatures(row, model.medianLnAge, drop), model),
  );
}

export function innerFolds<Row extends Comparable>(rows: readonly Row[]): Fold<Row>[] {
  return splitFolds(seededFolds(rows)).filter(({ train, test }) => train.length && test.length);
}

export function selectByMedianError<Row extends Comparable, Candidate>(
  folds: readonly Fold<Row>[],
  candidates: readonly Candidate[],
  fallback: Candidate,
  predict: (fold: Fold<Row>, candidate: Candidate) => Prediction[],
): Candidate {
  let best = fallback;
  let bestError = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const error = medianLogError(folds.flatMap((fold) => predict(fold, candidate)));
    if (error !== undefined && error < bestError) {
      bestError = error;
      best = candidate;
    }
  }
  return best;
}

function fitVariant(train: readonly Comparable[], lambda: number, drop?: ModelTerm): ValueModel {
  return fitValueModel(train, lambda, drop === "tvl" || drop === "age" ? { drop } : {});
}

export function selectLambda(rows: readonly Comparable[], drop?: ModelTerm): number {
  return selectByMedianError(innerFolds(rows), LAMBDAS, LAMBDAS[0], ({ train, test }, lambda) =>
    modelPredictions(test, fitVariant(train, lambda, drop), drop),
  );
}

export function nestedVariantPredictions({ train, test }: Fold, drop: ModelTerm): Prediction[] {
  return modelPredictions(test, fitVariant(train, selectLambda(train, drop), drop), drop);
}
