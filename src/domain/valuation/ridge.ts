import { diagonalPenalty, dot, weightedLeastSquares } from "./linalg.ts";

export interface RidgeRow {
  tvl: number;
  age: number;
  target: number;
  group?: number;
}

function medianInPlace(values: Float64Array): number {
  values.sort();
  const middle = Math.floor(values.length / 2);
  const upper = values[middle] ?? 0;
  return values.length % 2 ? upper : ((values[middle - 1] ?? upper) + upper) / 2;
}

//! Huber IRLS uses w = min(1, 1.345 × scaled MAD / |residual|).
export function fitHuber(
  design: readonly (readonly number[])[],
  targets: readonly number[],
  penalty: readonly (readonly number[])[],
  robust = true,
  ridge = false,
): { coefficients: number[]; huberScale: number } {
  const weights = new Float64Array(targets.length).fill(1);
  const residuals = weights.slice();
  const scratch = weights.slice();
  let coefficients: number[] = [];
  let huberScale = 1e-8;
  for (let iteration = 0; iteration <= 20; iteration++) {
    const next = weightedLeastSquares(design, targets, weights, penalty, ridge);
    for (let i = 0; i < design.length; i++) {
      residuals[i] = scratch[i] =
        (targets[i] as number) - dot(design[i] as readonly number[], next);
    }
    const center = medianInPlace(scratch);
    for (const [i, value] of residuals.entries()) scratch[i] = Math.abs(value - center);
    huberScale = Math.max(1e-8, 1.4826 * medianInPlace(scratch));
    const converged = next.every(
      (value, i) => Math.abs(value - (coefficients[i] ?? Infinity)) < 1e-5,
    );
    coefficients = next;
    if (!robust || converged) break;
    for (const [i, residual] of residuals.entries())
      weights[i] = Math.min(1, (1.345 * huberScale) / Math.abs(residual));
  }
  return { coefficients, huberScale };
}

//! Ridge uses unit weights.
export function fitRidge(
  rows: readonly RidgeRow[],
  lambda: number,
  robust: boolean,
  groupPenalty: readonly number[][] = [],
) {
  const penalty = diagonalPenalty(groupPenalty.length + 3, lambda);
  for (const [i, row] of groupPenalty.entries()) penalty[i + 1] = [0, ...row.slice(0, i + 1)];
  const design = rows.map(({ group, tvl, age }) => [
    1,
    ...groupPenalty.map((_, i) => Number(group === i + 1)),
    tvl,
    age,
  ]);
  const targets = rows.map(({ target }) => target);
  return fitHuber(design, targets, penalty, robust, true);
}
