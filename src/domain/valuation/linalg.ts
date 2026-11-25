export function dot(a: readonly number[], b: readonly number[], end = a.length): number {
  let sum = 0;
  for (let i = 0; i < end; i++) sum += (a[i] as number) * (b[i] ?? 0);
  return sum;
}

export function diagonalPenalty(width: number, lambda: number): number[][] {
  return Array.from({ length: width }, (_, i) => [...Array<number>(i).fill(0), i ? lambda : 0]);
}

export type StabilizeSystem = (normal: number[][], rhs: number[]) => void;

export function stabilizeRidge(normal: number[][], rhs: number[], pinnedColumn?: number): void {
  const [, [, first = 0] = [], [, cross = 0, second = 0] = []] = normal;
  if (
    normal.length === 3 &&
    pinnedColumn !== undefined &&
    first > 0 &&
    second > 0 &&
    cross ** 2 >= (1 - 8 * Number.EPSILON) * first * second
  ) {
    for (let i = pinnedColumn + 1; i < normal.length; i++) {
      const row = normal[i] as number[];
      row[pinnedColumn] = 0;
    }
    normal[pinnedColumn] = Array.from({ length: pinnedColumn + 1 }, (_, i) =>
      Number(i === pinnedColumn),
    );
    rhs[pinnedColumn] = 0;
  }
  for (let i = normal.length - 2; i < normal.length; i++) {
    const row = normal[i] as number[];
    if (row[i] === 0) row[i] = 1;
  }
}

export interface RidgeRow {
  tvl: number;
  age: number;
  target: number;
  group?: number;
}

export function ridgeGroup(group: number | undefined, tvlColumn: number): number {
  return group && group > 0 && group < tvlColumn && Number.isInteger(group) ? group : 0;
}

// Treatment coding has an intercept, at most one active contrast and two slopes.
// Accumulate each populated cell in the same row and multiplication order as dense WLS.
export function weightedRidgeLeastSquares(
  rows: readonly RidgeRow[],
  weights: Float64Array,
  penalty: readonly (readonly number[])[],
  normal: number[][],
  rhs: number[],
  stabilize?: StabilizeSystem,
): number[] {
  rhs.fill(0);
  for (let i = 0; i < penalty.length; i++) {
    const line = normal[i] as number[];
    const prior = penalty[i] as readonly number[];
    for (let j = 0; j < prior.length; j++) line[j] = prior[j] as number;
  }
  const ageColumn = normal.length - 1;
  const tvlColumn = ageColumn - 1;
  const intercept = normal[0] as number[];
  const tvlLine = normal[tvlColumn] as number[];
  const ageLine = normal[ageColumn] as number[];
  for (let i = 0; i < rows.length; i++) {
    const { tvl, age, target, group } = rows[i] as RidgeRow;
    const contrast = ridgeGroup(group, tvlColumn);
    const weight = weights[i] as number;
    const weightedTarget = weight * target;
    rhs[0] = (rhs[0] as number) + weightedTarget;
    intercept[0] = (intercept[0] as number) + weight;
    if (contrast) {
      const line = normal[contrast] as number[];
      rhs[contrast] = (rhs[contrast] as number) + weightedTarget;
      line[0] = (line[0] as number) + weight;
      line[contrast] = (line[contrast] as number) + weight;
    }
    if (tvl !== 0) {
      const scaled = weight * tvl;
      rhs[tvlColumn] = (rhs[tvlColumn] as number) + scaled * target;
      tvlLine[0] = (tvlLine[0] as number) + scaled;
      if (contrast) tvlLine[contrast] = (tvlLine[contrast] as number) + scaled;
      tvlLine[tvlColumn] = (tvlLine[tvlColumn] as number) + scaled * tvl;
    }
    if (age !== 0) {
      const scaled = weight * age;
      rhs[ageColumn] = (rhs[ageColumn] as number) + scaled * target;
      ageLine[0] = (ageLine[0] as number) + scaled;
      if (contrast) ageLine[contrast] = (ageLine[contrast] as number) + scaled;
      ageLine[tvlColumn] = (ageLine[tvlColumn] as number) + scaled * tvl;
      ageLine[ageColumn] = (ageLine[ageColumn] as number) + scaled * age;
    }
  }
  stabilize?.(normal, rhs);
  return choleskySolve(normal, rhs);
}

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
  for (let i = 0; i < lower.length; i++) {
    const row = lower[i] as number[];
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
