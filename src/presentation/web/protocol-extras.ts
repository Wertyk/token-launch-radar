import type { RadarRow } from "../../application/browser-api.ts";
import type { ProtocolFamily } from "../../domain/census/families.ts";
import { ageSparkline } from "./clock-view.ts";
import type { ViewTools } from "./view-tools.ts";

const reasonLabels = {
  "pre-token": "Meets the pre-token rule",
  watchlist: "House watchlist",
};

const flagLabels = {
  "growth-missing": "Missing TVL change. The model uses zero growth.",
  "age-missing": "Missing listing date. The model uses median comparable age.",
  "outside-comps-range": "TVL or age falls outside the comparable range.",
};

export function protocolFacts(
  { protocol, status, reason, boardReasons, flags }: RadarRow,
  age: number | null,
  usd: (value: number) => string,
  { escapeHtml: esc, formatInteger, growthText, statusLabels }: ViewTools,
): string {
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
  return `<section class="panel"><h3>Protocol record</h3><dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <p><strong>${statusLabels[status]}</strong>${status === "pre-token" ? "" : ` · ${esc(reason)}`}</p>
    <p class="muted">Included · ${boardReasons.map((key) => reasonLabels[key]).join(" · ")}</p>
    ${flags.length ? `<ul class="flags">${flags.map((flag) => `<li>${flagLabels[flag]}</li>`).join("")}</ul>` : ""}</section>`;
}

export function protocolClock(
  populationMaxAge: number,
  clockAge: number,
  odds: number,
  usesMedianAge: boolean,
  oddsAt: (age: number) => number,
  { formatInteger, formatOdds, svg }: ViewTools,
): string {
  const maxAge = Math.max(1, clockAge, populationMaxAge);
  return `<section class="panel clock"><h3>12-month launch odds</h3>
    ${ageSparkline(maxAge, clockAge, odds, oddsAt, svg)}
    <p><strong>P₁₂ · ${formatOdds(odds)}</strong></p>
    <p class="caption">Age marker · ${formatInteger(clockAge)} days${usesMedianAge ? " (population median)" : ""}</p>
  </section>`;
}

export function nearestComparables(
  slugs: readonly string[],
  families: ReadonlyMap<string, Pick<ProtocolFamily, "representative" | "mcap_usd">>,
  usd: (value: number) => string,
  { escapeHtml: esc, table }: ViewTools,
): string {
  const rows = slugs.map((slug) => {
    const family = families.get(slug);
    return [
      esc(family?.representative.name ?? slug),
      family?.mcap_usd ? usd(family.mcap_usd) : "—",
    ];
  });
  return `<section class="panel compact"><h3>Nearest comparables</h3>${table(["Twin", "Family market cap"], rows)}</section>`;
}
