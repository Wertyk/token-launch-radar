import type { ProtocolFamily } from "../census/families.ts";
import { clamp } from "../shared/math.ts";
import { daysBetween } from "../snapshot.ts";

export interface Comparable {
  slug: string;
  familyKey: string;
  listedAt: string | null;
  lnTvl: number;
  lnAge: number | null;
  growth: number;
  target: number;
}

export function logAge(listedAt: string, asOf: string): number {
  return Math.log(Math.max(1, daysBetween(listedAt, asOf)));
}

/**
 * Comparables' seven-day TVL change mixes in their own token's price, making a fitted
 * growth slope specific to traded protocols. Price one week of TVL momentum using
 * the fitted TVL elasticity.
 */
export function logMomentum(change: number | null): number {
  return change === null ? 0 : Math.log1p(clamp(change, -50, 100) / 100);
}

export function comparablesFromFamilies(
  families: readonly ProtocolFamily[],
  asOf: string,
): Comparable[] {
  return families.flatMap(({ key, representative, tvl_usd, mcap_usd }) => {
    if (mcap_usd === null) return [];
    const { slug, listed_at, change_7d } = representative;
    return [
      {
        slug,
        familyKey: key,
        listedAt: listed_at,
        lnTvl: Math.log(tvl_usd),
        lnAge: listed_at === null ? null : logAge(listed_at, asOf),
        growth: logMomentum(change_7d),
        target: Math.log(mcap_usd),
      },
    ];
  });
}
