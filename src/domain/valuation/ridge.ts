import { addOuterProduct, choleskySolve, zeroMatrix } from "./linalg.ts";

const HUBER_K = 1.345;
const MAD_NORMAL_SCALE = 1.4826;
const MIN_SCALE = 1e-8;
const MAX_ITERATIONS = 20;
const TOLERANCE = 1e-5;

export interface RidgeRow {
  tvl: number;
  age: number;
  target: number;
  group?: number;
}

function weightedRidge(
  rows: readonly DesignRow[],
  weights: Float64Array,
  lambda: number,
  groupPenalty: readonly number[][],
): number[] {
  const width = groupPenalty.length + 3;
  const normal = zeroMatrix(width);
  const rhs = Array<number>(width).fill(0);
  for (const [i, { values, columns, target }] of rows.entries()) {
    const weight = weights[i] ?? 1;
    addOuterProduct(normal, values, weight, columns);
    for (const [j, column] of columns.entries()) {
      rhs[column] = (rhs[column] ?? 0) + weight * (values[j] ?? 0) * target;
    }
  }
  const tvlColumn = width - 2;
  const ageColumn = width - 1;
  const tvl = normal[tvlColumn] ?? [];
  const age = normal[ageColumn] ?? [];
  const tvlSquared = tvl[tvlColumn] ?? 0;
  const ageSquared = age[ageColumn] ?? 0;
  // When both columns are collinear, TVL spans the unpenalized fit.
  if (
    lambda === 0 &&
    width === 3 &&
    tvlSquared > 0 &&
    ageSquared > 0 &&
    (age[tvlColumn] ?? 0) ** 2 >= (1 - 8 * Number.EPSILON) * tvlSquared * ageSquared
  ) {
    return [
      ...choleskySolve(
        normal.slice(0, 2).map((row) => row.slice(0, 2)),
        rhs.slice(0, 2),
      ),
      0,
    ];
  }
  for (const [i, penalties] of groupPenalty.entries()) {
    const line = normal[i + 1] ?? [];
    penalties.forEach((penalty, j) => {
      line[j + 1] = (line[j + 1] ?? 0) + penalty;
    });
  }
  tvl[tvlColumn] = (tvlSquared || 1) + lambda;
  age[ageColumn] = (ageSquared || 1) + lambda;
  return choleskySolve(normal, rhs);
}

interface DesignRow {
  target: number;
  values: number[];
  columns: number[];
}

function medianInPlace(values: Float64Array): number {
  values.sort();
  const middle = Math.floor(values.length / 2);
  const upper = values[middle] ?? 0;
  return values.length % 2 ? upper : ((values[middle - 1] ?? upper) + upper) / 2;
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

export function fitRidge(
  rows: readonly RidgeRow[],
  lambda: number,
  robust: boolean,
  groupPenalty: readonly number[][] = [],
) {
  const tvlColumn = groupPenalty.length + 1;
  const ageColumn = tvlColumn + 1;
  const design = rows.map(({ target, group = 0, tvl, age }) => ({
    target,
    values: group ? [1, 1, tvl, age] : [1, tvl, age],
    columns: group ? [0, group, tvlColumn, ageColumn] : [0, tvlColumn, ageColumn],
  }));
  return fitHuber(
    rows.length,
    (weights) => weightedRidge(design, weights, lambda, groupPenalty),
    (coefficients, residuals) => {
      const intercept = coefficients[0] ?? 0;
      const tvlSlope = coefficients[tvlColumn] ?? 0;
      const ageSlope = coefficients[ageColumn] ?? 0;
      let i = 0;
      for (const { target, group = 0, tvl, age } of rows) {
        const base = group ? intercept + (coefficients[group] ?? 0) : intercept;
        residuals[i++] = target - (base + tvlSlope * tvl + ageSlope * age);
      }
    },
    robust,
  );
}
