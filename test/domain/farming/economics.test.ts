import { expect, test } from "vitest";
import {
  estimateFarmEconomics,
  farmEconomicsTerms,
  renderEconomics,
} from "../../../src/domain/farming/economics.ts";

const plan = { totalCostUsd: 10, totalMinutes: 120, capitalApr: 0.02 };

test("derives fixed costs, capital carry and EV per deposit dollar", () => {
  const settings = {
    horizonMonths: 6,
    monthsPerYear: 12,
    minutesPerHour: 60,
    hourlyRateUsd: 30,
    airdropShareOfLaunchCap: 0.25,
    farmerHaircut: 0.5,
    capitalApr: { yieldBearing: 0.125, nonYielding: 0.25 },
  };
  // $10 + 2 × $30; half a year of 12.5% carry; $4M × ¼ × ½ × ¼ / $2M.
  expect(farmEconomicsTerms(plan, 4_000_000, 2_000_000, 0.25, settings)).toEqual({
    fixedCosts: 70,
    horizonYears: 0.5,
    capitalCarry: 0.0625,
    k: 0.0625,
  });
  expect(
    farmEconomicsTerms({ ...plan, capitalApr: 0.5 }, 4_000_000, 2_000_000, 0, settings),
  ).toEqual({ fixedCosts: 70, horizonYears: 0.5, capitalCarry: 0.25, k: 0 });
});

test("uses a quarter of circulating launch cap and the playbook's net capital rate", () => {
  // k = $1.2M × 25% × 50% × 50% / $2M = 0.0375. Fixed costs are $10 + 2 × $25.
  const result = estimateFarmEconomics(plan, 1_200_000, 2_000_000, 0.5);
  expect(result.airdropYieldApr).toBeCloseTo(0.0375, 12);
  expect(result.deposits).toEqual([
    { depositUsd: 1_000, expectedValueUsd: 37.5, costUsd: 80, verdict: "SKIP" },
    { depositUsd: 10_000, expectedValueUsd: 375, costUsd: 260, verdict: "THIN" },
  ]);
  expect(result.breakEvenDepositUsd).toBeCloseTo(60 / 0.0175, 8);
  const text = renderEconomics(result);
  expect(text).toContain(
    "Economics at $1,000 over 12 months · expected airdrop ≈ $37.50 vs cost ≈ $80 → SKIP. Break-even deposit ≈ $3,428.57.",
  );
  expect(text).toContain("25% of circulating launch cap");
  expect(text).toContain("small launch float");
  expect(text).toContain("mostly unlocked");
});

test("charges 5% for idle capital without changing the airdrop yield", () => {
  const result = estimateFarmEconomics({ ...plan, capitalApr: 0.05 }, 1_200_000, 2_000_000, 0.5);
  expect(result.airdropYieldApr).toBeCloseTo(0.0375, 12);
  expect(result.deposits).toEqual([
    { depositUsd: 1_000, expectedValueUsd: 37.5, costUsd: 110, verdict: "SKIP" },
    { depositUsd: 10_000, expectedValueUsd: 375, costUsd: 560, verdict: "SKIP" },
  ]);
  expect(result.breakEvenDepositUsd).toBe("never");
});

test.each([
  [1_200_000, "FARM"],
  [1_199_999, "THIN"],
  [600_000, "THIN"],
  [599_999, "SKIP"],
] as const)("uses inclusive verdict thresholds on V = $%i", (value, verdict) => {
  const result = estimateFarmEconomics(
    { ...plan, totalCostUsd: 0, totalMinutes: 0 },
    value,
    5_000_000,
    1,
  );
  expect(result.deposits.map((row) => row.verdict)).toEqual([verdict, verdict]);
});

test.each([
  ["equal to capital carry", 800_000, 5_000_000, 1, "THIN"],
  ["below capital carry", 720_000, 5_000_000, 1, "SKIP"],
  ["zero with P12 = 0", 8_000_000, 750_000, 0, "SKIP"],
  ["tiny with huge TVL", 8_000_000, Number.MAX_VALUE, 1, "SKIP"],
] as const)("break-even is never when k is %s", (_, value, tvl, probability, largeVerdict) => {
  const result = estimateFarmEconomics(plan, value, tvl, probability);
  expect(result.breakEvenDepositUsd).toBe("never");
  expect(result.deposits.map((row) => row.costUsd)).toEqual([80, 260]);
  expect(result.deposits.map((row) => row.verdict)).toEqual(["SKIP", largeVerdict]);
  expect(renderEconomics(result)).toContain("Break-even deposit never");
  if (probability === 0) {
    expect(result.airdropYieldApr).toBe(0);
    expect(result.deposits[0].expectedValueUsd).toBe(0);
  }
  if (tvl === Number.MAX_VALUE) {
    expect(result.deposits[0].expectedValueUsd).toBeGreaterThan(0);
    expect(result.deposits[0].expectedValueUsd).toBeLessThan(1e-296);
  }
});
