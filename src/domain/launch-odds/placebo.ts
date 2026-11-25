import { mulberry32 } from "../shared/prng.ts";
import type { OddsTerm, TokenStatusRow } from "./model.ts";
import { oddsValidationFolds, scoreOdds, statusPredictor } from "./validation.ts";

export function growthPlacebo(
  rows: readonly TokenStatusRow[],
  terms: readonly OddsTerm[],
  shuffles: number,
) {
  const random = mulberry32(0x29b3);
  const folds = oddsValidationFolds(rows);
  const predict = (train: readonly TokenStatusRow[]) => statusPredictor(train, terms);
  const real = scoreOdds(folds, predict);
  const wins = real.map(() => 0);
  const indexed = new Map(rows.map(({ slug }, i) => [slug, i]));

  for (let i = 0; i < shuffles; i++) {
    const growth = rows.map((row) => row.growth);
    for (let j = growth.length - 1; j > 0; j--) {
      const k = Math.floor(random() * (j + 1));
      const saved = growth[j] as number;
      growth[j] = growth[k] as number;
      growth[k] = saved;
    }
    const shuffled = (row: TokenStatusRow) => ({
      ...row,
      growth: growth[indexed.get(row.slug) ?? -1] ?? row.growth,
    });
    const permuted = folds.map((scheme) =>
      scheme.map(({ train, test }) => ({ train: train.map(shuffled), test: test.map(shuffled) })),
    );
    scoreOdds(permuted, predict).forEach((score, j) => {
      const observed = real[j];
      if (score !== null && observed != null && score <= observed) wins[j] = (wins[j] ?? 0) + 1;
    });
  }
  return {
    shuffles,
    real,
    asGoodOrBetter: real.map((score, i) => (score === null ? null : (wins[i] ?? 0) / shuffles)),
  };
}
