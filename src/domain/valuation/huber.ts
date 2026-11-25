import { dot, type StabilizeSystem, weightedLeastSquares } from "./linalg.ts";

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
  stabilize?: StabilizeSystem,
): { coefficients: number[]; huberScale: number } {
  const weights = new Float64Array(targets.length).fill(1);
  const residuals = weights.slice();
  const scratch = weights.slice();
  let coefficients: number[] = [];
  let huberScale = 1e-8;
  for (let iteration = 0; iteration <= 20; iteration++) {
    const next = weightedLeastSquares(design, targets, weights, penalty, stabilize);
    for (let i = 0; i < design.length; i++) {
      residuals[i] = scratch[i] =
        (targets[i] as number) - dot(design[i] as readonly number[], next);
    }
    const center = medianInPlace(scratch);
    for (let i = 0; i < residuals.length; i++)
      scratch[i] = Math.abs((residuals[i] as number) - center);
    huberScale = Math.max(1e-8, 1.4826 * medianInPlace(scratch));
    const converged = next.every(
      (value, i) => Math.abs(value - (coefficients[i] ?? Infinity)) < 1e-5,
    );
    coefficients = next;
    if (!robust || converged) break;
    for (let i = 0; i < residuals.length; i++)
      weights[i] = Math.min(1, (1.345 * huberScale) / Math.abs(residuals[i] as number));
  }
  return { coefficients, huberScale };
}
