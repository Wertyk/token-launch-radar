import type { launchProbability12, RadarRow } from "../../application/browser-api.ts";
import type { ProtocolFamily } from "../../domain/census/families.ts";
import type { EconomicsAssumptions } from "../../domain/farming/economics.ts";
import type { LaunchClock } from "../../domain/launch-clock/clock.ts";
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
import { svg, table } from "./render.ts";

type FormatUsd = (value: number) => string;

function decomposition(row: RadarRow, usd: FormatUsd): string {
  const { base, multipliers } = row.decomposition;
  const { lnTvl, growth, lnAge } = multipliers;
  const afterTvl = base * lnTvl;
  const stages = [
    ["Base", base],
    ["TVL", afterTvl, lnTvl],
    ["7d growth", afterTvl * growth, growth],
    ["Age", row.valueUsd, lnAge],
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
  coefficients: ValueModel["coefficients"];
  lnValue: number;
  back: string;
  usd: FormatUsd;
  farm: Pick<EconomicsAssumptions, "hourlyRateUsd" | "farmerHaircut">;
  diagnostics: ValueDiagnostics | undefined;
  families: ReadonlyMap<string, Pick<ProtocolFamily, "representative" | "mcap_usd">>;
  launchClock: LaunchClock;
  launchProbability12: typeof launchProbability12;
}

function valueEquation(
  row: RadarRow,
  { intercept, lnTvl, lnAge }: ValueModel["coefficients"],
  lnValue: number,
  clockAge: number,
  usd: FormatUsd,
): string {
  const growth = Math.exp(row.features.growth).toFixed(3);
  const days = Math.exp(row.features.lnAge).toFixed(0);
  return `<p class="value-equation">ln V ≈ ${intercept.toFixed(4)} ${signedTerm(lnTvl, 4)} × ln(${formatCompactUsd(row.protocol.tvl_usd)} × ${growth}) ${signedTerm(lnAge, 4)} × ln(${days} d) ≈ ${lnValue.toFixed(3)} → ${usd(row.launch_value_usd)} × P₁₂(${clockAge.toFixed(0)} d) ${formatOdds(row.launchProbability12)} → ${usd(row.implied_value_usd)}</p>`;
}

export function protocolView(
  row: RadarRow,
  {
    age,
    coefficients,
    lnValue,
    back,
    usd,
    farm,
    diagnostics,
    families,
    launchClock,
    launchProbability12,
  }: CardOptions,
  { nearestComparables, protocolClock, protocolFacts }: ProtocolExtras,
): string {
  const { protocol, plan, economics } = row;
  const { hourlyRateUsd, farmerHaircut } = farm;
  const { airdropYieldApr, breakEvenDepositUsd } = economics;
  const interval = diagnostics
    ? `${usd(diagnostics.interval_p10_usd)}–${usd(diagnostics.interval_p90_usd)}`
    : "—";
  const influence = diagnostics?.influence;
  const comparable = influence && families.get(influence.slug)?.representative.name;
  const influenceLine =
    influence?.rank_delta === 0
      ? "No single comparable moves this rank"
      : influence && comparable
        ? `Without ${esc(comparable)}, rank moves by ${Math.abs(influence.rank_delta)}`
        : "";
  const clockAge = Math.max(0, age ?? launchClock.medianAgeDays ?? 0);
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
          ${valueEquation(row, coefficients, lnValue, clockAge, usd)}
          ${influenceLine ? `<p class="caption">${influenceLine}</p>` : ""}
        </section>
        <section class="panel"><h3>Protocol record</h3>
          ${protocolFacts(row, age, usd)}
        </section>
        ${protocolClock(launchClock.points, clockAge, row.launchProbability12, age === null, launchProbability12)}
      </div>
      <div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${esc(plan.chain ?? "Chain unlisted")}</strong> · ${usd(plan.depositUsd)} plan · ${plan.horizonMonths} months</p>
          <div class="chips">${economics.deposits.map(({ depositUsd, verdict }) => chip(`${usd(depositUsd)} ${verdict}`, "badge")).join("")}</div>
          <p class="caption">${usd(hourlyRateUsd)}/h for labor · ${farmerHaircut * 100}% farmer haircut</p>
          <p>Expected airdrop yield ${(airdropYieldApr * 100).toFixed(2)}% APR · Capital cost ${(plan.capitalApr * 100).toFixed(2)}% APR</p>
          <p>Break-even deposit · ${breakEvenDepositUsd === "never" ? "never" : usd(breakEvenDepositUsd)}</p>
          ${steps}
          <p class="caption">Per-occurrence minutes and fees. Assumptions ${plan.assumptionsAsOf}${plan.flags.length ? " · fallback fees" : ""}.</p>
        </section>
        ${nearestComparables(diagnostics?.twins ?? [], families, usd)}
      </div>
    </div>`;
}
