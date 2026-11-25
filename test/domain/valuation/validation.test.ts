import { expect, test } from "vitest";
import { radarInputs } from "../../../src/application/recompute-radar.ts";
import { groupFamilies } from "../../../src/domain/census/families.ts";
import { makeFarmPlan } from "../../../src/domain/farming/plans.ts";
import { farmTables } from "../../../src/domain/farming/playbook-data.ts";
import type { Protocol } from "../../../src/domain/snapshot.ts";
import { parseSnapshot } from "../../../src/domain/snapshot.ts";
import { fitMultiples } from "../../../src/domain/valuation/baselines.ts";
import { groupComparableCategories } from "../../../src/domain/valuation/categories.ts";
import {
  fitCategoryModel,
  selectCategoryFit,
} from "../../../src/domain/valuation/category-model.ts";
import { comparablesFromFamilies } from "../../../src/domain/valuation/comparables.ts";
import { seededFolds, splitFolds, walkForwardSplit } from "../../../src/domain/valuation/folds.ts";
import { jackknifePlusBands, leaveOneFamilyOut } from "../../../src/domain/valuation/jackknife.ts";
import { medianLogError, scorePredictions } from "../../../src/domain/valuation/metrics.ts";
import {
  innerFolds,
  predictComparable,
  selectByMedianError,
} from "../../../src/domain/valuation/selection.ts";
import { fitOuterFold, validateModel } from "../../../src/domain/valuation/validation.ts";
import { refitValue, VALUE_RIDGE_LAMBDA } from "../../../src/domain/valuation/value-fit.ts";
import { cacheCalibrationFits } from "../../../src/domain/valuation/value-fit-cache.ts";
import {
  predictValueTrial,
  refitSelectedValue,
  selectValueTerms,
} from "../../../src/domain/valuation/value-selection.ts";
import { readKitSnapshot } from "../../radar-fixtures.ts";
import { protocol } from "../protocol-fixture.ts";

const fixtureRows = Array.from({ length: 12 }, (_, i) =>
  protocol({
    slug: `sample-${i}`,
    gecko_id: `id-${i}`,
    tvl_usd: 10 * (i + 1),
    mcap_usd: (i + 1) ** 2 * 100,
    change_7d: i * 6,
    listed_at: i < 10 ? `2024-01-${String(i + 1).padStart(2, "0")}` : null,
    category: i % 2 === 0 ? "Dexs" : "Lending",
  }),
);
function validationRows(protocols: readonly Protocol[]) {
  const families = groupFamilies(protocols);
  return groupComparableCategories(comparablesFromFamilies(families, "2024-03-01"), families);
}

const rows = validationRows(fixtureRows);

test("calibration refits and coverage match exhaustive term selection", () => {
  const categorySignal = rows.map((row, i) => ({
    ...row,
    lnTvl: (i % 4) * 0.25,
    target: 4 + (row.category === "dex" ? 5 : 0) + (i % 4) * 0.12,
  }));
  expect(selectValueTerms(categorySignal).terms).toContain("category");

  const fitExhaustively = (train: Readonly<typeof rows>) =>
    refitValue(train, selectValueTerms(train).terms);
  for (const input of [rows.toReversed(), categorySignal]) {
    const cachedRefit = cacheCalibrationFits(input);
    expect(leaveOneFamilyOut(input, cachedRefit)).toStrictEqual(
      leaveOneFamilyOut(input, fitExhaustively),
    );
    expect(jackknifePlusBands(input, cachedRefit)).toStrictEqual(
      jackknifePlusBands(input, fitExhaustively),
    );
  }
});

test("a calibration set without walk-forward evidence skips leave-one-out trials", () => {
  const input = rows.map((row) => ({ ...row, listedAt: null }));
  const reference = selectValueTerms(input);
  let trialFits = 0;
  const selected = refitSelectedValue(input, (train, terms) => {
    trialFits++;
    return refitValue(train, terms);
  });
  expect(reference.terms).toEqual([]);
  expect(reference.steps[0]?.baseline[0]).toBeTypeOf("number");
  expect(selected).toStrictEqual(refitValue(input, reference.terms));
  expect(trialFits).toBe(0);
});

