import { expect, test } from "vitest";
import { buildRadar } from "../../src/application/browser-api.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import {
  integrityChecks as checkEvidence,
  integrityStrip,
} from "../../src/presentation/web/integrity.ts";
import { boardMismatches } from "../../src/presentation/web/recompute.ts";
import { protocol } from "../domain/protocol-fixture.ts";

const deposits = [
  {
    depositUsd: 1000,
    expectedValueUsd: 3,
    costUsd: 4,
    netUsd: -1,
    netPerHourUsd: -2,
    verdict: "SKIP",
  },
  {
    depositUsd: 10000,
    expectedValueUsd: 30,
    costUsd: 40,
    netUsd: -10,
    netPerHourUsd: -20,
    verdict: "THIN",
  },
] as const;
const farm = { deposits, launchProbability12: 0.42, breakEvenDepositUsd: 1200 };
const plan = {
  chain: null,
  oneTimeCostUsd: 2,
  recurringCostUsd: 3,
  totalCostUsd: 5,
  totalMinutes: 45,
};
const row = {
  slug: "a",
  rank: 1,
  launch_value_usd: 48,
  implied_value_usd: 20,
  interval_p10_usd: 8,
  interval_p90_usd: 80,
  farm_steps: ["plan"],
  plan_chain: plan.chain,
  plan_one_time_cost_usd: plan.oneTimeCostUsd,
  plan_recurring_cost_usd: plan.recurringCostUsd,
  plan_total_cost_usd: plan.totalCostUsd,
  plan_total_minutes: plan.totalMinutes,
  airdrop_yield_apr: 0.03,
  launch_p12: 0.42,
  farm_economics: farm,
};
const computed = {
  ...row,
  protocol: { slug: row.slug },
  economics: { ...farm, airdropYieldApr: 0.03 },
  plan,
};
const data = {
  fitted: 128,
  houseRule: {
    truePositives: ["a"],
    falsePositives: ["b"],
    falseNegatives: [],
  },
  intervalCounts: { missLow: 12, covered: 104, missHigh: 12 },
  invalidPoints: 0,
  loo: {
    model: { medianMultiplier: 3.4559, n: 128, spearman: 0.39 },
    flatMultiple: { medianMultiplier: 5.0696, n: 128, spearman: 0.42 },
  },
};

function integrityChecks(
  computed: Parameters<typeof boardMismatches>[0],
  published: Parameters<typeof boardMismatches>[1],
  watchlist: readonly string[],
  data: Parameters<typeof checkEvidence>[3],
) {
  return checkEvidence(boardMismatches(computed, published), published, watchlist, data);
}

test("reports live board equality, watchlist coverage and matching diagnostic populations", () => {
  const checks = integrityChecks([computed], [row], ["a", "a"], data);
  expect(checks.map(({ pass }) => pass)).toEqual([true, true, true, true, true]);
  expect(checks.map(({ label }) => label)).toEqual([
    "Recompute = board.json · launch values, odds, implied values, ranks, plans, economics (1)",
    "Watchlist 1/1 on board",
    "House rule 1/1 recall · 1 extra explained by parentProtocol",
    "104/128 held-out traded caps inside P10–P90",
    "Launch value LOO error ×3.46 vs ×5.07 flat",
  ]);
});

test("marks each failed check and handles unavailable validation", () => {
  const checks = integrityChecks([{ ...computed, implied_value_usd: 21 }], [row], ["missing"], {
    ...data,
    houseRule: { ...data.houseRule, truePositives: [], falseNegatives: ["missing"] },
    intervalCounts: { missLow: 20, covered: 70, missHigh: 38 },
    loo: { ...data.loo, model: { ...data.loo.model, medianMultiplier: null } },
  });
  expect(checks.map(({ pass }) => pass)).toEqual([false, false, false, false, false]);
  expect(checks[0]?.label).toContain("1 mismatch");
  expect(checks[1]?.label).toContain("0/1");
  expect(checks[4]?.label).toContain("—");
  const unavailable = integrityChecks([computed], [row], ["a"], {
    ...data,
    intervalCounts: { missLow: 0, covered: 0, missHigh: 0 },
  });
  expect(unavailable[3]?.pass).toBe(false);
  expect(unavailable[3]?.label).toContain("0/128");
});

