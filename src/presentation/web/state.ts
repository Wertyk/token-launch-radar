import type { TokenStatus } from "../../domain/census/census.ts";

export const columns = {
  rank: "Rank",
  name: "Protocol",
  value: "Implied value",
  tvl: "TVL",
  growth: "7d %",
  age: "Days with no token",
  cost: "12-mo fees",
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

export const sliderLimits = { share: 100, haircut: 100, rate: 250, yield: 50, carry: 50 };
export type Sliders = Partial<Record<keyof typeof sliderLimits, number>>;

export const statusLabels: Record<TokenStatus, string> = {
  traded: "Token trades",
  "token-unpriced": "Records an unpriced token",
  "pre-token": "Records no token",
  excluded: "Excluded by the house rule",
};

export interface CensusState {
  status: TokenStatus | "";
  sort: "tvl" | "name" | "status" | "reason";
  dir: "asc" | "desc";
}

export const defaultCensus: CensusState = { status: "", sort: "tvl", dir: "desc" };

export interface PlanState {
  budgetUsd: number;
  hoursPerWeek: number;
  chains: string[];
  sliders: Sliders;
}

type Route =
  | { page: "board" | "unknown"; state: BoardState }
  | { page: "protocol"; state: BoardState; slug: string }
  | { page: "plan"; state: PlanState }
  | { page: "method" }
  | { page: "census"; state: CensusState };

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

export function isCensusSortKey(value: string | null | undefined): value is CensusState["sort"] {
  return value === "tvl" || value === "name" || value === "status" || value === "reason";
}

function limit(value: string | null, fallback: number): number {
  const number = Number(value);
  return value?.trim() && Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function parseRoute(hash: string): Route {
  const [path, query] = hash.slice(1).split(/\?(.*)/s, 2);
  const params = new URLSearchParams(query);
  if (path === "/method") return { page: "method" };
  if (path === "/census") {
    const status = params.get("status");
    const sort = params.get("sort");
    return {
      page: "census",
      state: {
        status: status && Object.hasOwn(statusLabels, status) ? (status as TokenStatus) : "",
        sort: isCensusSortKey(sort) ? sort : "tvl",
        dir: params.get("dir") === "asc" ? "asc" : "desc",
      },
    };
  }
  if (path === "/plan") {
    // Split the raw list so an encoded comma can be part of a chain name.
    const list = /(?:^|&)chains=([^&]*)/.exec(query ?? "")?.[1] ?? "";
    const chains = list.split(",").map((part) => new URLSearchParams(`c=${part}`).get("c") ?? "");
    const sliders: Sliders = {};
    for (const key of Object.keys(sliderLimits) as (keyof Sliders)[]) {
      const value = limit(params.get(key), -1);
      if (value >= 0 && value <= sliderLimits[key]) sliders[key] = value;
    }
    return {
      page: "plan",
      state: {
        budgetUsd: limit(params.get("budget"), 5_000),
        hoursPerWeek: limit(params.get("hours"), 3),
        chains: [...new Set(chains.filter(Boolean))],
        sliders,
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

export function planHash({ budgetUsd, hoursPerWeek, chains, sliders }: PlanState): string {
  const list = chains.map(encodeURIComponent).join(",");
  const params = new URLSearchParams({ budget: String(budgetUsd), hours: String(hoursPerWeek) });
  for (const key of Object.keys(sliderLimits) as (keyof Sliders)[]) {
    if (sliders[key] !== undefined) params.set(key, String(sliders[key]));
  }
  return `#/plan?${params}${list ? `&chains=${list}` : ""}`;
}

export function censusHash({ status, sort, dir }: CensusState): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (sort !== defaultCensus.sort || dir !== defaultCensus.dir) {
    params.set("sort", sort);
    params.set("dir", dir);
  }
  return `#/census${params.size ? `?${params}` : ""}`;
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
