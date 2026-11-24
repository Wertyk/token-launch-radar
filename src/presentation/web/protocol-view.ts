import type { clockShareAt, RadarRow } from "../../application/browser-api.ts";
import type { ProtocolFamily } from "../../domain/census/families.ts";
import type { EconomicsAssumptions } from "../../domain/farming/economics.ts";
import type { LaunchClock } from "../../domain/launch-clock/clock.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";
import type { ValueModel } from "../../domain/valuation/model.ts";
import { chip, growthText } from "./board-view.ts";
import { ageSparkline } from "./clock-view.ts";
import { escapeHtml as esc, formatCompactUsd, formatInteger, signedTerm } from "./format.ts";
import { svg, table } from "./render.ts";

import { statusLabels } from "./state.ts";

const reasonLabels = {
  "pre-token": "Meets the pre-token rule",
  watchlist: "House watchlist",
};

const flagLabels = {
  "growth-missing": "Missing TVL change. The model uses zero growth.",
  "age-missing": "Missing listing date. The model uses median comparable age.",
  "outside-comps-range": "TVL or age falls outside the comparable range.",
};

type FormatUsd = (value: number) => string;

function decomposition(row: RadarRow, usd: FormatUsd): string {
  const { base, multipliers } = row.decomposition;
  const afterTvl = base * multipliers.lnTvl;
  const afterGrowth = afterTvl * multipliers.growth;
  const stages = [
    { label: "Base", value: base },
    { label: "TVL", factor: multipliers.lnTvl, value: afterTvl },
    { label: "7d growth", factor: multipliers.growth, value: afterGrowth },
    { label: "Age", factor: multipliers.lnAge, value: row.valueUsd },
    { label: "Board value", value: row.implied_value_usd },
  ];
  const largest = Math.max(1, ...stages.map(({ value }) => (Number.isFinite(value) ? value : 0)));
  return `<ol class="waterfall">${stages
    .map(({ label, factor, value }) => {
      const finite = Number.isFinite(value);
      const width = finite ? ((value / largest) * 100).toFixed(2) : "0";
      return `<li><span>${label}</span><span>${factor === undefined ? "" : `×${factor.toPrecision(4)}`}</span>${svg(100, 6, `<rect width="${width}" height="6"></rect>`)}<strong>${finite ? usd(Math.round(value)) : "—"}</strong></li>`;
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
  clockShareAt: typeof clockShareAt;
}

function valueEquation(
  row: RadarRow,
  { intercept, lnTvl, lnAge }: ValueModel["coefficients"],
  lnValue: number,
  usd: FormatUsd,
): string {
  const growth = Math.exp(row.features.growth).toFixed(3);
  const days = Math.exp(row.features.lnAge).toFixed(0);
  const limit = Math.round(row.valueUsd) === row.implied_value_usd ? "" : " (board limit)";
  return `<p class="value-equation">ln V ≈ ${intercept.toFixed(4)} ${signedTerm(lnTvl, 4)} × ln(${formatCompactUsd(row.protocol.tvl_usd)} × ${growth}) ${signedTerm(lnAge, 4)} × ln(${days} d) ≈ ${lnValue.toFixed(3)}${limit} → ${usd(row.implied_value_usd)}</p>`;
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
    clockShareAt,
  }: CardOptions,
): string {
  const { protocol, plan, economics, status } = row;
  const { hourlyRateUsd, farmerHaircut } = farm;
  const { airdropYieldApr, breakEvenDepositUsd } = economics;
  const facts = [
    ["TVL", usd(protocol.tvl_usd)],
    ["7d TVL change", growthText(protocol.change_7d)],
    ["Listed", esc(protocol.listed_at ?? "Unlisted")],
    [
      status === "traded" || status === "token-unpriced"
        ? "Days since listing"
        : "Days with no token",
      formatInteger(age),
    ],
  ];
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
  const { points } = launchClock;
  const p12 = economics.launchProbability12;
  const twins = (diagnostics?.twins ?? []).map((slug) => {
    const family = families.get(slug);
    return [
      esc(family?.representative.name ?? slug),
      family?.mcap_usd ? usd(family.mcap_usd) : "—",
    ];
  });
  const steps = table(
    ["Action", "Est. fee", "Minutes", "Cadence"],
    plan.steps.map((step) => [
      esc(step.action) + (step.exitCondition ? `<small>${esc(step.exitCondition)}</small>` : ""),
      usd(step.costUsd),
      formatInteger(step.minutes),
      step.cadence,
    ]),
    { total: ["Total planned", usd(plan.totalCostUsd), formatInteger(plan.totalMinutes), "All"] },
  );
  return `<a class="back" href="${esc(back)}">← Back to board</a>
    <header class="protocol-heading"><div><h2>${esc(protocol.name)}</h2>
      <div class="chips">${chip(protocol.category ?? "Unlisted category")}${protocol.chains.map((chain) => chip(chain)).join("")}</div>
    </div>${chip(`Board rank ${row.rank}`, "badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Conditional value at launch</h3>
          <p class="figure">${usd(row.implied_value_usd)}</p>
          <p>P10–P90 · ${interval}</p>
          ${decomposition(row, usd)}
          ${valueEquation(row, coefficients, lnValue, usd)}
          ${influenceLine ? `<p class="caption">${influenceLine}</p>` : ""}
        </section>
        <section class="panel"><h3>Protocol record</h3>
          <dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
          <p><strong>${statusLabels[status]}</strong>${status === "pre-token" ? "" : ` · ${esc(row.reason)}`}</p>
          <p class="muted">Included · ${row.boardReasons.map((reason) => reasonLabels[reason]).join(" · ")}</p>
          ${row.flags.length ? `<ul class="flags">${row.flags.map((flag) => `<li>${flagLabels[flag]}</li>`).join("")}</ul>` : ""}
        </section>
        <section class="panel clock"><h3>Launch clock F(t)</h3>
          ${ageSparkline(points, clockAge, clockShareAt(points, clockAge))}
          <p><strong>P12 · ${(p12 * 100).toFixed(1)}%</strong></p>
          <p class="caption">Age marker · ${formatInteger(clockAge)} days${age === null ? " (median proxy)" : ""}</p>
        </section>
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
        <section class="panel compact"><h3>Nearest comparables</h3>
          ${table(["Twin", "Family market cap"], twins)}
        </section>
      </div>
    </div>`;
}
