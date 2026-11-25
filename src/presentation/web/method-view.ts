import type { RadarResult } from "../../application/build-radar.ts";
import { formatOdds } from "./format.ts";
import { multiplier } from "./integrity.ts";
import { brier, rangeRows } from "./kpis.ts";
import { table } from "./render.ts";

export function methodPanel(title: string, headers: string[], rows: string[][], note?: string) {
  return `<section class="panel"><h2>${title}</h2>${table(headers, rows)}${note ? `<p class="caption">${note}</p>` : ""}</section>`;
}

function termTrials(
  kind: "Value" | "Odds",
  selection: RadarResult["model"]["selection"] | RadarResult["odds"]["validation"],
  note?: string,
) {
  const errors =
    kind === "Value" ? ["LOO log error", "WF log error"] : ["10-fold Brier", "WF Brier"];
  const rows = selection.steps.flatMap(({ baseline, trials }, i) => [
    [String(i + 1), "Current terms", ...baseline.map(brier), "—"],
    ...trials.map(({ term, scores, kept }) => [
      String(i + 1),
      term,
      ...scores.map(brier),
      kept ? "Kept" : "Not kept",
    ]),
  ]);
  return methodPanel(`${kind} term selection`, ["Step", "Term", ...errors, "Decision"], rows, note);
}

export function methodView(
  {
    model,
    odds,
    rangeHonesty,
    bootstrap,
    placebo,
  }: Pick<RadarResult, "model" | "odds" | "rangeHonesty" | "bootstrap" | "placebo">,
  notes?: (panel: typeof methodPanel) => string,
): string {
  const {
    coefficients: { intercept, lnTvl, lnAge },
    validation,
    selection,
  } = model;
  const { baselines, scores } = odds.validation;
  const coef = (value?: number | null) => value?.toFixed(6) ?? "—";
  const { valueErrors } = bootstrap;
  const errorNote = `${bootstrap.replicates} bootstrap refits.`;
  const category = model.trialFit?.categoryTrial;
  const categoryNote = category
    ? `Category trial λ ${category.lambda} × ${category.categoryPenaltyMultiple} for group effects.`
    : "Category trial parameters unavailable.";

  const cards = [
    '<div class="method-value">',
    methodPanel(
      "Launch value model",
      ["Term in ln V", "Coefficient", "Bootstrap SE"],
      [
        ["Intercept", coef(intercept), coef(valueErrors.intercept)],
        [model.momentum ? "ln(TVL·(1+g₇))" : "ln(TVL)", coef(lnTvl), coef(valueErrors.lnTvl)],
        ...(selection.terms.includes("age")
          ? [["ln(age)", coef(lnAge), coef(valueErrors.lnAge)]]
          : []),
        ...Object.entries(model.categoryEffects ?? {}).map(([group, effect]) => [
          group,
          coef(effect),
          coef(valueErrors[group]),
        ]),
      ],
      `Huber ridge · λ ${model.lambda} · ${model.n} traded families. ${errorNote}`,
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
    termTrials("Value", selection, `Fixed penalties. ${categoryNote} Both errors must improve.`),
    '</div><div class="method-odds">',
    methodPanel(
      "Token-status model",
      ["Term in logit F(a)", "Coefficient", "Bootstrap SE"],
      odds.names.map((name, i) => [name, coef(odds.coefficients[i]), coef(odds.standardErrors[i])]),
      `${odds.n} listed protocols. PAVA share S(a) is clamped to 0.01–0.99. P₁₂ = [F(a+365) − F(a)] / [1 − F(a)]. Flat years use tail hazard. Undated age ${odds.medianAgeDays}d. ${errorNote}`,
    ),
    termTrials("Odds", odds.validation),
    '</div><div class="method-evidence">',
    methodPanel(
      "Held-out token status",
      ["Model", "10-fold Brier", "Walk-forward Brier"],
      (
        [
          ["Base rate", baselines.baseRate],
          ["Raw PAVA clock", baselines.pava],
          ["Clock-only model (step 0)", baselines.clockOnly],
          ["Final model", scores],
        ] as const
      ).map(([label, pair]) => [label, ...pair.map(brier)]),
      "Brier scores current token status. P₁₂ assumes the cross-section behaves like a cohort.",
    ),
    methodPanel("Held-out range honesty", ["Band", "Actual", "Stated"], rangeRows(rangeHonesty)),
    `<section class="panel"><h2>Growth placebo</h2><p class="caption">Real Brier ${placebo.real.map(brier).join(" / ")}. ${placebo.asGoodOrBetter.map((rate) => (rate === null ? "—" : formatOdds(rate))).join(" / ")} of ${placebo.shuffles} shuffles matched or beat it (10-fold / WF).</p></section>`,
    notes?.(methodPanel) ?? "",
    "</div>",
  ];
  return `<div class="method compact">${cards.join("")}</div>`;
}
