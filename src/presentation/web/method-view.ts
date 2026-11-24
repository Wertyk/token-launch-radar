import type { farmAssumptions, formatUsd } from "../../application/browser-api.ts";
import type { RadarResult } from "../../application/build-radar.ts";
import { clockSampleSize } from "./clock-view.ts";
import { formatInteger, formatOdds as pct } from "./format.ts";
import type { HouseRuleEvidence } from "./integrity.ts";
import { multiplier } from "./integrity.ts";
import { table } from "./render.ts";
import type { scatterCoverage } from "./scatter-view.ts";
import { launchValueScatter } from "./scatter-view.ts";

export function methodView(
  {
    model,
    houseRule,
    scatter,
    launchClock,
  }: Pick<RadarResult, "model" | "launchClock"> & {
    houseRule: HouseRuleEvidence;
    scatter: ReturnType<typeof scatterCoverage>;
  },
  farm?: ReturnType<typeof methodFarmAssumptions>,
): string {
  const {
    coefficients: { intercept, lnTvl, lnAge },
    validation,
    ablation,
  } = model;
  const score = ({ medianMultiplier, spearman }: typeof ablation.full) => [
    multiplier(medianMultiplier),
    spearman?.toFixed(3) ?? "—",
  ];
  const section = (title: string, headers: string[], rows: string[][], note?: string) =>
    `<section class="panel"><h2>${title}</h2>${table(headers, rows)}${note ? `<p class="caption">${note}</p>` : ""}</section>`;
  const { points } = launchClock;
  const cards = [
    '<div class="method-value">',
    section(
      "Launch value model",
      ["Term in ln V", "Coefficient"],
      [
        ["Intercept", intercept.toFixed(6)],
        ["ln(TVL·(1+g₇))", lnTvl.toFixed(6)],
        ["ln(age)", lnAge.toFixed(6)],
        ["Ridge penalty λ", String(model.lambda)],
      ],
      `Huber ridge on ${model.n} traded families.`,
    ),
    section(
      "Out-of-sample validation",
      ["Scheme", "Model", "Flat", "Category"],
      (
        [
          ["Leave one family out", validation.leaveOneFamilyOut],
          ["Seeded five-fold", validation.seededFiveFold],
          ["Walk-forward", validation.walkForward],
        ] as const
      ).map(([label, { model: fitted, flatMultiple, categoryMultiple }]) => [
        label,
        ...[fitted, flatMultiple, categoryMultiple].map((s) => score(s).join(" · ")),
      ]),
      "Current traded-family market caps proxy for launch value. Median error ×k and Spearman ρ.",
    ),
    "</div><div>",
    section(
      "Launch clock F(t)",
      ["Mean listing age (days)", "Fitted token share (PAVA)", "Count"],
      points.map(({ ageDays, share, count }) => [ageDays.toFixed(0), pct(share), String(count)]),
      `${formatInteger(clockSampleSize(points))} protocols · P₁₂(t) = [F(t+365) − F(t)] / [1 − F(t)]<br>Flat windows and the tail use the last rising segment’s constant conditional hazard, or the pooled annual rate for a flat fit. The snapshot cannot validate future launch odds.`,
    ),
    section(
      "House watchlist rule",
      ["TP", "FP", "FN"],
      [
        (["truePositives", "falsePositives", "falseNegatives"] as const).map((key) =>
          String(houseRule[key].length),
        ),
      ],
      "DefiLlama marks extra matches with parentProtocol, absent from the snapshot.",
    ),
    "</div><div>",
    section(
      "Leave-one-family-out ablation",
      ["Variant", "Median error", "Spearman ρ"],
      (
        [
          ["Full", ablation.full],
          ["−TVL", ablation.withoutTvl],
          ["−Age", ablation.withoutAge],
          ["−Momentum", ablation.withoutMomentum],
          ["+Category", ablation.withCategory],
          ["OLS", ablation.ols],
        ] as const
      ).map(([label, metrics]) => [label, ...score(metrics)]),
    ),
    launchValueScatter(scatter, validation.leaveOneFamilyOut),
    farm ? section(farm.title, ["Input", "Default"], farm.rows) : "",
    "</div>",
  ];
  return `<div class="method compact">${cards.join("")}</div>`;
}

export function methodFarmAssumptions(farm: typeof farmAssumptions, usd: typeof formatUsd) {
  return {
    title: `Farm assumptions · ${farm.asOf}`,
    rows: [
      ["Horizon", `${farm.horizonMonths} months`],
      ["Airdrop share of launch cap", pct(farm.airdropShareOfLaunchCap)],
      ["Farmer haircut (retained)", pct(farm.farmerHaircut)],
      ["Labor", `${usd(farm.hourlyRateUsd)}/h`],
      [
        "Capital APR",
        `${pct(farm.capitalApr.yieldBearing)} yield-bearing · ${pct(farm.capitalApr.nonYielding)} non-yielding`,
      ],
      ["Verdict test deposits", farm.depositsUsd.map(usd).join(" · ")],
      ["EV / cost cutoffs", `FARM ≥ ${farm.farmThreshold} · THIN ≥ ${farm.thinThreshold}`],
    ],
  };
}
