import { ablateLoo } from "./ablation.ts";
import { fitMultiples } from "./baselines.ts";
import type { CategoryComparable } from "./categories.ts";
import type { Fold } from "./folds.ts";
import { seededFolds, splitFolds, walkForwardSplit } from "./folds.ts";
import type { Prediction, ValidationScore } from "./metrics.ts";
import { scorePredictions } from "./metrics.ts";
import { fitValueModel } from "./model.ts";
import { modelPredictions, predictionsFor, selectLambda } from "./selection.ts";

type Scores = {
  model: ValidationScore;
  flatMultiple: ValidationScore;
  categoryMultiple: ValidationScore;
};
type Predictions = Record<keyof Scores, Prediction[]>;

export interface ModelValidation {
  validation: {
    leaveOneFamilyOut: Scores;
    seededFiveFold: Scores;
    walkForward: Scores;
  };
  ablation: ReturnType<typeof ablateLoo>;
}

export function fitOuterFold({ train, test }: Fold<CategoryComparable>): {
  lambda: number;
  predictions: Predictions;
} {
  const lambda = selectLambda(train);
  if (train.length === 0 || test.length === 0) {
    return { lambda, predictions: { model: [], flatMultiple: [], categoryMultiple: [] } };
  }
  const model = fitValueModel(train, lambda);
  const { flat, category } = fitMultiples(train);
  return {
    lambda,
    predictions: {
      model: modelPredictions(test, model),
      flatMultiple: predictionsFor(test, (row) => flat + row.lnTvl),
      categoryMultiple: predictionsFor(test, (row) => (category[row.category] ?? flat) + row.lnTvl),
    },
  };
}

function scoreFolds(folds: readonly Fold<CategoryComparable>[]): Scores {
  const heldOut = folds.map((fold) => fitOuterFold(fold).predictions);
  return {
    model: scorePredictions(heldOut.flatMap(({ model }) => model)),
    flatMultiple: scorePredictions(heldOut.flatMap(({ flatMultiple }) => flatMultiple)),
    categoryMultiple: scorePredictions(heldOut.flatMap(({ categoryMultiple }) => categoryMultiple)),
  };
}

export function validateModel(rows: readonly CategoryComparable[]): ModelValidation {
  const loo = splitFolds(rows.map((row) => [row]));
  const leaveOneFamilyOut = scoreFolds(loo);
  return {
    validation: {
      leaveOneFamilyOut,
      seededFiveFold: scoreFolds(splitFolds(seededFolds(rows))),
      walkForward: scoreFolds([walkForwardSplit(rows)]),
    },
    ablation: ablateLoo(loo, leaveOneFamilyOut.model),
  };
}
