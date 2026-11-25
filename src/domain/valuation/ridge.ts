import { fitHuber } from "./huber.ts";
import { diagonalPenalty, type RidgeRow, stabilizeRidge } from "./linalg.ts";

export { fitHuber } from "./huber.ts";
export type { RidgeRow } from "./linalg.ts";

//! Ridge uses unit weights.
export function fitRidge(
  rows: readonly RidgeRow[],
  lambda: number,
  robust: boolean,
  groupPenalty: readonly number[][] = [],
  reportScale = true,
) {
  const penalty = diagonalPenalty(groupPenalty.length + 3, lambda);
  for (const [i, row] of groupPenalty.entries()) penalty[i + 1] = [0, ...row.slice(0, i + 1)];
  const finite = rows.every(
    ({ tvl, age, target }) =>
      Number.isFinite(tvl) && Number.isFinite(age) && Number.isFinite(target),
  );
  const design =
    finite && groupPenalty.every((line) => line.every((value) => !Object.is(value, -0)))
      ? { rows }
      : rows.map(({ group, tvl, age }) => [
          1,
          ...groupPenalty.map((_, i) => Number(group === i + 1)),
          tvl,
          age,
        ]);
  const targets = "rows" in design ? [] : rows.map(({ target }) => target);
  //! For collinear unpenalized slopes, keep TVL and fix the final column (age) at zero.
  return fitHuber(
    design,
    targets,
    penalty,
    robust,
    lambda > 0
      ? undefined
      : (normal, rhs) => stabilizeRidge(normal, rhs, lambda === 0 ? 2 : undefined),
    reportScale,
  );
}
