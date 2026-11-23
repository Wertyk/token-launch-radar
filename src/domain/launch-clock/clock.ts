import { classify } from "../census/census.ts";
import { clamp, median } from "../shared/math.ts";
import type { Protocol } from "../snapshot.ts";
import { daysBetween } from "../snapshot.ts";
import { pava } from "./pava.ts";

const YEAR_DAYS = 365;

export interface ClockPoint {
  ageDays: number;
  share: number;
  count: number;
}

export interface LaunchClock {
  points: ClockPoint[];
  medianAgeDays: number | null;
}

export function fitLaunchClock(protocols: readonly Protocol[], asOf: string): LaunchClock {
  const ages: { slug: string; value: number }[] = [];
  const bins = new Map<number, { count: number; recorded: number; ageSum: number }>();
  // Listing age is a proxy for protocol age. This cross-section is not a survival history.
  for (const protocol of protocols) {
    if (protocol.listed_at === null) continue;
    const age = Math.max(0, daysBetween(protocol.listed_at, asOf));
    ages.push({ slug: protocol.slug, value: age });
    const year = Math.floor(age / YEAR_DAYS);
    const bin = bins.get(year) ?? { count: 0, recorded: 0, ageSum: 0 };
    const { status } = classify(protocol);
    bin.count++;
    bin.recorded += Number(status === "traded" || status === "token-unpriced");
    bin.ageSum += age;
    bins.set(year, bin);
  }
  const ordered = [...bins].sort(([a], [b]) => a - b).map(([, bin]) => bin);
  const shares = pava(ordered);
  // Place each annual bin at the mean listing age of its observations.
  const points = ordered.map(({ ageSum, count }, i) => ({
    ageDays: ageSum / count,
    share: shares[i] ?? 0,
    count,
  }));
  return { points, medianAgeDays: median(ages) ?? null };
}

function shareAt(points: readonly ClockPoint[], age: number): number {
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
  return left.share;
}

export function launchProbability12(points: readonly ClockPoint[], age: number): number {
  const now = shareAt(points, age);
  // At saturation there is no remaining mass to condition on and no modeled increase.
  if (now === 1) return 0;
  return clamp((shareAt(points, age + YEAR_DAYS) - now) / (1 - now), 0, 1);
}
