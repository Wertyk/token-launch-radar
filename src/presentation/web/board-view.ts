import type { BoardRow } from "./board.ts";
import { escapeHtml as esc, formatInteger, formatPercent } from "./format.ts";
import type { BoardState } from "./state.ts";
import { columns, protocolHash } from "./state.ts";

function options(values: readonly string[]): string {
  return [...new Set(values)]
    .sort()
    .map((value) => {
      const label = esc(value);
      return `<option value="${label}">${label}</option>`;
    })
    .join("");
}

export function boardView(rows: readonly BoardRow[]): string {
  const categories = rows.flatMap(({ category }) => (category === null ? [] : [category]));
  return `
    <form class="filters" aria-label="Board filters">
      <div class="field">
        <label for="protocol-search">Search protocol</label>
        <input id="protocol-search" type="search" name="q" placeholder="Protocol name" autocomplete="off">
      </div>
      <div class="field">
        <label for="category-filter">Category</label>
        <select id="category-filter" name="cat"><option value="">All categories</option>${options(categories)}</select>
      </div>
      <div class="field">
        <label for="chain-filter">Chain</label>
        <select id="chain-filter" name="chain"><option value="">All chains</option>${options(rows.flatMap(({ chains }) => chains))}</select>
      </div>
      <label class="toggle"><input type="checkbox" name="wl"> Watchlist only</label>
      <output id="results" aria-live="polite"></output>
    </form>
    <section class="table-window" aria-label="Protocol rankings" tabindex="0">
      <table class="ranking" aria-label="Ranked protocols">
        <thead><tr>${Object.entries(columns)
          .map(
            ([key, label]) =>
              `<th scope="col" class="col-${key}"><button type="button" data-sort="${key}">${label}<span class="sort-arrow" aria-hidden="true"></span></button></th>`,
          )
          .join("")}</tr></thead>
        <tbody></tbody>
      </table>
    </section>`;
}

export function chip(label: string): string {
  return `<span class="chip">${esc(label)}</span>`;
}

export function growthText(growth: number | null): string {
  const text = formatPercent(growth);
  const trend = text.startsWith("+") ? "gain" : text.startsWith("−") ? "loss" : "";
  return `<span class="${trend}">${text}</span>`;
}

export function boardRows(
  rows: readonly BoardRow[],
  state: BoardState,
  maxLogValue: number,
  usd: (value: number) => string,
): string {
  if (!rows.length) {
    return `<tr><td colspan="${Object.keys(columns).length}" class="empty">No protocols match these filters.</td></tr>`;
  }
  return rows
    .map((row) => {
      const href = esc(protocolHash(row.slug, state));
      const remaining = row.chains.length - 2;
      const logShare = (Math.log1p(row.value) / maxLogValue) * 100;
      return `
        <tr data-protocol>
          <td class="rank">${formatInteger(row.rank)}</td>
          <td><a class="protocol-name" href="${href}">${esc(row.name)}</a>
            <div class="chips" title="${esc(row.chains.join(", "))}">
              ${chip(row.category ?? "Unlisted category")}
              ${row.chains.slice(0, 2).map(chip).join("")}
              ${remaining > 0 ? chip(`+${remaining}`) : ""}
            </div>
          </td>
          <td class="value"><strong>${usd(row.value)}</strong>
            <div class="value-track" aria-hidden="true"><span style="width:${logShare.toFixed(2)}%"></span></div>
          </td>
          <td>${usd(row.tvl)}</td>
          <td>${growthText(row.growth)}</td>
          <td>${formatInteger(row.age)}</td>
          <td>${usd(row.cost)}</td>
          <td>${formatInteger(row.time)} min</td>
          <td>${row.watchlist ? '<span class="badge">Watchlist</span>' : '<span class="muted">—</span>'}</td>
        </tr>`;
    })
    .join("");
}
