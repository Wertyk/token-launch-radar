import { compareText } from "../shared/order.ts";
import type { CategoryComparable } from "./categories.ts";
import type { Comparable } from "./comparables.ts";
import type { ValueModel } from "./model.ts";
import { fitValueModel } from "./model.ts";
import { predictComparable } from "./selection.ts";
import { cacheCalibrationFits } from "./value-fit-cache.ts";
import { refitSelectedValue } from "./value-selection.ts";

const TAIL_ALPHA = 0.1;
// With one held-out family the finite lower rank first exists at floor(n × alpha) ≥ 1.
export const MIN_BAND_FAMILIES = Math.ceil(1 / TAIL_ALPHA);

export interface JackknifeSample {
  slug: string;
  prediction: number;
  residual: number;
}

export interface FamilyRefit {
  comparable: Comparable;
  model: ValueModel;
  residual: number;
}

type Refit = (rows: readonly CategoryComparable[]) => ValueModel;

export function leaveOneFamilyOut(
  rows: readonly CategoryComparable[],
  refit: number | Refit = refitSelectedValue,
): FamilyRefit[] {
  if (rows.length < 2) return [];
  // The comparable set has one observation per family.
  const ordered = [...rows].sort((a, b) => compareText(a.slug, b.slug));
  return ordered.map((comparable) => {
    const train = ordered.filter((row) => row !== comparable);
    const model = typeof refit === "number" ? fitValueModel(train, refit) : refit(train);
    return {
      comparable,
      model,
      residual: comparable.target - predictComparable(comparable, model),
    };
  });
}

export function jackknifePlusBand(samples: readonly JackknifeSample[]) {
  const candidates = samples
    .map(({ slug, prediction, residual }) => ({ slug, value: prediction + residual }))
    .sort((a, b) => a.value - b.value || compareText(a.slug, b.slug));
  // Barber et al., Appendix A. The one-based ranks are floor((n + 1) * alpha)
  // and its mirror, ceil((n + 1) * (1 - alpha)).
  const atTail = (alpha: number) => {
    const rank = Math.floor((candidates.length + 1) * alpha);
    return [
      candidates[rank - 1]?.value ?? -Infinity,
      candidates[candidates.length - rank]?.value ?? Infinity,
    ] as const;
  };
  const [p10, p90] = atTail(TAIL_ALPHA);
  const [p25, p75] = atTail(0.25);
  return { p10, p25, p75, p90 };
}

export function jackknifePlusBands(
  rows: readonly CategoryComparable[],
  refit: number | Refit = refitSelectedValue,
) {
  const bands = new Map<string, ReturnType<typeof jackknifePlusBand>>();
  if (rows.length < 3) return bands;

  for (const heldOut of rows) {
    const train = rows.filter((row) => row !== heldOut);
    const refits = leaveOneFamilyOut(train, refit);
    const samples = refits.map(({ comparable, model, residual }) => ({
      slug: comparable.slug,
      prediction: predictComparable(heldOut, model),
      residual,
    }));
    bands.set(heldOut.slug, jackknifePlusBand(samples));
  }
  return bands;
}

export function jackknifePlusCoverage(rows: readonly CategoryComparable[]) {
  const bands = jackknifePlusBands(rows, cacheCalibrationFits(rows));
  if (!bands.size) return null;

  const counts = { missLow: 0, covered: 0, missHigh: 0 };
  const coveredSlugs = new Set<string>();
  for (const heldOut of rows) {
    const band = bands.get(heldOut.slug);
    if (!band) continue;
    const { p10, p90 } = band;
    if (heldOut.target < p10) counts.missLow++;
    else if (heldOut.target > p90) counts.missHigh++;
    else coveredSlugs.add(heldOut.slug);
  }
  counts.covered = coveredSlugs.size;
  return { counts, coveredSlugs };
}

type RangePoint = { actual: number } & Record<"p10" | "p25" | "p75" | "p90", number | null>;

export function rangeHonesty(points: readonly RangePoint[]) {
  const count = (low: "p10" | "p25", high: "p75" | "p90", stated: number) => {
    let covered = 0;
    let n = 0;
    for (const point of points) {
      const a = point[low];
      const b = point[high];
      if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || a > b) continue;
      n++;
      if (a <= point.actual && point.actual <= b) covered++;
    }
    return { stated, covered, n };
  };
  return { middle: count("p25", "p75", 0.5), broad: count("p10", "p90", 0.8) };
}