test.each([
  { missLow: -1, covered: 129, missHigh: 0 },
  { missLow: 11.5, covered: 104, missHigh: 12.5 },
])("rejects impossible coverage counts even when they add up to the fit (%o)", (intervalCounts) => {
  const checks = integrityChecks([computed], [row], ["a"], { ...data, intervalCounts });
  expect(checks[3]?.pass).toBe(false);
});

test("flags the row whose published $10K cost increased by $1,000", () => {
  const unchanged = { ...row, slug: "unchanged", rank: 2 };
  const changed = {
    ...row,
    farm_economics: {
      ...farm,
      deposits: [deposits[0], { ...deposits[1], costUsd: deposits[1].costUsd + 1_000 }],
    },
  };
  const checks = integrityChecks(
    [computed, { ...computed, protocol: { slug: unchanged.slug }, rank: unchanged.rank }],
    [changed, unchanged],
    [row.slug],
    data,
  );
  expect(checks[0]?.pass).toBe(false);
  expect(integrityStrip(checks)).toContain(
    '<li class="check-failed">✗ Recompute ≠ board.json · launch values, odds, implied values, ranks, plans, economics (1 mismatched · a)</li>',
  );
});

test("checks board membership even when a watchlist row exists only in the recompute", () => {
  const checks = integrityChecks([computed], [], ["a"], data);
  expect(checks[1]).toEqual({ pass: false, label: "Watchlist 0/1 on board" });
});

test.each([
  { plan_chain: "Another chain" },
  { plan_one_time_cost_usd: plan.oneTimeCostUsd + 1 },
  { plan_recurring_cost_usd: plan.recurringCostUsd + 1 },
  { plan_total_cost_usd: plan.totalCostUsd + 1_000 },
  { plan_total_minutes: plan.totalMinutes + 1 },
  { farm_steps: undefined },
  { farm_steps: { length: 1, 0: "plan" } },
  { farm_economics: undefined },
  { farm_economics: { ...farm, deposits: { ...deposits, length: 2 } } },
])("shows a red badge with the slug for missing, malformed or changed fields (%o)", (change) => {
  const checks = integrityChecks([computed], [{ ...row, ...change } as typeof row], ["a"], data);
  expect(checks[0]?.pass).toBe(false);
  expect(integrityStrip(checks)).toContain(
    'class="check-failed">✗ Recompute ≠ board.json · launch values, odds, implied values, ranks, plans, economics (1 mismatched · a)',
  );
});

test("reports a null published row using the recomputed slug", () => {
  const checks = integrityChecks([computed], [null], ["a"], data);
  expect(checks[0]).toMatchObject({
    pass: false,
    label: expect.stringContaining("mismatched · a"),
  });
});

test("rechecks the house rule when a below-floor protocol on the board joins the watchlist", () => {
  const watchlist = ["a", "b"];
  const { houseRule } = buildRadar(
    {
      as_of: "2026-11-14",
      source: "House-rule test",
      floor_usd: 100,
      protocols: [
        protocol({ slug: "a", listed_at: "2026-11-01" }),
        protocol({ slug: "b", tvl_usd: 10, listed_at: "2026-11-01" }),
        protocol({ slug: "traded", gecko_id: "traded", mcap_usd: 1000 }),
      ],
      watchlist,
    },
    { lambda: 1, terms: [] },
    [],
    farmTables(),
  );
  const checks = integrityChecks([], [row, { ...row, slug: "b" }], watchlist, {
    ...data,
    houseRule,
  });
  expect(checks[1]).toEqual({ pass: true, label: "Watchlist 2/2 on board" });
  expect(checks[2]).toEqual({ pass: false, label: "House rule 1/2 recall" });
});

test.each([
  [1, 128],
  [128, 1],
])("reports undersized coverage and LOO populations (%i and %i)", (modelN, flatN) => {
  const checks = integrityChecks([computed], [row], ["a"], {
    ...data,
    intervalCounts: { missLow: 0, covered: 1, missHigh: 0 },
    loo: {
      model: { ...data.loo.model, n: modelN },
      flatMultiple: { ...data.loo.flatMultiple, n: flatN },
    },
  });
  expect(checks[3]?.pass).toBe(false);
  expect(checks[3]?.label).toContain("1/128");
  expect(checks[4]?.pass).toBe(false);
  expect(checks[4]?.label).toContain(`${modelN}/128`);
  expect(checks[4]?.label).toContain(`${flatN}/128`);
});
