export function dot(a: readonly number[], b: readonly number[], end = a.length): number {
  let sum = 0;
  for (let i = 0; i < end; i++) sum += (a[i] as number) * (b[i] ?? 0);
  return sum;
}

export function diagonalPenalty(width: number, lambda: number): number[][] {
  return Array.from({ length: width }, (_, i) => [...Array<number>(i).fill(0), i ? lambda : 0]);
}

export type StabilizeSystem = (normal: number[][], rhs: number[]) => void;

//! Solve (XᵀWX + penalty) b = XᵀWy.
export function weightedLeastSquares(
  design: readonly (readonly number[])[],
  targets: readonly number[],
  weights: ArrayLike<number>,
  penalty: readonly (readonly number[])[],
  stabilize?: StabilizeSystem,
): number[] {
  const normal = penalty.map((row) => [...row]);
  const rhs = normal.map(() => 0);
  for (let i = 0; i < design.length; i++) {
    const row = design[i] as readonly number[];
    const weight = weights[i] ?? 1;
    const target = targets[i] as number;
    for (let j = 0; j < normal.length; j++) {
      const value = row[j] as number;
      if (value === 0) continue;
      const line = normal[j] as number[];
      const scaled = weight * value;
      rhs[j] = (rhs[j] as number) + scaled * target;
      for (let k = 0; k <= j; k++) line[k] = (line[k] as number) + scaled * (row[k] as number);
    }
  }
  stabilize?.(normal, rhs);
  return choleskySolve(normal, rhs);
}

//! Cholesky with in-place triangular solves.
export function choleskySolve(lower: number[][], solution: number[]): number[] {
  for (const [i, row] of lower.entries()) {
    for (let j = 0; j <= i; j++) {
      const previous = lower[j] as readonly number[];
      const pivot = (row[j] as number) - dot(row, previous, j);
      if (j === i && !(pivot > 0 && Number.isFinite(pivot)))
        throw new Error("Cholesky requires positive, finite pivots.");
      row[j] = j === i ? Math.sqrt(pivot) : pivot / (previous[j] as number);
    }
    solution[i] = ((solution[i] as number) - dot(row, solution, i)) / (row[i] as number);
  }
  for (let i = lower.length - 1; i >= 0; i--) {
    const row = lower[i] as readonly number[];
    const value = (solution[i] as number) / (row[i] as number);
    solution[i] = value;
    for (let j = 0; j < i; j++) solution[j] = (solution[j] as number) - value * (row[j] as number);
  }
  return solution;
}
