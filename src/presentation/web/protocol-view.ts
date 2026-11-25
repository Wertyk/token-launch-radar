import type { RadarRow } from "../../application/browser-api.ts";
import type { ProtocolFamily } from "../../domain/census/families.ts";
import type { EconomicsAssumptions } from "../../domain/farming/economics.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";
import type { ValueModel } from "../../domain/valuation/model.ts";
import { chip } from "./board-view.ts";
import {
  escapeHtml as esc,
  formatCompactUsd,
  formatInteger,
  formatOdds,
  signedTerm,
} from "./format.ts";
import type { ProtocolExtras } from "./protocol-extras.ts";
import { boardInterval } from "./recompute.ts";
import { svg, table } from "./render.ts";
import { viewTools } from "./view-tools.ts";

type FormatUsd = (value: number) => string;

function decomposition(row: RadarRow, usd: FormatUsd): string {
  const { base, multipliers } = row.decomposition;
  const { lnTvl, growth, lnAge, category = 1 } = multipliers;
  const afterTvl = base * lnTvl;
  const stages = [
    ["Base", base],
    ["TVL", afterTvl, lnTvl],
    ...(growth === 1 ? [] : [["7d growth", afterTvl * growth, growth] as const]),
    ...(lnAge === 1 ? [] : [["Age", afterTvl * growth * lnAge, lnAge] as const]),
    ...(category === 1 ? [] : [["Category", row.valueUsd, category] as const]),
    ["Launch value", row.launch_value_usd],
    ["× launch odds 12m", null, row.launchProbability12],
    ["Implied value", row.implied_value_usd],
  ] as const;
  const largest = Math.max(
    1,
    ...stages.map(([, value]) => (Number.isFinite(value) ? (value ?? 0) : 0)),
  );
  return `<ol class="waterfall">${stages
    .map(([label, value, factor]) => {
      if (value === null)
        return `<li><span>${label}</span><span>(${formatOdds(factor)})</span></li>`;
      const finite = Number.isFinite(value);
      const width = finite ? ((value / largest) * 100).toFixed(2) : "0";
      const term = factor === undefined ? "" : `×${factor.toPrecision(4)}`;
      return `<li><span>${label}</span><span>${term}</span>${svg(100, 6, `<rect width="${width}" height="6"></rect>`)}<strong>${finite ? usd(Math.round(value)) : "—"}</strong></li>`;
    })
    .join("")}</ol>`;
}

interface CardOptions {
  age: number | null;
  model: ValueModel;
  lnValue: number;
  back: string;
  usd: FormatUsd;
  farm: Pick<EconomicsAssumptions, "hourlyRateUsd" | "farmerHaircut">;
  diagnostics: ValueDiagnostics | undefined;
  families: ReadonlyMap<string, Pick<ProtocolFamily, "representative" | "mcap_usd">>;
  maxOddsAge: number;
}

export function valueFormula(model: ValueModel, row?: RadarRow): string {
  const { intercept, lnTvl, lnAge } = model.coefficients;
  const decimals = row ? 4 : 3;
  const tvl = row ? formatCompactUsd(row.protocol.tvl_usd) : "TVL";
  const growth = row ? Math.exp(row.features.growth).toFixed(3) : "(1+g₇)";
  const age = row ? `${Math.exp(row.features.lnAge).toFixed(0)} d` : "age";
  const ageTerm = lnAge ? ` ${signedTerm(lnAge, decimals)} × ln(${age})` : "";
  const effect = model.categoryEffects?.[row?.features.category ?? "other"] ?? 0;
  const category = model.categoryEffects
    ? row
      ? ` ${signedTerm(effect, decimals)}`
      : " + category effect"
    : "";
  return `${intercept.toFixed(decimals)} ${signedTerm(lnTvl, decimals)} × ln(${tvl}${model.momentum ? ` × ${growth}` : ""})${ageTerm}${category}`;
}

export function protocolView(
  row: RadarRow,
  { age, model, lnValue, back, usd, farm, diagnostics, families, maxOddsAge }: CardOptions,
  { nearestComparables, protocolClock, protocolFacts }: Partial<ProtocolExtras>,
): string {
  const { protocol, plan, oddsAge, oddsAt, launchProbability12: p12 } = row;
  const { airdropYieldApr, breakEvenDepositUsd, deposits } = row.economics;
  const implied = usd(row.implied_value_usd);
  const interval = boardInterval(diagnostics)?.map(usd).join("–") ?? "—";
  const influence = diagnostics?.influence;
  const comparable = influence && families.get(influence.slug)?.representative.name;
  const influenceLine =
    influence?.rank_delta === 0
      ? "No single comparable moves this rank"
      : influence && comparable
        ? `Without ${esc(comparable)}, rank moves by ${Math.abs(influence.rank_delta)}`
        : "";
  const steps = table(
    ["Action", "Est. fee", "Min", "When"],
    plan.steps.map((step) => [
      esc(step.action),
      usd(step.costUsd),
      formatInteger(step.minutes),
      step.cadence,
    ]),
    { total: ["Total", usd(plan.totalCostUsd), formatInteger(plan.totalMinutes), "—"] },
  );
  return `<a class="back" href="${esc(back)}">← Back to board</a>
    <header class="protocol-heading"><div><h2>${esc(protocol.name)}</h2>
    <div class="chips">${[protocol.category ?? "Unlisted category", ...protocol.chains].map((label) => chip(label)).join("")}</div>
    </div>${chip(`Board rank ${row.rank}`, "badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Implied value</h3>
          <p class="figure">${implied}</p>
          <p>P10–P90 · ${interval}</p>
          ${decomposition(row, usd)}
          <p class="value-equation">ln V ≈ ${valueFormula(model, row)} ≈ ${lnValue.toFixed(3)} → ${usd(row.launch_value_usd)} × P₁₂(${oddsAge.toFixed(0)} d) ${formatOdds(p12)} → ${implied}</p>
          ${influenceLine ? `<p class="caption">${influenceLine}</p>` : ""}
        </section>
        ${protocolFacts?.(row, age, usd, viewTools) ?? ""}
        ${protocolClock?.(maxOddsAge, oddsAge, p12, age === null, oddsAt, viewTools) ?? ""}
      </div><div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${esc(plan.chain ?? "Chain unlisted")}</strong> · ${usd(plan.depositUsd)} plan · ${plan.holdWeeks.toFixed(1)} weeks expected</p>
          ${table(
            ["Deposit", "Net", "Net per hour", "Verdict"],
            deposits.map(({ depositUsd, netUsd, netPerHourUsd, verdict }) => [
              usd(depositUsd),
              usd(netUsd),
              usd(netPerHourUsd),
              verdict,
            ]),
            { className: "deposit-grid" },
          )}
          <p class="caption">${usd(farm.hourlyRateUsd)}/h for labor · ${farm.farmerHaircut * 100}% farmer haircut</p>
          <p>Expected airdrop yield ${(airdropYieldApr * 100).toFixed(2)}% APR · Capital cost ${(plan.capitalApr * 100).toFixed(2)}% APR</p>
          <p>Break-even deposit · ${breakEvenDepositUsd === "never" ? "never" : usd(breakEvenDepositUsd)}</p>
          <p class="caption">${esc(plan.steps.at(-1)?.exitCondition ?? "")}</p>
          ${steps}
          <p class="caption">Minutes and fees per occurrence. Assumptions ${plan.assumptionsAsOf}${plan.flags.length ? " · fallback fees" : ""}.</p>
        </section>
        ${nearestComparables?.(diagnostics?.twins ?? [], families, usd, viewTools) ?? ""}
      </div>
    </div>`;
}
