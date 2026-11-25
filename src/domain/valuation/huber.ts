import {
  dot,
  type RidgeRow,
  ridgeGroup,
  type StabilizeSystem,
  weightedLeastSquares,
  weightedRidgeLeastSquares,
} from "./linalg.ts";

export function medianInPlace(values: Float64Array): number {
  const middle = Math.floor(values.length / 2);
  let left = 0;
  let right = values.length - 1;
  // Partition around the upper median. All entries before it are no larger.
  let partitions = 2 * Math.ceil(Math.log2(values.length));
  while (left < right && partitions-- > 0) {
    let low = left;
    let high = right;
    const a = values[left] as number;
    const b = values[(left + right) >>> 1] as number;
    const c = values[right] as number;
    const pivot = a < b ? Math.max(a, Math.min(b, c)) : Math.max(b, Math.min(a, c));
    if (Number.isNaN(pivot)) {
      values.sort();
      break;
    }
    while (low <= high) {
      while ((values[low] as number) < pivot) low++;
      while (!((values[high] as number) <= pivot)) high--;
      if (low <= high) {
        const value = values[low] as number;
        values[low++] = values[high] as number;
        values[high--] = value;
      }
    }
    if (middle <= high) right = high;
    else if (middle >= low) left = low;
    else break;
  }
  // Native ordering distinguishes the two signed zeros and places NaNs last.
  if (partitions <= 0 || values[middle] === 0 || Number.isNaN(values[middle])) {
    values.sort();
    left = middle - 1;
  }
  const upper = values[middle] ?? 0;
  if (values.length % 2 || middle === 0) return upper;
  const from = left < middle ? left : 0;
  let lower = values[from] as number;
  for (let i = from + 1; i < middle; i++) lower = Math.max(lower, values[i] as number);
  return (lower + upper) / 2;
}

//! Huber IRLS uses w = min(1, 1.345 × scaled MAD / |residual|).
export function fitHuber(
  design: readonly (readonly number[])[] | { rows: readonly RidgeRow[] },
  targets: readonly number[],
  penalty: readonly (readonly number[])[],
  robust = true,
  stabilize?: StabilizeSystem,
  reportScale = true,
): { coefficients: number[]; huberScale: number } {
  const count = "rows" in design ? design.rows.length : targets.length;
  const weights = new Float64Array(count).fill(1);
  const residuals = weights.slice();
  const scratch = weights.slice();
  let coefficients: number[] = [];
  let huberScale = 1e-8;
  const ageColumn = penalty.length - 1;
  const tvlColumn = ageColumn - 1;
  const normal = penalty.map((row) => [...row]);
  // Alternate RHS buffers so the convergence check can still read the previous fit.
  const solutions = [normal.map(() => 0), normal.map(() => 0)] as const;
  for (let iteration = 0; iteration <= 20; iteration++) {
    const next =
      "rows" in design
        ? weightedRidgeLeastSquares(
            design.rows,
            weights,
            penalty,
            normal,
            solutions[iteration % 2] as number[],
            stabilize,
          )
        : weightedLeastSquares(design, targets, weights, penalty, stabilize);
    const converged = next.every(
      (value, i) => Math.abs(value - (coefficients[i] ?? Infinity)) < 1e-5,
    );
    coefficients = next;
    // Selection uses the coefficients alone. Residuals from the final solve
    // cannot affect those coefficients and are only needed for the reported scale.
    if (!reportScale && (!robust || converged || iteration === 20)) break;
    if ("rows" in design) {
      for (let i = 0; i < design.rows.length; i++) {
        const { target, tvl, age, group } = design.rows[i] as RidgeRow;
        const contrast = ridgeGroup(group, tvlColumn);
        const intercept = 0 + (next[0] as number);
        const fitted =
          (contrast ? intercept + (next[contrast] as number) : intercept) +
          tvl * (next[tvlColumn] as number) +
          age * (next[ageColumn] as number);
        residuals[i] = scratch[i] = target - fitted;
      }
    } else {
      for (let i = 0; i < design.length; i++) {
        residuals[i] = scratch[i] =
          (targets[i] as number) - dot(design[i] as readonly number[], next);
      }
    }
    const center = medianInPlace(scratch);
    for (let i = 0; i < residuals.length; i++)
      scratch[i] = Math.abs((residuals[i] as number) - center);
    huberScale = Math.max(1e-8, 1.4826 * medianInPlace(scratch));
    if (!robust || converged) break;
    for (let i = 0; i < residuals.length; i++)
      weights[i] = Math.min(1, (1.345 * huberScale) / Math.abs(residuals[i] as number));
  }
  return { coefficients, huberScale };
}
