import type { browserApi } from "../../application/browser-api.ts";
import type { FarmEconomics } from "../../domain/farming/economics.ts";
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
  rankRange: readonly [number, number] | null;
  cost: number;
  time: number;
  verdict: FarmEconomics["deposits"][number]["verdict"];
  netPerHour: number;
  watchlist: boolean;
  category: string | null;
  chains: readonly string[];
}

const verdictOrder = { SKIP: 0, THIN: 1, FARM: 2 };

function compareRows(
  a: BoardRow,
  b: BoardRow,
  sort: SortKey,
  direction: number,
  compareText: typeof browserApi.compareText,
): number {
  if (sort === "name") return direction * compareText(a.name.toLowerCase(), b.name.toLowerCase());
  if (sort === "verdict") return direction * (verdictOrder[a.verdict] - verdictOrder[b.verdict]);
  const first = a[sort];
  const second = b[sort];
  if (first === null || second === null) return Number(first === null) - Number(second === null);
  return direction * (Number(first) - Number(second));
}

export function selectRows(
  rows: readonly BoardRow[],
  state: BoardState,
  compareText: typeof browserApi.compareText,
): BoardRow[] {
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
    .sort((a, b) => compareRows(a, b, sort, direction, compareText) || compareText(a.slug, b.slug));
}
