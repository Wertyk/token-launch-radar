import { fitMultiples } from "./baselines.ts";
import type { CategoryComparable } from "./categories.ts";
import { type Fold, seededFolds, splitFolds, walkForwardSplit } from "./folds.ts";
import {
  matchesPredictions,
  type Prediction,
  scorePredictions,
  type ValidationScore,
} from "./metrics.ts";
import { predictionsFor } from "./selection.ts";
import { VALUE_RIDGE_LAMBDA } from "./value-fit.ts";
import { predictValueTrial, selectValueTerms } from "./value-selection.ts";

type Scores = {
  model: ValidationScore;
  flatMultiple: ValidationScore;
  categoryMultiple: ValidationScore;
};

type FoldPredictions = Record<keyof Scores, Prediction[]>;
type Scheme = "leaveOneFamilyOut" | "seededFiveFold" | "walkForward";
const schemes = ["leaveOneFamilyOut", "seededFiveFold", "walkForward"] as const;
const models = ["model", "flatMultiple", "categoryMultiple"] as const;

export interface ModelValidation {
  validation: Record<Scheme, Scores>;
  evidence: Record<Scheme, FoldPredictions[]>;
  selection: ReturnType<typeof selectValueTerms>;
}

export function fitOuterFold(fold: Fold<CategoryComparable>) {
  const { train, test } = fold;
  const terms = train.length && test.length ? selectValueTerms(train).terms : [];
  const predictions: FoldPredictions = {
    model: predictValueTrial(fold, terms),
    flatMultiple: [],
    categoryMultiple: [],
  };
  if (train.length && test.length) {
    const { flat, category } = fitMultiples(train);
    predictions.flatMultiple = predictionsFor(test, (row) => flat + row.lnTvl);
    predictions.categoryMultiple = predictionsFor(
      test,
      (row) => (category[row.category] ?? flat) + row.lnTvl,
    );
  }
  return { terms, lambda: VALUE_RIDGE_LAMBDA, predictions };
}

function scoreValueFolds(folds: readonly FoldPredictions[]): Scores {
  return {
    model: scorePredictions(folds.flatMap(({ model }) => model)),
    flatMultiple: scorePredictions(folds.flatMap(({ flatMultiple }) => flatMultiple)),
    categoryMultiple: scorePredictions(folds.flatMap(({ categoryMultiple }) => categoryMultiple)),
  };
}

function valueValidationFolds(rows: readonly CategoryComparable[]) {
  return {
    leaveOneFamilyOut: splitFolds(rows.map((row) => [row])),
    seededFiveFold: splitFolds(seededFolds(rows)),
    walkForward: [walkForwardSplit(rows)],
  };
}

export function scoreValueEvidence(
  rows: readonly CategoryComparable[],
  evidence: ModelValidation["evidence"],
): ModelValidation["validation"] | null {
  const folds = valueValidationFolds(rows);
  for (const scheme of schemes) {
    const predictions = evidence?.[scheme];
    if (!Array.isArray(predictions) || predictions.length !== folds[scheme].length) return null;
    for (const [i, { train, test }] of folds[scheme].entries()) {
      if (
        !models.every((key) =>
          matchesPredictions(predictions[i]?.[key], train.length ? test : [], (row) => row.target),
        )
      )
        return null;
    }
  }
  return {
    leaveOneFamilyOut: scoreValueFolds(evidence.leaveOneFamilyOut),
    seededFiveFold: scoreValueFolds(evidence.seededFiveFold),
    walkForward: scoreValueFolds(evidence.walkForward),
  };
}

export function validateModel(rows: readonly CategoryComparable[]) {
  const folds = valueValidationFolds(rows);
  const loo = folds.leaveOneFamilyOut.map(fitOuterFold);
  const collect = (fits: ReturnType<typeof fitOuterFold>[]) =>
    fits.map(({ predictions }) => predictions);
  const evidence = {
    leaveOneFamilyOut: collect(loo),
    seededFiveFold: collect(folds.seededFiveFold.map(fitOuterFold)),
    walkForward: collect(folds.walkForward.map(fitOuterFold)),
  };
  return {
    evidence,
    validation: {
      leaveOneFamilyOut: scoreValueFolds(evidence.leaveOneFamilyOut),
      seededFiveFold: scoreValueFolds(evidence.seededFiveFold),
      walkForward: scoreValueFolds(evidence.walkForward),
    },
    selection: selectValueTerms(rows),
    looPredictions: loo.flatMap(({ predictions }) => predictions.model),
    looTerms: new Map(
      loo.flatMap(({ predictions, terms }) => predictions.model.map(({ slug }) => [slug, terms])),
    ),
  };
}
