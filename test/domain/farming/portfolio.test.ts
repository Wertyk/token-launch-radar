import { expect, test } from "vitest";
import { FARM_ASSUMPTIONS } from "../../../src/domain/farming/assumptions.ts";
import { makeFarmPlan, scheduleFarmMinutes } from "../../../src/domain/farming/plans.ts";
import { farmTables } from "../../../src/domain/farming/playbook-data.ts";
import { planPortfolio } from "../../../src/domain/farming/portfolio.ts";
import { mulberry32 } from "../../../src/domain/shared/prng.ts";
import { protocol } from "../protocol-fixture.ts";

const tables = farmTables();
const assumptions = { ...FARM_ASSUMPTIONS, tables };

function row(
  slug: string,
  rank: number,
  value = 8_000_000,
  chains = ["Base"],
  category = "Lending",
) {
  const record = protocol({ slug, category, tvl_usd: 10_000_000, chains });
  return {
    protocol: record,
    rank,
    launch_value_usd: value,
    plan: makeFarmPlan(record, tables),
    economics: { launchProbability12: 1 },
  };
}

test("requires cash for the deposit and its fees, including at zero budget", () => {
  for (const budgetUsd of [0, 1_000, 1_000.39]) {
    const result = planPortfolio([row("a", 1)], { budgetUsd, hoursPerWeek: 3, assumptions });
    expect(result.positions).toEqual([]);
    expect(result.rejected).toEqual([{ slug: "a", reason: "over-budget" }]);
  }
  const budgetUsd = 1_000.4;
  const result = planPortfolio([row("a", 1)], { budgetUsd, hoursPerWeek: 3, assumptions });
  expect(result.totals.cashUsd).toBe(budgetUsd);
});

test("requires enough weekly time for a whole plan", () => {
  const result = planPortfolio([row("a", 1)], {
    budgetUsd: 5_000,
    hoursPerWeek: 0.01,
    assumptions,
  });
  expect(result.positions).toEqual([]);
  expect(result.rejected).toEqual([{ slug: "a", reason: "over-hours" }]);
});

test("counts weekly actions in the same week as entry", () => {
  const rows = [row("a", 1, 80_000_000, ["Base"], "Dexs")];
  const options = { budgetUsd: 5_000, assumptions };
  expect(planPortfolio(rows, { ...options, hoursPerWeek: 0.6 }).positions).toEqual([]);
  // Setup, funding, deposit and the first review take 5 + 10 + 15 + 8 minutes.
  expect(planPortfolio(rows, { ...options, hoursPerWeek: 38 / 60 }).positions).toHaveLength(1);
});

test("counts the last monthly review in the same week as exit", () => {
  const candidate = row("a", 1);
  const { lending } = tables.playbooks;
  if (!lending) throw new Error("Expected a lending playbook.");
  const customPlan = makeFarmPlan(candidate.protocol, {
    ...tables,
    playbooks: { ...tables.playbooks, lending: { ...lending, minutes: [12, 20, 35] } },
  });
  const rows = [{ ...candidate, plan: customPlan }];
  const options = { budgetUsd: 5_000, assumptions };
  expect(planPortfolio(rows, { ...options, hoursPerWeek: 0.9 }).rejected).toEqual([
    { slug: "a", reason: "over-hours" },
  ]);
  expect(planPortfolio(rows, { ...options, hoursPerWeek: 55 / 60 }).positions).toHaveLength(1);
});

test("caps the combined weekly schedule and counts shared funding once", () => {
  const rows = [row("a", 1), row("b", 2)];
  const options = { budgetUsd: 20_001, assumptions };
  // Both entries take 44 minutes in the first week, including one funding transfer.
  expect(planPortfolio(rows, { ...options, hoursPerWeek: 0.7 }).positions).toHaveLength(1);
  expect(planPortfolio(rows, { ...options, hoursPerWeek: 0.75 }).positions).toHaveLength(2);
});

