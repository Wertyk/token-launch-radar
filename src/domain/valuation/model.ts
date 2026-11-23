import type { BoardEntry } from "../census/census.ts";
import { clamp, median } from "../shared/math.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import type { Comparable } from "./comparables.ts";
import { logAge, logMomentum } from "./comparables.ts";
import type { RidgeRow } from "./ridge.ts";
import { fitRidge } from "./ridge.ts";

const FITTED_KEYS = ["lnTvl", "lnAge"] as const;

interface FittedFeatures {
  lnTvl: number;
  lnAge: number;
}

export interface ValueFeatures extends FittedFeatures {
  growth: number;
}

export type FeatureFlag = "growth-missing" | "age-missing" | "outside-comps-range";

export interface FeatureRow {
  features: ValueFeatures;
  flags: FeatureFlag[];
}

export interface ValueModel {
  n: number;
  lambda: number;
  huberScale: number;
  medianLnAge: number;
  featureMeans: FittedFeatures;
  featureRanges: Record<keyof FittedFeatures, { min: number; max: number }>;
  coefficients: FittedFeatures & { intercept: number };
}

export interface Valuation extends FeatureRow {
  valueUsd: number;
  implied_value_usd: number;
  decomposition: {
    base: number;
    multipliers: FittedFeatures & { growth: number };
  };
}

export interface RankedRow extends BoardEntry, Valuation {
  rank: number;
}

type FittedTerm = "tvl" | "age";

interface FitOptions {
  drop?: FittedTerm;
  robust?: boolean;
}

export function valueFeatures(protocol: Protocol, asOf: string, medianLnAge: number): FeatureRow {
  const flags: FeatureFlag[] = [];
  if (protocol.change_7d === null) flags.push("growth-missing");
  if (protocol.listed_at === null) flags.push("age-missing");

  return {
    features: {
      lnTvl: Math.log(protocol.tvl_usd),
      lnAge: protocol.listed_at === null ? medianLnAge : logAge(protocol.listed_at, asOf),
      growth: logMomentum(protocol.change_7d),
    },
    flags,
  };
}

function featureStats(values: readonly number[]) {
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    sum += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const mean = min === max ? min : sum / values.length;
  const scale = Math.sqrt(
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
  );
  return { mean, scale, range: { min, max } };
}

export function prepareFit(rows: readonly Comparable[], drop?: FittedTerm) {
  const n = rows.length;
  if (n === 0) throw new Error("The value model needs at least one traded comparable.");

  const medianLnAge =
    median(rows.flatMap(({ slug, lnAge }) => (lnAge === null ? [] : [{ slug, value: lnAge }]))) ??
    0;
  const tvl = featureStats(rows.map(({ lnTvl }) => lnTvl));
  const age = featureStats(rows.map(({ lnAge }) => lnAge ?? medianLnAge));
  const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / n;
  const tvlScale = drop === "tvl" ? 0 : tvl.scale;
  const ageScale = drop === "age" ? 0 : age.scale;
  const design: RidgeRow[] = rows.map((row) => ({
    target: row.target - targetMean,
    tvl: tvlScale ? (row.lnTvl - tvl.mean) / tvlScale : 0,
    age: ageScale ? ((row.lnAge ?? medianLnAge) - age.mean) / ageScale : 0,
  }));
  return {
    design,
    targetMean,
    tvlScale,
    ageScale,
    metadata: {
      n,
      medianLnAge,
      featureMeans: { lnTvl: tvl.mean, lnAge: age.mean },
      featureRanges: { lnTvl: tvl.range, lnAge: age.range },
    },
  };
}

export function restoreCoefficients(
  { targetMean, tvlScale, ageScale, metadata: { featureMeans } }: ReturnType<typeof prepareFit>,
  centeredIntercept: number,
  tvlSlope: number,
  ageSlope: number,
): ValueModel["coefficients"] {
  const lnTvl = tvlScale ? tvlSlope / tvlScale : 0;
  const lnAge = ageScale ? ageSlope / ageScale : 0;
  const intercept =
    targetMean + centeredIntercept - lnTvl * featureMeans.lnTvl - lnAge * featureMeans.lnAge;
  return { intercept, lnTvl, lnAge };
}

export function fitValueModel(
  rows: readonly Comparable[],
  lambda: number,
  { drop, robust = true }: FitOptions = {},
): ValueModel {
  const prepared = prepareFit(rows, drop);
  const {
    coefficients: [base = 0, tvl = 0, age = 0],
    huberScale,
  } = fitRidge(prepared.design, lambda, robust);
  return {
    ...prepared.metadata,
    lambda,
    huberScale,
    coefficients: restoreCoefficients(prepared, base, tvl, age),
  };
}

export function logValue(
  { lnTvl, growth, lnAge }: ValueFeatures,
  { coefficients }: Pick<ValueModel, "coefficients">,
): number {
  return (
    coefficients.intercept + coefficients.lnTvl * (lnTvl + growth) + coefficients.lnAge * lnAge
  );
}

export function predictValue(protocol: Protocol, asOf: string, model: ValueModel): Valuation {
  const row = valueFeatures(protocol, asOf, model.medianLnAge);
  const { featureMeans, featureRanges, coefficients } = model;
  const { features } = row;
  if (
    FITTED_KEYS.some((key) => {
      const { min, max } = featureRanges[key];
      return features[key] < min || features[key] > max;
    })
  ) {
    row.flags.push("outside-comps-range");
  }
  const { intercept, lnTvl, lnAge } = coefficients;
  const logBase = intercept + lnTvl * featureMeans.lnTvl + lnAge * featureMeans.lnAge;
  const valueUsd = Math.exp(logValue(features, model));

  return {
    ...row,
    valueUsd,
    implied_value_usd: clamp(Math.round(valueUsd), 1, 1e14),
    decomposition: {
      base: Math.exp(logBase),
      multipliers: {
        lnTvl: Math.exp(lnTvl * (features.lnTvl - featureMeans.lnTvl)),
        growth: Math.exp(lnTvl * features.growth),
        lnAge: Math.exp(lnAge * (features.lnAge - featureMeans.lnAge)),
      },
    },
  };
}

export function rankBoard(
  entries: readonly BoardEntry[],
  asOf: string,
  model: ValueModel,
): RankedRow[] {
  return entries
    .map((entry) => ({ ...entry, ...predictValue(entry.protocol, asOf, model) }))
    .sort(
      (a, b) =>
        b.implied_value_usd - a.implied_value_usd || compareText(a.protocol.slug, b.protocol.slug),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
