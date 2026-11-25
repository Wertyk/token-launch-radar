import { YEAR_DAYS } from "../launch-clock/clock.ts";
import { type OddsModel, protocolOdds } from "../launch-odds/model.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { predictValue, type ValueModel } from "./model.ts";

export type InputEffects = readonly [tvl: number, growth: number, age: number];

export function impliedValueEffects(
  protocol: Protocol,
  asOf: string,
  model: ValueModel,
  odds: OddsModel,
): InputEffects {
  const baseOdds = protocolOdds(odds, protocol, asOf);
  const base = predictValue(protocol, asOf, model).valueUsd * baseOdds.launchProbability12;
  const effect = (value: number, probability: number) => ((value * probability) / base - 1) * 100;
  const perturb = (record: Protocol) =>
    effect(
      predictValue(record, asOf, model).valueUsd,
      protocolOdds(odds, record, asOf).launchProbability12,
    );
  const nextYear = new Date(Date.parse(asOf) + YEAR_DAYS * 86_400_000).toISOString();
  const agedModel =
    protocol.listed_at === null && model.coefficients.lnAge
      ? { ...model, medianLnAge: Math.log(Math.exp(model.medianLnAge) + YEAR_DAYS) }
      : model;
  return [
    perturb({ ...protocol, tvl_usd: protocol.tvl_usd * 1.1 }),
    perturb({ ...protocol, change_7d: (protocol.change_7d ?? 0) + 10 }),
    effect(
      predictValue(protocol, nextYear, agedModel).valueUsd,
      baseOdds.oddsAt(baseOdds.oddsAge + YEAR_DAYS),
    ),
  ];
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
