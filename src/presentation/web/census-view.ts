import type { browserApi } from "../../application/browser-api.ts";
import type { CensusRecord } from "../../domain/census/census.ts";
import { escapeHtml as esc, formatInteger } from "./format.ts";
import { table } from "./render.ts";
import type { CensusState } from "./state.ts";
import { statusLabels } from "./state.ts";

type BoardMembership = Pick<ReadonlySet<string>, "has">;

export function censusSummary(rows: readonly CensusRecord[], ranked?: BoardMembership): string {
  const counts = { "pre-token": 0, traded: 0, "token-unpriced": 0, excluded: 0 };
  let included = 0;
  for (const { slug, status } of rows) {
    if (!Object.hasOwn(counts, status)) throw new Error("Census counts do not add up");
    if (ranked?.has(slug)) included++;
    else counts[status]++;
  }
  const link = (status: keyof typeof counts, label: string = status) =>
    `<a href="#/census?status=${status}${ranked ? "&amp;unranked=1" : ""}">${formatInteger(counts[status])} ${label}</a>`;
  const parts = [link("traded"), link("token-unpriced", "token, unpriced"), link("excluded")];
  const total = formatInteger(rows.length);
  return `<p class="census-summary">${ranked ? `All ${total} protocols accounted for: ${formatInteger(included)} ranked · ${parts.join(" · ")} (wrapped, staked, bridged, exchange or versioned names)` : `${total} protocols = ${link("pre-token", "pre-token (ranked)")} + ${parts.join(" + ")}`}</p>`;
}

export function selectCensus(
  rows: readonly CensusRecord[],
  { status, sort, dir, unranked }: CensusState,
  compareText: typeof browserApi.compareText,
  ranked?: BoardMembership,
) {
  const direction = dir === "asc" ? 1 : -1;
  const label = (row: CensusRecord, key: Exclude<CensusState["sort"], "tvl">) =>
    key === "status" ? statusLabels[row.status] : row[key].toLowerCase();
  return rows
    .filter((row) => (!status || row.status === status) && (!unranked || !ranked?.has(row.slug)))
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
  compareText: typeof browserApi.compareText,
  ranked?: BoardMembership,
) {
  const selected = selectCensus(rows, state, compareText, ranked);
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
