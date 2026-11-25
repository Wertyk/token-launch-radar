import type { BoardEntry } from "../census/census.ts";
import { clamp, featureStats, median } from "../shared/math.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import type { CategoryGroup } from "./categories.ts";
import { categoryGroup, categoryTotals } from "./categories.ts";
import type { Comparable } from "./comparables.ts";
import { logAge, logMomentum } from "./comparables.ts";
import { medianInPlace } from "./huber.ts";
import type { RidgeRow } from "./ridge.ts";
import { fitRidge } from "./ridge.ts";

const FITTED_KEYS = ["lnTvl", "lnAge"] as const;

interface FittedFeatures {
  lnTvl: number;
  lnAge: number;
}

interface ValueFeatures extends FittedFeatures {
  growth: number;
  category?: CategoryGroup;
}

type FeatureFlag = "growth-missing" | "age-missing" | "outside-comps-range";

interface FeatureRow {
  features: ValueFeatures;
  flags: FeatureFlag[];
}

export interface ValueModel {
  n: number;
  momentum: boolean;
  categoryEffects?: Record<CategoryGroup, number>;
  lambda: number;
  huberScale: number;
  medianLnAge: number;
  featureMeans: FittedFeatures;
  featureRanges: Record<keyof FittedFeatures, { min: number; max: number }>;
  coefficients: FittedFeatures & { intercept: number };
}

interface Valuation extends FeatureRow {
  valueUsd: number;
  launch_value_usd: number;
  decomposition: {
    base: number;
    multipliers: FittedFeatures & { growth: number; category?: number };
  };
}

interface LaunchCandidate extends BoardEntry {
  launchProbability12: number;
}

export interface RankedRow extends LaunchCandidate, Valuation {
  implied_value_usd: number;
  rank: number;
}

type FittedTerm = "tvl" | "age";

export interface FitOptions {
  drop?: FittedTerm;
  robust?: boolean;
  momentum?: boolean;
  reportScale?: boolean;
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

export function prepareFit(
  rows: readonly Comparable[],
  drop?: FittedTerm,
  category?: CategoryDesign,
) {
  const n = rows.length;
  if (n === 0) throw new Error("The value model needs at least one traded comparable.");

  const medianLnAge = medianAge(rows);
  const tvl = featureStats(rows.map(({ lnTvl }) => lnTvl));
  const age = featureStats(rows.map(({ lnAge }) => lnAge ?? medianLnAge));
  const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / n;
  const tvlScale = drop === "tvl" ? 0 : tvl.scale;
  const ageScale = drop === "age" ? 0 : age.scale;
  const design: RidgeRow[] = rows.map((row) => ({
    target: row.target - targetMean,
    tvl: tvlScale ? (row.lnTvl - tvl.mean) / tvlScale : 0,
    age: ageScale ? ((row.lnAge ?? medianLnAge) - age.mean) / ageScale : 0,
    group: category?.groupBySlug.get(row.slug) ?? 0,
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

function medianAge(rows: readonly Comparable[]): number {
  const ages = new Float64Array(rows.length);
  let count = 0;
  for (const { lnAge } of rows) {
    if (lnAge === null) continue;
    if (!Number.isFinite(lnAge) || Object.is(lnAge, -0)) {
      return (
        median(
          rows.flatMap(({ slug, lnAge }) => (lnAge === null ? [] : [{ slug, value: lnAge }])),
        ) ?? 0
      );
    }
    ages[count++] = lnAge;
  }
  return medianInPlace(ages.subarray(0, count));
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

export interface CategoryDesign {
  groups: CategoryGroup[];
  groupBySlug: ReadonlyMap<string, number>;
  contrastShares: number[];
  penalty: number[][];
}

export function fitValueModel(
  rows: readonly Comparable[],
  lambda: number,
  { drop, robust = true, momentum = true, reportScale = true }: FitOptions = {},
  category?: CategoryDesign,
): ValueModel {
  const prepared = prepareFit(rows, drop, category);
  const { coefficients, huberScale } = fitRidge(
    prepared.design,
    lambda,
    robust,
    category?.penalty,
    reportScale,
  );
  const tvlColumn = category?.groups.length ?? 1;
  const center =
    category?.contrastShares.reduce(
      (sum, share, i) => sum + share * (coefficients[i + 1] ?? 0),
      0,
    ) ?? 0;
  const categoryEffects = category && categoryTotals();
  category?.groups.forEach((key, i) => {
    if (categoryEffects) categoryEffects[key] = (i ? (coefficients[i] ?? 0) : 0) - center;
  });
  return {
    ...prepared.metadata,
    lambda,
    momentum,
    huberScale,
    coefficients: restoreCoefficients(
      prepared,
      (coefficients[0] ?? 0) + center,
      coefficients[tvlColumn] ?? 0,
      coefficients[tvlColumn + 1] ?? 0,
    ),
    ...(categoryEffects && { categoryEffects }),
  };
}

export function logValue(
  { lnTvl, growth, lnAge, category }: ValueFeatures,
  {
    coefficients,
    momentum = true,
    categoryEffects,
  }: Pick<ValueModel, "coefficients" | "categoryEffects"> & Partial<Pick<ValueModel, "momentum">>,
): number {
  return (
    coefficients.intercept +
    coefficients.lnTvl * (lnTvl + (momentum ? growth : 0)) +
    coefficients.lnAge * lnAge +
    (categoryEffects?.[category ?? "other"] ?? 0)
  );
}

export function predictValue(protocol: Protocol, asOf: string, model: ValueModel): Valuation {
  const row = valueFeatures(protocol, asOf, model.medianLnAge);
  const { featureMeans, featureRanges, coefficients } = model;
  const { features } = row;
  if (model.categoryEffects) features.category = categoryGroup(protocol.category);
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
    launch_value_usd: clamp(Math.round(valueUsd), 1, 1e14),
    decomposition: {
      base: Math.exp(logBase),
      multipliers: {
        lnTvl: Math.exp(lnTvl * (features.lnTvl - featureMeans.lnTvl)),
        growth: Math.exp(lnTvl * (model.momentum === false ? 0 : features.growth)),
        lnAge: Math.exp(lnAge * (features.lnAge - featureMeans.lnAge)),
        ...(model.categoryEffects && {
          category: Math.exp(model.categoryEffects[features.category ?? "other"]),
        }),
      },
    },
  };
}

export function rankBoard<Entry extends LaunchCandidate>(
  entries: readonly Entry[],
  asOf: string,
  model: ValueModel,
): (Entry & RankedRow)[] {
  return entries
    .map((entry) => {
      const value = predictValue(entry.protocol, asOf, model);
      return {
        ...entry,
        ...value,
        implied_value_usd: Math.max(
          1,
          Math.round(value.launch_value_usd * entry.launchProbability12),
        ),
      };
    })
    .sort(
      (a, b) =>
        b.implied_value_usd - a.implied_value_usd || compareText(a.protocol.slug, b.protocol.slug),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