test.each(["Risk Curators", "Onchain Capital Allocator"])(
  "treats %s as other for valuation and uses a yield-bearing vault plan",
  (category) => {
    const example = protocol({ category, mcap_usd: 100 });
    expect(validationRows([example])[0]?.category).toBe("other");
    const tables = farmTables();
    const plan = makeFarmPlan(example, tables);
    expect(plan.capitalApr).toBe(0);
    expect(plan.steps.some(({ action }) => /vault/i.test(action))).toBe(true);
  },
);

test("inner folds remove empty splits and keep members of a family together", () => {
  const [a, b] = rows;
  if (!a || !b) throw new Error("Expected two comparables");
  const twin = { ...a, slug: "twin" };
  expect(innerFolds([a, twin])).toEqual([]);
  const folds = innerFolds([twin, b, a]);
  expect(folds).toHaveLength(2);
  expect(folds).toContainEqual({ train: [b], test: [a, twin] });
  expect(folds).toContainEqual({ train: [a, twin], test: [b] });
  expect(innerFolds([a, b, twin])).toEqual(folds);
});

test("selects the lowest median log error and keeps ties in candidate order", () => {
  const [a, b, c] = rows;
  if (!a || !b || !c) throw new Error("Expected three comparables");
  const folds = [
    { train: [a], test: [b, c] },
    { train: [b, c], test: [a] },
  ];
  const candidates = [
    [3, 3, 0],
    [1, 1, 99],
    [-1, -1, 99],
  ] as const;
  const fallback = [0, 0, 0] as const;
  const predict = ({ test }: (typeof folds)[number], offsets: readonly number[]) =>
    test.map((row) => ({
      slug: row.slug,
      actual: 0,
      predicted: offsets[[a, b, c].indexOf(row)] ?? 0,
    }));
  expect(selectByMedianError(folds, candidates, fallback, predict)).toBe(candidates[1]);
  expect(selectByMedianError([], candidates, fallback, predict)).toBe(fallback);
});

test("takes the median of absolute natural-log errors", () => {
  expect(
    medianLogError([
      { slug: "a", actual: 1, predicted: 9 },
      { slug: "b", actual: 0, predicted: -4 },
      { slug: "c", actual: 2, predicted: 1 },
      { slug: "d", actual: 4, predicted: 2 },
    ]),
  ).toBe(3);
  expect(medianLogError([])).toBeUndefined();
});

test("assigns families to five balanced, deterministic folds independent of input order", () => {
  const shared = rows[0];
  if (!shared) throw new Error("Expected a comparable.");
  const input = [...rows, { ...shared, slug: "duplicate" }];
  const folds = seededFolds(input);
  expect(folds).toHaveLength(5);
  expect(seededFolds(input.toReversed())).toEqual(folds);
  const familyCounts = folds.map((fold) => new Set(fold.map((row) => row.familyKey)).size);
  expect(familyCounts).toEqual([3, 3, 2, 2, 2]);
  expect(new Set(folds.flatMap((fold) => fold.map((row) => row.familyKey))).size).toBe(12);
  expect(
    folds
      .flat()
      .map(({ slug }) => slug)
      .sort(),
  ).toEqual(input.map(({ slug }) => slug).sort());
  expect(
    folds.filter((fold) => fold.some((row) => row.familyKey === shared.familyKey)),
  ).toHaveLength(1);
});

