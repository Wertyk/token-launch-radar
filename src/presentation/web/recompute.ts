import type { BoardRows } from "../../application/browser-api.ts";

type CheckRow = Pick<
  BoardRows["rows"][number],
  "slug" | "rank" | "implied_value_usd" | "farm_steps"
>;

export function countBoardMismatches(
  computed: readonly CheckRow[],
  published: readonly CheckRow[],
): number {
  let count = Math.abs(computed.length - published.length);
  for (const [index, row] of computed.entries()) {
    const other = published[index];
    if (
      other &&
      (row.slug !== other.slug ||
        row.rank !== other.rank ||
        row.implied_value_usd !== other.implied_value_usd ||
        row.farm_steps.length !== other.farm_steps.length ||
        row.farm_steps.some((step, i) => step !== other.farm_steps[i]))
    ) {
      count++;
    }
  }
  return count;
}
