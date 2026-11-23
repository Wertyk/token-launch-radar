import type * as BrowserApi from "../../application/browser-api.ts";
import type { Snapshot } from "../../domain/snapshot.ts";
import type { BoardRow } from "./board.ts";
import { selectRows } from "./board.ts";
import { boardRows, boardView } from "./board-view.ts";
import { escapeHtml as esc, formatInteger } from "./format.ts";
import { protocolView } from "./protocol-view.ts";
import { countBoardMismatches } from "./recompute.ts";
import type { BoardState, SortKey } from "./state.ts";
import { boardHash, isSortKey, parseRoute } from "./state.ts";

interface RadarData extends Pick<Snapshot, "protocols" | "watchlist"> {
  meta: Pick<Snapshot, "as_of" | "floor_usd" | "source">;
  board: BrowserApi.BoardRows;
  model: ReturnType<typeof BrowserApi.buildRadar>["model"];
  launchClock: Parameters<typeof BrowserApi.buildRadar>[2];
}

declare global {
  interface Window {
    Radar: typeof BrowserApi;
    RADAR_DATA?: RadarData;
  }
}

function element<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing dashboard element ${selector}`);
  return found;
}

function signedTerm(value: number): string {
  return `${value < 0 ? "−" : "+"} ${Math.abs(value).toFixed(3)}`;
}

function header(
  counts: readonly (readonly [string, string])[],
  coefficients: ReturnType<typeof BrowserApi.buildRadar>["model"]["coefficients"],
  rows: number,
  mismatches: number,
): string {
  const { intercept, lnTvl, lnAge } = coefficients;
  const check = mismatches
    ? `Page recompute differs from board.json · ${formatInteger(mismatches)} mismatched ${mismatches === 1 ? "row" : "rows"}`
    : `Page recompute = board.json ✓ (${formatInteger(rows)} rows)`;
  return `
    <dl class="kpis">${counts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <section class="model" aria-label="Value model">
      <div>
        <p class="equation">ln V = ${intercept.toFixed(3)} ${signedTerm(lnTvl)}·ln(TVL·(1+g₇)) ${signedTerm(lnAge)}·ln(age)</p>
        <p class="caption">Fitted on traded comparables. Age is days since listing, minimum 1. g₇ is 7-day TVL growth clipped to −50%…+100%.</p>
      </div>
      <span class="check ${mismatches ? "check-failed" : ""}">${check}</span>
    </section>`;
}

function mountBoard(
  main: HTMLElement,
  rows: readonly BoardRow[],
  maxLogValue: number,
  usd: typeof BrowserApi.formatUsd,
) {
  main.innerHTML = boardView(rows);
  const search = element<HTMLInputElement>('[name="q"]', main);
  const category = element<HTMLSelectElement>('[name="cat"]', main);
  const chain = element<HTMLSelectElement>('[name="chain"]', main);
  const watchlist = element<HTMLInputElement>('[name="wl"]', main);
  const results = element("#results", main);
  const body = element("tbody", main);
  const heads = main.querySelectorAll<HTMLTableCellElement>("th");

  function setSelect(select: HTMLSelectElement, value: string): void {
    select.querySelector("[data-unlisted]")?.remove();
    select.value = value;
    if (select.selectedIndex < 0) {
      const option = new Option(value, value, false, true);
      option.dataset.unlisted = "";
      select.add(option);
    }
  }

  return (state: BoardState) => {
    if (search.value !== state.q) search.value = state.q;
    setSelect(category, state.cat);
    setSelect(chain, state.chain);
    watchlist.checked = state.wl;
    for (const th of heads) {
      if (th.querySelector("button")?.dataset.sort === state.sort) {
        th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
      } else {
        th.removeAttribute("aria-sort");
      }
    }
    const selected = selectRows(rows, state);
    results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`;
    body.innerHTML = boardRows(selected, state, maxLogValue, usd);
  };
}

