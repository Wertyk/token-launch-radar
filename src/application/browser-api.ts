import { FARM_ASSUMPTIONS as farmAssumptions } from "../domain/farming/assumptions.ts";
import {
  depositAmounts,
  estimateFarmEconomics,
  farmEconomicsTerms,
} from "../domain/farming/economics.ts";
import { makeFarmPlan } from "../domain/farming/plans.ts";
import { launchProbability12 } from "../domain/launch-odds/model.ts";
import { growthPlacebo } from "../domain/launch-odds/placebo.ts";
import { scoreOddsEvidence, selectOddsTerms } from "../domain/launch-odds/validation.ts";
import { formatUsd } from "../domain/shared/money.ts";
import { compareText } from "../domain/shared/order.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import { daysBetween } from "../domain/snapshot.ts";
import {
  coefficientEffects,
  impliedValueEffects,
  summarizeEffects,
} from "../domain/valuation/input-effects.ts";
import { MIN_BAND_FAMILIES, rangeHonesty } from "../domain/valuation/jackknife.ts";
import { logValue } from "../domain/valuation/model.ts";
import { scoreValueEvidence } from "../domain/valuation/validation.ts";
import { selectValueTerms } from "../domain/valuation/value-selection.ts";
import { bootstrapRadar, EVIDENCE_REPLICATES } from "./bootstrap-radar.ts";
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

function reproduceSelection({ comparables, population }: ReturnType<typeof recomputeRadar>) {
  return {
    value: selectValueTerms(comparables),
    odds: selectOddsTerms(population),
  };
}

function reproduceDiagnostics(
  { board, comparables, population, model, odds }: ReturnType<typeof recomputeRadar>,
  terms: Parameters<typeof bootstrapRadar>[4],
  asOf: string,
) {
  return {
    bootstrap: bootstrapRadar(board, comparables, population, model, terms, odds, asOf),
    placebo: growthPlacebo(population, odds.terms, EVIDENCE_REPLICATES),
  };
}

export const browserApi = {
  coefficientEffects,
  impliedValueEffects,
  summarizeEffects,
  rangeHonesty,
  reproduceSelection,
  scoreValueEvidence,
  scoreOddsEvidence,
  reproduceDiagnostics,
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
