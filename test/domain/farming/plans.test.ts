import { expect, test } from "vitest";
import { ASSUMPTIONS_AS_OF, FARM_ASSUMPTIONS } from "../../../src/domain/farming/assumptions.ts";
import { estimateFarmEconomics, renderEconomics } from "../../../src/domain/farming/economics.ts";
import { makeFarmPlan as buildPlan, renderFarmStep } from "../../../src/domain/farming/plans.ts";
import { farmTables } from "../../../src/domain/farming/playbook-data.ts";
import { protocol } from "../protocol-fixture.ts";

const horizonOccurrences = { once: 1, weekly: 52, monthly: 12 };
const tables = farmTables();

function makeFarmPlan(record: ReturnType<typeof protocol>, depositUsd = 1_000) {
  return buildPlan(record, tables, { depositUsd });
}

const playbooks = [
  ["Dexs", /pool/i, 0],
  ["Uncollateralized Lending", /supply/i, 0],
  ["CDP", /collateral/i, 0],
  ["Liquid Restaking", /stake/i, 0],
  ["Yield Aggregator", /vault/i, 0],
  ["Risk Curators", /vault/i, 0],
  ["Onchain Capital Allocator", /vault/i, 0],
  ["Interest Rate Derivatives", /margin/i, 0.05],
  ["Canonical Bridge", /destination/i, 0.05],
  ["RWA", /KYC/i, 0],
  ["Prediction Market", /resolution/i, 0.05],
  [null, /documented/i, 0.05],
] as const;

test.each([
  [
    "Yield",
    "Before depositing $1,000 into a vault on Base",
    "allocation weights",
    "Redeem vault shares",
  ],
  ["Lending", "Supply $1,000 on Base.", "supply rate", "withdrawing the supplied assets"],
  ["Dexs", "Add $1,000 to a liquidity pool on Base.", "Track pool share", "Remove liquidity"],
])(
  "renders concrete %s actions with the planned amounts and fees",
  (category, entry, review, exit) => {
    const plan = makeFarmPlan(protocol({ category, name: "Sample Finance", chains: ["Base"] }));
    const steps = plan.steps.map(renderFarmStep);
    const gas = category === "Dexs" ? "$2.70" : "$0.10";
    expect(plan.steps[0]?.action).toBe(`Set aside $1,000 and keep about ${gas} for gas on Base.`);
    expect(steps[1]).toContain("If your funds sit on another chain, bridge $1,000 to Base.");
    expect(steps[1]).toContain("Est. fee $0.30 | 10 minutes | once");
    expect(steps[2]).toContain(entry);
    expect(steps[3]).toContain(review);
    expect(steps[4]).toContain(exit);
  },
);

test("renders a chainless plan with the selected deposit and a chain verification step", () => {
  const plan = makeFarmPlan(
    protocol({ name: "Sample Finance", category: "Yield", chains: [] }),
    250,
  );
  const steps = plan.steps.map(renderFarmStep);
  expect(steps[0]).toContain("Verify a supported chain");
  expect(steps[1]).toContain(
    "If your funds sit on another chain, bridge $250 to a verified chain.",
  );
  expect(steps[1]).toContain("Est. fee $2.50 | 10 minutes | once");
  expect(steps[2]).toContain("Before depositing $250 into a vault on a verified chain");
});

test("uses the bridge itself for the transfer action and estimates its fee once", () => {
  const plan = makeFarmPlan(
    protocol({ name: "Sample Finance", category: "Bridge", chains: ["Base"] }),
  );
  expect(plan.fundingStep).toBeNull();
  expect(plan.steps.map(renderFarmStep)[1]).toContain("Quote a $1,000 transfer from Base.");
  expect(plan.oneTimeCostUsd).toBe(0.3);
});

test("preserves the funding condition when long chain names shorten the rendered action", () => {
  const plan = makeFarmPlan(
    protocol({
      name: "Long protocol name ".repeat(30),
      chains: ["Long chain label ".repeat(30)],
    }),
  );
  expect(plan.steps.map(renderFarmStep)[1]).toMatch(
    /^If your funds sit on another chain, bridge \$1,000 to Long chain label/,
  );
});

