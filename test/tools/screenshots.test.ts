import { expect, test } from "vitest";
import type { BoardRows } from "../../src/application/board-rows.ts";
import type { CensusRecord } from "../../src/domain/census/census.ts";
import { assertExcludedRows, shotStates } from "../../tools/screenshots.ts";

type ShotRow = Pick<BoardRows["rows"][number], "slug" | "rank" | "farm_economics">;

function row(rank: number, verdict: "THIN" | "FARM" | "SKIP"): ShotRow {
  const deposit = { expectedValueUsd: 1, costUsd: 1, netUsd: 0, netPerHourUsd: 0 };
  return {
    slug: `row-${rank}`,
    rank,
    farm_economics: {
      launchProbability12: 0.5,
      breakEvenDepositUsd: "never",
      deposits: [
        { ...deposit, depositUsd: 1_000, verdict: "SKIP" },
        { ...deposit, depositUsd: 10_000, verdict },
      ],
    },
  };
}

test("chooses the highest-ranked $10K non-SKIP plan, independent of input order", () => {
  expect(shotStates({ rows: [row(5, "FARM"), row(1, "SKIP"), row(2, "THIN")] })).toEqual([
    { name: "1-board", hash: "#/" },
    { name: "2-detail", hash: "#/p/row-2" },
    { name: "3-filtered", hash: "#/census?status=excluded" },
    { name: "4-method", hash: "#/method" },
  ]);
});

test("validates the visible rows against the excluded census in descending TVL order", () => {
  const record = (slug: string, tvl_usd: number, status: CensusRecord["status"]): CensusRecord => ({
    slug,
    name: slug,
    tvl_usd,
    status,
    category: null,
    familyKey: `slug:${slug}`,
    reason: "Product reason.",
  });
  const census = [
    record("b", 50, "excluded"),
    record("c", 200, "traded"),
    record("m", 100, "excluded"),
    record("a", 50, "excluded"),
  ];
  const high = ["m", "Excluded by the house rule", "Product reason.", "$100"];
  const low = ["a", "Excluded by the house rule", "Product reason.", "$50"];
  expect(() => assertExcludedRows(census, [high, low])).not.toThrow();
  expect(() => assertExcludedRows(census, [])).toThrow(/visible rows/i);
  expect(() => assertExcludedRows(census, [low, high])).toThrow(/descending TVL/i);
  expect(() =>
    assertExcludedRows(census, [["c", "Token trades", "Product reason.", "$200"]]),
  ).toThrow(/excluded/i);
});

test("reports when no $10K non-SKIP plan can be shown", () => {
  expect(() => shotStates({ rows: [row(1, "SKIP")] })).toThrow(/no .*\$10K/i);
});
