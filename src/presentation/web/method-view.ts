import type { farmAssumptions, formatUsd } from "../../application/browser-api.ts";
import type { RadarResult } from "../../application/build-radar.ts";
import { multiplier } from "./integrity.ts";
import { table } from "./render.ts";

export function methodView(
  {
    model,
    houseRule,
    intervalCounts,
    launchClock,
  }: Pick<RadarResult, "model" | "houseRule" | "intervalCounts" | "launchClock">,
  farm: typeof farmAssumptions,
  usd: typeof formatUsd,
): string {
  const { coefficients, validation, ablation } = model;
  const { intercept, lnTvl, lnAge } = coefficients;
  const { leaveOneFamilyOut, seededFiveFold, walkForward } = validation;
  const { full, withoutTvl, withoutAge, withoutMomentum, withCategory, ols } = ablation;
  const score = ({ medianMultiplier, spearman }: typeof full) => [
    multiplier(medianMultiplier),
    spearman?.toFixed(3) ?? "—",
  ];
  const section = (title: string, headers: string[], rows: string[][], note = "") =>
    `<section class="panel"><h3>${title}</h3>${table(headers, rows)}${note ? `<p class="caption">${note}</p>` : ""}</section>`;
  const { truePositives, falsePositives, falseNegatives } = houseRule;
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return `<h2>Method</h2><div class="method compact">
    ${section(
      "Value model",
      ["Term in ln V", "Coefficient"],
      [
        ["Intercept", intercept.toFixed(6)],
        ["ln(TVL·(1+g₇))", lnTvl.toFixed(6)],
        ["ln(age)", lnAge.toFixed(6)],
        ["Ridge penalty λ", String(model.lambda)],
      ],
      `Huber ridge on ${model.n} traded families.`,
    )}
    ${section(
      "Out-of-sample validation",
      ["Scheme", "Model", "Flat", "Category"],
      (
        [
          ["Leave one family out", leaveOneFamilyOut],
          ["Seeded five-fold", seededFiveFold],
          ["Walk-forward", walkForward],
        ] as const
      ).map(([label, { model: fitted, flatMultiple, categoryMultiple }]) => [
        label,
        ...[fitted, flatMultiple, categoryMultiple].map((s) => score(s).join(" · ")),
      ]),
      "Cells show median error ×k and Spearman ρ.",
    )}
    ${section(
      "Leave-one-family-out ablation",
      ["Variant", "Median error", "Spearman ρ"],
      (
        [
          ["Full", full],
          ["−TVL", withoutTvl],
          ["−Age", withoutAge],
          ["−Momentum", withoutMomentum],
          ["+Category", withCategory],
          ["OLS", ols],
        ] as const
      ).map(([label, metrics]) => [label, ...score(metrics)]),
      "Category was tested and rejected. Without age, both scores improve slightly.",
    )}
    ${section(
      "Held-out P10–P90 coverage",
      ["Below P10", "Inside", "Above P90"],
      intervalCounts
        ? [[intervalCounts.missLow, intervalCounts.covered, intervalCounts.missHigh].map(String)]
        : [],
      "Jackknife+ bands.",
    )}
    ${section(
      "Launch clock F(t)",
      ["Mean age (days)", "Fitted token share", "Count"],
      launchClock.points.map(({ ageDays, share, count }) => [
        ageDays.toFixed(0),
        pct(share),
        String(count),
      ]),
      "P12 estimates the next year conditional on recording no token.",
    )}
    ${section(
      "House watchlist rule",
      ["TP", "FP", "FN"],
      [[truePositives.length, falsePositives.length, falseNegatives.length].map(String)],
      "DefiLlama marks the extra matches with parentProtocol, absent from the snapshot.",
    )}
    ${section(
      `Farm assumptions · ${farm.asOf}`,
      ["Input", "Default"],
      [
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
    )}
  </div>`;
}
