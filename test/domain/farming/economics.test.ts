import { expect, test } from "vitest";
import { FARM_ASSUMPTIONS } from "../../../src/domain/farming/assumptions.ts";
import {
  estimateFarmEconomics,
  farmEconomicsTerms,
  renderEconomics,
} from "../../../src/domain/farming/economics.ts";

const plan = { totalCostUsd: 10, totalMinutes: 120, capitalApr: 0 };

test("uses cash fees, zero yield-bearing carry, and the playbook's custom capital rate", () => {
  expect(FARM_ASSUMPTIONS.capitalApr).toEqual({ yieldBearing: 0, nonYielding: 0.05 });
  const settings = {
    ...FARM_ASSUMPTIONS,
    horizonMonths: 6,
    capitalApr: { yieldBearing: 0.125, nonYielding: 0.25 },
  };
  expect(farmEconomicsTerms(plan, 4_000_000, 2_000_000, 0.25, settings)).toEqual({
    cashFees: 10,
    hours: 2,
    horizonYears: 0.5,
    capitalCarry: 0.0625,
    k: 0.0625,
  });
  expect(
    farmEconomicsTerms({ ...plan, capitalApr: 0.5 }, 4_000_000, 2_000_000, 0, settings)
      .capitalCarry,
  ).toBe(0.25);
});

test("prices the airdrop once and breaks even at the deposit where net reaches zero", () => {
  // k = $1.2M × 25% × 50% × 50% / $2M = 0.0375, with $10 in fees and no carry.
  const result = estimateFarmEconomics(plan, 1_200_000, 2_000_000, 0.5);
  expect(result.airdropYieldApr).toBeCloseTo(0.0375, 12);
  expect(result.deposits).toEqual([
    {
      depositUsd: 1_000,
      expectedValueUsd: 37.5,
      costUsd: 10,
      netUsd: 27.5,
      netPerHourUsd: 13.75,
      verdict: "THIN",
    },
    {
      depositUsd: 10_000,
      expectedValueUsd: 375,
      costUsd: 10,
      netUsd: 365,
      netPerHourUsd: 182.5,
      verdict: "FARM",
    },
  ]);
  expect(result.breakEvenDepositUsd).toBeCloseTo(10 / 0.0375, 10);
  const step = renderEconomics(result);
  for (const text of [
    "$27.50 net",
    "$13.75/h",
    "THIN",
    "$266.67",
    "net reaches $0",
    "25% of circulating launch cap",
  ]) {
    expect(step).toContain(text);
  }
});

test("charges 5% for non-yielding deposits, with no break-even when carry exceeds drop yield", () => {
  const result = estimateFarmEconomics({ ...plan, capitalApr: 0.05 }, 1_200_000, 2_000_000, 0.5);
  expect(result.deposits[0]).toMatchObject({
    expectedValueUsd: 37.5,
    costUsd: 60,
    netUsd: -22.5,
    verdict: "SKIP",
  });
  expect(result.breakEvenDepositUsd).toBe("never");
});

test.each([
  [480, 50, "FARM"],
  [479, 49.875, "THIN"],
  [81, 0.125, "THIN"],
  [80, 0, "SKIP"],
  [79, -0.125, "SKIP"],
] as const)(
  "uses the inclusive labor boundary and strict positive net at V = $%i",
  (value, netUsd, verdict) => {
    const result = estimateFarmEconomics(plan, value, 1_000, 1);
    expect(result.deposits[0]).toMatchObject({ netUsd, netPerHourUsd: netUsd / 2, verdict });
  },
);

test("break-even is never with zero drop odds and positive fees", () => {
  const result = estimateFarmEconomics(plan, 8_000_000, 750_000, 0);
  expect(result.airdropYieldApr).toBe(0);
  expect(result.deposits[0]).toMatchObject({ expectedValueUsd: 0, netUsd: -10, verdict: "SKIP" });
  expect(result.breakEvenDepositUsd).toBe("never");
  expect(renderEconomics(result)).toContain("Break-even deposit never");
});
