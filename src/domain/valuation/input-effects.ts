import { YEAR_DAYS } from "../launch-clock/clock.ts";
import { type OddsModel, protocolOdds } from "../launch-odds/model.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { predictValue, type ValueModel } from "./model.ts";

export type InputEffects = readonly [tvl: number, growth: number, age: number];

function inputEffectContrasts(
  protocol: Protocol,
  asOf: string,
  model: ValueModel,
  odds: OddsModel,
) {
  const baseOdds = protocolOdds(odds, protocol, asOf);
  const base = predictValue(protocol, asOf, model);
  const p12 = baseOdds.launchProbability12;
  const effect = (value: typeof base, probability: number, term?: "lnTvl" | "growth") => {
    const a = base.features;
    const b = value.features;
    const { lnTvl, lnAge } = model.coefficients;
    // Compare in log space to attribute direction to the fitted slopes and conditional odds.
    // A positive clock slope does not force the next annual window to have higher odds.
    const growth = model.momentum ? b.growth - a.growth : 0;
    const i = term === undefined ? -1 : odds.terms.indexOf(term);
    let oddsFromSlope = term === undefined ? probability : p12;
    if (term !== undefined && i >= 0) {
      const [intercept, ...slopes] = odds.coefficients;
      const shift = (slopes[i + 1] ?? NaN) * (b[term] - a[term]);
      oddsFromSlope = protocolOdds(
        { ...odds, coefficients: [(intercept ?? NaN) + shift, ...slopes] },
        protocol,
        asOf,
      ).launchProbability12;
    }
    return [
      ((value.valueUsd * probability) / (base.valueUsd * p12) - 1) * 100,
      100 *
        Math.expm1(
          lnTvl * (b.lnTvl - a.lnTvl + growth) +
            lnAge * (b.lnAge - a.lnAge) +
            Math.log(oddsFromSlope / p12),
        ),
    ] as const;
  };
  const perturb = (record: Protocol, term: "lnTvl" | "growth") =>
    effect(
      predictValue(record, asOf, model),
      protocolOdds(odds, record, asOf).launchProbability12,
      term,
    );
  const nextYear = new Date(Date.parse(asOf) + YEAR_DAYS * 86_400_000).toISOString();
  const agedModel =
    protocol.listed_at === null && model.coefficients.lnAge
      ? { ...model, medianLnAge: Math.log(Math.exp(model.medianLnAge) + YEAR_DAYS) }
      : model;
  return [
    perturb({ ...protocol, tvl_usd: protocol.tvl_usd * 1.1 }, "lnTvl"),
    perturb({ ...protocol, change_7d: (protocol.change_7d ?? 0) + 10 }, "growth"),
    effect(
      predictValue(protocol, nextYear, agedModel),
      baseOdds.oddsAt(baseOdds.oddsAge + YEAR_DAYS),
    ),
  ] as const;
}

export function impliedValueEffects(
  protocol: Protocol,
  asOf: string,
  model: ValueModel,
  odds: OddsModel,
): InputEffects {
  const [tvl, growth, age] = inputEffectContrasts(protocol, asOf, model, odds);
  return [tvl[0], growth[0], age[0]];
}

export function coefficientEffects(
  protocol: Protocol,
  asOf: string,
  model: ValueModel,
  odds: OddsModel,
): InputEffects {
  const [tvl, growth, age] = inputEffectContrasts(protocol, asOf, model, odds);
  return [tvl[1], growth[1], age[1]];
}

export function summarizeEffects(effects: ReadonlyMap<string, InputEffects>) {
  return ([0, 1, 2] as const).map((input) => {
    const values = [...effects];
    if (values.some(([, effect]) => !Number.isFinite(effect[input])))
      return [NaN, NaN, NaN] as const;
    values.sort(([a, x], [b, y]) => x[input] - y[input] || compareText(a, b));
    const n = values.length;
    const at = (i: number) => values[i]?.[1][input] ?? NaN;
    return [
      (at(Math.floor((n - 1) / 2)) + at(Math.floor(n / 2))) / 2,
      at(Math.ceil(0.1 * n) - 1),
      at(Math.ceil(0.9 * n) - 1),
    ] as const;
  });
}
