import { expect, test } from "vitest";
import { countBoardMismatches } from "../../src/presentation/web/recompute.ts";

const economics = {
  launchProbability12: 0.42,
  breakEvenDepositUsd: 1200,
  airdropYieldApr: 0.03,
  deposits: [
    { depositUsd: 1000, verdict: "SKIP", expectedValueUsd: 3, costUsd: 4 },
    { depositUsd: 10000, verdict: "THIN", expectedValueUsd: 30, costUsd: 40 },
  ],
} as const;
const first = {
  slug: "a",
  rank: 1,
  implied_value_usd: 20,
  farm_steps: ["plan", "exit"],
  launch_p12: 0.42,
  airdrop_yield_apr: 0.03,
  farm_economics: { ...economics, deposits: [...economics.deposits] },
};
const second = { ...first, slug: "b", rank: 2, implied_value_usd: 10, farm_steps: ["step"] };
const recomputed = (row: typeof first) => ({
  ...row,
  protocol: { slug: row.slug },
  economics,
});
const computed = [first, second].map(recomputed);

test("matches the board fields while ignoring unrelated metadata", () => {
  const withCategory = { ...first, category: "Yield" };
  expect(countBoardMismatches(computed, [withCategory, second])).toBe(0);
  expect(countBoardMismatches([], [])).toBe(0);
});

test.each([
  { slug: "c" },
  { rank: 3 },
  { implied_value_usd: 19 },
  { farm_steps: ["exit", "plan"] },
  { farm_steps: ["plan"] },
  { farm_steps: ["plan", "exit", "extra"] },
  { airdrop_yield_apr: 0.05 },
  { launch_p12: 0 },
  { farm_economics: { ...first.farm_economics, launchProbability12: 0 } },
  { farm_economics: { ...first.farm_economics, breakEvenDepositUsd: "never" as const } },
  ...first.farm_economics.deposits.map((_, index) => ({
    farm_economics: {
      ...first.farm_economics,
      deposits: first.farm_economics.deposits.map((deposit, i) =>
        i === index ? { ...deposit, verdict: "FARM" as const } : deposit,
      ),
    },
  })),
  { farm_economics: { ...first.farm_economics, deposits: first.farm_economics.deposits.slice(1) } },
])("detects a changed field in a row (%o)", (change) => {
  expect(countBoardMismatches(computed, [{ ...first, ...change }, second])).toBe(1);
});

test("counts reordered, missing and extra rows", () => {
  expect(countBoardMismatches(computed, [second, first])).toBe(2);
  expect(countBoardMismatches(computed.slice(0, 1), [first, second])).toBe(1);
  expect(countBoardMismatches(computed, [first])).toBe(1);
});
