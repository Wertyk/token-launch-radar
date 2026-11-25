import type { CategoryGroup } from "./categories.ts";
import type { Comparable } from "./comparables.ts";
import type { Fold } from "./folds.ts";
import { seededFolds, splitFolds } from "./folds.ts";
import type { Prediction } from "./metrics.ts";
import { medianLogError } from "./metrics.ts";
import type { FitOptions, ValueModel } from "./model.ts";
import { fitValueModel, logValue } from "./model.ts";

// Visit stronger penalties first to resolve equal validation errors.
export const LAMBDAS = [64, 16, 4, 1, 0.1, 0.01] as const;

export const VALUE_CANDIDATES = ["momentum", "age", "category"] as const;
export type ValueTerm = (typeof VALUE_CANDIDATES)[number];
export const DEFAULT_VALUE_TERMS: readonly ValueTerm[] = ["momentum", "age"];

export function predictionsFor<Row extends Comparable>(
  rows: readonly Row[],
  predict: (row: Row) => number,
): Prediction[] {
  return rows.map((row) => ({ slug: row.slug, actual: row.target, predicted: predict(row) }));
}

export function modelPredictions(rows: readonly Comparable[], model: ValueModel) {
  return predictionsFor(rows, (row) => predictComparable(row, model));
}

export type ComparableModel = Pick<
  ValueModel,
  "coefficients" | "medianLnAge" | "categoryEffects" | "momentum"
>;

export function predictComparable(row: Comparable, model: ComparableModel) {
  const { lnTvl, growth, lnAge } = row;
  const category = (row as Partial<{ category: CategoryGroup }>).category;
  return logValue(
    { lnTvl, growth, lnAge: lnAge ?? model.medianLnAge, category: category ?? "other" },
    model,
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

export function valueOptions(terms: readonly ValueTerm[]): FitOptions {
  return { ...(!terms.includes("age") && { drop: "age" }), momentum: terms.includes("momentum") };
}

export function selectLambda(rows: readonly Comparable[], terms = DEFAULT_VALUE_TERMS): number {
  return selectByMedianError(innerFolds(rows), LAMBDAS, LAMBDAS[0], ({ train, test }, lambda) =>
    modelPredictions(test, fitValueModel(train, lambda, valueOptions(terms))),
  );
}
