import type { RadarResult } from "../../application/build-radar.ts";
import { formatCompactUsd } from "./format.ts";
import type { CoverageCounts } from "./integrity.ts";
import { multiplier } from "./integrity.ts";
import { svg } from "./render.ts";

export function scatterCoverage(
  points: readonly (NonNullable<RadarResult["looScatter"]>[number] | null)[],
  families: ReadonlyMap<string, { mcap_usd: number | null }>,
) {
  const counts: CoverageCounts = { missLow: 0, covered: 0, missHigh: 0 };
  const seen = new Set<string>();
  const classified = points.flatMap((point) => {
    if (!point) return [];
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
      return [];
    seen.add(slug);
    const result = actual < p10 ? "missLow" : actual > p90 ? "missHigh" : "covered";
    counts[result]++;
    return [{ actual, predicted, inside: result === "covered" }];
  });
  return { points: classified, counts, invalidPoints: points.length - classified.length };
}

export function launchValueScatter(
  { points, counts }: ReturnType<typeof scatterCoverage>,
  { model, flatMultiple }: RadarResult["model"]["validation"]["leaveOneFamilyOut"],
): string {
  const heading =
    '<section class="panel scatter"><h2>Predicted launch value vs current market cap</h2>';
  if (!points.length) {
    return `${heading}<p class="caption">No valid held-out bands to display.</p></section>`;
  }
  // Predictions and caps are already natural logs. Share one domain across the two axes.
  const values = points.flatMap(({ actual, predicted }) => [actual, predicted]);
  const min = Math.floor(Math.min(...values) / Math.LN10);
  const max = Math.max(min + 1, Math.ceil(Math.max(...values) / Math.LN10));
  const fraction = (log: number) => (log / Math.LN10 - min) / (max - min);
  const x = (log: number) => (59 + fraction(log) * 313).toFixed(2);
  const y = (log: number) => (178 - fraction(log) * 170).toFixed(2);
  const marks = [];
  for (let power = min; power <= max; power += Math.ceil((max - min) / 5)) {
    const log = power * Math.LN10;
    const label = formatCompactUsd(10 ** power).replace(".00", "");
    marks.push(
      `<path class="scatter-grid" d="M59 ${y(log)}H372 M${x(log)} 178V8"></path><text x="54" y="${y(log)}" dy=".35em" text-anchor="end">${label}</text><text x="${x(log)}" y="191" text-anchor="middle">${label}</text>`,
    );
  }
  const circles = points.map(
    ({ actual, predicted, inside }) =>
      `<circle class="${inside ? "inside" : "outside"}" cx="${x(actual)}" cy="${y(predicted)}" r="3"${inside ? "" : ' fill="none" stroke="currentColor"'}></circle>`,
  );
  const plot = svg(
    400,
    204,
    `${marks.join("")}<path class="identity" d="M59 178L372 8" stroke="currentColor" stroke-dasharray="4 3"></path>${circles.join("")}<text x="216" y="201" text-anchor="middle">Actual market cap (log USD)</text><text transform="translate(10 93) rotate(-90)" text-anchor="middle">Predicted (log USD)</text>`,
  );
  return `${heading}${plot}<p class="caption">● Inside band · ○ Outside band · Dashed y = x<br>${counts.covered}/${points.length} inside held-out P10–P90 · LOO median error ${multiplier(model.medianMultiplier)} vs ${multiplier(flatMultiple.medianMultiplier)} flat</p></section>`;
}
