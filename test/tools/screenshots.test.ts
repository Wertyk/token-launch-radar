import { expect, test } from "vitest";
import type { BoardRows } from "../../src/application/board-rows.ts";
import { shotStates } from "../../tools/screenshots.ts";

type ShotRow = Pick<BoardRows["rows"][number], "slug" | "rank" | "farm_economics">;

function row(rank: number, verdict: "THIN" | "FARM" | "SKIP"): ShotRow {
  const deposit = { expectedValueUsd: 1, costUsd: 1 };
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
    { name: "3-method", hash: "#/method" },
    { name: "4-census", hash: "#/census" },
  ]);
});

test("reports when no $10K non-SKIP plan can be shown", () => {
  expect(() => shotStates({ rows: [row(1, "SKIP")] })).toThrow(/no .*\$10K/i);
});
