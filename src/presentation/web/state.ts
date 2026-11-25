import type { TokenStatus } from "../../domain/census/census.ts";

export const columns = {
  rank: "Rank",
  name: "Protocol",
  value: "Implied value",
  launchValue: "Launch value",
  odds: "Odds 12m",
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
  unranked?: boolean;
}

export const defaultCensus: CensusState = { status: "", sort: "tvl", dir: "desc" };

type Route =
  | { page: "board" | "unknown"; state: BoardState }
  | { page: "protocol"; state: BoardState; slug: string }
  | { page: "plan" }
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

export function parseRoute(hash: string): Route {
  return pageRoute(hash, readBoardState);
}

export function pageRoute(hash: string, readBoard?: typeof readBoardState): Route {
  const [path, query] = hash.slice(1).split(/\?(.*)/s, 2);
  if (path === "/method") return { page: "method" };
  if (path === "/plan") return { page: "plan" };
  const params = new URLSearchParams(query);
  if (path === "/census") {
    const status = params.get("status");
    const sort = params.get("sort");
    return {
      page: "census",
      state: {
        status: status && Object.hasOwn(statusLabels, status) ? (status as TokenStatus) : "",
        sort: isCensusSortKey(sort) ? sort : "tvl",
        dir: params.get("dir") === "asc" ? "asc" : "desc",
        unranked: params.get("unranked") === "1",
      },
    };
  }
  const state = readBoard?.(params) ?? defaultState;
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

export function readBoardState(params: URLSearchParams): BoardState {
  const sort = params.get("sort") ?? undefined;
  return {
    sort: isSortKey(sort) ? sort : defaultState.sort,
    dir: params.get("dir") === "desc" ? "desc" : "asc",
    cat: params.get("cat") ?? "",
    chain: params.get("chain") ?? "",
    wl: params.get("wl") === "1",
    q: params.get("q") ?? "",
  };
}

export function censusHash({ status, sort, dir, unranked }: CensusState): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (unranked) params.set("unranked", "1");
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
  return protocolHref(slug, boardHash(state));
}

export function protocolHref(slug: string, back: string): string {
  return `#/p/${encodeURIComponent(slug)}${back.slice(2)}`;
}
