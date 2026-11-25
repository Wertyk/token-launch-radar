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
  const { protocol, plan, economics, oddsAge, oddsAt } = row;
  const { hourlyRateUsd, farmerHaircut } = farm;
  const { airdropYieldApr, breakEvenDepositUsd } = economics;
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
      esc(step.action) + (step.exitCondition ? `<small>${esc(step.exitCondition)}</small>` : ""),
      usd(step.costUsd),
      formatInteger(step.minutes),
      step.cadence,
    ]),
    { total: ["Total", usd(plan.totalCostUsd), formatInteger(plan.totalMinutes), "—"] },
  );
  return `<a class="back" href="${esc(back)}">← Back to board</a>
    <header class="protocol-heading"><div><h2>${esc(protocol.name)}</h2>
      <div class="chips">${chip(protocol.category ?? "Unlisted category")}${protocol.chains.map((chain) => chip(chain)).join("")}</div>
    </div>${chip(`Board rank ${row.rank}`, "badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Implied value</h3>
          <p class="figure">${usd(row.implied_value_usd)}</p>
          <p>P10–P90 · ${interval}</p>
          ${decomposition(row, usd)}
          <p class="value-equation">ln V ≈ ${valueFormula(model, row)} ≈ ${lnValue.toFixed(3)} → ${usd(row.launch_value_usd)} × P₁₂(${oddsAge.toFixed(0)} d) ${formatOdds(row.launchProbability12)} → ${usd(row.implied_value_usd)}</p>
          ${influenceLine ? `<p class="caption">${influenceLine}</p>` : ""}
        </section>
        ${protocolFacts?.(row, age, usd, viewTools) ?? ""}
        ${protocolClock?.(maxOddsAge, oddsAge, row.launchProbability12, age === null, oddsAt, viewTools) ?? ""}
      </div>
      <div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${esc(plan.chain ?? "Chain unlisted")}</strong> · ${usd(plan.depositUsd)} plan · ${plan.horizonMonths} months</p>
          <div class="chips">${economics.deposits.map(({ depositUsd, verdict, netUsd, netPerHourUsd }) => chip(`${usd(depositUsd)} ${verdict} · ${usd(netUsd)} net · ${usd(netPerHourUsd)}/h`, "badge")).join("")}</div>
          <p class="caption">${usd(hourlyRateUsd)}/h for labor · ${farmerHaircut * 100}% farmer haircut</p>
          <p>Expected airdrop yield ${(airdropYieldApr * 100).toFixed(2)}% APR · Capital cost ${(plan.capitalApr * 100).toFixed(2)}% APR</p>
          <p>Break-even deposit · ${breakEvenDepositUsd === "never" ? "never" : usd(breakEvenDepositUsd)}</p>
          ${steps}
          <p class="caption">Per-occurrence minutes and fees. Assumptions ${plan.assumptionsAsOf}${plan.flags.length ? " · fallback fees" : ""}.</p>
        </section>
        ${nearestComparables?.(diagnostics?.twins ?? [], families, usd, viewTools) ?? ""}
      </div>
    </div>`;
}
