import { median } from "../shared/math.ts";
import { selectTerms } from "../shared/term-selection.ts";
import type { CategoryComparable } from "./categories.ts";
import { type Fold, splitFolds, walkForwardSplit } from "./folds.ts";
import { medianLogError } from "./metrics.ts";
import {
  type ComparableModel,
  predictComparable,
  predictionsFor,
  VALUE_CANDIDATES,
  type ValueTerm,
} from "./selection.ts";
import { refitValue } from "./value-fit.ts";

export type ValueTrialFit = (
  rows: readonly CategoryComparable[],
  terms: readonly ValueTerm[],
) => ComparableModel;

export function predictValueTrial(
  { train, test }: Fold<CategoryComparable>,
  terms: readonly ValueTerm[],
  fitTrial: ValueTrialFit = refitValue,
) {
  if (!train.length || !test.length) return [];
  const model = fitTrial(train, terms);
  return predictionsFor(test, (row) => predictComparable(row, model));
}

export function selectValueTerms(rows: readonly CategoryComparable[], fit?: ValueTrialFit) {
  return valueSelection(rows, fit, false);
}

function valueSelection(
  rows: readonly CategoryComparable[],
  fit: ValueTrialFit | undefined,
  termsOnly: boolean,
) {
  const walkForward = walkForwardSplit(rows);
  const futureError = (terms: readonly ValueTerm[]) =>
    medianLogError(predictValueTrial(walkForward, terms, fit)) ?? null;
  if (termsOnly) {
    const baseline = futureError([]);
    // Even the baseline LOO fits are unnecessary if no challenger can be kept.
    if (
      baseline === null ||
      !VALUE_CANDIDATES.some((term) => {
        const score = futureError([term]);
        return score !== null && score < baseline;
      })
    )
      return { terms: [] as ValueTerm[], steps: [], scores: [null, baseline] };
  }
  const loo = rows.length < 2 ? [] : splitFolds(rows.map((row) => [row]));
  const fitTrial = fit ?? refitValue;
  return selectTerms(VALUE_CANDIDATES, (terms, baseline) => {
    const future = futureError(terms);
    // A failed walk-forward trial cannot be kept. Score both tests for the published trial table.
    if (termsOnly && baseline && (future === null || baseline[1] == null || future >= baseline[1]))
      return [null, future];
    const errors = loo.map(({ train, test }) => {
      const row = test[0] as CategoryComparable;
      return {
        slug: row.slug,
        value: Math.abs(row.target - predictComparable(row, fitTrial(train, terms))),
      };
    });
    return [median(errors) ?? null, future];
  });
}

export function refitSelectedValue(rows: readonly CategoryComparable[], fit?: ValueTrialFit) {
  return refitValue(rows, valueSelection(rows, fit, true).terms);
}
