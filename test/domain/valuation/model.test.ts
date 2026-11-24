import { expect, test } from "vitest";
import { boardEntries, buildCensus } from "../../../src/domain/census/census.ts";
import { groupFamilies } from "../../../src/domain/census/families.ts";
import type { Protocol } from "../../../src/domain/snapshot.ts";
import { comparablesFromFamilies } from "../../../src/domain/valuation/comparables.ts";
import {
  fitValueModel,
  predictValue,
  rankBoard,
  valueFeatures,
} from "../../../src/domain/valuation/model.ts";
import { protocol } from "../protocol-fixture.ts";

const asOf = "2024-03-17";
const comparables = [2 ** 24, 2 ** 28].flatMap((tvl) =>
  [0, 100].flatMap((growth) =>
    [1, 16].map((days) =>
      protocol({
        slug: `fit-${tvl}-${growth}-${days}`,
        tvl_usd: tvl,
        change_7d: growth,
        listed_at: days === 1 ? "2024-03-16" : "2024-03-01",
        mcap_usd: 8 * Math.sqrt(tvl) * (days === 16 ? 2 : 1),
      }),
    ),
  ),
);

const fitFixture = (rows: readonly Protocol[], lambda = 0, robust = true) =>
  fitValueModel(comparablesFromFamilies(groupFamilies(rows), asOf), lambda, { robust });

test.each([
  [-51, Math.log(0.5)],
  [-50, Math.log(0.5)],
  [100, Math.log(2)],
  [101, Math.log(2)],
  [25, Math.log(1.25)],
])("transforms a %d percent change with the growth clamp", (change_7d, growth) => {
  const row = valueFeatures(protocol({ tvl_usd: 2 ** 24, change_7d }), "2024-03-01", 99);
  expect(row.features.lnTvl).toBeCloseTo(24 * Math.LN2, 12);
  expect(row.features.growth).toBeCloseTo(growth, 12);
  expect(row.features.lnAge).toBeCloseTo(Math.LN2, 12);
  expect(row.flags).toEqual([]);
});

test("floors age at one day for both same-day and future listings", () => {
  for (const listed_at of ["2024-03-01", "2024-03-02"]) {
    const row = valueFeatures(protocol({ listed_at }), "2024-03-01", 99);
    expect(row.features.lnAge).toBe(0);
    expect(row.flags).toEqual([]);
  }
});

test("recovers the known log-scale coefficients from eight exact-fit comparables", () => {
  const model = fitFixture([
    ...comparables,
    protocol({ slug: "pre", tvl_usd: 1e12 }),
    protocol({ slug: "unpriced", symbol: "FIX", mcap_usd: 0 }),
  ]);
  expect(model.n).toBe(8);
  expect(model.coefficients.intercept).toBeCloseTo(Math.log(8), 5);
  expect(model.coefficients.lnTvl).toBeCloseTo(0.5, 5);
  expect(model.coefficients).not.toHaveProperty("growth");
  expect(model.coefficients.lnAge).toBeCloseTo(0.25, 5);
  expect(model.featureMeans.lnTvl).toBeCloseTo(26 * Math.LN2, 12);
  expect(model.featureMeans.lnAge).toBeCloseTo(2 * Math.LN2, 12);
});

test("uses the family TVL and first positive market cap, resolving duplicates by slug", () => {
  const [first, ...rest] = comparables;
  if (!first) throw new Error("The fixture must provide a comparable.");
  const a = { ...first, slug: "a-primary", gecko_id: "shared-family" };
  const z = { ...first, slug: "z-duplicate", gecko_id: "shared-family", mcap_usd: 1e12 };
  expect(fitFixture([z, a, ...rest])).toEqual(
    fitFixture([{ ...a, tvl_usd: a.tvl_usd + z.tvl_usd }, ...rest]),
  );
});

test("imputes median log age from known comparable ages and flags both missing features", () => {
  const model = fitFixture([
    ...comparables,
    protocol({ slug: "unknown", listed_at: null, change_7d: null, mcap_usd: 1_000_000 }),
  ]);
  const row = predictValue(protocol({ listed_at: null, change_7d: null }), asOf, model);
  expect(model.n).toBe(9);
  expect(model.medianLnAge).toBeCloseTo(2 * Math.LN2, 12);
  expect(row.features).toEqual({
    lnTvl: Math.log(16_000_000),
    growth: 0,
    lnAge: model.medianLnAge,
  });
  expect(row.flags).toEqual(["growth-missing", "age-missing"]);
  expect(model.featureMeans.lnAge).toBeCloseTo(2 * Math.LN2, 12);
  expect(row.decomposition.multipliers.growth).toBe(1);
});

test("uses log one-day age when all comparable ages are missing", () => {
  const model = fitFixture(comparables.map((value) => ({ ...value, listed_at: null })));
  expect(model.medianLnAge).toBe(0);
  expect(model.featureMeans.lnAge).toBe(0);
  expect(model.coefficients.lnAge).toBe(0);
});

test.each([
  [-51, 0.5],
  [-50, 0.5],
  [0, 1],
  [100, 2],
  [101, 2],
])("prices %d percent growth as a TVL momentum multiplier", (change_7d, tvlFactor) => {
  const model = fitFixture(comparables);
  const candidate = protocol({ tvl_usd: 2 ** 26, listed_at: "2024-03-01" });
  const flat = predictValue(candidate, asOf, model);
  const row = predictValue({ ...candidate, change_7d }, asOf, model);
  const expected = tvlFactor ** model.coefficients.lnTvl;
  expect(row.decomposition.multipliers.growth).toBeCloseTo(expected, 12);
  expect(row.valueUsd / flat.valueUsd).toBeCloseTo(expected, 12);
});

