import type { RadarRow } from "../../application/browser-api.ts";

type Economics = RadarRow["economics"];
type RankedFields = Pick<RadarRow, "rank" | "implied_value_usd" | "farm_steps">;
export type RecomputedRow = RankedFields & {
  protocol: Pick<RadarRow["protocol"], "slug">;
  economics: Omit<Economics, "deposits"> & { deposits: Readonly<Economics["deposits"]> };
};
export type CheckRow = RankedFields & {
  slug: string;
  launch_p12: number;
  airdrop_yield_apr: number;
  farm_economics: Pick<Economics, "breakEvenDepositUsd" | "launchProbability12"> & {
    deposits: readonly Economics["deposits"][number][];
  };
};

export function countBoardMismatches(
  computed: readonly RecomputedRow[],
  published: readonly CheckRow[],
): number {
  let count = Math.abs(computed.length - published.length);
  for (const [index, row] of computed.entries()) {
    const other = published[index];
    const farm = other?.farm_economics;
    const {
      airdropYieldApr,
      launchProbability12: p12,
      breakEvenDepositUsd,
      deposits,
    } = row.economics;
    if (
      other &&
      (row.protocol.slug !== other.slug ||
        row.rank !== other.rank ||
        row.implied_value_usd !== other.implied_value_usd ||
        row.farm_steps.length !== other.farm_steps.length ||
        row.farm_steps.some((step, i) => step !== other.farm_steps[i]) ||
        airdropYieldApr !== other.airdrop_yield_apr ||
        p12 !== other.launch_p12 ||
        p12 !== farm?.launchProbability12 ||
        breakEvenDepositUsd !== farm.breakEvenDepositUsd ||
        deposits.length !== farm.deposits?.length ||
        deposits.some(
          ({ depositUsd, verdict }, i) =>
            depositUsd !== farm.deposits[i]?.depositUsd || verdict !== farm.deposits[i]?.verdict,
        ))
    ) {
      count++;
    }
  }
  return count;
}
