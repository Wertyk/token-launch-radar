import type { Snapshot } from "../domain/snapshot.ts";

export { FARM_ASSUMPTIONS as farmAssumptions } from "../domain/farming/assumptions.ts";
export { estimateFarmEconomics } from "../domain/farming/economics.ts";
export { planPortfolio } from "../domain/farming/portfolio.ts";
export { shareAt as clockShareAt } from "../domain/launch-clock/clock.ts";
export { formatUsd } from "../domain/shared/money.ts";
export { daysBetween } from "../domain/snapshot.ts";
export type { BoardRows } from "./board-rows.ts";
export type { RadarRow } from "./build-radar.ts";
export { recomputeRadar as buildRadar } from "./build-radar.ts";

export interface PublishedSnapshot extends Pick<Snapshot, "protocols" | "watchlist"> {
  meta: Pick<Snapshot, "as_of" | "floor_usd" | "source"> & { protocolCount: number };
}

export function readPublishedSnapshot({
  meta,
  protocols,
  watchlist,
}: PublishedSnapshot): Snapshot | null {
  if (
    !Array.isArray(protocols) ||
    !Array.isArray(watchlist) ||
    protocols.length !== meta?.protocolCount
  ) {
    return null;
  }
  const { as_of, floor_usd, source } = meta;
  return { as_of, floor_usd, source, protocols, watchlist };
}
