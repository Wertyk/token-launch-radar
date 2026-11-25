import { expect, test } from "vitest";
import type { OddsModel } from "../../../src/domain/launch-odds/model.ts";
import { categoryTotals } from "../../../src/domain/valuation/categories.ts";
import {
  impliedValueEffects,
  summarizeEffects,
} from "../../../src/domain/valuation/input-effects.ts";
import type { ValueModel } from "../../../src/domain/valuation/model.ts";
import { protocol } from "../protocol-fixture.ts";

const value: ValueModel = {
  n: 1,
  lambda: 1,
  momentum: false,
  huberScale: 1,
  medianLnAge: Math.log(365),
  featureMeans: { lnTvl: 0, lnAge: 0 },
  featureRanges: { lnTvl: { min: 0, max: 20 }, lnAge: { min: 0, max: 20 } },
  coefficients: { intercept: 0, lnTvl: 1, lnAge: 0 },
};
const odds: OddsModel = {
  terms: ["lnTvl", "growth"],
  coefficients: [-Math.log(10_000) + Math.log(1.95), 1, 1, -1],
  shares: categoryTotals(),
  clock: [
    { ageDays: 365, share: 0.25, count: 1 },
    { ageDays: 730, share: 0.5, count: 1 },
    { ageDays: 1095, share: 0.625, count: 1 },
  ],
  n: 3,
  medianAgeDays: 365,
  maxAgeDays: 1095,
};
const asOf = "2025-01-01";
const record = protocol({ listed_at: "2024-01-02", tvl_usd: 10_000, change_7d: 95 });

test("perturbs each input through the value and odds predictions", () => {
  const [tvl, growth, age] = impliedValueEffects(record, asOf, value, odds);
  // P12 starts at 1/3. TVL multiplies V by 11/10 and P12 by 22/21.
  expect(tvl).toBeCloseTo(100 * ((11 / 10) * (22 / 21) - 1), 10);
  // Growth stops at +100%. The shift in other logit multiplies P12 by 78/79.
  expect(growth).toBeCloseTo(100 * (78 / 79 - 1), 10);
  // The next conditional window starts at F=1/2 and ends at F=5/8, so P12 is 1/4.
  expect(age).toBeCloseTo(-25, 10);
  expect(impliedValueEffects({ ...record, listed_at: null }, asOf, value, odds)).toEqual([
    tvl,
    growth,
    age,
  ]);
  const reversed: OddsModel = {
    ...odds,
    coefficients: [-Math.log(10_000) - Math.log(1.95), 1, 1, 1],
  };
  expect(impliedValueEffects(record, asOf, value, reversed)[1]).toBeGreaterThan(0);
});

test("summarizes each input with the median and nearest-rank P10–P90", () => {
  const effects = new Map(
    Array.from({ length: 10 }, (_, index) => [String(index), [index + 1, -index - 1, 0] as const]),
  );
  expect(summarizeEffects(effects)).toEqual([
    [5.5, 1, 9],
    [-5.5, -10, -2],
    [0, 0, 0],
  ]);
});
