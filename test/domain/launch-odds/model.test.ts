import { expect, test } from "vitest";
import { buildCensus } from "../../../src/domain/census/census.ts";
import { groupFamilies } from "../../../src/domain/census/families.ts";
import type { ClockPoint } from "../../../src/domain/launch-clock/clock.ts";
import { fitLogistic, sigmoid } from "../../../src/domain/launch-odds/logistic.ts";
import {
  bootstrapProbability12,
  categoryTokenShares,
  fitOddsModel,
  launchProbability12,
  oddsFeatures,
  oddsPopulation,
} from "../../../src/domain/launch-odds/model.ts";
import { baseRate, meanBrier } from "../../../src/domain/launch-odds/validation.ts";
import { protocol } from "../protocol-fixture.ts";

test("solves the penalized score equations and restores coefficients to the input units", () => {
  const target = [0, 0, 0, 1, 0, 1, 1, 1];
  const design = target.map((_, i) => [i < 4 ? 3 : 7]);
  // With standardized x = ±1 and slope ln(2), p = 1/3 or 2/3.
  // The intercept score cancels. The slope score is 6 − 8 × 2/3 = 2/3.
  const penalty = 2 / (3 * Math.LN2);
  const [intercept = NaN, slope = NaN] = fitLogistic(design, target, penalty);
  expect(intercept).toBeCloseTo((-5 * Math.LN2) / 2, 10);
  expect(slope).toBeCloseTo(Math.LN2 / 2, 10);
  const residuals = design.map(([x = 0], i) => (target[i] ?? 0) - sigmoid(intercept + slope * x));
  expect(residuals.reduce((sum, r) => sum + r, 0)).toBeCloseTo(0, 10);
  expect(
    residuals.reduce((sum, r, i) => sum + r * (i < 4 ? -1 : 1), 0) - penalty * 2 * slope,
  ).toBeCloseTo(0, 10);
});

test("regularizes a perfectly separable sample and fits deterministically", () => {
  const design = [[-3], [-1], [1], [3]];
  const labels = [0, 0, 1, 1];
  const coefficients = fitLogistic(design, labels, 1);
  expect(coefficients.every(Number.isFinite)).toBe(true);
  expect(coefficients[1]).toBeGreaterThan(0);
  expect(fitLogistic(design, labels, 1)).toEqual(coefficients);
});

test("uses the training base rate and mean squared probability error", () => {
  expect(baseRate([{ label: 1 }, { label: 0 }, { label: 1 }, { label: 1 }])).toBe(0.75);
  expect(
    meanBrier([
      { actual: 1, predicted: 0.75 },
      { actual: 0, predicted: 0.5 },
    ]),
  ).toBe(0.15625);
});

test("fits the category share from training labels and shrinks unseen groups to the base rate", () => {
  const training = [
    { category: "dex", label: 1 },
    { category: "dex", label: 1 },
    { category: "yield", label: 0 },
    { category: "yield", label: 0 },
  ] as const;
  const shares = categoryTokenShares(training, 4);
  expect(shares.dex).toBeCloseTo((2 + 4 * 0.5) / 6, 12);
  expect(shares.other).toBe(0.5);
  const features = {
    category: "dex",
    ageDays: 72,
    lnTvl: 4,
    growth: 0,
    lnChains: 1,
    label: 0,
  } as const;
  const changed = { ...features, label: 1 };
  const clock = [{ ageDays: 72, share: 0.75, count: 4 }];
  const design = oddsFeatures(features, ["categoryShare"], shares, clock);
  expect(design[0]).toBeCloseTo(Math.log(3), 12);
  expect(design[1]).toBe(shares.dex);
  expect(oddsFeatures(changed, ["categoryShare"], shares, clock)).toEqual(design);
});

