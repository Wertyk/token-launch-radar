import { expect, test } from "vitest";
import { boardEntries, buildCensus } from "../../../src/domain/census/census.ts";
import { mulberry32 } from "../../../src/domain/shared/prng.ts";
import type { Comparable } from "../../../src/domain/valuation/comparables.ts";
import { describeBoardValues } from "../../../src/domain/valuation/diagnostics.ts";
import {
  jackknifePlusBand,
  jackknifePlusCoverage,
  leaveOneFamilyOut,
} from "../../../src/domain/valuation/jackknife.ts";
import { fitValueModel, rankBoard } from "../../../src/domain/valuation/model.ts";
import { protocol } from "../protocol-fixture.ts";

function comparable(slug: string, lnTvl: number, target: number, lnAge = 0): Comparable {
  return { slug, familyKey: `gecko:${slug}`, listedAt: null, lnTvl, lnAge, target, growth: 0 };
}

test("jackknife+ takes separate order statistics of each refit's prediction plus or minus its error", () => {
  const samples = [
    [11, 2],
    [13, 8],
    [15, 3],
    [17, 1],
    [19, 2],
    [21, 8],
    [23, 9],
    [25, 1],
    [27, 2],
    [29, 1],
    [31, 1],
    [33, 1],
    [24, 2],
    [26, 1],
  ].map(([prediction = 0, residual = 0], index) => ({
    slug: String(index),
    prediction,
    residual,
  }));
  // With 14 residuals the n + 1 correction takes the third endpoint from each tail.
  expect(jackknifePlusBand(samples, 21)).toEqual({ p10: 12, p90: 32 });
  expect(jackknifePlusBand(samples, 40)).toEqual({ p10: 12, p90: 40 });
});

test("left-out refits use the published penalty and their own absolute residuals", () => {
  const rows = [comparable("a", 0, 3), comparable("b", 0, 4), comparable("c", 0, 6)];
  const fits = leaveOneFamilyOut(rows, 4);
  expect(
    fits.map(({ comparable: { slug }, model: { lambda }, residual }) => [slug, lambda, residual]),
  ).toEqual([
    ["a", 4, 2],
    ["b", 4, 0.5],
    ["c", 4, 2.5],
  ]);
});

test("out-of-sample coverage is near 80% for seeded Gaussian log errors", () => {
  const random = mulberry32(0x23af);
  const rows = Array.from({ length: 100 }, (_, i) => {
    const tvl = 10 + 10 * random();
    const age = 3 + 4 * random();
    const noise = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    return comparable(String(i), tvl, 3 + 0.8 * tvl + 0.2 * age + noise, age);
  });
  const coverage = jackknifePlusCoverage(leaveOneFamilyOut(rows, 1));
  expect(coverage).toBeGreaterThanOrEqual(0.75);
  expect(coverage).toBeLessThanOrEqual(0.85);
  expect(jackknifePlusCoverage(leaveOneFamilyOut(rows.slice(0, 2), 1))).toBeNull();
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
  const ranked = rankBoard(entries, "2024-01-01", model);
  const refits = leaveOneFamilyOut(rows, model.lambda);
  // Leaving out either endpoint makes the fit flat and changes the ranks by one.
  const reversedRankings = refits.flatMap(({ comparable: { slug }, model }) =>
    rankBoard(entries, "2024-01-01", model)[0]?.protocol.slug === "alpha-low" ? [slug] : [],
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
  const ranked = rankBoard(entries, "2024-01-04", model);
  const [row] = describeBoardValues(
    ranked,
    rows,
    leaveOneFamilyOut(rows, model.lambda),
    "2024-01-04",
  );
  expect(row?.diagnostics.twins).toEqual(["c", "d", "e", "a", "b"]);
  expect(row?.diagnostics.influence).toBeNull();
});
