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
  for (const [i, row] of matrix.entries()) {
    const factorRow: number[] = [];
    for (const [j, priorRow] of lower.entries()) {
      let residual = at(row, j);
      for (const [k, value] of factorRow.entries()) {
        residual -= value * at(priorRow, k);
      }
      factorRow.push(residual / at(priorRow, j));
    }

    const diagonal = factorRow.reduce((sum, value) => sum - value * value, at(row, i));
    if (!Number.isFinite(diagonal) || diagonal <= 0) {
      throw new Error("Cholesky factorization requires a positive-definite matrix.");
    }
    factorRow.push(Math.sqrt(diagonal));
    lower.push(factorRow);
  }

  // Forward substitution solves Ly = b.
  const y: number[] = [];
  for (const [i, row] of lower.entries()) {
    let residual = at(rhs, i);
    for (const [j, value] of y.entries()) residual -= at(row, j) * value;
    y.push(residual / at(row, i));
  }

  // Backward substitution solves Lᵀx = y.
  const x: number[] = [];
  for (const [reverseIndex, row] of lower.toReversed().entries()) {
    const i = n - 1 - reverseIndex;
    let residual = at(y, i);
    for (let j = i + 1; j < n; j++) {
      const factorRow = lower[j];
      if (!factorRow) throw new Error("Incomplete Cholesky factor.");
      residual -= at(factorRow, i) * at(x, j);
    }
    x[i] = residual / at(row, i);
  }
  return x;
}
