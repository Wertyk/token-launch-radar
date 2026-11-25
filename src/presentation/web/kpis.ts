import type { RadarResult } from "../../application/build-radar.ts";
import type { InputEffects, summarizeEffects } from "../../domain/valuation/input-effects.ts";
import type { BoardRow } from "./board.ts";
import { formatInteger, formatOdds, formatPercent } from "./format.ts";
import { multiplier } from "./integrity.ts";

export const brier = (value: number | null) => value?.toFixed(4) ?? "—";

export const inputLabels = ["+10% TVL", "+10pp growth", "+1 yr"];
export const effectPercent = (value: number) =>
  formatPercent(Number.isFinite(value) ? value : null);
export function effectLine(values: readonly number[]) {
  return inputLabels
    .map((label, index) => `${label} → ${effectPercent(values[index] ?? NaN)}`)
    .join(" · ");
}

export type { InputEffects };
export type EffectSummary = ReturnType<typeof summarizeEffects>;

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
  effects: EffectSummary,
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
    [
      "Inputs in implied value",
      ["TVL", "growth", "age"]
        .map((label, index) => `${label} ${effectPercent(effects[index]?.[0] ?? NaN)}`)
        .join(" · "),
      "per +10% TVL, +10pp 7-day growth, +1 yr with no token · board medians",
    ],
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
