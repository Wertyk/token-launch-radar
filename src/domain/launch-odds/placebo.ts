import { mulberry32 } from "../shared/prng.ts";
import type { OddsTerm, TokenStatusRow } from "./model.ts";
import { prepareOddsFit } from "./model.ts";
import { oddsValidationFolds, scoreOdds, statusPredictor } from "./validation.ts";

export const PLACEBO_SEED = 0x29b3;

export function growthPlacebo(
  rows: readonly TokenStatusRow[],
  terms: readonly OddsTerm[],
  shuffles: number,
  seed = PLACEBO_SEED,
) {
  const random = mulberry32(seed);
  const indexed = new Map(rows.map(({ slug }, i) => [slug, i]));
  const copies = new Map(rows.map((row) => [row, { ...row }]));
  const copy = (row: TokenStatusRow) => copies.get(row) as TokenStatusRow;
  const prep = new Map<readonly TokenStatusRow[], ReturnType<typeof prepareOddsFit>>();
  const folds = oddsValidationFolds(rows).map((scheme) =>
    scheme.map(({ train, test }) => {
      const training = train.map(copy);
      // Shuffling growth leaves the clock and category shares for each fold fixed.
      if (train.length && test.length) prep.set(training, prepareOddsFit(training));
      return { train: training, test: test.map(copy) };
    }),
  );
  const predict = (train: readonly TokenStatusRow[]) =>
    statusPredictor(train, terms, prep.get(train));
  const real = scoreOdds(folds, predict);
  const wins = real.map(() => 0);

  for (let i = 0; i < shuffles; i++) {
    const growth = rows.map((row) => row.growth);
    for (let j = growth.length - 1; j > 0; j--) {
      const k = Math.floor(random() * (j + 1));
      const saved = growth[j] as number;
      growth[j] = growth[k] as number;
      growth[k] = saved;
    }
    for (const [row, shuffled] of copies)
      shuffled.growth = growth[indexed.get(row.slug) ?? -1] ?? row.growth;
    scoreOdds(folds, predict).forEach((score, j) => {
      const observed = real[j];
      if (score !== null && observed != null && score <= observed) wins[j] = (wins[j] ?? 0) + 1;
    });
  }
  return {
    shuffles,
    seed,
    real,
    asGoodOrBetter: real.map((score, i) => (score === null ? null : (wins[i] ?? 0) / shuffles)),
  };
}
