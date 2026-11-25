import { fitHuber } from "./huber.ts";
import { diagonalPenalty } from "./linalg.ts";

export { fitHuber } from "./huber.ts";

export interface RidgeRow {
  tvl: number;
  age: number;
  target: number;
  group?: number;
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
  return fitHuber(design, targets, penalty, robust, (normal, rhs) => {
    const [, [, tvl = 0] = [], [, cross = 0, age = 0] = []] = normal;
    // In unpenalized ridge with collinear slopes, keep TVL and fix age at zero.
    if (
      normal.length === 3 &&
      penalty[2]?.[2] === 0 &&
      tvl > 0 &&
      age > 0 &&
      cross ** 2 >= (1 - 8 * Number.EPSILON) * tvl * age
    ) {
      normal[2] = [0, 0, 1];
      rhs[2] = 0;
    }
    for (const [i, row] of normal.entries()) {
      if (i >= normal.length - 2 && row[i] === 0) row[i] = 1;
    }
  });
}
