import type { RadarResult } from "../../application/build-radar.ts";
import { formatCompactUsd } from "./format.ts";
import { multiplier } from "./integrity.ts";
import { svg } from "./render.ts";

export function launchValueScatter(
  points: RadarResult["looScatter"],
  { model, flatMultiple }: RadarResult["model"]["validation"]["leaveOneFamilyOut"],
): string {
  const heading = '<section class="panel scatter"><h2>Predicted vs actual launch value</h2>';
  if (!points.length) {
    return `${heading}<p class="caption">Too few traded families for held-out bands.</p></section>`;
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
      `<circle class="${inside ? "inside" : "outside"}" cx="${x(actual)}" cy="${y(predicted)}" r="3"></circle>`,
  );
  const plot = svg(
    400,
    204,
    `${marks.join("")}<path class="identity" d="M59 178L372 8"></path>${circles.join("")}<text x="216" y="201" text-anchor="middle">Actual market cap (log USD)</text><text transform="translate(10 93) rotate(-90)" text-anchor="middle">Predicted (log USD)</text>`,
  );
  const covered = points.filter(({ inside }) => inside).length;
  return `${heading}${plot}<p class="caption">● Inside band · ○ Outside band · Dashed y = x<br>${covered}/${points.length} inside held-out P10–P90 · LOO median error ${multiplier(model.medianMultiplier)} vs ${multiplier(flatMultiple.medianMultiplier)} flat</p></section>`;
}
