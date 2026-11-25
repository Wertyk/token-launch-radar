import { selectTerms } from "../shared/term-selection.ts";
import { fitMultiples } from "./baselines.ts";
import type { CategoryComparable } from "./categories.ts";
import type { Fold } from "./folds.ts";
import { seededFolds, splitFolds, walkForwardSplit } from "./folds.ts";
import type { Prediction, ValidationScore } from "./metrics.ts";
import { medianLogError, scorePredictions } from "./metrics.ts";
import type { ValueTerm } from "./selection.ts";
import {
  DEFAULT_VALUE_TERMS,
  modelPredictions,
  predictionsFor,
  VALUE_CANDIDATES,
} from "./selection.ts";
import { refitValue, tuneValueFit } from "./value-fit.ts";

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
  selection: ReturnType<typeof selectTerms<ValueTerm>>;
}

function predictFold({ train, test }: Fold<CategoryComparable>, terms: readonly ValueTerm[]) {
  if (!train.length || !test.length) return [];
  return modelPredictions(test, refitValue(train, tuneValueFit(train, terms)));
}

function baselinePredictions({ train, test }: Fold<CategoryComparable>) {
  if (!train.length || !test.length) return { flatMultiple: [], categoryMultiple: [] };
  const { flat, category } = fitMultiples(train);
  return {
    flatMultiple: predictionsFor(test, (row) => flat + row.lnTvl),
    categoryMultiple: predictionsFor(test, (row) => (category[row.category] ?? flat) + row.lnTvl),
  };
}

export function fitOuterFold(
  fold: Fold<CategoryComparable>,
  terms = DEFAULT_VALUE_TERMS,
): {
  lambda: number;
  predictions: Predictions;
} {
  const fit = tuneValueFit(fold.train, terms);
  return {
    lambda: fit.lambda,
    predictions: {
      model:
        fold.train.length && fold.test.length
          ? modelPredictions(fold.test, refitValue(fold.train, fit))
          : [],
      ...baselinePredictions(fold),
    },
  };
}

function evaluateFolds(
  folds: readonly Fold<CategoryComparable>[],
  predictions: Prediction[],
): Scores {
  const heldOut = folds.map(baselinePredictions);
  return {
    model: scorePredictions(predictions),
    flatMultiple: scorePredictions(heldOut.flatMap(({ flatMultiple }) => flatMultiple)),
    categoryMultiple: scorePredictions(heldOut.flatMap(({ categoryMultiple }) => categoryMultiple)),
  };
}

export function validateModel(
  rows: readonly CategoryComparable[],
): ModelValidation & { looPredictions: Prediction[] } {
  const loo = splitFolds(rows.map((row) => [row]));
  const walkForward = [walkForwardSplit(rows)];
  const predictions = new Map<string, { loo: Prediction[]; walkForward: Prediction[] }>();
  const selection = selectTerms(VALUE_CANDIDATES, (terms: readonly ValueTerm[]) => {
    const key = terms.join(",");
    const heldOut = {
      loo: loo.flatMap((fold) => predictFold(fold, terms)),
      walkForward: walkForward.flatMap((fold) => predictFold(fold, terms)),
    };
    predictions.set(key, heldOut);
    return [medianLogError(heldOut.loo) ?? null, medianLogError(heldOut.walkForward) ?? null];
  });
  const selected = predictions.get(selection.terms.join(","));
  if (!selected) throw new Error("Missing selected value model predictions.");
  const fiveFold = splitFolds(seededFolds(rows));
  return {
    validation: {
      leaveOneFamilyOut: evaluateFolds(loo, selected.loo),
      seededFiveFold: evaluateFolds(
        fiveFold,
        fiveFold.flatMap((fold) => predictFold(fold, selection.terms)),
      ),
      walkForward: evaluateFolds(walkForward, selected.walkForward),
    },
    selection,
    looPredictions: selected.loo,
  };
}
