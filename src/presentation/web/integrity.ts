import type { RadarResult } from "../../application/build-radar.ts";
import type { ValidationScore } from "../../domain/valuation/metrics.ts";
import type { CheckRow } from "./recompute.ts";
import { countBoardMismatches } from "./recompute.ts";

interface Evidence extends Pick<RadarResult, "houseRule" | "intervalCounts"> {
  loo: { model: ValidationScore; flatMultiple: ValidationScore };
}

export function integrityChecks(
  computed: readonly CheckRow[],
  published: readonly CheckRow[],
  watchlist: readonly string[],
  { houseRule, intervalCounts, loo }: Evidence,
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
  const extra = houseRule.falsePositives.length;
  const model = loo.model.medianMultiplier;
  const flat = loo.flatMultiple.medianMultiplier;
  return [
    {
      pass: mismatches === 0,
      label: mismatches
        ? `Page recompute · ${mismatches} mismatch${mismatches === 1 ? "" : "es"}`
        : `Page recompute = board.json (${published.length} rows)`,
    },
    { pass: covered === unique.length, label: `Watchlist ${covered}/${unique.length} on board` },
    {
      pass: houseRule.recall === 1 && houseRule.falseNegatives.length === 0,
      label: `House rule ${(houseRule.recall * 100).toFixed(0)}% recall${extra ? ` · ${extra} extra explained by parentProtocol` : ""}`,
    },
    {
      pass: samples > 0 && inside / samples >= 0.8,
      label: samples ? `${inside}/${samples} inside P10–P90` : "P10–P90 coverage unavailable",
    },
    {
      pass: model !== null && flat !== null && model < flat,
      label: `LOO median error ${multiplier(model)} vs ${multiplier(flat)} flat`,
    },
  ];
}

export function multiplier(value: number | null): string {
  return value === null ? "—" : `×${value.toFixed(2)}`;
}
