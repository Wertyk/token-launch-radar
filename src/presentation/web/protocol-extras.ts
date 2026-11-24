import type { launchProbability12, RadarRow } from "../../application/browser-api.ts";
import type { ProtocolFamily } from "../../domain/census/families.ts";
import type { ClockPoint } from "../../domain/launch-clock/clock.ts";
import { growthText } from "./board-view.ts";
import { ageSparkline } from "./clock-view.ts";
import { escapeHtml as esc, formatInteger, formatOdds } from "./format.ts";
import { table } from "./render.ts";
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

export function protocolFacts(
  { protocol, status, reason, boardReasons, flags }: RadarRow,
  age: number | null,
  usd: (value: number) => string,
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
  return `<dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <p><strong>${statusLabels[status]}</strong>${status === "pre-token" ? "" : ` · ${esc(reason)}`}</p>
    <p class="muted">Included · ${boardReasons.map((key) => reasonLabels[key]).join(" · ")}</p>
    ${flags.length ? `<ul class="flags">${flags.map((flag) => `<li>${flagLabels[flag]}</li>`).join("")}</ul>` : ""}`;
}

export function protocolClock(
  points: readonly ClockPoint[],
  clockAge: number,
  odds: number,
  usesMedianAge: boolean,
  oddsAt: typeof launchProbability12,
): string {
  const maxAge = Math.max(1, clockAge, points.at(-1)?.ageDays ?? 0);
  return `<section class="panel clock"><h3>Launch clock</h3>
    ${ageSparkline(maxAge, clockAge, odds, (days) => oddsAt(points, days))}
    <p><strong>P₁₂ · ${formatOdds(odds)}</strong></p>
    <p class="caption">Age marker · ${formatInteger(clockAge)} days${usesMedianAge ? " (median proxy)" : ""}</p>
  </section>`;
}

export function nearestComparables(
  slugs: readonly string[],
  families: ReadonlyMap<string, Pick<ProtocolFamily, "representative" | "mcap_usd">>,
  usd: (value: number) => string,
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

export interface ProtocolExtras {
  protocolFacts: typeof protocolFacts;
  protocolClock: typeof protocolClock;
  nearestComparables: typeof nearestComparables;
}