function start(main: HTMLElement, data: RadarData, api: typeof BrowserApi): void {
  const { buildRadar, daysBetween, formatUsd, parseSnapshot, toBoard } = api;
  const snapshot = parseSnapshot({
    ...data.meta,
    protocols: data.protocols,
    watchlist: data.watchlist,
  });
  const radar = buildRadar(snapshot, data.model.lambda, data.launchClock);
  const published = data.board.rows;
  const computed = toBoard(radar, published).rows;
  const mismatches = countBoardMismatches(computed, published);
  const watchlisted = new Set(snapshot.watchlist);
  const protocols = new Map(radar.board.map((row) => [row.protocol.slug, row]));
  const ages = new Map(
    radar.board.map(({ protocol: { slug, listed_at } }) => [
      slug,
      listed_at === null ? null : daysBetween(listed_at, snapshot.as_of),
    ]),
  );
  const rows: BoardRow[] = radar.board.map(
    ({ protocol, rank, status, implied_value_usd, plan }) => ({
      slug: protocol.slug,
      name: protocol.name,
      rank,
      value: implied_value_usd,
      tvl: protocol.tvl_usd,
      growth: protocol.change_7d,
      age:
        status === "traded" || status === "token-unpriced"
          ? null
          : (ages.get(protocol.slug) ?? null),
      cost: plan.totalCostUsd,
      time: plan.totalMinutes,
      watchlist: watchlisted.has(protocol.slug),
      category: protocol.category,
      chains: protocol.chains,
    }),
  );
  const maxLogValue = Math.log1p(rows.reduce((max, row) => Math.max(max, row.value), 1));
  element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`;
  element("#summary").innerHTML = header(
    [
      ["Protocols scanned", formatInteger(radar.census.length)],
      ["Traded comparables", formatInteger(radar.model.n)],
      ["Board rows", formatInteger(rows.length)],
      [
        "Watchlist covered",
        `${formatInteger(rows.filter((row) => row.watchlist).length)} / ${formatInteger(watchlisted.size)}`,
      ],
    ],
    radar.model.coefficients,
    computed.length,
    mismatches,
  );

  let updateBoard: ReturnType<typeof mountBoard> | undefined;
  let lastPage: string | undefined;

  function draw(): void {
    delete main.dataset.ready;
    const route = parseRoute(location.hash);
    const page = route.page === "protocol" ? `protocol/${route.slug}` : route.page;
    const changedPage = lastPage !== undefined && lastPage !== page;
    lastPage = page;
    if (route.page === "board") {
      updateBoard ??= mountBoard(main, rows, maxLogValue, formatUsd);
      updateBoard(route.state);
    } else {
      updateBoard = undefined;
      const back = boardHash(route.state);
      const detail = route.page === "protocol" ? protocols.get(route.slug) : undefined;
      main.innerHTML = detail
        ? protocolView(detail, ages.get(detail.protocol.slug) ?? null, back, formatUsd)
        : `<section class="panel message"><h2 tabindex="-1">Page unavailable</h2>
          <p>${route.page === "protocol" ? "This protocol is outside the ranked board." : "This address doesn’t match a dashboard page."}</p>
          <a href="${esc(back)}">Back to board</a></section>`;
    }
    if (changedPage) {
      window.scrollTo(0, 0);
      main.querySelector<HTMLElement>('h2[tabindex="-1"]')?.focus({ preventScroll: true });
    }
    main.dataset.ready = "";
  }

  function sortBy(sort: SortKey): void {
    const { state } = parseRoute(location.hash);
    const dir = state.sort === sort && state.dir === "asc" ? "desc" : "asc";
    location.hash = boardHash({ ...state, sort, dir });
  }

  main.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const sort = event.target.closest<HTMLButtonElement>("button[data-sort]")?.dataset.sort;
    if (isSortKey(sort)) {
      sortBy(sort);
    } else if (
      !event.target.closest("a") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      const link = event.target.closest("tr[data-protocol]")?.querySelector("a");
      if (link) location.hash = link.hash;
    }
  });
  main.addEventListener("submit", (event) => event.preventDefault());
  main.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== "q") return;
    const { state } = parseRoute(location.hash);
    history.replaceState(null, "", boardHash({ ...state, q: event.target.value }));
    draw();
  });
  main.addEventListener("change", (event) => {
    const target = event.target;
    const { state } = parseRoute(location.hash);
    if (target instanceof HTMLSelectElement && (target.name === "cat" || target.name === "chain")) {
      location.hash = boardHash({ ...state, [target.name]: target.value });
    } else if (target instanceof HTMLInputElement && target.name === "wl") {
      location.hash = boardHash({ ...state, wl: target.checked });
    }
  });
  window.addEventListener("hashchange", draw);
  draw();
}

const main = element("main");
if (window.RADAR_DATA) {
  start(main, window.RADAR_DATA, window.Radar);
} else {
  main.innerHTML = `<section class="panel message"><h2>Snapshot data unavailable</h2>
    <p><code>main.ts</code> writes <code>../data.js</code>. Run <code>pnpm radar</code> and open <code>out/dashboard/index.html</code>.</p></section>`;
}
