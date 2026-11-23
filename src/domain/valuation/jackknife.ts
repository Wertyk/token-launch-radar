import { compareText } from "../shared/order.ts";
import type { Comparable } from "./comparables.ts";
import type { ValueModel } from "./model.ts";
import { fitValueModel, logValue } from "./model.ts";
import { modelFeatures } from "./selection.ts";

export interface JackknifeSample {
  slug: string;
  prediction: number;
  residual: number;
}

export interface FamilyRefit {
  comparable: Comparable;
  model: ValueModel;
  prediction: number;
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
    const prediction = predictComparable(comparable, model);
    return { comparable, model, prediction, residual: Math.abs(comparable.target - prediction) };
  });
}

export function jackknifePlusBand(samples: readonly JackknifeSample[], point: number) {
  const lower = [...samples].sort(
    (a, b) =>
      a.prediction - a.residual - (b.prediction - b.residual) || compareText(a.slug, b.slug),
  );
  const upper = [...samples].sort(
    (a, b) =>
      a.prediction + a.residual - (b.prediction + b.residual) || compareText(a.slug, b.slug),
  );
  // Absolute residuals allocate the nominal 20% miss rate across both tails.
  // Finite-sample, one-based ranks are floor((n + 1) * .20) and ceil((n + 1) * .80).
  const tailRank = Math.floor((samples.length + 1) / 5);
  const lo = lower[tailRank - 1];
  const hi = upper[samples.length - tailRank];
  // Keep the published full-fit estimate inside the band even at extreme covariates.
  return {
    p10: Math.min(point, lo ? lo.prediction - lo.residual : Number.NEGATIVE_INFINITY),
    p90: Math.max(point, hi ? hi.prediction + hi.residual : Number.POSITIVE_INFINITY),
  };
}

export function jackknifePlusCoverage(refits: readonly FamilyRefit[]): number | null {
  if (refits.length < 3) return null;

  const rows = refits.map(({ comparable }) => comparable);
  const heldOut = refits.map((refit) => ({ ...refit, samples: [] as JackknifeSample[] }));
  // Each coverage band must omit the comparable being scored from all its training fits.
  // One fit per unordered pair supplies one candidate for each comparable's band.
  for (const [i, left] of heldOut.entries()) {
    for (const right of heldOut.slice(i + 1)) {
      const model = fitValueModel(
        rows.filter((row) => row !== left.comparable && row !== right.comparable),
        left.model.lambda,
      );
      const leftPrediction = predictComparable(left.comparable, model);
      const rightPrediction = predictComparable(right.comparable, model);
      left.samples.push({
        slug: right.comparable.slug,
        prediction: leftPrediction,
        residual: Math.abs(right.comparable.target - rightPrediction),
      });
      right.samples.push({
        slug: left.comparable.slug,
        prediction: rightPrediction,
        residual: Math.abs(left.comparable.target - leftPrediction),
      });
    }
  }

  let covered = 0;
  for (const {
    comparable: { target },
    prediction,
    samples,
  } of heldOut) {
    const { p10, p90 } = jackknifePlusBand(samples, prediction);
    if (p10 <= target && target <= p90) covered++;
  }
  return covered / heldOut.length;
}
