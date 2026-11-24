import { expect, test } from "vitest";
import { groupFamilies } from "../../../src/domain/census/families.ts";
import type { Protocol } from "../../../src/domain/snapshot.ts";
import { fitMultiples } from "../../../src/domain/valuation/baselines.ts";
import { groupComparableCategories } from "../../../src/domain/valuation/categories.ts";
import {
  fitCategoryModel,
  selectCategoryFit,
} from "../../../src/domain/valuation/category-model.ts";
import { comparablesFromFamilies } from "../../../src/domain/valuation/comparables.ts";
import { seededFolds, splitFolds, walkForwardSplit } from "../../../src/domain/valuation/folds.ts";
import { scorePredictions } from "../../../src/domain/valuation/metrics.ts";
import { selectLambda } from "../../../src/domain/valuation/selection.ts";
import { fitOuterFold, validateModel } from "../../../src/domain/valuation/validation.ts";
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
  expect(original.lambda).toEqual(selectLambda(train));
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

test("walk-forward trains on the earliest dated 60% plus all undated families", () => {
  const { train, test: future } = walkForwardSplit(rows.toReversed());
  expect(train.map(({ slug }) => slug).sort()).toEqual([
    "sample-0",
    "sample-1",
    "sample-10",
    "sample-11",
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
  const { validation, ablation, looPredictions } = validateModel(rows);
  const heldOut = splitFolds(rows.map((row) => [row])).flatMap(
    (fold) => fitOuterFold(fold).predictions.model,
  );
  expect(looPredictions).toEqual(heldOut);
  expect(scorePredictions(looPredictions)).toEqual(validation.leaveOneFamilyOut.model);
  expect(validation.leaveOneFamilyOut.model.n).toBe(12);
  expect(validation.seededFiveFold.model.n).toBe(12);
  expect(validation.walkForward.model.n).toBe(4);
  expect(Object.keys(ablation)).toEqual([
    "full",
    "withoutTvl",
    "withoutAge",
    "withoutMomentum",
    "withCategory",
    "ols",
  ]);
  expect(ablation.full).toEqual(validation.leaveOneFamilyOut.model);
  for (const score of Object.values(ablation)) {
    expect(score).toMatchObject({
      n: 12,
      medianMultiplier: expect.any(Number),
      spearman: expect.any(Number),
    });
  }
  const onlyRow = rows.slice(0, 1);
  const singleton = validateModel(onlyRow);
  expect(singleton.validation.leaveOneFamilyOut.model.n).toBe(0);
  for (const score of Object.values(singleton.ablation)) {
    expect(score).toEqual({ n: 0, medianMultiplier: null, spearman: null });
  }
});

test("the OLS trial fits a held-out power law without shrinkage", () => {
  const powerLaw = rows.map((row, i) => ({
    ...row,
    lnTvl: i,
    lnAge: null,
    growth: 0,
    target: 4 + i,
  }));
  const { ablation } = validateModel(powerLaw);
  expect(ablation.ols.n).toBe(12);
  expect(ablation.ols.medianMultiplier).toBeCloseTo(1, 12);
  expect(ablation.ols.spearman).toBe(1);
  expect(ablation.full.medianMultiplier).toBeGreaterThan(1);
});
