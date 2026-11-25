import type { CategoryComparable } from "./categories.ts";
import { categoryDesign, selectCategoryFit } from "./category-model.ts";
import type { Comparable } from "./comparables.ts";
import type { CategoryDesign } from "./model.ts";
import { fitValueModel } from "./model.ts";
import type { ValueTerm } from "./selection.ts";
import { selectLambda, valueOptions } from "./selection.ts";

export interface ValueFit {
  terms: readonly ValueTerm[];
  lambda: number;
  categoryPenaltyMultiple?: number;
  category?: CategoryDesign;
}

export function tuneValueFit(
  rows: readonly CategoryComparable[],
  terms: readonly ValueTerm[],
): ValueFit {
  if (!terms.includes("category")) return { terms, lambda: selectLambda(rows, terms) };
  const parameters = selectCategoryFit(rows, terms);
  return { terms, ...parameters, category: categoryDesign(rows, parameters) };
}

export function refitValue(rows: readonly Comparable[], fit: ValueFit) {
  return fitValueModel(rows, fit.lambda, valueOptions(fit.terms), fit.category);
}

export function refitValueSubset(rows: readonly CategoryComparable[], fit: ValueFit) {
  if (fit.categoryPenaltyMultiple === undefined) return refitValue(rows, fit);
  const category = categoryDesign(rows, {
    lambda: fit.lambda,
    categoryPenaltyMultiple: fit.categoryPenaltyMultiple,
  });
  return refitValue(rows, { ...fit, category });
}
