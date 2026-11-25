import { fitAgeShares, shareAt } from "../launch-clock/clock.ts";
import { selectTerms } from "../shared/term-selection.ts";
import type { Fold } from "../valuation/folds.ts";
import { seededFolds, splitFolds, walkForwardSplit } from "../valuation/folds.ts";
import { linearScore, sigmoid } from "./logistic.ts";
import type { OddsTerm, TokenStatusRow } from "./model.ts";
import { baseRate, fitOddsModel, ODDS_CANDIDATES, oddsFeatures } from "./model.ts";

export { baseRate };

export function meanBrier(
  predictions: readonly { actual: number; predicted: number }[],
): number | null {
  if (!predictions.length) return null;
  return (
    predictions.reduce((sum, { actual, predicted }) => sum + (actual - predicted) ** 2, 0) /
    predictions.length
  );
}

export function oddsValidationFolds(rows: readonly TokenStatusRow[]) {
  return [splitFolds(seededFolds(rows, 10)), [walkForwardSplit(rows)]];
}

export function scoreOdds(
  folds: readonly Fold<TokenStatusRow>[][],
  fitPredictor: (train: readonly TokenStatusRow[]) => (row: TokenStatusRow) => number,
) {
  return folds.map((scheme) =>
    meanBrier(
      scheme.flatMap(({ train, test }) => {
        if (!train.length || !test.length) return [];
        const predict = fitPredictor(train);
        return test.map((row) => ({ actual: row.label, predicted: predict(row) }));
      }),
    ),
  );
}

export function statusPredictor(train: readonly TokenStatusRow[], terms: readonly OddsTerm[]) {
  const { shares, clock, coefficients } = fitOddsModel(train, terms);
  return (row: TokenStatusRow) =>
    sigmoid(linearScore(oddsFeatures(row, terms, shares, clock), coefficients));
}

export function validateOdds(rows: readonly TokenStatusRow[]) {
  const folds = oddsValidationFolds(rows);
  const rate = scoreOdds(folds, (train) => {
    const share = baseRate(train);
    return () => share;
  });
  const pava = scoreOdds(folds, (train) => {
    const points = fitAgeShares(train);
    return (row) => shareAt(points, row.ageDays);
  });
  const selection = selectTerms(ODDS_CANDIDATES, (terms) =>
    scoreOdds(folds, (train) => statusPredictor(train, terms)),
  );
  return {
    ...selection,
    baselines: {
      baseRate: rate,
      pava,
      clockOnly: selection.steps[0]?.baseline ?? selection.scores,
    },
  };
}
