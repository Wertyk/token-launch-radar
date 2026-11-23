import { clamp, median } from "../shared/math.ts";
import { compareText } from "../shared/order.ts";

export interface Prediction {
  slug: string;
  actual: number;
  predicted: number;
}

export interface ValidationScore {
  n: number;
  medianMultiplier: number | null;
  spearman: number | null;
}

export function medianLogError(rows: readonly Prediction[]): number | undefined {
  return median(
    rows.map(({ slug, actual, predicted }) => ({ slug, value: Math.abs(actual - predicted) })),
  );
}

function ranks(rows: readonly Prediction[], key: "actual" | "predicted"): Map<string, number> {
  const sorted = [...rows].sort((a, b) => a[key] - b[key] || compareText(a.slug, b.slug));
  const ranked = new Map<string, number>();
  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && sorted[end]?.[key] === sorted[start]?.[key]) end++;
    for (const row of sorted.slice(start, end)) ranked.set(row.slug, (start + 1 + end) / 2);
    start = end;
  }
  return ranked;
}

export function scorePredictions(rows: readonly Prediction[]): ValidationScore {
  const n = rows.length;
  const medianError = medianLogError(rows);
  const actualRanks = ranks(rows, "actual");
  const predictedRanks = ranks(rows, "predicted");
  const center = (n + 1) / 2;
  let covariance = 0;
  let actualVariance = 0;
  let predictedVariance = 0;
  for (const { slug } of rows) {
    const actual = (actualRanks.get(slug) ?? center) - center;
    const predicted = (predictedRanks.get(slug) ?? center) - center;
    covariance += actual * predicted;
    actualVariance += actual ** 2;
    predictedVariance += predicted ** 2;
  }
  const denominator = Math.sqrt(actualVariance * predictedVariance);
  return {
    n,
    medianMultiplier: medianError === undefined ? null : Math.exp(medianError),
    spearman: denominator === 0 ? null : clamp(covariance / denominator, -1, 1),
  };
}
