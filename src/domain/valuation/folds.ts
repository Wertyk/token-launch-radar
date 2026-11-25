import { compareText } from "../shared/order.ts";
import { mulberry32 } from "../shared/prng.ts";
import type { Comparable } from "./comparables.ts";

const FOLD_COUNT = 5;
const FOLD_SEED = 0x2a14;

interface FoldRow {
  slug: string;
  familyKey: string;
  listedAt: string | null;
}

export interface Fold<Row extends FoldRow = Comparable> {
  train: Row[];
  test: Row[];
}

function bySlug(a: FoldRow, b: FoldRow): number {
  return compareText(a.slug, b.slug);
}

export function seededFolds<Row extends FoldRow>(
  rows: readonly Row[],
  count = FOLD_COUNT,
): Row[][] {
  const ordered = [...rows].sort(bySlug);
  const keys = [...new Set(ordered.map(({ familyKey }) => familyKey))];
  const next = mulberry32(FOLD_SEED);
  // Remove a randomly selected key from the remaining pool in constant time.
  const assignments = new Map<string, number>();
  while (keys.length > 0) {
    const index = Math.floor(next() * keys.length);
    assignments.set(keys[index] as string, assignments.size % count);
    const last = keys.pop() as string;
    if (index < keys.length) keys[index] = last;
  }
  const folds: Row[][] = Array.from({ length: count }, () => []);
  for (const row of ordered) folds[assignments.get(row.familyKey) ?? -1]?.push(row);
  return folds;
}

/** Test each held-out group with the remaining families in a stable order. */
export function splitFolds<Row extends FoldRow>(heldOut: readonly Row[][]): Fold<Row>[] {
  const ordered = heldOut
    .flatMap((fold, index) => fold.map((row) => ({ row, index })))
    .sort((a, b) => bySlug(a.row, b.row));
  return heldOut.map((test, i) => {
    const train: Row[] = [];
    for (const { row, index } of ordered) if (index !== i) train.push(row);
    return { train, test };
  });
}

export function walkForwardSplit<Row extends FoldRow>(rows: readonly Row[]): Fold<Row> {
  const dated = rows
    .filter((row): row is Row & { listedAt: string } => row.listedAt !== null)
    .sort((a, b) => compareText(a.listedAt, b.listedAt) || bySlug(a, b));
  const cutoff = Math.floor(dated.length * 0.6);
  const lastTrainingDate = dated[cutoff - 1]?.listedAt;
  const test = dated.slice(cutoff).filter(({ listedAt }) => listedAt !== lastTrainingDate);
  const heldOut = new Set(test.map(({ familyKey }) => familyKey));
  return { train: dated.filter((row) => !heldOut.has(row.familyKey)).sort(bySlug), test };
}
