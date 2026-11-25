import type { TokenStatus } from "../../domain/census/census.ts";

export const columns = {
  rank: "Rank",
  name: "Protocol",
  value: "Implied value",
  launchValue: "Launch value",
  odds: "Odds 12m",
  tvl: "TVL",
  growth: "7d %",
  age: "Days listed",
  cost: "Plan",
  verdict: "Verdict",
  netPerHour: "Net/h",
  watchlist: "Watchlist",
} as const;

export type SortKey = keyof typeof columns | "time";

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

const defaultSort = "rank";
export const defaultState: BoardState = {
  sort: defaultSort,
  dir: "asc",
  cat: "",
  chain: "",
  wl: false,
  q: "",
};

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
