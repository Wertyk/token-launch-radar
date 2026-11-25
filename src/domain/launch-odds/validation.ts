import { shareAt } from "../launch-clock/clock.ts";
import { selectTerms } from "../shared/term-selection.ts";
import type { Fold } from "../valuation/folds.ts";
import { seededFolds, splitFolds, walkForwardSplit } from "../valuation/folds.ts";
import { matchesPredictions } from "../valuation/metrics.ts";
import { linearScore, sigmoid } from "./logistic.ts";
import type { OddsTerm, TokenStatusRow } from "./model.ts";
import { baseRate, fitOddsClock, fitOddsModel, ODDS_CANDIDATES, oddsFeatures } from "./model.ts";

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

function predictOddsFold(
  { train, test }: Fold<TokenStatusRow>,
  fitPredictor: (train: readonly TokenStatusRow[]) => (row: TokenStatusRow) => number,
) {
  if (!train.length || !test.length) return [];
  const predict = fitPredictor(train);
  return test.map((row) => ({ slug: row.slug, actual: row.label, predicted: predict(row) }));
}

function predictOddsFolds(
  folds: readonly Fold<TokenStatusRow>[][],
  fitPredictor: Parameters<typeof predictOddsFold>[1],
) {
  return folds.map((scheme) => scheme.map((fold) => predictOddsFold(fold, fitPredictor)));
}

type OddsPredictions = ReturnType<typeof predictOddsFolds>;

function scoreOddsFolds(folds: OddsPredictions) {
  return folds.map((scheme) => meanBrier(scheme.flat()));
}

export function scoreOdds(
  folds: Parameters<typeof predictOddsFolds>[0],
  fitPredictor: Parameters<typeof predictOddsFolds>[1],
) {
  return scoreOddsFolds(predictOddsFolds(folds, fitPredictor));
}

export function statusPredictor(train: readonly TokenStatusRow[], terms: readonly OddsTerm[]) {
  const { shares, clock, coefficients, medianAgeDays } = fitOddsModel(train, terms);
  return (row: TokenStatusRow) =>
    sigmoid(linearScore(oddsFeatures(row, terms, shares, clock, medianAgeDays), coefficients));
}

export function selectOddsTerms(
  rows: readonly TokenStatusRow[],
  folds = oddsValidationFolds(rows),
) {
  return selectTerms(ODDS_CANDIDATES, (terms) =>
    scoreOdds(folds, (train) => statusPredictor(train, terms)),
  );
}

export function fitOuterOddsFold(fold: Fold<TokenStatusRow>) {
  return predictOddsFold(fold, (train) => statusPredictor(train, selectOddsTerms(train).terms));
}

const oddsKeys = ["model", "baseRate", "pava", "clockOnly"] as const;
type OddsEvidence = Record<(typeof oddsKeys)[number], OddsPredictions>;

function oddsScores(evidence: OddsEvidence) {
  return {
    scores: scoreOddsFolds(evidence.model),
    baselines: {
      baseRate: scoreOddsFolds(evidence.baseRate),
      pava: scoreOddsFolds(evidence.pava),
      clockOnly: scoreOddsFolds(evidence.clockOnly),
    },
  };
}

export function scoreOddsEvidence(rows: readonly TokenStatusRow[], evidence: OddsEvidence) {
  const folds = oddsValidationFolds(rows);
  for (const key of oddsKeys) {
    const predictions = evidence?.[key];
    if (!Array.isArray(predictions) || predictions.length !== folds.length) return null;
    for (const [i, scheme] of folds.entries()) {
      const heldOut = predictions[i];
      if (!Array.isArray(heldOut) || heldOut.length !== scheme.length) return null;
      for (const [j, { train, test }] of scheme.entries()) {
        if (!matchesPredictions(heldOut[j], train.length ? test : [], (row) => row.label, true))
          return null;
      }
    }
  }
  return oddsScores(evidence);
}

export function validateOdds(rows: readonly TokenStatusRow[]) {
  const folds = oddsValidationFolds(rows);
  const selection = selectOddsTerms(rows, folds);
  const rate = predictOddsFolds(folds, (train) => {
    const share = baseRate(train);
    return () => share;
  });
  const pava = predictOddsFolds(folds, (train) => {
    const { clock, medianAgeDays } = fitOddsClock(train);
    return (row) => shareAt(clock, row.ageDays ?? medianAgeDays);
  });
  const evidence = {
    model: folds.map((scheme) => scheme.map(fitOuterOddsFold)),
    baseRate: rate,
    pava,
    clockOnly: predictOddsFolds(folds, (train) => statusPredictor(train, [])),
  };
  return { selection, evidence, ...oddsScores(evidence) };
}
