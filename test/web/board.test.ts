import { expect, test } from "vitest";
import type { BoardRow } from "../../src/presentation/web/board.ts";
import { selectRows } from "../../src/presentation/web/board.ts";
import type { SortKey } from "../../src/presentation/web/state.ts";
import { defaultState } from "../../src/presentation/web/state.ts";

const alpha: BoardRow = {
  slug: "a",
  name: "Alpha Capital",
  rank: 1,
  value: 100,
  tvl: 120,
  growth: 2,
  age: 20,
  cost: 0.45,
  time: 40,
  watchlist: true,
  category: "Lending",
  chains: ["Base"],
};

const beta: BoardRow = {
  ...alpha,
  slug: "b",
  name: "Beta Capital",
  rank: 2,
  value: 30,
  tvl: 500,
  growth: -1,
  age: 30,
  cost: 0.8,
  time: 20,
  watchlist: false,
  category: "Yield",
  chains: ["Base", "Arbitrum"],
};

test.each<[SortKey, string[]]>([
  ["rank", ["a", "b"]],
  ["name", ["a", "b"]],
  ["value", ["b", "a"]],
  ["tvl", ["a", "b"]],
  ["growth", ["b", "a"]],
  ["age", ["a", "b"]],
  ["cost", ["a", "b"]],
  ["time", ["b", "a"]],
  ["watchlist", ["b", "a"]],
])("sorts %s in either direction", (sort, ascending) => {
  const rows = [beta, alpha];
  expect(selectRows(rows, { ...defaultState, sort }).map(({ slug }) => slug)).toEqual(ascending);
  expect(selectRows(rows, { ...defaultState, sort, dir: "desc" }).map(({ slug }) => slug)).toEqual(
    ascending.toReversed(),
  );
  expect(rows).toEqual([beta, alpha]);
});

test("sorts ties by slug and puts missing values last in both directions", () => {
  const rows = [
    { ...beta, growth: alpha.growth },
    { ...alpha, slug: "c", growth: null },
    { ...alpha, slug: "d", growth: -5 },
    alpha,
  ];
  expect(selectRows(rows, { ...defaultState, sort: "growth" }).map(({ slug }) => slug)).toEqual([
    "d",
    "a",
    "b",
    "c",
  ]);
  expect(
    selectRows(rows, { ...defaultState, sort: "growth", dir: "desc" }).map(({ slug }) => slug),
  ).toEqual(["a", "b", "d", "c"]);
});

test("requires all filters to match and searches the name without regard to case", () => {
  const rows = [
    alpha,
    beta,
    { ...alpha, slug: "c", category: "Yield" },
    { ...alpha, slug: "d", chains: ["Base Testnet"] },
    { ...alpha, slug: "e", watchlist: false },
    { ...alpha, slug: "capital", name: "No match" },
  ];
  const filter = { ...defaultState, cat: "Lending", chain: "Base", wl: true, q: " CAPITAL " };
  expect(selectRows(rows, filter)).toEqual([alpha]);
  expect(selectRows(rows, { ...filter, chain: "Arbitrum" })).toEqual([]);
});
