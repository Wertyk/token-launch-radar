import type { BoardEntry, CensusEntry } from "../census/census.ts";
import { clamp, median } from "../shared/math.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { daysBetween } from "../snapshot.ts";
import { choleskySolve } from "./linalg.ts";

const RIDGE = 1e-6;
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
    multipliers: ValueFeatures;
  };
}

export interface RankedRow extends BoardEntry, Valuation {
  rank: number;
}

function logAge(listedAt: string, asOf: string): number {
  return Math.log(Math.max(1, daysBetween(listedAt, asOf)));
}

function featuresForFit(protocol: Protocol, asOf: string, medianLnAge: number): FittedFeatures {
  // Age is time since listing for comparables and time running with no token for pre-token rows.
  return {
    lnTvl: Math.log(protocol.tvl_usd),
    lnAge: protocol.listed_at === null ? medianLnAge : logAge(protocol.listed_at, asOf),
  };
}

export function valueFeatures(protocol: Protocol, asOf: string, medianLnAge: number): FeatureRow {
  const flags: FeatureFlag[] = [];
  if (protocol.change_7d === null) flags.push("growth-missing");
  if (protocol.listed_at === null) flags.push("age-missing");

  return {
    features: {
      ...featuresForFit(protocol, asOf, medianLnAge),
      growth:
        protocol.change_7d === null ? 0 : Math.log1p(clamp(protocol.change_7d, -50, 100) / 100),
    },
    flags,
  };
}

function fittingSet(census: readonly CensusEntry[]) {
  const families = new Map<string, Protocol & { mcap_usd: number }>();
  const independent: (Protocol & { mcap_usd: number })[] = [];
  for (const { protocol, status } of census) {
    if (status !== "traded" || protocol.mcap_usd === null) continue;
    const comparable = { ...protocol, mcap_usd: protocol.mcap_usd };
    const family = protocol.gecko_id;
    if (family === null) {
      independent.push(comparable);
      continue;
    }
    const prior = families.get(family);
    if (!prior || compareText(protocol.slug, prior.slug) < 0) families.set(family, comparable);
  }
  return [...independent, ...families.values()].sort((a, b) => compareText(a.slug, b.slug));
}

export function fitValueModel(census: readonly CensusEntry[], asOf: string): ValueModel {
  const comparables = fittingSet(census);
  const n = comparables.length;
  if (n === 0) throw new Error("The value model needs at least one traded comparable.");

  const knownAges = comparables.flatMap(({ slug, listed_at }) =>
    listed_at === null ? [] : [{ slug, value: logAge(listed_at, asOf) }],
  );
  const medianLnAge = median(knownAges) ?? 0;
  const rows = comparables.map((protocol) => ({
    features: featuresForFit(protocol, asOf, medianLnAge),
    target: Math.log(protocol.mcap_usd),
  }));
  const featureStats = (key: keyof FittedFeatures) => {
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const { features } of rows) {
      const value = features[key];
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { mean: sum / n, range: { min, max } };
  };
  const tvl = featureStats("lnTvl");
  const age = featureStats("lnAge");
  const featureMeans = { lnTvl: tvl.mean, lnAge: age.mean };
  const featureRanges = { lnTvl: tvl.range, lnAge: age.range };
  const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / n;
  const centered = rows.map(({ features, target }) => ({
    features: {
      lnTvl: features.lnTvl - featureMeans.lnTvl,
      lnAge: features.lnAge - featureMeans.lnAge,
    },
    target: target - targetMean,
  }));

  // Centering solves the normal equations for the slopes while leaving the intercept unpenalized.
  const normal = FITTED_KEYS.map((first) =>
    FITTED_KEYS.map((second) =>
      centered.reduce(
        (sum, row) => sum + row.features[first] * row.features[second],
        first === second ? RIDGE : 0,
      ),
    ),
  );
  const rhs = FITTED_KEYS.map((key) =>
    centered.reduce((sum, row) => sum + row.features[key] * row.target, 0),
  );
  const [lnTvl, lnAge] = choleskySolve(normal, rhs);
  if (lnTvl === undefined || lnAge === undefined) {
    throw new Error("The value model requires two fitted slopes.");
  }
  const intercept = targetMean - lnTvl * featureMeans.lnTvl - lnAge * featureMeans.lnAge;
  return { n, medianLnAge, featureMeans, featureRanges, coefficients: { intercept, lnTvl, lnAge } };
}

/**
 * Comparables' seven-day TVL change mixes in their own token's price, making a fitted
 * growth slope specific to traded protocols. Price one week of TVL momentum using
 * the fitted TVL elasticity.
 */
export function predictValue(protocol: Protocol, asOf: string, model: ValueModel): Valuation {
  const row = valueFeatures(protocol, asOf, model.medianLnAge);
  const {
    featureMeans,
    featureRanges,
    coefficients: { intercept, lnTvl, lnAge },
  } = model;
  const { features } = row;
  if (
    FITTED_KEYS.some((key) => {
      const { min, max } = featureRanges[key];
      return features[key] < min || features[key] > max;
    })
  ) {
    row.flags.push("outside-comps-range");
  }
  const logValue = intercept + lnTvl * (features.lnTvl + features.growth) + lnAge * features.lnAge;
  const logBase = intercept + lnTvl * featureMeans.lnTvl + lnAge * featureMeans.lnAge;
  const valueUsd = Math.exp(logValue);

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
