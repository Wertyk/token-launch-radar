import type { CategoryComparable, CategoryGroup } from "./categories.ts";
import { type CategoryParameters, categoryDesign } from "./category-design.ts";
import type { FitOptions, ValueModel } from "./model.ts";
import { fitValueModel } from "./model.ts";
import {
  DEFAULT_VALUE_TERMS,
  innerFolds,
  LAMBDAS,
  modelPredictions,
  selectByMedianError,
  valueOptions,
} from "./selection.ts";

// The comparison retains the joint grid from the category-model trial.
const CATEGORY_MULTIPLES = [65_536, 1024, 256, 64, 16, 4, 1] as const;

export function fitCategoryModel(
  rows: readonly CategoryComparable[],
  parameters: CategoryParameters,
  options?: FitOptions,
) {
  return fitValueModel(
    rows,
    parameters.lambda,
    options,
    categoryDesign(rows, parameters.lambda * parameters.categoryPenaltyMultiple),
  ) as ValueModel & { categoryEffects: Record<CategoryGroup, number> };
}

export function selectCategoryFit(
  rows: readonly CategoryComparable[],
  terms = DEFAULT_VALUE_TERMS,
): CategoryParameters {
  const options = valueOptions(terms);
  const multiples =
    new Set(rows.map(({ category }) => category)).size < 2
      ? [CATEGORY_MULTIPLES[0]]
      : CATEGORY_MULTIPLES;
  const candidates = LAMBDAS.flatMap((lambda) =>
    multiples.map((categoryPenaltyMultiple) => ({
      lambda,
      categoryPenaltyMultiple,
    })),
  ).sort(
    (a, b) =>
      b.lambda * b.categoryPenaltyMultiple - a.lambda * a.categoryPenaltyMultiple ||
      b.lambda - a.lambda ||
      b.categoryPenaltyMultiple - a.categoryPenaltyMultiple,
  );
  const strongest = { lambda: LAMBDAS[0], categoryPenaltyMultiple: CATEGORY_MULTIPLES[0] };
  return selectByMedianError(
    innerFolds(rows),
    candidates,
    strongest,
    ({ train, test }, parameters) =>
      modelPredictions(test, fitCategoryModel(train, parameters, options)),
  );
}