test("outer test targets do not affect lambda or predictions", () => {
  const [testRows, ...otherFolds] = seededFolds(rows);
  if (!testRows) throw new Error("Expected a test fold.");
  const train = otherFolds.flat();
  const original = fitOuterFold({ train, test: testRows });
  const changed = fitOuterFold({
    train,
    test: testRows.map((row) => ({ ...row, target: row.target + 30 })),
  });
  expect(original.lambda).toBe(VALUE_RIDGE_LAMBDA);
  expect(changed.lambda).toEqual(original.lambda);
  for (const predictor of ["model", "flatMultiple", "categoryMultiple"] as const) {
    const predicted = original.predictions[predictor].map((row) => row.predicted);
    expect(new Set(predicted).size).toBeGreaterThan(1);
    expect(changed.predictions[predictor].map((row) => row.predicted)).toEqual(predicted);
  }
});

function categoryFixture(logEffect: number) {
  return validationRows(
    Array.from({ length: 40 }, (_, i) =>
      protocol({
        slug: `group-${i}`,
        category: i % 2 ? "Dexs" : "Lending",
        mcap_usd: Math.exp(15 + logEffect * (i % 2 ? 1 : -1)),
      }),
    ),
  );
}

test("selects a small category penalty and recovers a strong category effect", () => {
  const training = categoryFixture(Math.LN2);
  const parameters = selectCategoryFit(training);
  const model = fitCategoryModel(training, parameters);
  expect(parameters.categoryPenaltyMultiple).toBe(1);
  expect(model.categoryEffects.dex).toBeCloseTo(Math.LN2, 2);
  expect(model.categoryEffects.lending).toBeCloseTo(-Math.LN2, 2);
});

test("chooses the largest category penalty and lambda when categories explain nothing and all scores tie", () => {
  const training = categoryFixture(0);
  const parameters = selectCategoryFit(training);
  expect(parameters).toEqual({ lambda: 64, categoryPenaltyMultiple: 65_536 });
  expect(fitCategoryModel(training, parameters).categoryEffects.dex).toBe(0);
});

test("strong category shrinkage preserves the unpenalized intercept at a small MAD scale", () => {
  const training = categoryFixture(0)
    .slice(0, 6)
    .map((row, i) => ({
      ...row,
      target: i < 2 ? -700 : 500,
    }));
  const model = fitCategoryModel(training, { lambda: 64, categoryPenaltyMultiple: 65_536 });
  expect(Math.abs(model.coefficients.intercept - 500)).toBeLessThan(0.001);
});

test("mutating one market cap cannot change its own nested or selection-trial prediction", () => {
  const snapshot = parseSnapshot(readKitSnapshot());
  const families = groupFamilies(snapshot.protocols);
  const original = groupComparableCategories(
    comparablesFromFamilies(families, snapshot.as_of),
    families,
  );
  const slug = "anvil";
  const mutated = original.map((row) =>
    row.slug === slug ? { ...row, target: row.target + 30 } : row,
  );
  const ownFolds = (input: typeof original) =>
    [
      splitFolds(input.map((row) => [row])),
      splitFolds(seededFolds(input)),
      [walkForwardSplit(input)],
    ].map((scheme) => {
      const fold = scheme.find(({ test }) => test.some((row) => row.slug === slug));
      if (!fold) throw new Error(`Expected a holdout for ${slug}.`);
      return fold;
    });
  const changedFolds = ownFolds(mutated);
  for (const [i, fold] of ownFolds(original).entries()) {
    const changed = changedFolds[i];
    if (!changed) throw new Error("Missing mutated fold");
    const own = (points: ReturnType<typeof predictValueTrial>) => {
      const point = points.find((row) => row.slug === slug);
      if (!point) throw new Error("Missing prediction");
      return point;
    };
    const before = fitOuterFold(fold);
    const after = fitOuterFold(changed);
    expect(after.terms).toEqual(before.terms);
    expect(after.lambda).toBe(before.lambda);
    expect(own(after.predictions.model).actual).toBe(own(before.predictions.model).actual + 30);
    expect(own(after.predictions.model).predicted).toBe(own(before.predictions.model).predicted);
    for (const terms of [
      [],
      ["momentum"],
      ["age"],
      ["category"],
      ["momentum", "age"],
      ["momentum", "category"],
      ["age", "category"],
      ["momentum", "age", "category"],
    ] as const) {
      expect(own(predictValueTrial(changed, terms)).predicted).toBe(
        own(predictValueTrial(fold, terms)).predicted,
      );
    }
  }
});

