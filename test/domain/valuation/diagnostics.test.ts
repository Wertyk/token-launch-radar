import { expect, test } from "vitest";
import { boardEntries, buildCensus } from "../../../src/domain/census/census.ts";
import { mulberry32 } from "../../../src/domain/shared/prng.ts";
import type { Comparable } from "../../../src/domain/valuation/comparables.ts";
import { describeBoardValues } from "../../../src/domain/valuation/diagnostics.ts";
import {
  jackknifePlusBand,
  jackknifePlusCoverage,
  leaveOneFamilyOut,
  rangeHonesty,
} from "../../../src/domain/valuation/jackknife.ts";
import { fitValueModel, rankBoard } from "../../../src/domain/valuation/model.ts";
import { selectLambda } from "../../../src/domain/valuation/selection.ts";
import { protocol } from "../protocol-fixture.ts";

function comparable(slug: string, lnTvl: number, target: number, lnAge = 0): Comparable {
  return { slug, familyKey: `gecko:${slug}`, listedAt: null, lnTvl, lnAge, target, growth: 0 };
}

test("jackknife+ takes both quantiles of predictions shifted by skewed signed residuals", () => {
  const predictionsAndResiduals = [
    [11, -1],
    [13, 8],
    [15, -3],
    [17, -8],
    [19, -2],
    [21, 8],
    [23, 9],
    [25, 1],
    [27, 2],
    [29, 1],
    [31, -10],
    [33, 6],
    [24, 2],
    [26, 1],
  ] as const;
  const samples = predictionsAndResiduals.map(([prediction, residual], index) => ({
    slug: String(index),
    prediction,
    residual,
  }));
  // The finite-sample ranks are 1 and 14. Absolute-residual tails would give 5 and 41.
  expect(jackknifePlusBand(samples)).toEqual({ p10: 9, p25: 12, p75: 30, p90: 39 });
});

test("jackknife+ uses finite-sample ranks 12 and 117 for 128 candidates", () => {
  const samples = Array.from({ length: 128 }, (_, i) => ({
    slug: String(i),
    prediction: 128 - i,
    residual: 0,
  }));
  expect(jackknifePlusBand(samples)).toEqual({ p10: 12, p25: 32, p75: 97, p90: 117 });
});

test("left-out board refits use the published penalty and their own signed residuals", () => {
  const rows = [comparable("a", 0, 3), comparable("b", 0, 4), comparable("c", 0, 6)];
  const fits = leaveOneFamilyOut(rows, 4);
  expect(
    fits.map(({ comparable: { slug }, model: { lambda }, residual }) => [slug, lambda, residual]),
  ).toEqual([
    ["a", 4, -2],
    ["b", 4, -0.5],
    ["c", 4, 2.5],
  ]);
});

test("coverage selects a penalty inside each outer training fold", () => {
  const random = mulberry32(3);
  const rows = Array.from({ length: 20 }, (_, i) => {
    const tvl = i / 4;
    const age = Math.round(10 * random());
    const noise = Math.round(20 * random() ** 2) / 4;
    return comparable(String(i).padStart(2, "0"), tvl, 3 + tvl + noise, age);
  });
  expect(selectLambda(rows)).toBe(0.01);
  expect(selectLambda(rows.filter(({ slug }) => slug !== "09"))).toBe(0.1);
  const coverage = jackknifePlusCoverage(rows);
  expect(coverage?.counts).toEqual({ missLow: 2, covered: 15, missHigh: 3 });
  expect(coverage?.coveredSlugs.size).toBe(15);
  expect(coverage?.coveredSlugs.has("09")).toBe(true);
});

test("out-of-sample coverage is near 80% for seeded Gaussian log errors", () => {
  const random = mulberry32(0x23af);
  const rows = Array.from({ length: 100 }, (_, i) => {
    const tvl = 10 + 10 * random();
    const age = 3 + 4 * random();
    const noise = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    return comparable(String(i), tvl, 3 + 0.8 * tvl + 0.2 * age + noise, age);
  });
  const coverage = jackknifePlusCoverage(rows);
  expect(coverage?.counts.covered).toBeGreaterThanOrEqual(75);
  expect(coverage?.counts.covered).toBeLessThanOrEqual(85);
  expect(jackknifePlusCoverage(rows.slice(0, 2))).toBeNull();
});

