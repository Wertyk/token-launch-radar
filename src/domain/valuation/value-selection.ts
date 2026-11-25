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
  const loo = splitFolds(rows.map((row) => [row]));
  const walkForward = walkForwardSplit(rows);
  return selectTerms(VALUE_CANDIDATES, (terms, baseline) => {
    const future = medianLogError(predictValueTrial(walkForward, terms, fit)) ?? null;
    // A failed walk-forward trial cannot be kept. Score both tests for the published trial table.
    if (termsOnly && baseline && (future === null || baseline[1] == null || future >= baseline[1]))
      return [null, future];
    return [
      medianLogError(loo.flatMap((fold) => predictValueTrial(fold, terms, fit))) ?? null,
      future,
    ];
  });
}

export function refitSelectedValue(rows: readonly CategoryComparable[], fit?: ValueTrialFit) {
  return refitValue(rows, valueSelection(rows, fit, true).terms);
}
