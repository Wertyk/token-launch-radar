import { expect, test } from "vitest";
import { buildRadar } from "../../src/application/browser-api.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import { integrityChecks } from "../../src/presentation/web/integrity.ts";
import { protocol } from "../domain/protocol-fixture.ts";

const deposits = [
  { depositUsd: 1000, expectedValueUsd: 3, costUsd: 4, verdict: "SKIP" },
  { depositUsd: 10000, expectedValueUsd: 30, costUsd: 40, verdict: "THIN" },
] as const;
const farm = { deposits, launchProbability12: 0.42, breakEvenDepositUsd: 1200 };
const row = {
  slug: "a",
  rank: 1,
  implied_value_usd: 20,
  farm_steps: ["plan"],
  airdrop_yield_apr: 0.03,
  launch_p12: 0.42,
  farm_economics: farm,
};
const computed = {
  ...row,
  protocol: { slug: row.slug },
  economics: { ...farm, airdropYieldApr: 0.03 },
};
const data = {
  fitted: 128,
  houseRule: {
    truePositives: ["a"],
    falsePositives: ["b"],
    falseNegatives: [],
  },
  intervalCounts: { missLow: 12, covered: 104, missHigh: 12 },
  loo: {
    model: { medianMultiplier: 3.4559, n: 128, spearman: 0.39 },
    flatMultiple: { medianMultiplier: 5.0696, n: 128, spearman: 0.42 },
  },
};

test("reports live board equality, watchlist coverage and matching diagnostic populations", () => {
  const checks = integrityChecks([computed], [row], ["a", "a"], data);
  expect(checks.map(({ pass }) => pass)).toEqual([true, true, true, true, true]);
  expect(checks.map(({ label }) => label)).toEqual([
    "Recompute = board.json: values, ranks, plans, economics (1)",
    "Watchlist 1/1 on board",
    "House rule 1/1 recall · 1 extra explained by parentProtocol",
    "104/128 inside P10–P90",
    "LOO median error ×3.46 vs ×5.07 flat",
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
  const unavailable = integrityChecks([computed], [row], ["a"], { ...data, intervalCounts: null });
  expect(unavailable[3]?.pass).toBe(false);
  expect(unavailable[3]?.label).toContain("0/128");
});

test("checks board membership even when a watchlist row exists only in the recompute", () => {
  const checks = integrityChecks([computed], [], ["a"], data);
  expect(checks[1]).toEqual({ pass: false, label: "Watchlist 0/1 on board" });
});

test("rechecks the house rule when a below-floor protocol on the board joins the watchlist", () => {
  const watchlist = ["a", "b"];
  const { houseRule } = buildRadar(
    {
      as_of: "2026-11-14",
      source: "House-rule test",
      floor_usd: 100,
      protocols: [
        protocol({ slug: "a" }),
        protocol({ slug: "b", tvl_usd: 10 }),
        protocol({ slug: "traded", gecko_id: "traded", mcap_usd: 1000 }),
      ],
      watchlist,
    },
    1,
    { points: [], medianAgeDays: null },
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