test("rank influence reports the signed rank change and is stable under input reordering", () => {
  const rows = [
    comparable("a", 0, 3),
    comparable("b", 1, 7),
    comparable("c", 2, 3),
    comparable("d", 3, 7),
  ];
  const entries = boardEntries(
    buildCensus([
      protocol({ slug: "alpha-low", tvl_usd: 1, listed_at: null }),
      protocol({ slug: "zeta-high", tvl_usd: Math.exp(3), listed_at: null }),
    ]),
    [],
  );
  const model = fitValueModel(rows, 1);
  const candidates = entries.map((entry) => ({ ...entry, launchProbability12: 1 }));
  const ranked = rankBoard(candidates, "2024-01-01", model);
  const refits = leaveOneFamilyOut(rows, model.lambda);
  // Leaving out either endpoint makes the fit flat and changes the ranks by one.
  const reversedRankings = refits.flatMap(({ comparable: { slug }, model }) =>
    rankBoard(candidates, "2024-01-01", model)[0]?.protocol.slug === "alpha-low" ? [slug] : [],
  );
  expect(reversedRankings).toEqual(["a", "d"]);
  const described = describeBoardValues(ranked, rows, refits, "2024-01-01");
  expect(
    described.map(({ protocol: { slug }, diagnostics: { influence, twins } }) => ({
      slug,
      influence,
      twins,
    })),
  ).toEqual([
    {
      slug: "zeta-high",
      influence: { family_key: "gecko:a", slug: "a", rank_delta: 1 },
      twins: ["d", "c", "b", "a"],
    },
    {
      slug: "alpha-low",
      influence: { family_key: "gecko:a", slug: "a", rank_delta: -1 },
      twins: ["a", "b", "c", "d"],
    },
  ]);
  expect(
    describeBoardValues(ranked, [...rows].reverse(), [...refits].reverse(), "2024-01-01"),
  ).toEqual(described);
});

test("P10–P90 and rank influence use each row's fixed odds across valuation refits", () => {
  const asOf = "2024-01-04";
  const family = comparable("family", 0, Math.log(100));
  const flat = fitValueModel([family], 1);
  const model = { ...flat, coefficients: { ...flat.coefficients, lnTvl: 1 } };
  const entries = boardEntries(
    buildCensus([
      protocol({ slug: "high-tvl", tvl_usd: 4 }),
      protocol({ slug: "low-tvl", tvl_usd: 1 }),
    ]),
    [],
  ).map((entry) => ({
    ...entry,
    launchProbability12: entry.protocol.tvl_usd === 4 ? 0.2 : 0.6,
  }));
  const ranked = rankBoard(entries, asOf, model);
  const described = describeBoardValues(
    ranked,
    [family],
    Array.from({ length: 9 }, (_, i) => ({
      comparable: { ...family, slug: String(i) },
      model: flat,
      residual: Math.log(2),
    })),
    asOf,
  );
  expect(ranked.map(({ implied_value_usd }) => implied_value_usd)).toEqual([80, 60]);
  expect(described.map(({ diagnostics }) => diagnostics.influence?.rank_delta)).toEqual([1, -1]);
  for (const [i, bound] of [40, 120].entries()) {
    expect(described[i]?.diagnostics.interval_p10_usd).toBeLessThanOrEqual(bound);
    expect(described[i]?.diagnostics.interval_p10_usd).toBeGreaterThanOrEqual(bound - 1);
    expect(described[i]?.diagnostics.interval_p90_usd).toBeGreaterThanOrEqual(bound);
    expect(described[i]?.diagnostics.interval_p90_usd).toBeLessThanOrEqual(bound + 1);
  }
});

test("twins use standardized distances, then slug for ties, and stop at five", () => {
  const rows = [
    comparable("b", 50, 4, 2),
    comparable("a", 50, 4, 2),
    comparable("c", 52, 4, 1),
    comparable("d", 60, 4, 1),
    comparable("e", 30, 4, 1),
    comparable("f", 90, 4, 3),
  ];
  const entries = boardEntries(
    buildCensus([protocol({ slug: "query", tvl_usd: Math.exp(50), listed_at: "2024-01-01" })]),
    [],
  );
  const model = fitValueModel(rows, 1);
  const ranked = rankBoard(
    entries.map((entry) => ({ ...entry, launchProbability12: 1 })),
    "2024-01-04",
    model,
  );
  const [row] = describeBoardValues(
    ranked,
    rows,
    leaveOneFamilyOut(rows, model.lambda),
    "2024-01-04",
  );
  expect(row?.diagnostics.twins).toEqual(["c", "d", "e", "a", "b"]);
});

test("rank influence names a family when every deletion leaves the rank unchanged", () => {
  const rows = [comparable("a", 0, 3), comparable("b", 1, 4)];
  const entries = boardEntries(buildCensus([protocol()]), []);
  const asOf = "2024-01-04";
  const model = fitValueModel(rows, 1);
  const ranked = rankBoard(
    entries.map((entry) => ({ ...entry, launchProbability12: 1 })),
    asOf,
    model,
  );
  const refits = leaveOneFamilyOut(rows, model.lambda).toReversed();
  const [row] = describeBoardValues(ranked, rows, refits, asOf);
  expect(row?.diagnostics.influence).toEqual({ family_key: "gecko:a", slug: "a", rank_delta: 0 });
  expect(describeBoardValues(ranked, rows, [], asOf)[0]?.diagnostics.influence).toBeNull();
});

test("counts held-out caps on the boundaries of the two bands", () => {
  const points = [-1, 0, 1, 2, 3, 4].map((actual) => ({
    actual,
    p10: 0,
    p25: 1,
    p75: 2,
    p90: 3,
  }));
  expect(rangeHonesty(points)).toEqual({
    middle: { stated: 0.5, covered: 2, n: 6 },
    broad: { stated: 0.8, covered: 4, n: 6 },
  });
});
