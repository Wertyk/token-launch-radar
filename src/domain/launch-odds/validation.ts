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

export function validateOdds(rows: readonly TokenStatusRow[]) {
  const folds = [splitFolds(seededFolds(rows, 10)), [walkForwardSplit(rows)]];
  function score(
    fitPredictor: (train: readonly TokenStatusRow[]) => (row: TokenStatusRow) => number,
  ) {
    const predict = ({ train, test }: Fold<TokenStatusRow>) => {
      if (!train.length || !test.length) return [];
      const predictRow = fitPredictor(train);
      return test.map((row) => ({ actual: row.label, predicted: predictRow(row) }));
    };
    return folds.map((scheme) => meanBrier(scheme.flatMap(predict)));
  }

  const rate = score((train) => {
    const share = baseRate(train);
    return () => share;
  });
  const pava = score((train) => {
    const points = fitAgeShares(train);
    return (row) => shareAt(points, row.ageDays);
  });
  const selection = selectTerms(ODDS_CANDIDATES, (terms: readonly OddsTerm[]) =>
    score((train) => {
      const { shares, clock, coefficients } = fitOddsModel(train, terms);
      return (row) => sigmoid(linearScore(oddsFeatures(row, terms, shares, clock), coefficients));
    }),
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
