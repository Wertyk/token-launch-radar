import { compareText } from "../shared/order.ts";
import type { Comparable } from "./comparables.ts";
import type { ValueModel } from "./model.ts";
import { fitValueModel } from "./model.ts";
import { predictComparable, selectLambda } from "./selection.ts";

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

type Refit<Row> = (rows: readonly Row[]) => ValueModel;

export function leaveOneFamilyOut<Row extends Comparable>(
  rows: readonly Row[],
  refit: number | Refit<Row>,
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
  const tailRank = Math.floor((candidates.length + 1) * TAIL_ALPHA);
  return {
    p10: candidates[tailRank - 1]?.value ?? Number.NEGATIVE_INFINITY,
    p90: candidates[candidates.length - tailRank]?.value ?? Number.POSITIVE_INFINITY,
  };
}

export function jackknifePlusBands<Row extends Comparable>(
  rows: readonly Row[],
  selectFit: (train: readonly Row[]) => number | Refit<Row> = selectLambda,
) {
  const bands = new Map<string, ReturnType<typeof jackknifePlusBand>>();
  if (rows.length < 3) return bands;

  for (const heldOut of rows) {
    const train = rows.filter((row) => row !== heldOut);
    // Select the penalty without the scored family and reuse it in every band refit.
    const refits = leaveOneFamilyOut(train, selectFit(train));
    const samples = refits.map(({ comparable, model, residual }) => ({
      slug: comparable.slug,
      prediction: predictComparable(heldOut, model),
      residual,
    }));
    bands.set(heldOut.slug, jackknifePlusBand(samples));
  }
  return bands;
}

export function jackknifePlusCoverage(rows: readonly Comparable[]) {
  const bands = jackknifePlusBands(rows);
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
