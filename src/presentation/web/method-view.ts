import type { RadarResult } from "../../application/build-radar.ts";
import { multiplier } from "./integrity.ts";
import type { termTrials } from "./method-extras.ts";
import { table } from "./render.ts";
import type { scatterCoverage } from "./scatter-view.ts";
import { launchValueScatter } from "./scatter-view.ts";

export function methodPanel(title: string, headers: string[], rows: string[][], note?: string) {
  return `<section class="panel"><h2>${title}</h2>${table(headers, rows)}${note ? `<p class="caption">${note}</p>` : ""}</section>`;
}

export function methodView(
  {
    model,
    odds,
    scatter,
  }: Pick<RadarResult, "model" | "odds"> & {
    scatter: ReturnType<typeof scatterCoverage>;
  },
  notes?: (panel: typeof methodPanel) => string,
  renderTrials?: typeof termTrials,
): string {
  const {
    coefficients: { intercept, lnTvl, lnAge },
    validation,
    selection,
  } = model;
  const { baselines, scores } = odds.validation;
  const brier = (x: number | null) => x?.toFixed(4) ?? "—";
  const oddsHeaders = ["10-fold Brier", "Walk-forward Brier"];
  const cards = [
    '<div class="method-value">',
    methodPanel(
      "Launch value model",
      ["Term in ln V", "Coefficient"],
      [
        ["Intercept", intercept.toFixed(6)],
        [model.momentum ? "ln(TVL·(1+g₇))" : "ln(TVL)", lnTvl.toFixed(6)],
        ...(selection.terms.includes("age") ? [["ln(age)", lnAge.toFixed(6)]] : []),
        ...Object.entries(model.categoryEffects ?? {}).map(([group, effect]) => [
          group,
          effect.toFixed(6),
        ]),
        ["Ridge penalty λ", String(model.lambda)],
      ],
      `Huber ridge on ${model.n} traded families.`,
    ),
    methodPanel(
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
        ...[fitted, flatMultiple, categoryMultiple].map(
          ({ medianMultiplier, spearman }) =>
            `${multiplier(medianMultiplier)} · ${spearman?.toFixed(3) ?? "—"}`,
        ),
      ]),
      "Current traded-family market caps proxy for launch value. Median error ×k and Spearman ρ.",
    ),
    renderTrials?.(selection, "Value", table) ?? "",
    "</div><div>",
    methodPanel(
      "Token-status model",
      ["Term in logit F(a)", "Coefficient"],
      odds.names.map((name, i) => [name, odds.coefficients[i]?.toFixed(6) ?? "—"]),
      `S(a) is the PAVA share clamped to 0.01–0.99. P₁₂ = [F(a+365) − F(a)] / [1 − F(a)]. Flat years use the annual tail hazard. Undated age ${odds.medianAgeDays} days.`,
    ),
    methodPanel(
      "Held-out token status",
      ["Model", ...oddsHeaders],
      [
        ["Base rate", ...baselines.baseRate.map(brier)],
        ["Raw PAVA clock", ...baselines.pava.map(brier)],
        ["Clock-only model (step 0)", ...baselines.clockOnly.map(brier)],
        ["Final model", ...scores.map(brier)],
      ],
      "Each fold refits its clock. Brier scores current token status. P₁₂ assumes the cross-section behaves like a cohort.",
    ),
    renderTrials?.(odds.validation, "Odds", table) ?? "",
    "</div><div>",
    launchValueScatter(scatter, validation.leaveOneFamilyOut),
    notes?.(methodPanel) ?? "",
    "</div>",
  ];
  return `<div class="method compact">${cards.join("")}</div>`;
}
