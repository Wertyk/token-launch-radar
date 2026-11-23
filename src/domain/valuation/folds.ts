import { compareText } from "../shared/order.ts";
import { mulberry32 } from "../shared/prng.ts";
import type { Comparable } from "./comparables.ts";

const FOLD_COUNT = 5;
const FOLD_SEED = 0x2a14;

export interface Fold<Row extends Comparable = Comparable> {
  train: Row[];
  test: Row[];
}

function bySlug(a: Comparable, b: Comparable): number {
  return compareText(a.slug, b.slug);
}

export function seededFolds<Row extends Comparable>(rows: readonly Row[]): Row[][] {
  const ordered = [...rows].sort(bySlug);
  const keys = [...new Set(ordered.map(({ familyKey }) => familyKey))];
  const next = mulberry32(FOLD_SEED);
  // Remove a randomly selected key from the remaining pool in constant time.
  const assignments = new Map<string, number>();
  while (keys.length > 0) {
    const index = Math.floor(next() * keys.length);
    const key = keys[index];
    const last = keys.pop();
    if (key === undefined || last === undefined) throw new Error("Missing fold family.");
    if (index < keys.length) keys[index] = last;
    assignments.set(key, assignments.size % FOLD_COUNT);
  }
  const folds: Row[][] = Array.from({ length: FOLD_COUNT }, () => []);
  for (const row of ordered) folds[assignments.get(row.familyKey) ?? -1]?.push(row);
  return folds;
}

/** Test each held-out group with the remaining families in a stable order. */
export function splitFolds<Row extends Comparable>(heldOut: readonly Row[][]): Fold<Row>[] {
  return heldOut.map((test, i) => ({
    train: heldOut.flatMap((fold, j) => (i === j ? [] : fold)).sort(bySlug),
    test,
  }));
}

export function walkForwardSplit<Row extends Comparable>(rows: readonly Row[]): Fold<Row> {
  const dated = rows.flatMap((row) => (row.listedAt === null ? [] : [{ row, date: row.listedAt }]));
  dated.sort((a, b) => compareText(a.date, b.date) || bySlug(a.row, b.row));
  const cutoff = Math.floor(dated.length * 0.6);
  const test = dated.slice(cutoff).map(({ row }) => row);
  const heldOut = new Set(test.map(({ familyKey }) => familyKey));
  return { train: rows.filter((row) => !heldOut.has(row.familyKey)).sort(bySlug), test };
}
