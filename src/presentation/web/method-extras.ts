import type { farmAssumptions, formatUsd } from "../../application/browser-api.ts";
import type { RadarResult } from "../../application/build-radar.ts";
import type { formatOdds } from "./format.ts";
import type { HouseRuleEvidence } from "./integrity.ts";
import type { table } from "./render.ts";

export function fixedScore(value: number | null): string {
  return value?.toFixed(4) ?? "—";
}

export function termTrials(
  selection: RadarResult["model"]["selection"] | RadarResult["odds"]["validation"],
  kind: "Value" | "Odds",
  tableView: typeof table,
) {
  const errors =
    kind === "Value"
      ? ["LOO log error", "Walk-forward log error"]
      : ["10-fold Brier", "Walk-forward Brier"];
  const rows = selection.steps.flatMap(({ baseline, trials }, i) => [
    [String(i + 1), "Current terms", ...baseline.map(fixedScore), "—"],
    ...trials.map(({ term, scores, kept }) => [
      String(i + 1),
      term,
      ...scores.map(fixedScore),
      kept ? "Kept" : "Not kept",
    ]),
  ]);
  return `<details class="panel"><summary>${kind} term selection</summary>
    <p class="caption">A term stays only if it lowers both held-out errors.</p>
    ${tableView(["Step", "Term", ...errors, "Decision"], rows)}</details>`;
}

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
