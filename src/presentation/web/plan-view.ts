import type * as BrowserApi from "../../application/browser-api.ts";
import { escapeHtml as esc } from "./format.ts";
import { options, table } from "./render.ts";
import type { Sliders } from "./state.ts";
import { sliderLimits } from "./state.ts";

const sliderLabels = {
  share: "Airdrop share of launch cap (%)",
  haircut: "Farmer haircut, retained (%)",
  rate: "Labor rate (USD/h)",
  yield: "Yield-bearing capital APR (%)",
  carry: "Non-yielding capital APR (%)",
};

export function sliderValues(farm: typeof BrowserApi.farmAssumptions) {
  return {
    share: farm.airdropShareOfLaunchCap * 100,
    haircut: farm.farmerHaircut * 100,
    rate: farm.hourlyRateUsd,
    yield: farm.capitalApr.yieldBearing * 100,
    carry: farm.capitalApr.nonYielding * 100,
  };
}

export function plannerSettings(farm: typeof BrowserApi.farmAssumptions, sliders: Sliders) {
  const values = { ...sliderValues(farm), ...sliders };
  return {
    ...farm,
    airdropShareOfLaunchCap: values.share / 100,
    farmerHaircut: values.haircut / 100,
    hourlyRateUsd: values.rate,
    capitalApr: { yieldBearing: values.yield / 100, nonYielding: values.carry / 100 },
  };
}

export function plannerForm(chains: readonly string[]): string {
  return `<section class="panel farm portfolio"><h2>Farm portfolio</h2>
    <p class="plan-meta">12-month estimates. Costs include fees, labor and capital.</p>
    <form>
      <div class="filters">
        <label class="field">Cash budget (USD)<input name="budget" type="number" min="0" step="any" required></label>
        <label class="field">Weekly hours cap<input name="hours" type="number" min="0" step="any" required></label>
        <label class="field">Chains · leave empty for all<select name="chains" multiple size="4">${options(chains)}</select></label>
      </div>
      <fieldset class="sliders"><legend>Farm assumptions</legend>
        ${Object.entries(sliderLimits)
          .map(
            ([key, max]) =>
              `<label>${sliderLabels[key as keyof Sliders]} <output></output><input type="range" name="${key}" min="0" max="${max}" step="any"></label>`,
          )
          .join("")}
        <button type="button" data-reset>Reset to defaults</button>
      </fieldset>
    </form>
    <div id="portfolio-results" aria-live="polite"></div>
  </section>`;
}

const reasons = {
  "over-budget": "Over budget",
  "over-hours": "Over hours",
  "chain-excluded": "Chain excluded",
  "non-positive": "No positive net value at any deposit",
};

export function plannerResults(
  { positions, totals, rejected, closest }: ReturnType<typeof BrowserApi.planPortfolio>,
  economics: ReturnType<typeof BrowserApi.estimateFarmEconomics>[],
  getName: (slug: string) => string,
  usd: typeof BrowserApi.formatUsd,
): string {
  const name = (slug: string) => esc(getName(slug));
  const values = ({
    depositUsd,
    expectedValueUsd,
    costUsd,
    netUsd,
  }: Pick<typeof totals, "depositUsd" | "expectedValueUsd" | "costUsd" | "netUsd">) =>
    [depositUsd, expectedValueUsd, costUsd, netUsd].map(usd);
  const chainName = (chain: string | null) => esc(chain ?? "Unlisted");
  const labels = ["FARM", "THIN", "SKIP"] as const;
  const verdicts = table(
    ["Deposit", ...labels],
    economics[0]?.deposits.map(({ depositUsd }, i) => {
      const counts = { FARM: 0, THIN: 0, SKIP: 0 };
      for (const { deposits } of economics) counts[deposits[i]?.verdict ?? "SKIP"]++;
      return [usd(depositUsd), ...labels.map((label) => String(counts[label]))];
    }) ?? [],
  );
  const chosen = positions.length
    ? `<p class="plan-meta">${usd(totals.cashUsd)} cash · ${usd(totals.feesUsd)} fees · ${totals.hoursPerWeek.toFixed(2)} average hours/week</p>
      <div class="portfolio-table">${table(
        ["Protocol", "Chain", "Deposit", "Expected value", "Cost", "Net"],
        positions.map((p) => [name(p.slug), chainName(p.chain), ...values(p)]),
        { total: ["Total", "", ...values(totals)] },
      )}</div>`
    : "<p><strong>No candidate with positive net value fits these limits.</strong></p>";
  const near = closest.length
    ? `<h3>Closest to break-even</h3><ul>${closest.map((p) => `<li>${name(p.slug)} · ${chainName(p.chain)} · ${usd(p.depositUsd)} deposit · ${usd(p.shortfallUsd)} shortfall</li>`).join("")}</ul>`
    : "";
  const skipped = rejected.length
    ? `<h3>Top-ranked protocols skipped</h3><ul>${rejected.map(({ slug, reason }) => `<li>${name(slug)} · ${reasons[reason]}</li>`).join("")}</ul>`
    : "";
  return `<div class="verdicts"><h3>Verdicts for all board plans</h3>${verdicts}</div><h3>Portfolio under your limits</h3>${chosen}${near}${skipped}`;
}
