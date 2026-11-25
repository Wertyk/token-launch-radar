import { expect, test } from "vitest";
import { boardMismatches, matchesFields } from "../../src/presentation/web/recompute.ts";

const economics = {
  launchProbability12: 0.42,
  breakEvenDepositUsd: 1200.37,
  airdropYieldApr: 0.03,
  deposits: [
    {
      depositUsd: 1000,
      verdict: "SKIP",
      expectedValueUsd: 8.5733067596217,
      costUsd: 10.23,
      netUsd: -1.6566932403783,
      netPerHourUsd: -2.987170591033927,
    },
    {
      depositUsd: 10000,
      verdict: "THIN",
      expectedValueUsd: 85.733067596217,
      costUsd: 10.23,
      netUsd: 75.503067596217,
      netPerHourUsd: 136.1416256672027,
    },
  ],
} as const;
const plan = {
  chain: null,
  oneTimeCostUsd: 2.1,
  recurringCostUsd: 3.15,
  totalCostUsd: 5.25,
  totalMinutes: 45,
};
const first = {
  slug: "a",
  rank: 1,
  launch_value_usd: 4_800_000_000,
  implied_value_usd: 20,
  interval_p10_usd: 8,
  interval_p90_usd: 80,
  farm_steps: ["plan", "exit"],
  plan_chain: plan.chain,
  plan_one_time_cost_usd: plan.oneTimeCostUsd,
  plan_recurring_cost_usd: plan.recurringCostUsd,
  plan_total_cost_usd: plan.totalCostUsd,
  plan_total_minutes: plan.totalMinutes,
  launch_p12: 0.42,
  airdrop_yield_apr: 0.03,
  farm_economics: { ...economics, deposits: [...economics.deposits] },
};
const second = { ...first, slug: "b", rank: 2, implied_value_usd: 10, farm_steps: ["step"] };
const recomputed = (row: typeof first) => ({
  ...row,
  protocol: { slug: row.slug },
  economics,
  plan,
});
const computed = [first, second].map(recomputed);

test("matches the board fields while ignoring unrelated metadata", () => {
  const withCategory = { ...first, category: "Yield" };
  expect(boardMismatches(computed, [withCategory, second])).toEqual([]);
  expect(boardMismatches([], [])).toEqual([]);
});

function perturbFloats(fraction: number) {
  const scale = (value: number) => value * (1 + fraction);
  return {
    ...first,
    launch_p12: scale(first.launch_p12),
    airdrop_yield_apr: scale(first.airdrop_yield_apr),
    farm_economics: {
      launchProbability12: scale(economics.launchProbability12),
      breakEvenDepositUsd: scale(economics.breakEvenDepositUsd),
      deposits: economics.deposits.map((deposit) => ({
        ...deposit,
        expectedValueUsd: scale(deposit.expectedValueUsd),
        costUsd: scale(deposit.costUsd),
        netUsd: scale(deposit.netUsd),
        netPerHourUsd: scale(deposit.netPerHourUsd),
      })),
    },
  };
}

test("matches a published row with one or two ulps of drift in each floating-point field", () => {
  expect(boardMismatches(computed, [perturbFloats(Number.EPSILON), second])).toEqual([]);
});

test.each([
  ["netUsd", 1, Number.EPSILON, true],
  ["expectedValueUsd", 100, 1e-10, true],
  ["launch_value_usd", first.launch_value_usd, 1, false],
  ["depositUsd", 1_000, 1e-10, false],
  ["rank", 1, Number.EPSILON, false],
])("compares %s symmetrically by field type", (field, exact, drift, matches) => {
  expect(matchesFields(exact, exact + drift, field)).toBe(matches);
  expect(matchesFields(exact + drift, exact, field)).toBe(matches);
});

test("rejects the same row with one part per million of drift", () => {
  expect(boardMismatches(computed, [perturbFloats(1e-6), second])).toEqual([first.slug]);
});

test.each([
  { slug: "c" },
  { rank: 3 },
  { rank: 1 + Number.EPSILON },
  { launch_value_usd: first.launch_value_usd - 1 },
  { implied_value_usd: 19 },
  { interval_p10_usd: Number.NaN },
  { interval_p90_usd: Number.POSITIVE_INFINITY },
  { interval_p90_usd: first.interval_p90_usd + 1e-9 },
  { interval_p10_usd: 81 },
  { plan_one_time_cost_usd: plan.oneTimeCostUsd + 1e-9 },
  { plan_recurring_cost_usd: plan.recurringCostUsd + 1e-9 },
  { plan_total_cost_usd: plan.totalCostUsd + 1e-9 },
  { farm_steps: ["exit", "plan"] },
  { farm_steps: ["plan"] },
  { farm_steps: ["plan", "exit", "extra"] },
  { airdrop_yield_apr: 0.05 },
  { launch_p12: 0 },
  { launch_p12: Number.POSITIVE_INFINITY },
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
  ...(["depositUsd", "costUsd", "expectedValueUsd", "netUsd", "netPerHourUsd"] as const).flatMap(
    (key) =>
      first.farm_economics.deposits.map((_, index) => ({
        farm_economics: {
          ...first.farm_economics,
          deposits: first.farm_economics.deposits.map((deposit, i) =>
            i === index
              ? {
                  ...deposit,
                  [key]: deposit[key] + (key === "depositUsd" ? 1e-9 : 1e-6),
                }
              : deposit,
          ),
        },
      })),
  ),
  { farm_economics: { ...first.farm_economics, deposits: first.farm_economics.deposits.slice(1) } },
])("detects a changed field in a row (%o)", (change) => {
  expect(boardMismatches(computed, [{ ...first, ...change }, second])).toEqual([first.slug]);
});

test("counts reordered, missing and extra rows", () => {
  expect(boardMismatches(computed, [second, first])).toEqual([first.slug, second.slug]);
  expect(boardMismatches(computed.slice(0, 1), [first, second])).toEqual([second.slug]);
  expect(boardMismatches(computed, [first])).toEqual([second.slug]);
});
