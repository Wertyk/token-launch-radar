import { readFileSync } from "node:fs";
import { beforeAll, expect, test } from "vitest";
import { toBoardRows } from "../../src/application/board-rows.ts";
import { buildRadar, recomputeRadar } from "../../src/application/build-radar.ts";
import { ASSUMPTIONS_AS_OF, FARM_ASSUMPTIONS } from "../../src/domain/farming/assumptions.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import { planPortfolio } from "../../src/domain/farming/portfolio.ts";
import { launchProbability12 } from "../../src/domain/launch-clock/clock.ts";
import type { Snapshot } from "../../src/domain/snapshot.ts";
import { parseSnapshot } from "../../src/domain/snapshot.ts";
import { valueFeatures } from "../../src/domain/valuation/model.ts";
import { parsePlanState } from "../../src/presentation/web/plan-state.ts";

const snapshotPath =
  process.env.RADAR_SNAPSHOT ?? "../token-radar-kit/token-radar-01-kit/input/snapshot.json";

function readSnapshot(): Snapshot {
  let json: string;
  try {
    json = readFileSync(snapshotPath, "utf8");
  } catch (cause) {
    throw new Error(
      `Could not read kit snapshot at ${snapshotPath}. Set RADAR_SNAPSHOT to its path.`,
      {
        cause,
      },
    );
  }
  return parseSnapshot(JSON.parse(json));
}

let snapshot: Snapshot;
let result: ReturnType<typeof buildRadar>;

beforeAll(() => {
  snapshot = readSnapshot();
  result = buildRadar(snapshot);
}, 20_000);

test("the kit snapshot produces a complete, valid and deterministic board", () => {
  const { census, board } = result;

  expect(census).toHaveLength(758);
  expect(census.map(({ slug }) => slug)).toEqual(snapshot.protocols.map(({ slug }) => slug));
  const counts = new Map<string, number>();
  for (const { status } of census) counts.set(status, (counts.get(status) ?? 0) + 1);
  expect(Object.fromEntries(counts)).toEqual({
    traded: 128,
    "token-unpriced": 288,
    excluded: 144,
    "pre-token": 198,
  });
  expect(
    census.map(({ slug, name, category, tvl_usd }) => ({ slug, name, category, tvl_usd })),
  ).toEqual(
    snapshot.protocols.map(({ slug, name, category, tvl_usd }) => ({
      slug,
      name,
      category,
      tvl_usd,
    })),
  );
  for (const { reason, familyKey } of census) {
    expect(reason.trim()).not.toBe("");
    expect(familyKey.trim()).not.toBe("");
  }
  const { houseRule } = result;
  expect(houseRule.truePositives).toEqual([...snapshot.watchlist].sort());
  expect(houseRule.falsePositives).toHaveLength(20);
  expect(houseRule.falseNegatives).toEqual([]);
  expect(houseRule.recall).toBe(1);
  expect(houseRule.precision).toBe(2 / 3);
  expect(result.model.n).toBe(128);
  expect(snapshot.watchlist).toHaveLength(40);
  expect(board).toHaveLength(198);
  const boardSlugs = new Set(board.map(({ protocol: row }) => row.slug));
  expect(boardSlugs.size).toBe(board.length);
  expect(boardSlugs).toEqual(
    new Set([
      ...snapshot.watchlist,
      ...census.filter(({ status }) => status === "pre-token").map(({ slug }) => slug),
    ]),
  );
  expect(new Set(board.map(({ implied_value_usd }) => implied_value_usd)).size).toBeGreaterThan(1);
  let previousValue = Number.POSITIVE_INFINITY;
  let previousSlug = "";
  const watchlist = new Set(snapshot.watchlist);
  const excludedCategories = [
    "Bridge",
    "Canonical Bridge",
    "Liquid Staking",
    "Liquid Restaking",
    "Restaked BTC",
    "CEX",
  ];
  for (const [index, row] of board.entries()) {
    expect(row.rank).toBe(index + 1);
    expect(Number.isInteger(row.implied_value_usd)).toBe(true);
    expect(row.implied_value_usd).toBeGreaterThan(0);
    expect(row.implied_value_usd).toBeLessThanOrEqual(1e14);
    expect(row.implied_value_usd).toBeLessThanOrEqual(previousValue);
    if (row.implied_value_usd === previousValue)
      expect(previousSlug < row.protocol.slug).toBe(true);
    previousValue = row.implied_value_usd;
    previousSlug = row.protocol.slug;
    if (!watchlist.has(row.protocol.slug)) {
      expect(excludedCategories, row.protocol.slug).not.toContain(row.protocol.category);
    }
    expect(row.farm_steps.length).toBeGreaterThanOrEqual(3);
    expect(row.farm_steps.length).toBeLessThanOrEqual(12);
    if (row.protocol.chains.length === 0) {
      expect(row.plan.chain).toBeNull();
    } else {
      expect(row.protocol.chains).toContain(row.plan.chain);
    }
    for (const step of row.farm_steps) {
      expect(step.trim().length).toBeGreaterThanOrEqual(20);
      expect(step.trim().length).toBeLessThanOrEqual(600);
    }
  }
  const recomputed = recomputeRadar(
    snapshot,
    result.model.lambda,
    result.launchClock,
    farmTables(),
  );
  expect(toBoardRows({ board: recomputed.board, houseRule })).toEqual(toBoardRows(result));
});

