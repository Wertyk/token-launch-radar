import { FARM_ASSUMPTIONS as farmAssumptions } from "../domain/farming/assumptions.ts";
import { estimateFarmEconomics } from "../domain/farming/economics.ts";
import { planPortfolio } from "../domain/farming/portfolio.ts";
import { launchProbability12 } from "../domain/launch-clock/clock.ts";
import { formatUsd } from "../domain/shared/money.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { daysBetween } from "../domain/snapshot.ts";
import { logValue } from "../domain/valuation/model.ts";
import { recomputeRadar as buildRadar } from "./build-radar.ts";

export type { BoardRows } from "./board-rows.ts";
export type { RadarRow } from "./build-radar.ts";
export {
  buildRadar,
  daysBetween,
  estimateFarmEconomics,
  farmAssumptions,
  formatUsd,
  launchProbability12,
  logValue,
  planPortfolio,
};

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

export const browserApi = {
  farmAssumptions,
  estimateFarmEconomics,
  planPortfolio,
  launchProbability12,
  formatUsd,
  daysBetween,
  logValue,
  buildRadar,
  readPublishedSnapshot,
};
