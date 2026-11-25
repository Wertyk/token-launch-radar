import { expect, test } from "vitest";
import type { TokenStatusRow } from "../../../src/domain/launch-odds/model.ts";
import { growthPlacebo } from "../../../src/domain/launch-odds/placebo.ts";
import { mulberry32 } from "../../../src/domain/shared/prng.ts";

test("the seeded growth placebo distinguishes signal from noise", () => {
  const rows: TokenStatusRow[] = Array.from({ length: 100 }, (_, i) => ({
    slug: String(i),
    familyKey: String(i),
    listedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    ageDays: 100 - i,
    label: i % 2,
    growth: i % 2 ? 1 : -1,
    category: "other",
    lnChains: 0,
    lnTvl: 10,
  }));
  const result = growthPlacebo(rows, ["growth"], 200);
  expect(result).toEqual(growthPlacebo(rows, ["growth"], 200));
  expect(result.asGoodOrBetter).toEqual([0, 0]);
  const random = mulberry32(1);
  const noise = growthPlacebo(
    rows.map((row) => ({ ...row, growth: 2 * random() - 1 })),
    ["growth"],
    200,
  );
  expect(noise.asGoodOrBetter.every((share) => share !== null && share > 0.5)).toBe(true);
});
