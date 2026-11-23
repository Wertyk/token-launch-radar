import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { boardEntries, buildCensus } from "../../src/domain/census/census.ts";
import { makeFarmPlan, renderFarmStep } from "../../src/domain/farming/plans.ts";
import type { Snapshot } from "../../src/domain/snapshot.ts";
import { parseSnapshot } from "../../src/domain/snapshot.ts";
import { fitValueModel, rankBoard } from "../../src/domain/valuation/model.ts";

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

function domainResults(snapshot: Snapshot) {
  const census = buildCensus(snapshot.protocols);
  const model = fitValueModel(census, snapshot.as_of);
  const board = rankBoard(boardEntries(census, snapshot.watchlist), snapshot.as_of, model).map(
    (row) => {
      const plan = makeFarmPlan(row.protocol);
      return { ...row, plan, farm_steps: plan.steps.map(renderFarmStep) };
    },
  );
  return { census, model, board };
}

test("the kit snapshot produces a complete, valid and deterministic board", () => {
  const snapshot = readSnapshot();
  const result = domainResults(snapshot);
  const { census, board } = result;

  expect(census.map(({ protocol: row }) => row.slug)).toEqual(
    snapshot.protocols.map((row) => row.slug),
  );
  for (const { status, reason } of census) {
    expect(["traded", "token-unpriced", "pre-token", "excluded"]).toContain(status);
    expect(reason.trim()).not.toBe("");
  }
  expect(result.model.n).toBe(128);
  expect(snapshot.watchlist).toHaveLength(40);
  expect(board.length).toBeGreaterThanOrEqual(100);
  expect(board.length).toBeLessThanOrEqual(4000);
  const boardSlugs = new Set(board.map(({ protocol: row }) => row.slug));
  expect(boardSlugs.size).toBe(board.length);
  expect(boardSlugs).toEqual(
    new Set([
      ...snapshot.watchlist,
      ...census.filter(({ status }) => status === "pre-token").map(({ protocol: row }) => row.slug),
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
  expect(domainResults(snapshot)).toEqual(result);
});
