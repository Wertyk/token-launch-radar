import type { RadarRow } from "../../application/browser-api.ts";
import { chip, growthText } from "./board-view.ts";
import { escapeHtml as esc, formatInteger } from "./format.ts";

const statusLabels = {
  traded: "Token trades",
  "token-unpriced": "Records an unpriced token",
  "pre-token": "Records no token",
  excluded: "Excluded by the house rule",
};

const reasonLabels = {
  "pre-token": "Meets the pre-token rule",
  watchlist: "On the house watchlist",
};

const flagLabels = {
  "growth-missing": "7-day TVL change is missing. The model uses zero growth.",
  "age-missing": "Listing date is missing. The model uses the comparable median age.",
  "outside-comps-range": "TVL or age falls outside the range of the traded comparables.",
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
      return `<li>
        <span>${label}</span>
        <span>${factor === undefined ? "" : `×${factor.toPrecision(4)}`}</span>
        <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
          <rect width="${width}" height="6"></rect>
        </svg>
        <strong>${finite ? usd(Math.round(value)) : "—"}</strong>
      </li>`;
    })
    .join("")}</ol>`;
}

export function protocolView(
  row: RadarRow,
  age: number | null,
  back: string,
  usd: FormatUsd,
): string {
  const { protocol, plan, economics, status } = row;
  const { airdropYieldApr, breakEvenDepositUsd } = economics;
  const isTokenRecorded = status === "traded" || status === "token-unpriced";
  const facts = [
    ["TVL", usd(protocol.tvl_usd)],
    ["7d TVL change", growthText(protocol.change_7d)],
    ["Listed", esc(protocol.listed_at ?? "Unlisted")],
    [isTokenRecorded ? "Days since listing" : "Days with no token", formatInteger(age)],
  ];
  return `
    <a class="back" href="${esc(back)}">← Back to board</a>
    <div class="protocol-heading">
      <div>
        <h2 tabindex="-1">${esc(protocol.name)}</h2>
        <div class="chips">
          ${chip(protocol.category ?? "Unlisted category")}
          ${protocol.chains.map(chip).join("")}
        </div>
      </div>
      <span class="badge">Board rank ${formatInteger(row.rank)}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel">
          <h3>Protocol record</h3>
          <dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
          <p><strong>${statusLabels[status]}</strong>${status === "pre-token" ? "" : ` · ${esc(row.reason)}`}</p>
          <p class="muted">Board inclusion · ${row.boardReasons.map((reason) => reasonLabels[reason]).join(" · ")}</p>
          ${row.flags.length ? `<ul class="flags">${row.flags.map((flag) => `<li>${flagLabels[flag]}</li>`).join("")}</ul>` : ""}
        </section>
        <section class="panel valuation">
          <h3>Conditional value at launch</h3>
          <p class="figure">${usd(row.implied_value_usd)}</p>
          <p class="muted">If the protocol’s record stays as it is.</p>
          ${decomposition(row, usd)}
          <p class="caption">Bars show cumulative dollar values. The board rounds to whole dollars and bounds values from $1 to $100T.</p>
        </section>
      </div>
      <section class="panel farm">
        <h3>Farm plan</h3>
        <p class="plan-meta"><strong>${esc(plan.chain ?? "Chain unlisted")}</strong> · ${usd(plan.depositUsd)} plan · ${plan.horizonMonths} months</p>
        <div class="chips">${economics.deposits.map(({ depositUsd, verdict }) => `<span class="badge">${usd(depositUsd)} ${verdict}</span>`).join("")}</div>
        <p>Expected airdrop yield ${(airdropYieldApr * 100).toFixed(2)}% APR · Net capital cost ${(plan.capitalApr * 100).toFixed(2)}% APR</p>
        <p>Break-even deposit · ${breakEvenDepositUsd === "never" ? "never" : usd(breakEvenDepositUsd)}</p>
        <table>
          <thead><tr><th scope="col">Action</th><th scope="col">Est. fee</th><th scope="col">Minutes</th><th scope="col">Cadence</th></tr></thead>
          <tbody>${plan.steps
            .map(
              (step) =>
                `<tr><td>${esc(step.action)}${step.exitCondition ? `<small>${esc(step.exitCondition)}</small>` : ""}</td><td>${usd(step.costUsd)}</td><td>${formatInteger(step.minutes)}</td><td>${step.cadence}</td></tr>`,
            )
            .join("")}</tbody>
          <tfoot><tr><th scope="row">Total planned</th><td>${usd(plan.totalCostUsd)}</td><td>${formatInteger(plan.totalMinutes)}</td><td>All</td></tr></tfoot>
        </table>
        <p class="caption">Active minutes and fees per occurrence. Fee assumptions ${plan.assumptionsAsOf}${plan.flags.length ? " · default chain fees" : ""}.</p>
      </section>
    </div>`;
}
