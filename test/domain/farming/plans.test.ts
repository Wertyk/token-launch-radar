import { expect, test } from "vitest";
import {
  ASSUMPTIONS_AS_OF,
  DEFAULT_DEPOSIT_USD,
  makeFarmPlan,
  renderFarmStep,
} from "../../../src/domain/farming/plans.ts";
import { protocol } from "../protocol-fixture.ts";

test.each([
  ["Dexs", /liquidity pool/i],
  ["CDP", /collateral/i],
  ["Liquid Restaking", /restak/i],
  ["Yield Aggregator", /vault/i],
  ["Interest Rate Derivatives", /margin/i],
  ["Canonical Bridge", /destination/i],
  ["RWA", /eligibility/i],
  [null, /supported deposit/i],
] as const)(
  "renders the %s playbook with a long name and an unlisted gas rate",
  (category, action) => {
    const plan = makeFarmPlan(
      protocol({
        category,
        chains: ["Unmapped Chain"],
        name: "Very long protocol name ".repeat(20),
      }),
    );
    expect(plan.chain).toBe("Unmapped Chain");
    expect(plan.depositUsd).toBe(DEFAULT_DEPOSIT_USD);
    expect(plan.steps.map((step) => step.action).join(" ")).toMatch(action);
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.steps.length).toBeLessThanOrEqual(12);
    for (const step of plan.steps) {
      const rendered = renderFarmStep(step);
      expect(step.chain).toBe(plan.chain);
      expect(rendered).toBe(rendered.trim());
      expect(rendered.length).toBeGreaterThanOrEqual(20);
      expect(rendered.length).toBeLessThanOrEqual(600);
      expect(rendered).toContain("Unmapped Chain");
      expect(rendered).toMatch(/\$\d/);
      expect(rendered).toMatch(/\d+ minutes?/);
    }
  },
);

test("uses the cheapest available chain and resolves equal estimates by chain name", () => {
  expect(ASSUMPTIONS_AS_OF).toBe("2026-11-14");
  expect(makeFarmPlan(protocol({ chains: ["Ethereum", "Base"] })).chain).toBe("Base");
  expect(makeFarmPlan(protocol({ chains: ["Unmapped Z", "Unmapped A"] })).chain).toBe("Unmapped A");
});

test("records the selected deposit size and totals the estimated fees and minutes", () => {
  const plan = makeFarmPlan(protocol({ chains: ["Base"], category: "Lending" }), 1234.5);
  expect(plan.depositUsd).toBe(1234.5);
  expect(plan.steps.map(renderFarmStep).join(" ")).toContain("$1,234.50");
  expect(plan.totalCostUsd).toBeCloseTo(
    plan.steps.reduce((sum, step) => sum + step.costUsd, 0),
    12,
  );
  expect(plan.totalCostUsd).toBeLessThan(plan.depositUsd);
  expect(plan.totalMinutes).toBe(plan.steps.reduce((sum, step) => sum + step.minutes, 0));
});

test("renders a verification step when the snapshot has no chain", () => {
  const plan = makeFarmPlan(protocol({ chains: [] }));
  expect(plan.chain).toBeNull();
  expect(plan.steps[0]?.action).toMatch(/verify/i);
  expect(plan.steps.length).toBeGreaterThanOrEqual(3);
  expect(plan.steps.length).toBeLessThanOrEqual(12);
  for (const step of plan.steps) {
    const rendered = renderFarmStep(step);
    expect(step.chain).toBeNull();
    expect(rendered).toContain("Chain unlisted");
    expect(rendered).toMatch(/\$\d/);
    expect(rendered).toMatch(/\d+ minutes?/);
    expect(rendered.trim().length).toBeGreaterThanOrEqual(20);
    expect(rendered.trim().length).toBeLessThanOrEqual(600);
  }
});

test("bounds rendered text while preserving fee and duration", () => {
  const rendered = renderFarmStep({
    action: "Deposit ".repeat(150),
    chain: "Unmapped Chain ".repeat(150),
    costUsd: 0.42,
    minutes: 15,
    note: "Check receipts. ".repeat(150),
  });
  expect(rendered.length).toBeLessThanOrEqual(600);
  expect(rendered).toContain("$0.42");
  expect(rendered).toContain("15 minutes");
});
