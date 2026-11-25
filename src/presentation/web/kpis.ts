import type { RadarResult } from "../../application/build-radar.ts";
import type { BoardRow } from "./board.ts";
import { formatInteger, formatOdds } from "./format.ts";
import { multiplier } from "./integrity.ts";

export const brier = (value: number | null) => value?.toFixed(4) ?? "—";

const actual = (covered: number, n: number) => (n ? formatOdds(covered / n) : "—");
const nominal = (stated: number) => `${stated * 100}%`;

export function rangeRows({ middle, broad }: RadarResult["rangeHonesty"]) {
  return (
    [
      ["P25–P75", middle],
      ["P10–P90", broad],
    ] as const
  ).map(([band, { stated, covered, n }]) => [
    band,
    `${actual(covered, n)} · ${covered}/${n}`,
    nominal(stated),
  ]);
}

export function termCounts(
  selection: RadarResult["model"]["selection"] | RadarResult["odds"]["validation"],
) {
  return `${selection.terms.length}/${selection.steps[0]?.trials.length ?? 0}`;
}

export function kpiStrip(
  model: RadarResult["model"],
  odds: RadarResult["odds"]["validation"],
  ranges: RadarResult["rangeHonesty"],
  rows: readonly BoardRow[],
  protocols: number,
  watchlist: number,
) {
  const { walkForward: wf, leaveOneFamilyOut: loo } = model.validation;
  const miss = ({ model, flatMultiple }: typeof loo) =>
    `${multiplier(model.medianMultiplier)} vs ${multiplier(flatMultiple.medianMultiplier)}`;
  const range = ({ stated, covered, n }: typeof ranges.middle) =>
    `${actual(covered, n)} / ${nominal(stated)}`;
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const { verdict } of rows) counts[verdict]++;
  const pair = (scores: readonly (number | null)[]) => scores.map(brier).join("/");
  return [
    ["Held-out miss", `${miss(wf)} · ${miss(loo)}`, "Walk-forward · family LOO vs flat"],
    [
      "Range honesty",
      `${range(ranges.middle)} · ${range(ranges.broad)}`,
      "P25–P75 · P10–P90, actual/stated",
    ],
    [
      "Odds Brier · 10-fold / WF",
      pair(odds.scores),
      `vs ${pair(odds.baselines.baseRate)} base · ${pair(odds.baselines.pava)} clock`,
    ],
    ["Terms kept", `${termCounts(model.selection)} · ${termCounts(odds)} + clock`, "Value · odds"],
    ["Worth farming at $10K", Object.values(counts).join(" / "), "FARM / THIN / SKIP"],
    [
      "Accounted",
      `${formatInteger(protocols)} protocols`,
      `${rows.filter(({ watchlist }) => watchlist).length}/${watchlist} watchlist`,
    ],
  ]
    .map(
      ([label, value, context]) =>
        `<div><dt>${label}</dt><dd>${value}</dd><small>${context}</small></div>`,
    )
    .join("");
}
