import { expect, test } from "vitest";
import { boardEntries, buildCensus } from "../../../src/domain/census/census.ts";
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
  const model = fitValueModel(
    buildCensus([
      ...comparables,
      protocol({ slug: "pre", tvl_usd: 1e12 }),
      protocol({ slug: "unpriced", symbol: "FIX", mcap_usd: 0 }),
    ]),
    asOf,
  );
  expect(model.n).toBe(8);
  expect(model.coefficients.intercept).toBeCloseTo(Math.log(8), 5);
  expect(model.coefficients.lnTvl).toBeCloseTo(0.5, 5);
  expect(model.coefficients).not.toHaveProperty("growth");
  expect(model.coefficients.lnAge).toBeCloseTo(0.25, 5);
  expect(model.featureMeans.lnTvl).toBeCloseTo(26 * Math.LN2, 12);
  expect(model.featureMeans.lnAge).toBeCloseTo(2 * Math.LN2, 12);
});

test("uses one comparable per Gecko ID, resolving duplicate observations by slug", () => {
  const [first, ...rest] = comparables;
  if (!first) throw new Error("The fixture must provide a comparable.");
  const a = { ...first, slug: "a-primary", gecko_id: "shared-family" };
  const z = { ...first, slug: "z-duplicate", gecko_id: "shared-family", mcap_usd: 1e12 };
  expect(fitValueModel(buildCensus([z, a, ...rest]), asOf)).toEqual(
    fitValueModel(buildCensus([a, ...rest]), asOf),
  );
});

test("imputes median log age from known comparable ages and flags both missing features", () => {
  const census = buildCensus([
    ...comparables,
    protocol({ slug: "unknown", listed_at: null, change_7d: null, mcap_usd: 1_000_000 }),
  ]);
  const model = fitValueModel(census, asOf);
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
  const model = fitValueModel(
    buildCensus(comparables.map((value) => ({ ...value, listed_at: null }))),
    asOf,
  );
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
  const model = fitValueModel(buildCensus(comparables), asOf);
  const candidate = protocol({ tvl_usd: 2 ** 26, listed_at: "2024-03-01" });
  const flat = predictValue(candidate, asOf, model);
  const row = predictValue({ ...candidate, change_7d }, asOf, model);
  const expected = tvlFactor ** model.coefficients.lnTvl;
  expect(row.decomposition.multipliers.growth).toBeCloseTo(expected, 12);
  expect(row.valueUsd / flat.valueUsd).toBeCloseTo(expected, 12);
});

test("the base, centered multipliers and momentum reconstruct the unrounded prediction", () => {
  const model = fitValueModel(buildCensus(comparables), asOf);
  const row = predictValue(
    protocol({ tvl_usd: 2 ** 28, change_7d: 100, listed_at: "2024-03-01" }),
    asOf,
    model,
  );
  const { base, multipliers } = row.decomposition;
  const product = base * multipliers.lnTvl * multipliers.growth * multipliers.lnAge;
  expect(Math.abs(product / row.valueUsd - 1)).toBeLessThan(1e-9);
  expect(multipliers.lnTvl).toBeCloseTo(2, 5);
  expect(multipliers.growth).toBeCloseTo(Math.SQRT2, 5);
  expect(multipliers.lnAge).toBeCloseTo(Math.SQRT2, 5);
  expect(row.implied_value_usd).toBe(Math.round(row.valueUsd));
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
    const model = fitValueModel(buildCensus(comparables), asOf);
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

test("clamps rounded values and ranks tied values by slug", () => {
  const model = fitValueModel(buildCensus(comparables), asOf);
  const candidates = [
    protocol({ slug: "z", tvl_usd: 1e100 }),
    protocol({ slug: "small", tvl_usd: 1e-80 }),
    protocol({ slug: "a", tvl_usd: 1e90 }),
  ];
  const ranked = rankBoard(boardEntries(buildCensus(candidates), []), asOf, model);
  expect(
    ranked.map(({ rank, implied_value_usd, protocol: { slug } }) => [
      rank,
      slug,
      implied_value_usd,
    ]),
  ).toEqual([
    [1, "a", 1e14],
    [2, "z", 1e14],
    [3, "small", 1],
  ]);
});
