import type { CategoryComparable } from "./categories.ts";
import { categoryDesign } from "./category-design.ts";
import { fitValueModel } from "./model.ts";
import { type ComparableModel, type ValueTerm, valueOptions } from "./selection.ts";

// Retain the deployed λ for the slopes to keep regularization mild.
export const VALUE_RIDGE_LAMBDA = 0.01;
// Retain the v9 trial's effective group penalty (16 × 4) to shrink sparse categories.
export const VALUE_CATEGORY_PENALTY = 64;

export function refitValue(
  rows: readonly CategoryComparable[],
  terms: readonly ValueTerm[],
  reportScale = true,
) {
  const category = terms.includes("category")
    ? categoryDesign(rows, VALUE_CATEGORY_PENALTY)
    : undefined;
  return fitValueModel(rows, VALUE_RIDGE_LAMBDA, { ...valueOptions(terms), reportScale }, category);
}

export function refitValueTrial(
  rows: readonly CategoryComparable[],
  terms: readonly ValueTerm[],
): ComparableModel {
  const { coefficients, medianLnAge, categoryEffects, momentum } = refitValue(rows, terms, false);
  return { coefficients, medianLnAge, ...(categoryEffects && { categoryEffects }), momentum };
}