test("rejects horizons other than 12 months", () => {
  expect(() =>
    planPortfolio([row("a", 1)], {
      budgetUsd: 5_000,
      hoursPerWeek: 3,
      assumptions: { ...assumptions, horizonMonths: 6 },
    }),
  ).toThrow(/only supports a 12-month horizon/i);
});

test("uses a supported chain from the filter, including when the published plan uses another", () => {
  const result = planPortfolio([row("a", 1), row("b", 2, 8_000_000, ["Base", "Solana"])], {
    budgetUsd: 5_000,
    hoursPerWeek: 3,
    chains: ["Solana"],
    assumptions,
  });
  expect(result.positions).toMatchObject([{ slug: "b", chain: "Solana", depositUsd: 2_500 }]);
  expect(result.rejected).toEqual([{ slug: "a", reason: "chain-excluded" }]);
});

test("rescores after paying for funding and charges its fee and time once per chain", () => {
  const result = planPortfolio(
    [row("a", 3, 8_800_000), row("b", 2), row("c", 1, 8_010_000, ["Optimism"])],
    { budgetUsd: 4_501, hoursPerWeek: 3, assumptions },
  );
  expect(
    result.positions.map(({ slug, depositUsd, feesUsd }) => [slug, depositUsd, feesUsd]),
  ).toEqual([
    ["a", 2_500, 0.4],
    ["b", 1_000, 0.1],
    ["c", 1_000, 0.49],
  ]);
  const first = result.positions[0];
  // $8.8M × 25% × 50% / $10M × $2,500 = $275 EV. Fees, $25/hr and 2% carry make up cost.
  expect(first?.expectedValueUsd).toBe(275);
  expect(first?.costUsd).toBeCloseTo(0.4 + (109 / 60) * 25 + 50, 10);
  expect(first?.netUsd).toBeCloseTo(275 - (0.4 + (109 / 60) * 25 + 50), 10);
  expect(result.positions[1]?.hoursPerWeek).toBeCloseTo(99 / (52 * 60), 12);
  expect(result.positions[1]?.costUsd).toBeCloseTo(0.1 + (99 / 60) * 25 + 20, 10);
  expect(result.totals.cashUsd).toBe(4_500.99);
  expect(result.totals.hoursPerWeek).toBeCloseTo((109 + 99 + 109) / (52 * 60), 12);
});

test("requires $20,016 for two Ethereum protocols with their own $8 transfers", () => {
  // At a 5.5% expected yield, $10,000 is the only deposit above break-even.
  const rows = [
    row("a", 1, 4_400_000, ["Ethereum"], "Bridge"),
    row("b", 2, 4_400_000, ["Ethereum"], "Canonical Bridge"),
  ];
  const options = { hoursPerWeek: 3, assumptions };
  for (const budgetUsd of [20_008, 20_015.99]) {
    expect(planPortfolio(rows, { ...options, budgetUsd }).positions).toHaveLength(1);
  }
  const result = planPortfolio(rows, { ...options, budgetUsd: 20_016 });
  expect(result.positions).toMatchObject([
    { slug: "a", depositUsd: 10_000, feesUsd: 8 },
    { slug: "b", depositUsd: 10_000, feesUsd: 8 },
  ]);
  expect(result.totals.cashUsd).toBe(20_016);
});

test("a protocol transfer does not pay for funding a separate position", () => {
  const rows = [
    row("a", 1, 80_000_000, ["Ethereum"], "Bridge"),
    row("b", 2, 16_000_000, ["Ethereum"]),
  ];
  const result = planPortfolio(rows, { budgetUsd: 20_022, hoursPerWeek: 3, assumptions });
  expect(result.positions).toMatchObject([
    { slug: "a", depositUsd: 10_000, feesUsd: 8 },
    { slug: "b", depositUsd: 10_000, feesUsd: 14 },
  ]);
});

