import { FARM_ASSUMPTIONS as farmAssumptions } from "../domain/farming/assumptions.ts";
import {
  depositAmounts,
  estimateFarmEconomics,
  farmEconomicsTerms,
} from "../domain/farming/economics.ts";
import { makeFarmPlan, occurrences, shorten } from "../domain/farming/plans.ts";
import { launchProbability12 } from "../domain/launch-odds/model.ts";
import { formatUsd } from "../domain/shared/money.ts";
import { compareText } from "../domain/shared/order.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { daysBetween } from "../domain/snapshot.ts";
import { MIN_BAND_FAMILIES } from "../domain/valuation/jackknife.ts";
import { logValue } from "../domain/valuation/model.ts";
import { recomputeRadar as buildRadar } from "./recompute-radar.ts";

export type { BoardRows } from "./board-rows.ts";
export type { RadarRow } from "./recompute-radar.ts";
export {
  buildRadar,
  daysBetween,
  estimateFarmEconomics,
  farmAssumptions,
  formatUsd,
  launchProbability12,
  logValue,
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
  MIN_BAND_FAMILIES,
  depositAmounts,
  farmEconomicsTerms,
  makeFarmPlan,
  occurrences,
  shorten,
  farmAssumptions,
  estimateFarmEconomics,
  formatUsd,
  compareText,
  daysBetween,
  logValue,
  buildRadar,
  readPublishedSnapshot,
};
