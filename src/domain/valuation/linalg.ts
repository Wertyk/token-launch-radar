export function zeroMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => Array<number>(size).fill(0));
}

/** Adds the weighted outer product to the lower triangle, using only nonzero columns. */
export function addOuterProduct(
  matrix: number[][],
  row: readonly number[],
  weight: number,
  columns: readonly number[],
): void {
  for (const [i, column] of columns.entries()) {
    const line = matrix[column];
    if (!line) throw new Error("Incomplete normal matrix.");
    const scaled = weight * (row[i] ?? 0);
    for (let j = 0; j <= i; j++) {
      const other = columns[j] ?? 0;
      line[other] = (line[other] ?? 0) + scaled * (row[j] ?? 0);
    }
  }
}

function at(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error("Incomplete linear system.");
  return value;
}

/** Solves Ax = b for a symmetric positive-definite A by factoring A = LLᵀ. */
export function choleskySolve(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] {
  const n = matrix.length;
  if (rhs.length !== n || matrix.some((row) => row.length !== n)) {
    throw new Error("The linear system requires a square matrix and a matching right-hand side.");
  }

  const lower: number[][] = [];
  const solution: number[] = [];
  for (const [i, row] of matrix.entries()) {
    const factor: number[] = [];
    let diagonal = at(row, i);
    let target = at(rhs, i);
    for (const [j, previous] of lower.entries()) {
      let value = at(row, j);
      for (const [k, entry] of factor.entries()) value -= entry * at(previous, k);
      const entry = value / at(previous, j);
      factor.push(entry);
      diagonal -= entry ** 2;
      target -= entry * at(solution, j);
    }
    if (!(diagonal > 0) || !Number.isFinite(diagonal)) {
      throw new Error("Cholesky factorization requires a positive-definite matrix.");
    }
    const root = Math.sqrt(diagonal);
    factor.push(root);
    lower.push(factor);
    solution.push(target / root);
  }

  for (let i = n - 1; i >= 0; i--) {
    const row = lower[i] ?? [];
    const value = at(solution, i) / at(row, i);
    solution[i] = value;
    for (let j = 0; j < i; j++) solution[j] = at(solution, j) - value * at(row, j);
  }
  return solution;
}
