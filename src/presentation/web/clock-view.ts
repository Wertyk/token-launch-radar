import type { svg } from "./render.ts";

export function ageSparkline(
  maxAge: number,
  age: number,
  odds: number,
  oddsAt: (age: number) => number,
  svgView: typeof svg,
): string {
  const y = (fraction: number) => ((1 - fraction) * 40).toFixed(2);
  const marker = (age / maxAge) * 100;
  const line = Array.from({ length: 33 }, (_, index) => {
    const x = (index / 32) * 100;
    return `${x.toFixed(2)},${y(oddsAt((x / 100) * maxAge))}`;
  }).join(" ");
  return svgView(
    100,
    40,
    `<polyline points="${line}"></polyline><circle cx="${marker.toFixed(2)}" cy="${y(odds)}" r="2" class="age-point"></circle>`,
  );
}
