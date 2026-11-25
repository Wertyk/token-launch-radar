import { pava } from "./pava.ts";

export const YEAR_DAYS = 365;

export interface ClockPoint {
  ageDays: number;
  share: number;
  count: number;
}

export function fitAgeShares(rows: readonly { ageDays: number; label: number }[]): ClockPoint[] {
  const bins = new Map<number, { count: number; recorded: number; ageSum: number }>();
  for (const { ageDays: age, label } of rows) {
    const year = Math.floor(age / YEAR_DAYS);
    const bin = bins.get(year) ?? { count: 0, recorded: 0, ageSum: 0 };
    bin.count++;
    bin.recorded += label;
    bin.ageSum += age;
    bins.set(year, bin);
  }
  const ordered = [...bins].sort(([a], [b]) => a - b).map(([, bin]) => bin);
  const shares = pava(ordered);
  // Place each annual bin at the mean listing age of its observations.
  return ordered.map(({ ageSum, count }, i) => ({
    ageDays: ageSum / count,
    share: shares[i] ?? 0,
    count,
  }));
}

export function tailHazard(points: readonly ClockPoint[]): number {
  // Extend the last point at the last rising segment's constant conditional hazard,
  // or use the pooled token share as the annual rate if the curve never rises.
  for (let i = points.length - 1; i > 0; i--) {
    const left = points[i - 1];
    const right = points[i];
    if (left && right && right.share > left.share) {
      return Math.log((1 - left.share) / (1 - right.share)) / (right.ageDays - left.ageDays);
    }
  }
  return -Math.log1p(-(points[0]?.share ?? 0)) / YEAR_DAYS;
}

export function shareAt(points: readonly ClockPoint[], age: number): number {
  let left = points[0];
  if (!left) return 0;
  if (age <= left.ageDays) return left.share;
  for (const right of points) {
    if (age <= right.ageDays) {
      const fraction = (age - left.ageDays) / (right.ageDays - left.ageDays);
      return left.share + fraction * (right.share - left.share);
    }
    left = right;
  }
  return left.share + (1 - left.share) * -Math.expm1(-tailHazard(points) * (age - left.ageDays));
}