test("base, TVL, momentum and age reconstruct the unrounded prediction", () => {
  const model = fitFixture(comparables);
  const row = predictValue(
    protocol({ tvl_usd: 2 ** 28, change_7d: 100, listed_at: "2024-03-01", category: "Dexs" }),
    asOf,
    model,
  );
  const { base, multipliers } = row.decomposition;
  const product = base * multipliers.lnTvl * multipliers.growth * multipliers.lnAge;
  expect(Math.abs(product / row.valueUsd - 1)).toBeLessThan(1e-9);
  expect(multipliers).not.toHaveProperty("category");
  expect(multipliers.lnTvl).toBeCloseTo(2, 5);
  expect(multipliers.growth).toBeCloseTo(Math.SQRT2, 5);
  expect(multipliers.lnAge).toBeCloseTo(Math.SQRT2, 5);
  expect(row.launch_value_usd).toBe(Math.round(row.valueUsd));
});

test("changing only category affects neither the production fit nor the prediction", () => {
  const rows = comparables.map((row, i) => ({ ...row, category: i % 2 ? "Dexs" : "RWA" }));
  const model = fitFixture(rows, 0.1);
  expect(model).toEqual(fitFixture(comparables, 0.1));
  expect(model.coefficients).not.toHaveProperty("category");
  expect(predictValue(protocol({ category: "Dexs" }), asOf, model)).toEqual(
    predictValue(protocol({ category: "RWA" }), asOf, model),
  );
});

test.each([
  [23, "2024-03-16", true],
  [29, "2024-03-01", true],
  [24, "2024-02-29", true],
  [24, "2024-03-16", false],
  [28, "2024-03-01", false],
] as const)(
  "checks the fitting ranges for TVL 2^%d and listing date %s",
  (tvlExponent, listed_at, outside) => {
    const model = fitFixture(comparables);
    const candidate = protocol({ tvl_usd: 2 ** tvlExponent, listed_at, change_7d: 100 });
    const row = predictValue(candidate, asOf, model);
    expect(row.flags).toEqual(outside ? ["outside-comps-range"] : []);
    const { features } = valueFeatures(candidate, asOf, model.medianLnAge);
    const { intercept, lnTvl, lnAge } = model.coefficients;
    const expected = Math.exp(
      intercept + lnTvl * (features.lnTvl + features.growth) + lnAge * features.lnAge,
    );
    expect(row.features).toEqual(features);
    expect(row.valueUsd / expected).toBeCloseTo(1, 12);
  },
);

test("ranks rounded launch values times odds, with clamping and slug ties", () => {
  const model = fitFixture(comparables);
  const candidates = [
    protocol({ slug: "z", tvl_usd: 1e100 }),
    protocol({ slug: "small", tvl_usd: 1e-80 }),
    protocol({ slug: "a", tvl_usd: 1e90 }),
  ];
  const entries = boardEntries(buildCensus(candidates), []).map((entry) => ({
    ...entry,
    launchProbability12: 0.25,
  }));
  const ranked = rankBoard(entries, asOf, model);
  expect(
    ranked.map(({ rank, implied_value_usd, protocol: { slug } }) => [
      rank,
      slug,
      implied_value_usd,
    ]),
  ).toEqual([
    [1, "a", 2.5e13],
    [2, "z", 2.5e13],
    [3, "small", 1],
  ]);
});

test("Huber downweights a gross outlier while least squares moves away from the true slope", () => {
  const rows = Array.from({ length: 21 }, (_, i) =>
    protocol({
      slug: `huber-${i}`,
      tvl_usd: Math.exp(i),
      mcap_usd: Math.exp(2 + 0.5 * i + (i === 20 ? 30 : 0)),
    }),
  );
  const huber = fitFixture(rows);
  const ols = fitFixture(rows, 0, false);
  expect(ols.coefficients.lnTvl).toBeCloseTo(0.5 + 300 / 770, 12);
  expect(huber.coefficients.lnTvl).toBeCloseTo(0.5, 4);
});

test("zero ridge gives least squares and increasing ridge shrinks both standardized slopes", () => {
  for (const lambda of [0, 1, 10, 100]) {
    const { lnTvl, lnAge } = fitFixture(comparables, lambda, false).coefficients;
    expect(lnTvl).toBeCloseTo((0.5 * 8) / (8 + lambda), 12);
    expect(lnAge).toBeCloseTo((0.25 * 8) / (8 + lambda), 12);
  }
});

test("ordinary least squares gives an exact fit with collinear TVL and age", () => {
  const rows = comparablesFromFamilies(groupFamilies(comparables), asOf).map((row, i) => ({
    ...row,
    lnTvl: i,
    lnAge: 2 * i,
    growth: 0,
    target: 4 + i,
  }));
  const model = fitValueModel(rows, 0, { robust: false });
  const { intercept, lnTvl, lnAge } = model.coefficients;
  expect(intercept).toBeCloseTo(4, 12);
  expect(lnTvl + 2 * lnAge).toBeCloseTo(1, 12);
});
