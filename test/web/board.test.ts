import { expect, test } from "vitest";
import { compareText } from "../../src/domain/shared/order.ts";
import type { BoardRow } from "../../src/presentation/web/board.ts";
import { selectRows as select } from "../../src/presentation/web/board.ts";
import { serializeBoard } from "../../src/presentation/web/board-export.ts";
import type { BoardState, SortKey } from "../../src/presentation/web/state.ts";
import { defaultState } from "../../src/presentation/web/state.ts";

const selectRows = (rows: readonly BoardRow[], state: BoardState) =>
  select(rows, state, compareText);

const alpha: BoardRow = {
  slug: "a",
  name: "Alpha Capital",
  rank: 1,
  value: 100,
  launchValue: 200,
  odds: 0.5,
  interval: null,
  tvl: 120,
  growth: 2,
  age: 40,
  rankRange: [1, 2],
  cost: 0.45,
  time: 40,
  verdict: "FARM",
  netPerHour: 35,
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
  launchValue: 300,
  odds: 0.1,
  tvl: 500,
  growth: -1,
  cost: 0.8,
  time: 20,
  verdict: "SKIP",
  netPerHour: -2,
  watchlist: false,
  category: "Yield",
  chains: ["Base", "Arbitrum"],
};

test.each<[SortKey, string[]]>([
  ["rank", ["a", "b"]],
  ["name", ["a", "b"]],
  ["value", ["b", "a"]],
  ["launchValue", ["a", "b"]],
  ["odds", ["b", "a"]],
  ["tvl", ["a", "b"]],
  ["growth", ["b", "a"]],
  ["cost", ["a", "b"]],
  ["time", ["b", "a"]],
  ["verdict", ["b", "a"]],
  ["netPerHour", ["b", "a"]],
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

test("sorts all three verdicts in economic order and breaks net-per-hour ties by slug", () => {
  const thin: BoardRow = { ...alpha, slug: "c", verdict: "THIN", netPerHour: beta.netPerHour };
  const rows = [thin, alpha, beta];
  expect(selectRows(rows, { ...defaultState, sort: "verdict" }).map(({ slug }) => slug)).toEqual([
    "b",
    "c",
    "a",
  ]);
  expect(
    selectRows(rows, { ...defaultState, sort: "netPerHour", dir: "desc" }).map(({ slug }) => slug),
  ).toEqual(["a", "b", "c"]);
});

test("exports exactly the filtered rows in display order", () => {
  const visible = selectRows([beta, alpha], { ...defaultState, wl: true });
  expect(JSON.parse(serializeBoard(visible, "json"))).toEqual([alpha]);
  expect(serializeBoard(visible, "csv")).toContain('"Alpha Capital"');
  expect(serializeBoard(visible, "csv")).not.toContain("Beta Capital");
});
