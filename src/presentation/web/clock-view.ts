import type { ClockPoint } from "../../domain/launch-clock/clock.ts";
import { svg } from "./render.ts";

export function ageSparkline(points: readonly ClockPoint[], age: number, share: number): string {
  const last = points.at(-1);
  const first = points[0];
  if (!first || !last) return "";
  const maxAge = Math.max(1, last.ageDays, age);
  const x = (days: number) => ((days * 100) / maxAge).toFixed(2);
  const y = (fraction: number) => ((1 - fraction) * 40).toFixed(2);
  const line = [
    `0.00,${y(first.share)}`,
    ...points.map((point) => `${x(point.ageDays)},${y(point.share)}`),
    `100.00,${y(last.share)}`,
  ].join(" ");
  return svg(
    100,
    40,
    `<polyline points="${line}"></polyline><circle cx="${x(age)}" cy="${y(share)}" r="2" class="age-point"></circle>`,
  );
}
