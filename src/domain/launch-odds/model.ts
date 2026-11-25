import { type buildCensus, exclusionReason } from "../census/census.ts";
import type { ClockPoint } from "../launch-clock/clock.ts";
import { fitAgeShares, shareAt, tailHazard, YEAR_DAYS } from "../launch-clock/clock.ts";
import { clamp, median } from "../shared/math.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { daysBetween } from "../snapshot.ts";
import type { CategoryGroup } from "../valuation/categories.ts";
import { categoryGroup, categoryTotals } from "../valuation/categories.ts";
import { logMomentum } from "../valuation/comparables.ts";
import { fitLogistic, linearScore, sigmoid } from "./logistic.ts";

export const ODDS_CANDIDATES = ["lnTvl", "growth", "lnChains", "categoryShare"] as const;
export type OddsTerm = (typeof ODDS_CANDIDATES)[number];

// Retain v9’s logistic penalty on standardized slopes to regularize separable samples.
export const LOGISTIC_PENALTY = 1;
export const PRIOR_STRENGTH = 20;

interface OddsFeatures {
  ageDays: number | null;
  lnTvl: number;
  growth: number;
  lnChains: number;
  category: CategoryGroup;
}

export interface TokenStatusRow extends OddsFeatures {
  slug: string;
  familyKey: string;
  listedAt: string | null;
  label: number;
}

type CategoryShares = Record<CategoryGroup, number>;

function protocolFeatures(protocol: Protocol, ageDays: number | null): OddsFeatures {
  return {
    ageDays,
    lnTvl: Math.log(protocol.tvl_usd),
    growth: logMomentum(protocol.change_7d),
    lnChains: Math.log(Math.max(1, protocol.chains.length)),
    category: categoryGroup(protocol.category),
  };
}

export function oddsPopulation(
  entries: Readonly<ReturnType<typeof buildCensus>>,
  asOf: string,
): TokenStatusRow[] {
  return entries
    .flatMap(({ protocol, status }) => {
      const { slug, listed_at: listedAt } = protocol;
      if (exclusionReason(protocol) !== null) return [];
      return [
        {
          ...protocolFeatures(
            protocol,
            listedAt === null ? null : Math.max(0, daysBetween(listedAt, asOf)),
          ),
          slug,
          familyKey: slug,
          listedAt,
          label: Number(status === "traded" || status === "token-unpriced"),
        },
      ];
    })
    .sort((a, b) => compareText(a.slug, b.slug));
}

export function baseRate(rows: readonly { label: number }[]): number {
  return rows.reduce((sum, { label }) => sum + label, 0) / rows.length;
}

export function categoryTokenShares(
  rows: readonly Pick<TokenStatusRow, "category" | "label">[],
  prior = PRIOR_STRENGTH,
): CategoryShares {
  const counts = categoryTotals();
  const recorded = categoryTotals();
  for (const { category, label } of rows) {
    counts[category]++;
    recorded[category] += label;
  }
  const rate = baseRate(rows);
  for (const category of Object.keys(counts) as CategoryGroup[]) {
    recorded[category] = (recorded[category] + prior * rate) / (counts[category] + prior);
  }
  return recorded;
}

export function oddsFeatures(
  row: OddsFeatures,
  terms: readonly OddsTerm[],
  shares: CategoryShares,
  clock: readonly ClockPoint[],
  medianAgeDays = 0,
): number[] {
  return [
    clockLogit(clock, row.ageDays ?? medianAgeDays),
    ...terms.map((term) => (term === "categoryShare" ? shares[row.category] : row[term])),
  ];
}

function clockLogit(clock: readonly ClockPoint[], age: number): number {
  const share = clamp(shareAt(clock, age), 0.01, 0.99);
  return Math.log(share / (1 - share));
}

export function fitOddsClock(rows: readonly TokenStatusRow[]) {
  const dated = rows.flatMap(({ ageDays, slug, label }) =>
    ageDays === null ? [] : [{ ageDays, slug, label }],
  );
  return {
    clock: dated.length
      ? fitAgeShares(dated)
      : [{ ageDays: 0, share: baseRate(rows), count: rows.length }],
    medianAgeDays: median(dated.map(({ slug, ageDays }) => ({ slug, value: ageDays }))) ?? 0,
    maxAgeDays: dated.reduce((max, { ageDays }) => Math.max(max, ageDays), 0),
  };
}

export function fitOddsModel(rows: readonly TokenStatusRow[], terms: readonly OddsTerm[]) {
  const shares = categoryTokenShares(rows);
  const clockFit = fitOddsClock(rows);
  const coefficients = fitLogistic(
    rows.map((row) => oddsFeatures(row, terms, shares, clockFit.clock, clockFit.medianAgeDays)),
    rows.map(({ label }) => label),
    LOGISTIC_PENALTY,
  );
  return { ...clockFit, terms, coefficients, shares, n: rows.length };
}

export type OddsModel = ReturnType<typeof fitOddsModel>;

export function checkClockCoefficient(gamma = 0): void {
  if (!(gamma > 0)) throw new Error("Token-status clock coefficient γ must be positive.");
}

/** (F(a+365) − F(a)) / (1 − F(a)), factored to avoid subtraction near 1. */
export function launchProbability12(
  clock: readonly ClockPoint[],
  age: number,
  otherLogit: number,
  gamma: number,
): number {
  checkClockCoefficient(gamma);
  return conditionalProbability(clock, age, otherLogit, gamma);
}

function conditionalProbability(
  clock: readonly ClockPoint[],
  age: number,
  otherLogit: number,
  gamma: number,
) {
  const future = clockLogit(clock, age + YEAR_DAYS);
  const rise = gamma * (future - clockLogit(clock, age));
  // On a flat year, v8 uses the last rising segment's annual tail hazard,
  // or the pooled token share when every segment is flat.
  if (rise === 0) return -Math.expm1(-tailHazard(clock) * YEAR_DAYS);
  return clamp(sigmoid(otherLogit + gamma * future) * -Math.expm1(-rise), 0, 1);
}

export function protocolOdds(
  model: OddsModel,
  protocol: Protocol,
  asOf: string,
  probability = launchProbability12,
) {
  const ageDays =
    protocol.listed_at === null
      ? model.medianAgeDays
      : Math.max(0, daysBetween(protocol.listed_at, asOf));
  const { clock, coefficients, shares, terms } = model;
  const features = oddsFeatures(protocolFeatures(protocol, ageDays), terms, shares, clock);
  features[0] = 0;
  const otherLogit = linearScore(features, coefficients);
  const gamma = coefficients[1] ?? 0;
  const oddsAt = (days: number) => probability(clock, days, otherLogit, gamma);
  return { oddsAge: ageDays, oddsAt, launchProbability12: oddsAt(ageDays) };
}

// A bootstrap fit can flatten the clock or have a nonpositive slope. Constrain
// its rise to zero in that case and retain the model's flat-year fallback.
export function bootstrapProbability12(
  clock: readonly ClockPoint[],
  age: number,
  otherLogit: number,
  gamma: number,
) {
  return conditionalProbability(clock, age, otherLogit, Math.max(0, gamma));
}
