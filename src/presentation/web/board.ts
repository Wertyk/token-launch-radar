import type { BoardState, SortKey } from "./state.ts";

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  value: number;
  launchValue: number;
  odds: number;
  interval: readonly [number, number] | null;
  tvl: number;
  growth: number | null;
  age: number | null;
  cost: number;
  time: number;
  watchlist: boolean;
  category: string | null;
  chains: readonly string[];
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

function compareRows(a: BoardRow, b: BoardRow, sort: SortKey, direction: number): number {
  if (sort === "name") return direction * compareText(a.name.toLowerCase(), b.name.toLowerCase());
  const first = a[sort];
  const second = b[sort];
  if (first === second) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return direction * (Number(first) - Number(second));
}

export function selectRows(rows: readonly BoardRow[], state: BoardState): BoardRow[] {
  const { sort, dir, cat, chain, wl } = state;
  const query = state.q.trim().toLowerCase();
  const direction = dir === "asc" ? 1 : -1;
  return rows
    .filter(
      (row) =>
        (!cat || row.category === cat) &&
        (!chain || row.chains.includes(chain)) &&
        (!wl || row.watchlist) &&
        (!query || row.name.toLowerCase().includes(query)),
    )
    .sort((a, b) => compareRows(a, b, sort, direction) || compareText(a.slug, b.slug));
}