test.each([
  { calibration: "aquarius-stellar", outer: null },
  { calibration: "babylon-protocol", outer: "anvil" },
])(
  "doubling $calibration's cap leaves its calibration prediction unchanged",
  ({ calibration, outer }) => {
    const { comparables } = radarInputs(parseSnapshot(readKitSnapshot()));
    const training = comparables.filter(({ slug }) => slug !== outer);
    const heldOut = training.find(({ slug }) => slug === calibration);
    if (!heldOut) throw new Error(`Missing calibration family ${calibration}`);
    const expected = fitOuterFold({
      train: training.filter((row) => row !== heldOut),
      test: [heldOut],
    }).predictions.model[0]?.predicted;
    const changed = training.map((row) =>
      row.slug === calibration ? { ...row, target: row.target + Math.LN2 } : row,
    );
    const ownPrediction = (input: typeof rows) => {
      const refits = leaveOneFamilyOut(input, cacheCalibrationFits(input));
      const saved = refits.find(({ comparable }) => comparable.slug === calibration);
      if (!saved) throw new Error(`Missing calibration family ${calibration}`);
      return predictComparable(saved.comparable, saved.model);
    };
    const prediction = ownPrediction(training);
    expect(ownPrediction(changed)).toBe(prediction);
    expect(prediction).toBe(expected);
  },
);

test("walk-forward trains on the earliest dated 60% and omits undated families", () => {
  const { train, test: future } = walkForwardSplit(rows.toReversed());
  expect(train.map(({ slug }) => slug).sort()).toEqual([
    "sample-0",
    "sample-1",
    "sample-2",
    "sample-3",
    "sample-4",
    "sample-5",
  ]);
  expect(future.map(({ slug }) => slug)).toEqual(["sample-6", "sample-7", "sample-8", "sample-9"]);
});

test("walk-forward keeps every family on the boundary date in training", () => {
  const boundary = "2024-01-06";
  const tied = rows.map((row) =>
    row.slug === "sample-6" || row.slug === "sample-7" ? { ...row, listedAt: boundary } : row,
  );
  const { train, test: future } = walkForwardSplit(tied.toReversed());
  expect(train.filter(({ listedAt }) => listedAt === boundary).map(({ slug }) => slug)).toEqual([
    "sample-5",
    "sample-6",
    "sample-7",
  ]);
  expect(future.map(({ slug }) => slug)).toEqual(["sample-8", "sample-9"]);
});

test("multiple baselines use arithmetic medians of raw ratios", () => {
  const comparables = [
    protocol({ slug: "a", category: "Dexs", tvl_usd: 10, mcap_usd: 10 }),
    protocol({ slug: "b", category: "Dexs", tvl_usd: 20, mcap_usd: 180 }),
    protocol({ slug: "c", category: "RWA", tvl_usd: 10, mcap_usd: 40 }),
  ];
  const baselines = fitMultiples(validationRows(comparables));
  expect(Math.exp(baselines.flat)).toBeCloseTo(4, 12);
  expect(Math.exp(baselines.category.dex ?? 0)).toBeCloseTo(5, 12);
  expect(Math.exp(baselines.category.rwa ?? 0)).toBeCloseTo(4, 12);
});

