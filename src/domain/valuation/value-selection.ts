import { selectTerms } from "../shared/term-selection.ts";
import type { CategoryComparable } from "./categories.ts";
import type { CategoryParameters } from "./category-design.ts";
import { splitFolds, walkForwardSplit } from "./folds.ts";
import { medianLogError } from "./metrics.ts";
import { modelPredictions, VALUE_CANDIDATES } from "./selection.ts";
import { refitValueSubset } from "./value-fit.ts";

export interface ValueTrialFit {
  lambda: number;
  categoryTrial?: CategoryParameters;
}

export function selectValueTerms(
  rows: readonly CategoryComparable[],
  { lambda, categoryTrial }: ValueTrialFit,
) {
  const folds = [splitFolds(rows.map((row) => [row])), [walkForwardSplit(rows)]];
  const candidates = categoryTrial
    ? VALUE_CANDIDATES
    : VALUE_CANDIDATES.filter((term) => term !== "category");
  return selectTerms(candidates, (terms) => {
    const parameters = terms.includes("category") && categoryTrial ? categoryTrial : { lambda };
    const fit = { terms, ...parameters };
    return folds.map(
      (scheme) =>
        medianLogError(
          scheme.flatMap(({ train, test }) => {
            if (!train.length || !test.length) return [];
            return modelPredictions(test, refitValueSubset(train, fit));
          }),
        ) ?? null,
    );
  });
}
