import type { RadarResult } from "../../application/build-radar.ts";
import type { CoverageCounts } from "./integrity.ts";

export function scatterCoverage(
  points: readonly (NonNullable<RadarResult["looScatter"]>[number] | null)[],
  families: ReadonlyMap<string, { mcap_usd: number | null }>,
) {
  const counts: CoverageCounts = { missLow: 0, covered: 0, missHigh: 0 };
  const seen = new Set<string>();
  const valid: NonNullable<RadarResult["looScatter"]> = [];
  for (const point of points) {
    if (!point) continue;
    const { slug, actual, predicted, p10, p90 } = point;
    const cap = families.get(slug)?.mcap_usd ?? 0;
    if (
      p10 === null ||
      p90 === null ||
      ![p10, p90, actual, predicted].every(Number.isFinite) ||
      p10 > p90 ||
      seen.has(slug) ||
      Math.abs(actual - Math.log(cap)) > 1e-9
    )
      continue;
    seen.add(slug);
    valid.push(point);
    counts[actual < p10 ? "missLow" : actual > p90 ? "missHigh" : "covered"]++;
  }
  return { valid, counts, invalidPoints: points.length - valid.length };
}