test("the outer category baseline predicts with the flat multiple for an unseen category", () => {
  const comparables = validationRows([
    protocol({ slug: "a", category: "Dexs", tvl_usd: 10, mcap_usd: 10 }),
    protocol({ slug: "b", category: "Dexs", tvl_usd: 20, mcap_usd: 180 }),
    protocol({ slug: "c", category: "RWA", tvl_usd: 10, mcap_usd: 40 }),
    protocol({ slug: "later", category: "Lending", tvl_usd: 25, mcap_usd: 250 }),
  ]);
  const { predictions } = fitOuterFold({
    train: comparables.slice(0, 3),
    test: comparables.slice(3),
  });
  expect(predictions.categoryMultiple[0]?.predicted).toBeCloseTo(Math.log(4 * 25), 12);
});

test("scores log errors and Spearman with averaged ranks for ties", () => {
  const score = scorePredictions([
    { slug: "a", actual: 0, predicted: 2 },
    { slug: "b", actual: 2, predicted: 1 },
    { slug: "c", actual: 4, predicted: 2 },
    { slug: "d", actual: 6, predicted: 4 },
  ]);
  expect(score.n).toBe(4);
  expect(score.medianMultiplier).toBeCloseTo(Math.exp(2), 12);
  // Actual ranks 1,2,3,4; predicted ranks 2.5,1,2.5,4.
  expect(score.spearman).toBeCloseTo(3 / Math.sqrt(5 * 4.5), 12);
  expect(scorePredictions([{ slug: "a", actual: 0, predicted: 0 }])).toEqual({
    n: 1,
    medianMultiplier: 1,
    spearman: null,
  });
  expect(
    scorePredictions([
      { slug: "a", actual: 0, predicted: 0 },
      { slug: "b", actual: 1, predicted: 0 },
    ]).spearman,
  ).toBeNull();
  expect(scorePredictions([])).toEqual({ n: 0, medianMultiplier: null, spearman: null });
});

test("nested validation reports only scoreable held-out observations", () => {
  const { validation, selection, looPredictions } = validateModel(rows);
  const loo = splitFolds(rows.map((row) => [row]));
  const heldOut = loo.flatMap((fold) => fitOuterFold(fold).predictions.model);
  expect(looPredictions).toEqual(heldOut);
  for (const [scheme, folds] of [
    ["leaveOneFamilyOut", loo],
    ["seededFiveFold", splitFolds(seededFolds(rows))],
    ["walkForward", [walkForwardSplit(rows)]],
  ] as const) {
    const nested = folds.flatMap((fold) => {
      const { terms } = selectValueTerms(fold.train);
      expect(fitOuterFold(fold).terms).toEqual(terms);
      return predictValueTrial(fold, terms);
    });
    expect(validation[scheme].model).toEqual(scorePredictions(nested));
  }
  expect(scorePredictions(looPredictions)).toEqual(validation.leaveOneFamilyOut.model);
  expect(validation.leaveOneFamilyOut.model.n).toBe(12);
  expect(validation.seededFiveFold.model.n).toBe(12);
  expect(validation.walkForward.model.n).toBe(4);
  expect(selection.scores).toEqual([
    medianLogError(loo.flatMap((fold) => predictValueTrial(fold, selection.terms))),
    medianLogError(predictValueTrial(walkForwardSplit(rows), selection.terms)),
  ]);
  const singleton = validateModel(rows.slice(0, 1));
  expect(singleton.validation.leaveOneFamilyOut.model.n).toBe(0);
  expect(singleton.selection.terms).toEqual([]);
  expect(singleton.selection.scores).toEqual([null, null]);
});

test("keeps the category variant when it improves both tests and refits its effects", () => {
  const grouped = categoryFixture(Math.LN2).map((row, i) => ({
    ...row,
    listedAt: i < 24 ? "2024-01-01" : "2024-02-01",
  }));
  const { selection } = validateModel(grouped);
  expect(selection.terms).toEqual(["category"]);
  expect(
    medianLogError(predictValueTrial(walkForwardSplit(grouped), selection.terms)),
  ).toBeLessThan(Math.LN2);
});
