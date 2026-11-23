import { expect, test } from "vitest";
import { integrityChecks } from "../../src/presentation/web/integrity.ts";

const row = { slug: "a", rank: 1, implied_value_usd: 20, farm_steps: ["plan"] };
const data = {
  houseRule: {
    truePositives: ["a"],
    falsePositives: [{ slug: "b", reason: "DefiLlama parentProtocol" }],
    falseNegatives: [],
    recall: 1,
    precision: 0.5,
  },
  intervalCounts: { missLow: 12, covered: 104, missHigh: 12 },
  loo: {
    model: { medianMultiplier: 3.4559, n: 128, spearman: 0.39 },
    flatMultiple: { medianMultiplier: 5.0696, n: 128, spearman: 0.42 },
  },
};

test("reports live board equality and watchlist coverage with published diagnostics", () => {
  const checks = integrityChecks([row], [row], ["a", "a"], data);
  expect(checks.map(({ pass }) => pass)).toEqual([true, true, true, true, true]);
  expect(checks.map(({ label }) => label)).toEqual([
    "Page recompute = board.json (1 rows)",
    "Watchlist 1/1 on board",
    "House rule 100% recall · 1 extra explained by parentProtocol",
    "104/128 inside P10–P90",
    "LOO median error ×3.46 vs ×5.07 flat",
  ]);
});

test("marks each failed check and handles unavailable validation", () => {
  const checks = integrityChecks([{ ...row, implied_value_usd: 21 }], [row], ["missing"], {
    houseRule: { ...data.houseRule, recall: 0 },
    intervalCounts: { missLow: 20, covered: 70, missHigh: 10 },
    loo: { ...data.loo, model: { ...data.loo.model, medianMultiplier: null } },
  });
  expect(checks.map(({ pass }) => pass)).toEqual([false, false, false, false, false]);
  expect(checks[0]?.label).toContain("1 mismatch");
  expect(checks[1]?.label).toContain("0/1");
  expect(checks[4]?.label).toContain("—");
  expect(integrityChecks([row], [row], ["a"], { ...data, intervalCounts: null })[3]).toEqual({
    pass: false,
    label: "P10–P90 coverage unavailable",
  });
});

test("checks board membership even when a watchlist row exists only in the recompute", () => {
  const checks = integrityChecks([row], [], ["a"], data);
  expect(checks[1]).toEqual({ pass: false, label: "Watchlist 0/1 on board" });
});
