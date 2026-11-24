import type { ValidationScore } from "../../domain/valuation/metrics.ts";
import { escapeHtml as esc } from "./format.ts";
import type { CheckRow } from "./recompute.ts";

export interface HouseRuleEvidence {
  truePositives: readonly string[];
  falsePositives: readonly unknown[];
  falseNegatives: readonly string[];
}

export interface CoverageCounts {
  missLow: number;
  covered: number;
  missHigh: number;
}

interface Evidence {
  fitted: number;
  houseRule: HouseRuleEvidence;
  intervalCounts: CoverageCounts;
  invalidPoints: number;
  loo: { model: ValidationScore; flatMultiple: ValidationScore };
}

export function integrityChecks(
  mismatches: readonly string[],
  published: readonly (CheckRow | null)[],
  watchlist: readonly string[],
  { fitted, houseRule, intervalCounts, invalidPoints, loo }: Evidence,
) {
  const count = mismatches.length;
  const slugs = new Set(published.map((row) => row?.slug));
  const unique = new Set(watchlist);
  const covered = [...unique].filter((slug) => slugs.has(slug)).length;
  const { missLow, covered: inside, missHigh } = intervalCounts;
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
    { pass: covered === unique.size, label: `Watchlist ${covered}/${unique.size} on board` },
    {
      pass: matches === unique.size && unique.size > 0,
      label: `House rule ${matches}/${unique.size} recall${extra ? ` · ${extra} extra explained by parentProtocol` : ""}`,
    },
    {
      pass:
        invalidPoints === 0 &&
        Object.values(intervalCounts).every((n) => Number.isInteger(n) && n >= 0) &&
        samples === fitted &&
        inside / samples >= 0.8,
      label: `${inside}/${samples} held-out traded caps inside P10–P90${samples === fitted ? "" : ` · ${samples}/${fitted} families`}${invalidPoints ? ` · ${invalidPoints} invalid` : ""}`,
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