test("reports up to five distinct feasible near misses and the top fifteen rejected rows", () => {
  const rows = Array.from({ length: 17 }, (_, index) => row(String(index), 17 - index, 1_000_000));
  const result = planPortfolio(rows, { budgetUsd: 25_000, hoursPerWeek: 10, assumptions });
  expect(result.positions).toEqual([]);
  expect(result.closest.map(({ slug }) => slug)).toEqual(["0", "1", "10", "11", "12"]);
  for (const position of result.closest) {
    expect(position.depositUsd).toBe(1_000);
    expect(position.shortfallUsd).toBeCloseTo(0.4 + (109 / 60) * 25 + 20 - 12.5, 10);
  }
  expect(result.rejected).toEqual(
    Array.from({ length: 15 }, (_, index) => ({
      slug: String(16 - index),
      reason: "non-positive",
    })),
  );
  expect(
    planPortfolio([...rows].reverse(), { budgetUsd: 25_000, hoursPerWeek: 10, assumptions }),
  ).toEqual(result);
});

test("breaks score ties by slug, independently of input and board rank", () => {
  const rows = [row("z", 1), row("a", 2)];
  const options = { budgetUsd: 2_500.4, hoursPerWeek: 3, assumptions };
  const result = planPortfolio(rows, options);
  expect(result.positions.map(({ slug }) => slug)).toEqual(["a"]);
  expect(planPortfolio([...rows].reverse(), options)).toEqual(result);
});

test("keeps seeded portfolios within cash and weekly hours and selects each protocol once", () => {
  const random = mulberry32(18);
  for (let trial = 0; trial < 100; trial++) {
    const budgetUsd = Math.floor(random() * 40_000);
    const hoursPerWeek = random() / 2;
    const rows = Array.from({ length: 20 }, (_, index) =>
      row(String(index), index + 1, 20_000_000 * random(), index % 2 ? ["Base"] : ["Solana"]),
    );
    const { positions, totals } = planPortfolio(rows, { budgetUsd, hoursPerWeek, assumptions });
    const deposits = positions.reduce((sum, position) => sum + position.depositUsd, 0);
    const feesCents = positions.reduce(
      (sum, position) => sum + Math.round(position.feesUsd * 100),
      0,
    );
    const weeklyHours = positions.reduce((sum, position) => sum + position.hoursPerWeek, 0);
    expect(totals.cashUsd).toBe(deposits + feesCents / 100);
    expect(totals.cashUsd).toBeLessThanOrEqual(budgetUsd);
    expect(totals.hoursPerWeek).toBeCloseTo(weeklyHours, 12);
    expect(totals.hoursPerWeek).toBeLessThanOrEqual(hoursPerWeek);
    expect(new Set(positions.map(({ slug }) => slug)).size).toBe(positions.length);
    expect(positions.every(({ netUsd }) => netUsd > 0)).toBe(true);
  }
});

test("selects multiple seeded offers while limiting the busiest week", () => {
  const random = mulberry32(18);
  const rows = Array.from({ length: 5 }, (_, i) =>
    row(String(i), i + 1, 8_000_000 + 1_000_000 * random()),
  );
  const hoursPerWeek = 0.75;
  const { positions } = planPortfolio(rows, { budgetUsd: 60_000, hoursPerWeek, assumptions });
  expect(positions.length).toBeGreaterThanOrEqual(2);
  const selected = rows.filter(({ protocol }) =>
    positions.some(({ slug }) => slug === protocol.slug),
  );
  const weeklyMinutes = Array<number>(assumptions.weeksPerYear).fill(0);
  for (const [i, { plan }] of selected.entries()) {
    for (const [week, minutes] of scheduleFarmMinutes(plan).entries()) {
      const waived = i > 0 && week === 0 ? (plan.fundingStep?.minutes ?? 0) : 0;
      weeklyMinutes[week] = (weeklyMinutes[week] ?? 0) + minutes - waived;
    }
  }
  const busiestWeek = Math.max(...weeklyMinutes);
  expect(busiestWeek).toBe(44);
  expect(busiestWeek / assumptions.minutesPerHour).toBeLessThanOrEqual(hoursPerWeek);
});