test("learns and clamps the clock from the model's training rows", () => {
  const rows = [0, 1].map((label) => ({
    slug: String(label),
    familyKey: String(label),
    listedAt: label ? "2024-01-01" : "2025-01-01",
    ageDays: label * 365,
    label,
    lnTvl: 4,
    growth: 0,
    lnChains: 0,
    category: "dex" as const,
  }));
  const model = fitOddsModel(rows, []);
  expect(model.coefficients[1]).toBeGreaterThan(0);
  expect(model.clock).toEqual([
    { ageDays: 0, share: 0, count: 1 },
    { ageDays: 365, share: 1, count: 1 },
  ]);
  expect(rows.map((row) => oddsFeatures(row, [], model.shares, model.clock)[0])).toEqual(
    [Math.log(1 / 99), Math.log(99)].map((expected) => expect.closeTo(expected, 12)),
  );
});

test("filters products before reading status and retains undated eligible records", () => {
  const protocols = [
    protocol({ slug: "pre", listed_at: "2024-01-01" }),
    protocol({ slug: "same-day", listed_at: "2024-03-01" }),
    protocol({ slug: "traded", mcap_usd: 100, gecko_id: "traded", listed_at: "2024-01-01" }),
    protocol({ slug: "unpriced", gecko_id: "unpriced", listed_at: "2024-01-01" }),
    ...[
      { category: "Bridge" },
      { name: "Example Wrapped" },
      { name: "Example Staked" },
      { name: "Kraken Example" },
      { name: "Example v2" },
    ].flatMap((fields, i) => [
      protocol({ ...fields, slug: `excluded-negative-${i}` }),
      protocol({
        ...fields,
        slug: `excluded-positive-${i}`,
        gecko_id: `excluded-${i}`,
        mcap_usd: 100,
      }),
    ]),
    protocol({ slug: "undated", listed_at: null }),
  ];
  const census = buildCensus(protocols, groupFamilies(protocols));
  expect(
    oddsPopulation(census, "2024-03-01").map(({ slug, label, ageDays }) => [slug, label, ageDays]),
  ).toEqual([
    ["pre", 0, 60],
    ["same-day", 0, 0],
    ["traded", 1, 60],
    ["undated", 0, null],
    ["unpriced", 1, 60],
  ]);
});

const clock: ClockPoint[] = [0.25, 0.625, 0.625].map((share, i) => ({
  ageDays: i * 365,
  share,
  count: 1,
}));

test("converts the fitted status curve and its extrapolated tail to conditional 12-month odds", () => {
  // At ages 0 and 365, gamma = 2 gives status probabilities 1/10 and 25/34.
  expect(launchProbability12(clock, 0, 0, 2)).toBeCloseTo(12 / 17, 12);
  // The tail halves the unrecorded share. With odds halved again by the intercept,
  // status probabilities at 730 and 1095 are 5/11 and 13/19.
  expect(launchProbability12(clock, 730, -Math.LN2, 1)).toBeCloseTo(8 / 19, 12);
  // Stable even when subtracting the two probabilities directly would give 0/0.
  expect(launchProbability12(clock, 0, 1_000, 1)).toBeCloseTo(0.8, 12);
  for (const slope of [0, -1]) {
    expect(() => launchProbability12(clock, 0, 0, slope)).toThrow(/clock coefficient.*positive/i);
  }
});

test.each([0, -1])("uses the tail when bootstrap constrains gamma %s to zero", (gamma) => {
  expect(bootstrapProbability12(clock, 0, 0, gamma)).toBeCloseTo(0.5, 12);
});

test("uses the v8 annual tail hazard when the time term stays flat throughout the window", () => {
  expect(launchProbability12(clock, 365, -4, 2)).toBeCloseTo(0.5, 12);
  expect(launchProbability12(clock, 10_000, -4, 2)).toBeCloseTo(0.5, 12);
  const flat = [{ ageDays: 365, share: 0.4, count: 5 }];
  expect(launchProbability12(flat, 0, -4, 2)).toBeCloseTo(0.4, 12);
});
