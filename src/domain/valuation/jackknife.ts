import { compareText } from "../shared/order.ts";
import type { Comparable } from "./comparables.ts";
import type { ValueModel } from "./model.ts";
import { fitValueModel, logValue } from "./model.ts";
import { modelFeatures, selectLambda } from "./selection.ts";

const TAIL_ALPHA = 0.1;

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

function predictComparable(row: Comparable, model: ValueModel): number {
  return logValue(modelFeatures(row, model.medianLnAge), model);
}

export function leaveOneFamilyOut(rows: readonly Comparable[], lambda: number): FamilyRefit[] {
  if (rows.length < 2) return [];
  // The comparable set has one observation per family.
  const ordered = [...rows].sort((a, b) => compareText(a.slug, b.slug));
  return ordered.map((comparable) => {
    const model = fitValueModel(
      ordered.filter((row) => row !== comparable),
      lambda,
    );
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

export function jackknifePlusBands(rows: readonly Comparable[]) {
  const bands = new Map<string, ReturnType<typeof jackknifePlusBand>>();
  if (rows.length < 3) return bands;

  for (const heldOut of rows) {
    const train = rows.filter((row) => row !== heldOut);
    // Select the penalty without the scored family and reuse it in every band refit.
    const refits = leaveOneFamilyOut(train, selectLambda(train));
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
