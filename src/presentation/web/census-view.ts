import type { CensusRecord } from "../../domain/census/census.ts";
import { compareText } from "./board.ts";
import { escapeHtml as esc, formatInteger } from "./format.ts";
import { table } from "./render.ts";
import type { CensusState } from "./state.ts";
import { statusLabels } from "./state.ts";

export function selectCensus(rows: readonly CensusRecord[], { status, sort, dir }: CensusState) {
  const direction = dir === "asc" ? 1 : -1;
  return rows
    .filter((row) => !status || row.status === status)
    .sort((a, b) => {
      const order =
        sort === "tvl"
          ? a.tvl_usd - b.tvl_usd
          : compareText(a[sort].toLowerCase(), b[sort].toLowerCase());
      return direction * order || compareText(a.slug, b.slug);
    });
}

export function censusView(
  rows: readonly CensusRecord[],
  state: CensusState,
  usd: (value: number) => string,
) {
  const selected = selectCensus(rows, state);
  return `<h2>Protocol census</h2>
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
      [["name", "Protocol"], ["status", "Status"], "Reason", ["tvl", "TVL"]],
      selected.map(({ name, status, reason, tvl_usd }) => [
        esc(name),
        statusLabels[status],
        esc(reason),
        usd(tvl_usd),
      ]),
      { ...state, className: "ranking census", empty: "No matching protocols." },
    )}`;
}
