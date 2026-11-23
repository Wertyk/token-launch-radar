import { choleskySolve } from "./linalg.ts";

const HUBER_K = 1.345;
const MAD_NORMAL_SCALE = 1.4826;
const MIN_SCALE = 1e-8;
const MAX_ITERATIONS = 20;
const TOLERANCE = 1e-5;

export interface RidgeRow {
  tvl: number;
  age: number;
  target: number;
}

function weightedRidge(rows: readonly RidgeRow[], weights: Float64Array, lambda: number): number[] {
  let weightSum = 0;
  let tvlSum = 0;
  let ageSum = 0;
  let targetSum = 0;
  let tvlSquared = 0;
  let ageSquared = 0;
  let tvlAge = 0;
  let tvlTarget = 0;
  let ageTarget = 0;
  for (const [index, { tvl, age, target }] of rows.entries()) {
    const weight = weights[index] ?? 1;
    const weightedTvl = weight * tvl;
    const weightedAge = weight * age;
    weightSum += weight;
    tvlSum += weightedTvl;
    ageSum += weightedAge;
    targetSum += weight * target;
    tvlSquared += weightedTvl * tvl;
    ageSquared += weightedAge * age;
    tvlAge += weightedTvl * age;
    tvlTarget += weightedTvl * target;
    ageTarget += weightedAge * target;
  }
  // When both columns are collinear, TVL alone spans the same unpenalized fit.
  if (
    lambda === 0 &&
    tvlSquared > 0 &&
    ageSquared > 0 &&
    tvlAge ** 2 >= (1 - 8 * Number.EPSILON) * tvlSquared * ageSquared
  ) {
    return [
      ...choleskySolve(
        [
          [weightSum, tvlSum],
          [tvlSum, tvlSquared],
        ],
        [targetSum, tvlTarget],
      ),
      0,
    ];
  }
  return choleskySolve(
    [
      [weightSum, tvlSum, ageSum],
      [tvlSum, (tvlSquared || 1) + lambda, tvlAge],
      [ageSum, tvlAge, (ageSquared || 1) + lambda],
    ],
    [targetSum, tvlTarget, ageTarget],
  );
}

// Partition around the middle order statistic. The left partition also gives
// the lower middle for an even sample, so IRLS needs no full residual sort.
function medianInPlace(values: Float64Array): number {
  const middle = Math.floor(values.length / 2);
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const pivot = values[(low + high) >>> 1] ?? 0;
    let left = low;
    let right = high;
    while (left <= right) {
      while ((values[left] ?? pivot) < pivot) left++;
      while ((values[right] ?? pivot) > pivot) right--;
      if (left <= right) {
        const value = values[left] ?? pivot;
        values[left++] = values[right] ?? pivot;
        values[right--] = value;
      }
    }
    if (middle <= right) high = right;
    else if (middle >= left) low = left;
    else break;
  }
  const upper = values[middle] ?? 0;
  if (values.length % 2 !== 0) return upper;
  let lower = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < middle; i++) lower = Math.max(lower, values[i] ?? upper);
  return (lower + upper) / 2;
}

function madScale(residuals: Float64Array, scratch: Float64Array): number {
  scratch.set(residuals);
  const center = medianInPlace(scratch);
  for (let i = 0; i < residuals.length; i++) scratch[i] = Math.abs((residuals[i] ?? 0) - center);
  return Math.max(MIN_SCALE, MAD_NORMAL_SCALE * medianInPlace(scratch));
}

export function fitHuber(
  size: number,
  solve: (weights: Float64Array) => number[],
  evaluateResiduals: (coefficients: readonly number[], residuals: Float64Array) => void,
  robust = true,
): { coefficients: number[]; huberScale: number } {
  const weights = new Float64Array(size).fill(1);
  const residuals = new Float64Array(size);
  const scratch = new Float64Array(size);
  let coefficients = solve(weights);
  evaluateResiduals(coefficients, residuals);
  let huberScale = madScale(residuals, scratch);
  if (robust) {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const cutoff = HUBER_K * huberScale;
      for (let i = 0; i < residuals.length; i++) {
        weights[i] = Math.min(1, cutoff / Math.abs(residuals[i] ?? 0));
      }
      const next = solve(weights);
      const converged = next.every(
        (value, i) => Math.abs(value - (coefficients[i] ?? 0)) < TOLERANCE,
      );
      coefficients = next;
      evaluateResiduals(coefficients, residuals);
      huberScale = madScale(residuals, scratch);
      if (converged) break;
    }
  }
  return { coefficients, huberScale };
}

export function fitRidge(rows: readonly RidgeRow[], lambda: number, robust: boolean) {
  return fitHuber(
    rows.length,
    (weights) => weightedRidge(rows, weights, lambda),
    ([intercept = 0, tvlSlope = 0, ageSlope = 0], residuals) => {
      let i = 0;
      for (const { target, tvl, age } of rows) {
        residuals[i++] = target - (intercept + tvlSlope * tvl + ageSlope * age);
      }
    },
    robust,
  );
}
