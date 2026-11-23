export const columns = {
  rank: "Rank",
  name: "Protocol",
  value: "Implied value",
  tvl: "TVL",
  growth: "7d %",
  age: "Days with no token",
  cost: "Plan cost",
  time: "Plan time",
  watchlist: "Watchlist",
} as const;

export type SortKey = keyof typeof columns;

export interface BoardState {
  sort: SortKey;
  dir: "asc" | "desc";
  cat: string;
  chain: string;
  wl: boolean;
  q: string;
}

export interface PlanState {
  budgetUsd: number;
  hoursPerWeek: number;
  chains: string[];
}

type Route =
  | { page: "board" | "unknown"; state: BoardState }
  | { page: "protocol"; state: BoardState; slug: string }
  | { page: "plan"; state: PlanState };

export const defaultState: BoardState = {
  sort: "rank",
  dir: "asc",
  cat: "",
  chain: "",
  wl: false,
  q: "",
};

export function isSortKey(value: string | undefined): value is SortKey {
  return value !== undefined && Object.hasOwn(columns, value);
}

function limit(value: string | null, fallback: number): number {
  const number = Number(value);
  return value?.trim() && Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function parseRoute(hash: string): Route {
  const [path, query] = hash.slice(1).split(/\?(.*)/s, 2);
  const params = new URLSearchParams(query);
  if (path === "/plan") {
    // Split the raw list so an encoded comma can be part of a chain name.
    const list = /(?:^|&)chains=([^&]*)/.exec(query ?? "")?.[1] ?? "";
    const chains = list.split(",").map((part) => new URLSearchParams(`c=${part}`).get("c") ?? "");
    return {
      page: "plan",
      state: {
        budgetUsd: limit(params.get("budget"), 5_000),
        hoursPerWeek: limit(params.get("hours"), 3),
        chains: [...new Set(chains.filter(Boolean))],
      },
    };
  }
  const sort = params.get("sort") ?? undefined;
  const state: BoardState = {
    sort: isSortKey(sort) ? sort : defaultState.sort,
    dir: params.get("dir") === "desc" ? "desc" : "asc",
    cat: params.get("cat") ?? "",
    chain: params.get("chain") ?? "",
    wl: params.get("wl") === "1",
    q: params.get("q") ?? "",
  };
  if (!path || path === "/") return { page: "board", state };
  const segment = /^\/p\/([^/]+)$/.exec(path)?.[1];
  if (segment) {
    try {
      return { page: "protocol", slug: decodeURIComponent(segment), state };
    } catch {
      return { page: "unknown", state };
    }
  }
  return { page: "unknown", state };
}

export function planHash({ budgetUsd, hoursPerWeek, chains }: PlanState): string {
  const list = chains.map(encodeURIComponent).join(",");
  return `#/plan?budget=${budgetUsd}&hours=${hoursPerWeek}${list ? `&chains=${list}` : ""}`;
}

export function boardHash(state: BoardState): string {
  const params = new URLSearchParams();
  if (state.sort !== defaultState.sort || state.dir !== defaultState.dir) {
    params.set("sort", state.sort);
    params.set("dir", state.dir);
  }
  if (state.cat) params.set("cat", state.cat);
  if (state.chain) params.set("chain", state.chain);
  if (state.wl) params.set("wl", "1");
  if (state.q) params.set("q", state.q);
  const query = params.toString();
  return query ? `#/?${query}` : "#/";
}

export function protocolHash(slug: string, state: BoardState): string {
  return `#/p/${encodeURIComponent(slug)}${boardHash(state).slice(2)}`;
}
