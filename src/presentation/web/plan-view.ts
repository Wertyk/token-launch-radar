import type * as BrowserApi from "../../application/browser-api.ts";
import { escapeHtml as esc } from "./format.ts";

export function plannerForm(chains: readonly string[]): string {
  return `<section class="panel farm portfolio">
    <h2 tabindex="-1">Farm portfolio</h2>
    <p class="plan-meta">12-month estimates. Cash covers deposits and fees. Cost also values time and committed capital.</p>
    <form class="filters">
      <label class="field">Cash budget (USD)<input name="budget" type="number" min="0" step="any" required></label>
      <label class="field">Weekly hours cap<input name="hours" type="number" min="0" step="any" required></label>
      <label class="field">Chains · no selection includes all
        <select name="chains" multiple size="4">${chains
          .map((chain) => {
            const label = esc(chain);
            return `<option value="${label}">${label}</option>`;
          })
          .join("")}</select>
      </label>
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
  names: ReadonlyMap<string, string>,
  usd: typeof BrowserApi.formatUsd,
): string {
  const name = (slug: string) => esc(names.get(slug) ?? slug);
  const values = ({
    depositUsd,
    expectedValueUsd,
    costUsd,
    netUsd,
  }: typeof totals | (typeof positions)[number]) =>
    [depositUsd, expectedValueUsd, costUsd, netUsd].map((v) => `<td>${usd(v)}</td>`).join("");
  const chainName = (chain: string | null) => esc(chain ?? "Unlisted");
  const chosen = positions.length
    ? `<p class="plan-meta">${usd(totals.cashUsd)} in cash, including ${usd(totals.feesUsd)} in fees · ${totals.hoursPerWeek.toFixed(2)} average hours/week</p>
      <div class="portfolio-table"><table>
        <thead><tr><th scope="col">Protocol</th><th scope="col">Chain</th><th scope="col">Deposit</th><th scope="col">Expected value</th><th scope="col">Cost</th><th scope="col">Net</th></tr></thead>
        <tbody>${positions.map((p) => `<tr><td>${name(p.slug)}</td><td>${chainName(p.chain)}</td>${values(p)}</tr>`).join("")}</tbody>
        <tfoot><tr><th scope="row">Total</th><td></td>${values(totals)}</tr></tfoot>
      </table></div>`
    : "<p><strong>No candidate with positive net value fits these limits.</strong></p>";
  const near = closest.length
    ? `<h3>Closest to break-even</h3><ul>${closest.map((p) => `<li>${name(p.slug)} · ${chainName(p.chain)} · ${usd(p.depositUsd)} deposit · ${usd(p.shortfallUsd)} shortfall</li>`).join("")}</ul>`
    : "";
  const skipped = rejected.length
    ? `<h3>Highest-ranked protocols skipped</h3><ul>${rejected.map(({ slug, reason }) => `<li>${name(slug)} · ${reasons[reason]}</li>`).join("")}</ul>`
    : "";
  return chosen + near + skipped;
}
