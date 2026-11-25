import type { farmAssumptions, formatUsd } from "../../application/browser-api.ts";
import type { formatOdds } from "./format.ts";
import type { HouseRuleEvidence } from "./integrity.ts";

export function methodFarmAssumptions(
  farm: typeof farmAssumptions,
  usd: typeof formatUsd,
  pct: typeof formatOdds,
) {
  return {
    title: `Farm assumptions · ${farm.asOf}`,
    rows: [
      ["Hold", "Until launch or one year, whichever comes first. Count whole review periods."],
      ["Airdrop share of launch cap", pct(farm.airdropShareOfLaunchCap)],
      ["Farmer haircut (retained)", pct(farm.farmerHaircut)],
      ["Labor", `${usd(farm.hourlyRateUsd)}/h`],
      [
        "Capital APR",
        `${pct(farm.capitalApr.yieldBearing)} yield-bearing · ${pct(farm.capitalApr.nonYielding)} non-yielding`,
      ],
      ["Verdict test deposits", farm.depositsUsd.map(usd).join(" · ")],
      ["Verdicts", `FARM > ${usd(farm.hourlyRateUsd)}/h · THIN if net > $0 · SKIP if net ≤ $0`],
    ],
  };
}

export type MethodPanel = (
  title: string,
  headers: string[],
  rows: string[][],
  note?: string,
) => string;

export function methodNotes(
  houseRule: HouseRuleEvidence,
  farm: typeof farmAssumptions,
  usd: typeof formatUsd,
  pct: typeof formatOdds,
  panel: MethodPanel,
) {
  const assumptions = methodFarmAssumptions(farm, usd, pct);
  const rule = panel(
    "House watchlist rule",
    ["TP", "FP", "FN"],
    [
      [houseRule.truePositives, houseRule.falsePositives, houseRule.falseNegatives].map(
        ({ length }) => String(length),
      ),
    ],
    "DefiLlama marks extra matches with parentProtocol, absent from the snapshot.",
  );
  const farmPanel = panel(assumptions.title, ["Input", "Default"], assumptions.rows);
  return `<details class="panel"><summary>Watchlist and farm assumptions</summary>${rule}${farmPanel}</details>`;
}