test("the parent flag still matches the house-rule audit on the published kit board", () => {
  const board = toBoardRows(result);
  const flag = "parent-protocol-likely";
  expect(
    board.rows
      .filter(({ flags }) => flags.includes(flag))
      .map(({ slug }) => slug)
      .sort(),
  ).toEqual(result.houseRule.falsePositives.map(({ slug }) => slug));
});

test("documents the age inputs computed for undated rows in the sealed snapshot", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  const { model, launchClock } = result;
  const modelAge = Math.round(Math.exp(model.medianLnAge));
  expect(modelAge).toBe(1000);
  expect(launchClock.medianAgeDays).toBe(677);
  const readmeModelAge = readme.match(
    /median log age among dated fit families \(equivalent to ([\d,]+) days/,
  )?.[1];
  expect(Number(readmeModelAge?.replaceAll(",", ""))).toBe(modelAge);
  expect(readme).toContain(
    `median age across its dated protocols (${launchClock.medianAgeDays} days`,
  );
  expect(readme).toContain("one-day floor");
  expect(readme).toContain("cannot validate future launch odds");
  const row = result.board.find(({ protocol }) => protocol.listed_at === null);
  if (!row) throw new Error("Expected an undated board row");
  expect(row.features.lnAge).toBe(model.medianLnAge);
  expect(row.launchProbability12).toBe(launchProbability12(launchClock.points, 677));
  expect(
    valueFeatures({ ...row.protocol, listed_at: snapshot.as_of }, snapshot.as_of, model.medianLnAge)
      .features.lnAge,
  ).toBe(0);
});

test("the nested kit LOO model matches or improves on the flat multiple", () => {
  const { validation, ablation } = result.model;
  const loo = validation.leaveOneFamilyOut;
  expect(loo.model.n).toBe(128);
  expect(loo.flatMultiple.n).toBe(128);
  expect(loo.categoryMultiple.n).toBe(128);
  expect(validation.seededFiveFold.model.n).toBe(128);
  expect(validation.walkForward.model.n).toBe(38);
  expect(loo.model.medianMultiplier).not.toBeNull();
  expect(loo.flatMultiple.medianMultiplier).not.toBeNull();
  expect(loo.model.medianMultiplier).toBeLessThanOrEqual(loo.flatMultiple.medianMultiplier ?? 0);
  expect(ablation.full).toEqual(loo.model);
  expect(ablation.withCategory.medianMultiplier).toBeGreaterThan(loo.model.medianMultiplier ?? 0);
  for (const score of Object.values(ablation)) {
    expect(score.n).toBe(128);
    expect(score.medianMultiplier).not.toBeNull();
    expect(score.spearman).not.toBeNull();
  }
});

test("kit farm plans vary in costs and time and publish two verdicts per protocol", () => {
  const { rows } = toBoardRows(result);
  expect(ASSUMPTIONS_AS_OF).toBe(snapshot.as_of);
  expect(new Set(rows.map((row) => row.plan_total_minutes)).size).toBeGreaterThan(1);
  expect(new Set(rows.map((row) => row.plan_total_cost_usd)).size).toBeGreaterThan(11);
  for (const row of rows) {
    expect(row.farm_steps.at(-1)).toMatch(/^Economics at \$1,000 over 12 months/);
    expect(row.airdrop_yield_apr).toBeCloseTo(
      (row.launch_value_usd / row.tvl_usd) * 0.25 * 0.5 * row.farm_economics.launchProbability12,
      12,
    );
    expect(row.farm_economics.deposits.map(({ depositUsd }) => depositUsd)).toEqual([
      1_000, 10_000,
    ]);
    expect(row.flags.includes("fee-assumed")).toBe(
      result.board[row.rank - 1]?.plan.flags.includes("fee-assumed"),
    );
  }
});

test("the kit planner rejects BTCFi CDP when the route allows 2.4 minutes per week", () => {
  const { budgetUsd, hoursPerWeek } = parsePlanState("#/plan?budget=10001&hours=0.04");
  const { positions, closest } = planPortfolio(result.board, {
    budgetUsd,
    hoursPerWeek,
    assumptions: { ...FARM_ASSUMPTIONS, tables: farmTables() },
  });
  expect(positions.map(({ slug }) => slug)).not.toContain("btcfi-cdp");
  expect(closest).toEqual([]);
});
