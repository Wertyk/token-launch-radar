import type { buildCensus } from "../census/census.ts";
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

export const PENALTY = 1;
export const PRIOR_STRENGTH = 20;

interface OddsFeatures {
  ageDays: number;
  lnTvl: number;
  growth: number;
  lnChains: number;
  category: CategoryGroup;
}

export interface TokenStatusRow extends OddsFeatures {
  slug: string;
  familyKey: string;
  listedAt: string;
  label: number;
}

type CategoryShares = Record<CategoryGroup, number>;

function protocolFeatures(protocol: Protocol, ageDays: number): OddsFeatures {
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
      if (listedAt === null || status === "excluded") return [];
      return [
        {
          ...protocolFeatures(protocol, Math.max(0, daysBetween(listedAt, asOf))),
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
): number[] {
  return [
    clockLogit(clock, row.ageDays),
    ...terms.map((term) => (term === "categoryShare" ? shares[row.category] : row[term])),
  ];
}

function clockLogit(clock: readonly ClockPoint[], age: number): number {
  const share = clamp(shareAt(clock, age), 0.01, 0.99);
  return Math.log(share / (1 - share));
}

export function fitOddsModel(rows: readonly TokenStatusRow[], terms: readonly OddsTerm[]) {
  const shares = categoryTokenShares(rows);
  const clock = fitAgeShares(rows);
  const coefficients = fitLogistic(
    rows.map((row) => oddsFeatures(row, terms, shares, clock)),
    rows.map(({ label }) => label),
    PENALTY,
  );
  return {
    terms,
    coefficients,
    shares,
    clock,
    n: rows.length,
    medianAgeDays: median(rows.map(({ slug, ageDays }) => ({ slug, value: ageDays }))) ?? 0,
    maxAgeDays: rows.reduce((max, { ageDays }) => Math.max(max, ageDays), 0),
  };
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
  const future = clockLogit(clock, age + YEAR_DAYS);
  const rise = future - clockLogit(clock, age);
  // On a flat year, v8 uses the last rising segment's annual tail hazard,
  // or the pooled token share when every segment is flat.
  if (rise === 0) return -Math.expm1(-tailHazard(clock) * YEAR_DAYS);
  return clamp(sigmoid(otherLogit + gamma * future) * -Math.expm1(-gamma * rise), 0, 1);
}

export function protocolOdds(model: OddsModel, protocol: Protocol, asOf: string) {
  const ageDays =
    protocol.listed_at === null
      ? model.medianAgeDays
      : Math.max(0, daysBetween(protocol.listed_at, asOf));
  const { clock, coefficients, shares, terms } = model;
  const features = oddsFeatures(protocolFeatures(protocol, ageDays), terms, shares, clock);
  features[0] = 0;
  const otherLogit = linearScore(features, coefficients);
  const gamma = coefficients[1] ?? 0;
  const oddsAt = (days: number) => launchProbability12(clock, days, otherLogit, gamma);
  return { oddsAge: ageDays, oddsAt, launchProbability12: oddsAt(ageDays) };
}
