import type { CensusRecord } from "../../domain/census/census.ts";
import { compareText } from "./board.ts";
import { escapeHtml as esc, formatInteger } from "./format.ts";
import { table } from "./render.ts";
import type { CensusState } from "./state.ts";
import { statusLabels } from "./state.ts";

export function censusSummary(rows: readonly CensusRecord[], board = false): string {
  const counts = { "pre-token": 0, traded: 0, "token-unpriced": 0, excluded: 0 };
  for (const { status } of rows) counts[status]++;
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== rows.length)
    throw new Error("Census counts do not add up");
  const link = (status: keyof typeof counts, label: string = status) =>
    `<a href="#/census?status=${status}">${formatInteger(counts[status])} ${label}</a>`;
  const parts = [link("traded"), link("token-unpriced", "token, unpriced"), link("excluded")];
  return `<p class="census-summary">${board ? `Not ranked: ${parts.join(" · ")} (wrapped, staked, bridged, exchange)` : `${formatInteger(rows.length)} protocols = ${link("pre-token", "pre-token (ranked)")} + ${parts.join(" + ")}`}</p>`;
}

export function selectCensus(rows: readonly CensusRecord[], { status, sort, dir }: CensusState) {
  const direction = dir === "asc" ? 1 : -1;
  const label = (row: CensusRecord, key: Exclude<CensusState["sort"], "tvl">) =>
    key === "status" ? statusLabels[row.status] : row[key].toLowerCase();
  return rows
    .filter((row) => !status || row.status === status)
    .sort((a, b) => {
      const order =
        sort === "tvl" ? a.tvl_usd - b.tvl_usd : compareText(label(a, sort), label(b, sort));
      return direction * order || compareText(a.slug, b.slug);
    });
}

export function censusView(
  rows: readonly CensusRecord[],
  state: CensusState,
  usd: (value: number) => string,
) {
  const selected = selectCensus(rows, state);
  return `<h2>Protocol census</h2>${censusSummary(rows)}
    <div class="filters">
      <label class="field">Status <select name="status"><option value="">All statuses</option>${Object.entries(
        statusLabels,
      )
        .map(
          ([key, label]) =>
            `<option value="${key}"${state.status === key ? " selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label>
      <output id="results">${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols</output>
    </div>
    ${table(
      [
        ["name", "Protocol"],
        ["status", "Status"],
        ["reason", "Reason"],
        ["tvl", "TVL"],
      ],
      selected.map(({ name, status, reason, tvl_usd }) => [
        esc(name),
        statusLabels[status],
        esc(reason),
        usd(tvl_usd),
      ]),
      { ...state, className: "ranking census", empty: "No matching protocols." },
    )}`;
}
