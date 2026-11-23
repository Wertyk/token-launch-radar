import { expect, test } from "vitest";
import { ASSUMPTIONS_AS_OF, FARM_ASSUMPTIONS } from "../../../src/domain/farming/assumptions.ts";
import { estimateFarmEconomics, renderEconomics } from "../../../src/domain/farming/economics.ts";
import { makeFarmPlan as buildPlan, renderFarmStep } from "../../../src/domain/farming/plans.ts";
import { farmTables } from "../../../src/domain/farming/playbook-data.ts";
import { protocol } from "../protocol-fixture.ts";

const horizonOccurrences = { once: 1, weekly: 52, monthly: 12 };
const tables = farmTables();

function makeFarmPlan(record: ReturnType<typeof protocol>, depositUsd?: number) {
  return buildPlan(record, tables, depositUsd);
}

const playbooks = [
  ["Dexs", /pool/i, 0.02],
  ["CDP", /collateral/i, 0.02],
  ["Liquid Restaking", /stake/i, 0.02],
  ["Yield Aggregator", /vault/i, 0.02],
  ["Risk Curators", /vault/i, 0.02],
  ["Onchain Capital Allocator", /vault/i, 0.02],
  ["Interest Rate Derivatives", /margin/i, 0.05],
  ["Canonical Bridge", /destination/i, 0.05],
  ["RWA", /KYC/i, 0.02],
  ["Prediction Market", /resolution/i, 0.05],
  [null, /documented/i, 0.05],
] as const;

for (const chains of [[], ["Unmapped Chain"]]) {
  test.each(playbooks)(
    "renders the %s playbook with a long name and fallback fees",
    (category, action, capitalApr) => {
      const plan = makeFarmPlan(
        protocol({ category, chains, name: "Very long protocol name ".repeat(60) }),
      );
      expect(plan.chain).toBe(chains[0] ?? null);
      expect(plan.flags).toEqual(["fee-assumed"]);
      expect(plan.depositUsd).toBe(1_000);
      expect(plan.capitalApr).toBe(capitalApr);
      expect(plan.steps.map((step) => step.action).join(" ")).toMatch(action);
      expect(plan.steps.at(-1)?.exitCondition).toBeTruthy();
      const economics = estimateFarmEconomics(plan, 8_000_000, 750_000, 0.5);
      const rendered = [...plan.steps.map(renderFarmStep), renderEconomics(economics)];
      expect(rendered.length).toBeGreaterThanOrEqual(3);
      expect(rendered.length).toBeLessThanOrEqual(12);
      for (const step of rendered) {
        expect(step).toBe(step.trim());
        expect(step.length).toBeGreaterThanOrEqual(20);
        expect(step.length).toBeLessThanOrEqual(600);
      }
      for (const [index, step] of plan.steps.entries()) {
        expect(step.chain).toBe(plan.chain);
        expect(rendered[index]).toContain(chains[0] ?? "Chain unlisted");
        expect(rendered[index]).toMatch(/\$\d/);
        expect(rendered[index]).toContain(`${step.minutes} minutes`);
        expect(rendered[index]).toContain(step.cadence);
      }
      let oneTime = 0;
      let recurring = 0;
      let minutes = 0;
      for (const { cadence, costUsd, minutes: activeMinutes } of plan.steps) {
        if (cadence === "once") oneTime += costUsd;
        else recurring += horizonOccurrences[cadence] * costUsd;
        minutes += horizonOccurrences[cadence] * activeMinutes;
      }
      expect(plan.oneTimeCostUsd).toBeCloseTo(oneTime, 8);
      expect(plan.recurringCostUsd).toBeCloseTo(recurring, 8);
      expect(plan.totalCostUsd).toBeCloseTo(oneTime + recurring, 8);
      expect(plan.totalMinutes).toBe(minutes);
      if (chains.length === 0) expect(plan.steps[0]?.action).toMatch(/verify/i);
    },
  );
}

test("uses dated fees and resolves equal estimates by the snapshot chain label", () => {
  expect(ASSUMPTIONS_AS_OF).toBe("2026-11-14");
  expect(FARM_ASSUMPTIONS.asOf).toBe(ASSUMPTIONS_AS_OF);
  expect(makeFarmPlan(protocol({ chains: ["Ethereum", "Base"] })).chain).toBe("Base");
  expect(makeFarmPlan(protocol({ chains: ["Unmapped Z", "Unmapped A"] })).chain).toBe("Unmapped A");
});

test.each([
  "Monad",
  "Hyperliquid L1",
  "Plasma",
  "Robinhood Chain",
  "Berachain",
  "Unichain",
  "Sonic",
  "Flare",
  "Bitcoin",
  "Stellar",
  "Linea",
  "Ink",
  "Mantle",
  "Starknet",
  "Aptos",
  "zkSync Era",
])("has a dated fee estimate for the %s snapshot label", (chain) => {
  const plan = makeFarmPlan(protocol({ chains: [chain] }));
  expect(plan.chain).toBe(chain);
  expect(plan.flags).toEqual([]);
});

test("uses the Binance alias with its original label and budgets a custom deposit", () => {
  const plan = makeFarmPlan(protocol({ chains: ["Avalanche", "Binance"] }), 1234.5);
  expect(plan.chain).toBe("Binance");
  expect(plan.flags).toEqual([]);
  expect(plan.depositUsd).toBe(1234.5);
  expect(plan.steps.map(renderFarmStep).join(" ")).toContain("$1,234.50");
  expect(plan.oneTimeCostUsd).toBe(0.7);
  expect(plan.recurringCostUsd).toBe(0);
  expect(makeFarmPlan(protocol({ chains: ["BSC"] })).totalCostUsd).toBe(plan.totalCostUsd);
});

test("uses the default gas and bridge allowance for an unknown chain", () => {
  const plan = makeFarmPlan(protocol({ chains: ["Unknown"] }));
  expect(plan.flags).toEqual(["fee-assumed"]);
  expect(plan.oneTimeCostUsd).toBe(3.4); // $2.50 bridge plus two $0.45 transactions
  expect(plan.recurringCostUsd).toBe(0);
});

test("includes recurring perps trading fees on fixed planned turnover", () => {
  const plan = makeFarmPlan(protocol({ chains: ["Base"], category: "Derivatives" }));
  const trade = plan.steps.find(({ action }) => /volume/i.test(action));
  expect(trade?.cadence).toBe("weekly");
  expect(trade?.action).toContain("$200");
  expect(trade?.action).toContain("0.06%");
  expect(trade?.costUsd).toBe(0.17); // $0.12 trading fee plus $0.05 gas
  expect(plan.recurringCostUsd).toBe(8.84);
  expect(
    makeFarmPlan(protocol({ chains: ["Base"], category: "Derivatives" }), 10_000).totalCostUsd,
  ).toBe(plan.totalCostUsd);
});

test("bounds text while preserving fee, duration and cadence", () => {
  const rendered = renderFarmStep({
    action: "Deposit ".repeat(150),
    chain: "Unmapped Chain ".repeat(150),
    costUsd: 0.42,
    minutes: 15,
    cadence: "monthly",
    exitCondition: "Check receipts. ".repeat(150),
  });
  expect(rendered.length).toBeLessThanOrEqual(600);
  expect(rendered).toContain("$0.42");
  expect(rendered).toContain("15 minutes");
  expect(rendered).toContain("monthly");
});
