import type { BoardRows } from "./board-rows.ts";
import { toBoardRows } from "./board-rows.ts";

export { formatUsd } from "../domain/shared/money.ts";
export { daysBetween, parseSnapshot } from "../domain/snapshot.ts";
export type { BoardRows } from "./board-rows.ts";
export type { RadarRow } from "./build-radar.ts";
export { recomputeRadar as buildRadar } from "./build-radar.ts";

type BoardRow = BoardRows["rows"][number];

function samePrecision(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= 1e-12;
}

export function toBoard(
  radar: Parameters<typeof toBoardRows>[0],
  published: readonly BoardRow[] = [],
): BoardRows {
  const board = toBoardRows(radar);
  for (const [index, row] of board.rows.entries()) {
    const reference = published[index];
    if (!reference || row.slug !== reference.slug) continue;
    const a = row.decomposition;
    const b = reference.decomposition;
    // Math.log and Math.exp can differ in the last digits across engines. Preserve equivalent published factors.
    if (
      samePrecision(a.base, b.base) &&
      samePrecision(a.multipliers.lnTvl, b.multipliers.lnTvl) &&
      samePrecision(a.multipliers.growth, b.multipliers.growth) &&
      samePrecision(a.multipliers.lnAge, b.multipliers.lnAge)
    ) {
      row.decomposition = b;
    }
  }
  return board;
}
