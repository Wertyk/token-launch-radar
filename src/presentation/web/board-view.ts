import type { BoardRow } from "./board.ts";
import { escapeHtml as esc, formatInteger, formatOdds, formatPercent } from "./format.ts";
import { svg, table, tableBody } from "./render.ts";
import { columns, protocolHref } from "./state.ts";

export function boardTable(): string {
  return `<section class="table-window" aria-label="Protocol rankings" tabindex="0">${table(Object.entries(columns), [], { className: "ranking", sort: "rank", dir: "asc" })}</section>`;
}

export function chip(label: string, className = "chip"): string {
  return `<span class="${className}">${esc(label)}</span>`;
}

export function growthText(growth: number | null): string {
  const text = formatPercent(growth);
  const trend = text.startsWith("+") ? "gain" : text.startsWith("−") ? "loss" : "";
  return `<span class="${trend}">${text}</span>`;
}

export function boardRows(
  rows: readonly BoardRow[],
  back: string,
  maxLogValue: number,
  usd: (value: number) => string,
): string {
  const scale = (value: number) => (Math.log1p(value) / maxLogValue) * 100;
  return tableBody(
    rows.map((row) => {
      const href = esc(protocolHref(row.slug, back));
      const remaining = row.chains.length - 2;
      const [low, high] = row.interval ?? [0, 0];
      const band = row.interval
        ? `<rect class="band" x="${scale(low).toFixed(2)}" y="5" width="${(scale(high) - scale(low)).toFixed(2)}" height="3"></rect>`
        : "";
      return [
        formatInteger(row.rank),
        `<a class="protocol-name" href="${href}">${esc(row.name)}</a>
       <div class="chips" title="${esc(row.chains.join(", "))}">${chip(row.category ?? "Unlisted category")}${row.chains
         .slice(0, 2)
         .map((chain) => chip(chain))
         .join("")}${remaining > 0 ? chip(`+${remaining}`) : ""}</div>`,
        `<div class="value" ${row.interval ? `title="P10–P90: ${usd(low)}–${usd(high)}"` : ""}><strong>${usd(row.value)}</strong>
        ${svg(100, 8, `<rect width="${scale(row.value).toFixed(2)}" height="3"></rect>${band}`)}</div>`,
        usd(row.launchValue),
        formatOdds(row.odds),
        usd(row.tvl),
        growthText(row.growth),
        formatInteger(row.age),
        usd(row.cost),
        `${formatInteger(row.time)} min`,
        row.watchlist ? chip("Watchlist", "badge") : "—",
      ];
    }),
    Object.keys(columns).length,
    { linked: true, empty: "No protocols match these filters." },
  );
}