test.each([" Uncollateralized Lending ", "Uncollateralized Credit"])(
  "uses supply and withdrawal wording for %s without changing its plan estimates",
  (category) => {
    const record = protocol({ name: "Sample Finance", chains: ["Base"], category });
    const plan = makeFarmPlan(record, 250);
    const baselineCategory = category.trim() === "Uncollateralized Lending" ? "Lending" : null;
    const baseline = makeFarmPlan({ ...record, category: baselineCategory }, 250);
    const steps = plan.steps.map(renderFarmStep);
    expect(steps[2]).toContain("Supply $250 on Base");
    expect(steps[4]).toContain("Withdraw the supplied funds");
    expect(steps.join(" ")).not.toMatch(/\bcollateral\b|liquidation/i);
    expect(plan.steps.map(({ costUsd, minutes, cadence }) => [costUsd, minutes, cadence])).toEqual(
      baseline.steps.map(({ costUsd, minutes, cadence }) => [costUsd, minutes, cadence]),
    );
  },
);

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

test("prices both transactions in each derivatives round trip at fixed planned turnover", () => {
  const plan = makeFarmPlan(protocol({ chains: ["Ethereum"], category: "Derivatives" }));
  const trade = plan.steps.find(({ action }) => /volume/i.test(action));
  expect(trade?.cadence).toBe("weekly");
  expect(trade?.action).toContain("$200");
  expect(trade?.action).toContain("0.06%");
  expect(trade?.costUsd).toBe(6.12); // $0.12 trading fee plus two $3 transactions
  expect(plan.recurringCostUsd).toBe(318.24);
  expect(
    makeFarmPlan(protocol({ chains: ["Ethereum"], category: "Derivatives" }), 10_000).totalCostUsd,
  ).toBe(plan.totalCostUsd);
});

test("counts both derivatives transactions when comparing chains", () => {
  const chains = ["Lower gas", "Lower bridge"];
  const plan = buildPlan(protocol({ chains, category: "Derivatives" }), {
    ...tables,
    gas: { ...tables.gas, chains: { "Lower gas": [0.01, 1], "Lower bridge": [0.02, 0.2] } },
  });
  // With 106 transactions, $2.06 in gas and bridge costs beats $2.32.
  expect(plan.chain).toBe("Lower gas");
  expect(plan.steps.find(({ cadence }) => cadence === "weekly")?.costUsd).toBe(0.14);
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

test.each([
  ["Lending", /health factor.*liquidation buffer/i],
  ["CDP Manager", /collateral ratio.*liquidation ratio/i],
  ["Risk Curators", /allocation.*curator.*strategy/i],
  ["Onchain Capital Allocator", /allocation.*curator.*strategy/i],
  ["RWA", /peg.*redemption window/i],
  ["Dual-Token Stablecoin", /peg.*redemption window/i],
  ["Liquid Restaking", /withdrawal queue.*slashing/i],
  ["Dexs", /pool share.*impermanent loss/i],
  ["Basis Trading", /funding.*margin/i],
  ["Cross Chain Bridge", /transfer limits.*finality/i],
  ["Prediction Market", /resolution/i],
  ["Payments", /access.*withdrawal/i],
] as const)("includes the %s risk check without using a protocol name", (category, risk) => {
  const names = ["Aave", "Steakhouse Financial", "Uniswap", "Morpho"];
  for (const name of names) {
    const plan = makeFarmPlan(protocol({ category, name }));
    expect(plan.steps.some(({ action }) => risk.test(action))).toBe(true);
    expect(plan.steps.map(renderFarmStep).join(" ")).not.toMatch(new RegExp(names.join("|"), "i"));
  }
});

test("accrues weekly fees and labor only for whole review periods in the expected hold", () => {
  const record = protocol({ category: "Dexs", chains: ["Base"] });
  const plan = buildPlan(record, tables, { launchProbability12: 0.5 });
  // 52 × 0.5 / ln(2) = 37.51 weeks. Each review costs $0.05 and 8 minutes.
  expect(plan.holdWeeks).toBeCloseTo(26 / Math.LN2, 12);
  expect(plan.recurringCostUsd).toBe(1.85);
  expect(plan.totalMinutes).toBe(5 + 10 + 15 + 37 * 8 + 12);
  const nearCertain = buildPlan(record, tables, { launchProbability12: 1 });
  expect(nearCertain.recurringCostUsd).toBe(0);
  expect(nearCertain.totalMinutes).toBe(42);
});
