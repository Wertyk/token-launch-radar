import { expect, test } from "vitest";
import {
  meanBrier,
  oddsValidationFolds,
  scoreOdds,
  selectOddsTerms,
  statusPredictor,
  validateOdds,
} from "../../../src/domain/launch-odds/validation.ts";
import { selectTerms } from "../../../src/domain/shared/term-selection.ts";

test("walk-forward starts from a clock fitted only on the older listings", () => {
  const rows = [0, 1, 1, 0, 0, 1].map((label, i) => ({
    slug: String(i),
    familyKey: String(i),
    listedAt: `2024-0${Math.max(3, i + 1)}-01`,
    ageDays: i < 3 ? 500 : 500 - 60 * i,
    label,
    lnTvl: 4,
    growth: 0,
    lnChains: 0,
    category: "dex" as const,
  }));
  const { baselines, scores, selection } = validateOdds(rows);
  const folds = oddsValidationFolds(rows);
  expect(scores).toEqual(
    scoreOdds(folds, (train) => statusPredictor(train, selectOddsTerms(train).terms)),
  );
  // The old bin holds at 2/3 for all three newer observations (0, 0, 1).
  // A clock fitted on all six rows would see the newer bin's 1/3 share.
  expect(baselines.pava[1]).toBeCloseTo(1 / 3, 12);
  expect(baselines.clockOnly[1]).toBeCloseTo(1 / 3, 12);
  expect(selection.steps[0]?.baseline).toEqual(baselines.clockOnly);
  const [first] = rows;
  if (!first) throw new Error("Expected a dated record.");
  const undated = {
    ...first,
    slug: "undated",
    familyKey: "undated",
    listedAt: null,
    ageDays: null,
  };
  const [kfold, chronological] = oddsValidationFolds([...rows, undated]);
  expect(kfold?.flatMap(({ test }) => test)).toContain(undated);
  expect(chronological).toEqual(folds[1]);
  expect(validateOdds([...rows, undated]).scores[1]).toBe(scores[1]);
});

test("keeps signal and rejects noise or gains confined to one held-out test", () => {
  const terms = ["signal", "noise", "oneTest"] as const;
  const labels = [0, 0, 1, 1];
  const signal = [-1, -1, 1, 1];
  const features = {
    signal,
    noise: [-1, 1, -1, 1],
    oneTest: signal,
  };
  const selected = selectTerms(terms, (included) =>
    [true, false].map((first) =>
      meanBrier(
        labels.map((actual, i) => ({
          actual,
          predicted:
            0.5 +
            included.reduce(
              (sum, term) =>
                sum + (features[term][i] ?? 0) * (term === "oneTest" && !first ? -0.15 : 0.15),
              0,
            ),
        })),
      ),
    ),
  );
  expect(selected.terms).toEqual(["signal"]);
  expect(selected.steps.map(({ trials }) => trials.map(({ term, kept }) => [term, kept]))).toEqual([
    [
      ["signal", true],
      ["noise", false],
      ["oneTest", false],
    ],
    [
      ["noise", false],
      ["oneTest", false],
    ],
  ]);
  const oneTest = selected.steps[1]?.trials[1]?.scores;
  expect(oneTest?.[0]).toBeLessThan(selected.scores[0] ?? 0);
  expect(oneTest?.[1]).toBeGreaterThan(selected.scores[1] ?? 1);
});
