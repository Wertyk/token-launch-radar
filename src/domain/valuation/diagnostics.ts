import { clamp } from "../shared/math.ts";
import { compareText } from "../shared/order.ts";
import type { Comparable } from "./comparables.ts";
import type { FamilyRefit, JackknifeSample } from "./jackknife.ts";
import { jackknifePlusBand } from "./jackknife.ts";
import type { RankedRow } from "./model.ts";
import { logValue, prepareFit, rankBoard } from "./model.ts";

interface RankInfluence {
  family_key: string;
  slug: string;
  // A positive delta means the row falls in the ranking when the family is removed.
  rank_delta: number;
}

export interface ValueDiagnostics {
  interval_p10_usd: number;
  interval_p90_usd: number;
  influence: RankInfluence | null;
  twins: string[];
}

export function describeBoardValues(
  ranked: readonly RankedRow[],
  comparables: readonly Comparable[],
  refits: readonly FamilyRefit[],
  asOf: string,
) {
  const board = new Map(
    ranked.map((row) => [
      row.protocol.slug,
      { row, samples: [] as JackknifeSample[], influence: null as RankInfluence | null },
    ]),
  );
  for (const {
    comparable: { slug, familyKey },
    model,
    residual,
  } of refits) {
    for (const row of rankBoard(ranked, asOf, model)) {
      const original = board.get(row.protocol.slug);
      if (!original) throw new Error("Missing board row for a valuation refit.");
      original.samples.push({ slug, prediction: logValue(row.features, model), residual });
      const rank_delta = row.rank - original.row.rank;
      const current = original.influence;
      const magnitude = Math.abs(rank_delta);
      const previousMagnitude = Math.abs(current?.rank_delta ?? 0);
      if (
        !current ||
        magnitude > previousMagnitude ||
        (magnitude === previousMagnitude && compareText(slug, current.slug) < 0)
      ) {
        original.influence = { slug, family_key: familyKey, rank_delta };
      }
    }
  }

  const {
    tvlScale,
    ageScale,
    metadata: { medianLnAge },
  } = prepareFit(comparables);
  return [...board.values()].map(({ row, samples, influence }) => {
    const { p10, p90 } = jackknifePlusBand(samples);
    const scale = (bound: number) => clamp(Math.exp(bound), 1, 1e14) * row.launchProbability12;
    const { lnTvl, lnAge } = row.features;
    const twins = comparables
      .map((comparable) => {
        const tvl = tvlScale ? (comparable.lnTvl - lnTvl) / tvlScale : 0;
        const age = ageScale ? ((comparable.lnAge ?? medianLnAge) - lnAge) / ageScale : 0;
        return { slug: comparable.slug, distance: tvl ** 2 + age ** 2 };
      })
      .sort((a, b) => a.distance - b.distance || compareText(a.slug, b.slug))
      .slice(0, 5)
      .map(({ slug }) => slug);
    const diagnostics: ValueDiagnostics = {
      interval_p10_usd: Math.max(1, Math.floor(scale(p10))),
      interval_p90_usd: Math.max(1, Math.ceil(scale(p90))),
      influence,
      twins,
    };
    return { protocol: row.protocol, diagnostics };
  });
}
