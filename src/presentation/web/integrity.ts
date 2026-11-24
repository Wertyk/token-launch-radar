import type { RadarResult } from "../../application/build-radar.ts";
import type { ValidationScore } from "../../domain/valuation/metrics.ts";
import { escapeHtml as esc } from "./format.ts";
import type { CheckRow, RecomputedRow } from "./recompute.ts";
import { boardMismatches } from "./recompute.ts";

export interface HouseRuleEvidence {
  truePositives: readonly string[];
  falsePositives: readonly unknown[];
  falseNegatives: readonly string[];
}

interface Evidence extends Pick<RadarResult, "intervalCounts"> {
  fitted: number;
  houseRule: HouseRuleEvidence;
  loo: { model: ValidationScore; flatMultiple: ValidationScore };
}

export function integrityChecks(
  computed: readonly RecomputedRow[],
  published: readonly CheckRow[],
  watchlist: readonly string[],
  { fitted, houseRule, intervalCounts, loo }: Evidence,
) {
  const mismatches = boardMismatches(computed, published);
  const count = mismatches.length;
  const slugs = new Set(published.map(({ slug }) => slug));
  const unique = [...new Set(watchlist)];
  const covered = unique.filter((slug) => slugs.has(slug)).length;
  const {
    missLow,
    covered: inside,
    missHigh,
  } = intervalCounts ?? { missLow: 0, covered: 0, missHigh: 0 };
  const samples = missLow + inside + missHigh;
  const matches = houseRule.truePositives.length;
  const extra = houseRule.falsePositives.length;
  const { model, flatMultiple: flat } = loo;
  const samePopulation = model.n === fitted && flat.n === fitted;
  return [
    {
      pass: count === 0,
      label: `Recompute ${count ? "≠" : "="} board.json · launch values, odds, implied values, ranks, plans, economics (${count ? `${count} mismatched · ${mismatches[0]}` : published.length})`,
    },
    { pass: covered === unique.length, label: `Watchlist ${covered}/${unique.length} on board` },
    {
      pass: matches === unique.length && unique.length > 0,
      label: `House rule ${matches}/${unique.length} recall${extra ? ` · ${extra} extra explained by parentProtocol` : ""}`,
    },
    {
      pass: samples === fitted && inside / samples >= 0.8,
      label: `${inside}/${samples} launch values inside P10–P90${samples === fitted ? "" : ` · ${samples}/${fitted} families`}`,
    },
    {
      pass:
        samePopulation &&
        model.medianMultiplier !== null &&
        flat.medianMultiplier !== null &&
        model.medianMultiplier < flat.medianMultiplier,
      label: `Launch value LOO error ${multiplier(model.medianMultiplier)} vs ${multiplier(flat.medianMultiplier)} flat${samePopulation ? "" : ` · model n=${model.n}/${fitted}, flat n=${flat.n}/${fitted}`}`,
    },
  ];
}

export function integrityStrip(checks: ReturnType<typeof integrityChecks>): string {
  return `<ul class="integrity">${checks
    .map(
      ({ pass, label }) =>
        `<li class="${pass ? "check" : "check-failed"}">${pass ? "✓" : "✗"} ${esc(label)}</li>`,
    )
    .join("")}</ul>`;
}

export function multiplier(value: number | null): string {
  return value === null ? "—" : `×${value.toFixed(2)}`;
}
