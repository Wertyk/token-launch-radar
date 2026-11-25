import { FARM_ASSUMPTIONS as farmAssumptions } from "../domain/farming/assumptions.ts";
import {
  depositAmounts,
  estimateFarmEconomics,
  farmEconomicsTerms,
} from "../domain/farming/economics.ts";
import { makeFarmPlan } from "../domain/farming/plans.ts";
import { launchProbability12 } from "../domain/launch-odds/model.ts";
import { validateOdds } from "../domain/launch-odds/validation.ts";
import { formatUsd } from "../domain/shared/money.ts";
import { compareText } from "../domain/shared/order.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { daysBetween } from "../domain/snapshot.ts";
import { groupComparableCategories } from "../domain/valuation/categories.ts";
import { MIN_BAND_FAMILIES, rangeHonesty } from "../domain/valuation/jackknife.ts";
import { logValue } from "../domain/valuation/model.ts";
import { selectValueTerms, type ValueTrialFit } from "../domain/valuation/value-selection.ts";
import { recomputeRadar } from "./recompute-radar.ts";

export type { BoardRows } from "./board-rows.ts";
export type { RadarRow } from "./recompute-radar.ts";
export { recomputeRadar as buildRadar } from "./recompute-radar.ts";
export {
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

function reproduceSelection(
  { comparables, families, population }: ReturnType<typeof recomputeRadar>,
  trialFit: ValueTrialFit,
) {
  return {
    value: selectValueTerms(groupComparableCategories(comparables, families), trialFit),
    odds: validateOdds(population),
  };
}

export const browserApi = {
  rangeHonesty,
  reproduceSelection,
  MIN_BAND_FAMILIES,
  depositAmounts,
  farmEconomicsTerms,
  makeFarmPlan,
  farmAssumptions,
  estimateFarmEconomics,
  formatUsd,
  compareText,
  daysBetween,
  logValue,
  buildRadar: recomputeRadar,
  readPublishedSnapshot,
};
