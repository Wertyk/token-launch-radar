import { selectTerms } from "../shared/term-selection.ts";
import type { CategoryComparable } from "./categories.ts";
import { type Fold, splitFolds, walkForwardSplit } from "./folds.ts";
import { medianLogError } from "./metrics.ts";
import { modelPredictions, VALUE_CANDIDATES, type ValueTerm } from "./selection.ts";
import { refitValue } from "./value-fit.ts";

export function predictValueTrial(
  { train, test }: Fold<CategoryComparable>,
  terms: readonly ValueTerm[],
) {
  return train.length && test.length ? modelPredictions(test, refitValue(train, terms)) : [];
}

export function selectValueTerms(rows: readonly CategoryComparable[]) {
  const folds = [splitFolds(rows.map((row) => [row])), [walkForwardSplit(rows)]];
  return selectTerms(VALUE_CANDIDATES, (terms) =>
    folds.map(
      (scheme) => medianLogError(scheme.flatMap((fold) => predictValueTrial(fold, terms))) ?? null,
    ),
  );
}
