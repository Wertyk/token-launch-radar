import type { CategoryComparable } from "./categories.ts";
import { nestedCategoryPredictions } from "./category-model.ts";
import type { Fold } from "./folds.ts";
import type { Prediction, ValidationScore } from "./metrics.ts";
import { scorePredictions } from "./metrics.ts";
import { fitValueModel } from "./model.ts";
import { modelPredictions, nestedVariantPredictions } from "./selection.ts";

export function ablateLoo(folds: readonly Fold<CategoryComparable>[], full: ValidationScore) {
  const score = (predict: (fold: Fold<CategoryComparable>) => Prediction[]) =>
    scorePredictions(folds.flatMap((fold) => (fold.train.length > 0 ? predict(fold) : [])));
  return {
    full,
    withoutTvl: score((fold) => nestedVariantPredictions(fold, "tvl")),
    withoutAge: score((fold) => nestedVariantPredictions(fold, "age")),
    withoutMomentum: score((fold) => nestedVariantPredictions(fold, "momentum")),
    withCategory: score(({ train, test }) => nestedCategoryPredictions(train, test)),
    // Ordinary least squares fixes lambda at zero and has no tuning parameter.
    ols: score(({ train, test }) =>
      modelPredictions(test, fitValueModel(train, 0, { robust: false })),
    ),
  };
}
