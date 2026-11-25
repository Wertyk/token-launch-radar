import type { TokenStatus } from "../../domain/census/census.ts";
import {
  type BoardState,
  type CensusState,
  columns,
  defaultState,
  type SortKey,
  statusLabels,
} from "./state.ts";

type Route =
  | { page: "board" | "unknown"; state: BoardState }
  | { page: "protocol"; state: BoardState; slug: string }
  | { page: "plan" }
  | { page: "method" }
  | { page: "census"; state: CensusState };

export function isSortKey(value: string | null | undefined): value is SortKey {
  return value === "time" || Object.hasOwn(columns, value ?? "");
}

export function isCensusSortKey(value: string | null | undefined): value is CensusState["sort"] {
  return value === "tvl" || value === "name" || value === "status" || value === "reason";
}

export function parseRoute(hash: string): Route {
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
  const sort = params.get("sort");
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
  try {
    if (segment) return { page: "protocol", slug: decodeURIComponent(segment), state };
  } catch {
    // Malformed encodings resolve to the unknown route.
  }
  return { page: "unknown", state };
}
