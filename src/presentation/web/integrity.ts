import type { RadarResult } from "../../application/build-radar.ts";
import type { ValidationScore } from "../../domain/valuation/metrics.ts";
import type { CheckRow, RecomputedRow } from "./recompute.ts";
import { countBoardMismatches } from "./recompute.ts";

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
  const mismatches = countBoardMismatches(computed, published);
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
      pass: mismatches === 0,
      label: `Recompute ${mismatches ? "≠" : "="} board.json: values, ranks, plans, economics (${mismatches ? `${mismatches} mismatched` : published.length})`,
    },
    { pass: covered === unique.length, label: `Watchlist ${covered}/${unique.length} on board` },
    {
      pass: matches === unique.length && unique.length > 0,
      label: `House rule ${matches}/${unique.length} recall${extra ? ` · ${extra} extra explained by parentProtocol` : ""}`,
    },
    {
      pass: samples === fitted && inside / samples >= 0.8,
      label: `${inside}/${samples} inside P10–P90${samples === fitted ? "" : ` · ${samples}/${fitted} families`}`,
    },
    {
      pass:
        samePopulation &&
        model.medianMultiplier !== null &&
        flat.medianMultiplier !== null &&
        model.medianMultiplier < flat.medianMultiplier,
      label: `LOO median error ${multiplier(model.medianMultiplier)} vs ${multiplier(flat.medianMultiplier)} flat${samePopulation ? "" : ` · model n=${model.n}/${fitted}, flat n=${flat.n}/${fitted}`}`,
    },
  ];
}

export function multiplier(value: number | null): string {
  return value === null ? "—" : `×${value.toFixed(2)}`;
}
