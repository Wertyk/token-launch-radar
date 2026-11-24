import type * as BrowserApi from "../../application/browser-api.ts";
import type { RadarResult } from "../../application/build-radar.ts";
import type { FarmTables } from "../../domain/farming/playbook-data.ts";
import type { Protocol, Snapshot } from "../../domain/snapshot.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";
import type { BoardRow } from "./board.ts";
import { selectRows } from "./board.ts";
import { boardRows, boardTable } from "./board-view.ts";
import { censusSummary, censusView } from "./census-view.ts";
import { clockSampleSize } from "./clock-view.ts";
import { element } from "./dom.ts";
import { escapeHtml as esc, formatInteger, signedTerm } from "./format.ts";
import { integrityChecks, integrityStrip } from "./integrity.ts";
import { methodView } from "./method-view.ts";
import type { MountPlanner } from "./planner.ts";
import type { ProtocolExtras } from "./protocol-extras.ts";
import { protocolView } from "./protocol-view.ts";
import { options } from "./render.ts";
import type { BoardState } from "./state.ts";
import { boardHash, censusHash, isCensusSortKey, isSortKey, parseRoute } from "./state.ts";

type PublishedRow = BrowserApi.BoardRows["rows"][number] &
  ValueDiagnostics & { launch_p12: number };

interface RadarData
  extends BrowserApi.PublishedSnapshot,
    Pick<RadarResult, "model" | "launchClock" | "census" | "intervalCounts" | "looScatter"> {
  meta: BrowserApi.PublishedSnapshot["meta"] & FarmTables;
  board: { rows: (PublishedRow | null)[] };
}

declare global {
  interface Window {
    Radar: typeof BrowserApi.browserApi & ProtocolExtras & { mountPlanner: MountPlanner };
    RADAR_DATA?: RadarData;
  }
}

function mountBoard(
  main: HTMLElement,
  rows: readonly BoardRow[],
  summary: string,
  usd: typeof BrowserApi.formatUsd,
) {
  main.innerHTML =
    summary + element<HTMLTemplateElement>("#board-filters").innerHTML + boardTable();
  const search = element<HTMLInputElement>('[name="q"]', main);
  const category = element<HTMLSelectElement>('[name="cat"]', main);
  const chain = element<HTMLSelectElement>('[name="chain"]', main);
  category.insertAdjacentHTML("beforeend", options(rows.flatMap(({ category }) => category ?? [])));
  chain.insertAdjacentHTML("beforeend", options(rows.flatMap(({ chains }) => chains)));
  const watchlist = element<HTMLInputElement>('[name="wl"]', main);
  const results = element("#results", main);
  const body = element("tbody", main);
  const buttons = main.querySelectorAll<HTMLButtonElement>("button[data-sort]");
  const maxLogValue = Math.log1p(
    Math.max(1, ...rows.flatMap(({ value, interval }) => [value, interval?.[1] ?? 0])),
  );

  function setSelect(select: HTMLSelectElement, value: string): void {
    select.querySelector("[data-temporary]")?.remove();
    select.value = value;
    if (select.selectedIndex < 0) {
      const option = new Option(value, value, false, true);
      option.dataset.temporary = "";
      select.add(option);
    }
  }

  return (state: BoardState) => {
    if (search.value !== state.q) search.value = state.q;
    setSelect(category, state.cat);
    setSelect(chain, state.chain);
    watchlist.checked = state.wl;
    for (const button of buttons) {
      const th = button.parentElement;
      if (th)
        th.ariaSort =
          button.dataset.sort !== state.sort
            ? null
            : state.dir === "asc"
              ? "ascending"
              : "descending";
    }
    const selected = selectRows(rows, state);
    results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`;
    body.innerHTML = boardRows(selected, state, maxLogValue, usd);
  };
}

function start(main: HTMLElement, snapshot: Snapshot, data: RadarData, api: Window["Radar"]): void {
  const { buildRadar, daysBetween, farmAssumptions, formatUsd } = api;
  const { launchClock, meta } = data;
  const radar = buildRadar(snapshot, data.model.lambda, launchClock, meta);
  // These are board.json's rows. The CLI end-to-end test checks every published field.
  const published = data.board.rows;
  const families = new Map(radar.families.map((family) => [family.representative.slug, family]));
  const evidence = new Map(published.map((row) => [row?.slug, row ?? undefined]));
  const checks = integrityChecks(radar.board, published, snapshot.watchlist, {
    fitted: radar.model.n,
    houseRule: radar.houseRule,
    intervalCounts: data.intervalCounts,
    loo: data.model.validation.leaveOneFamilyOut,
  });
  const watchlisted = new Set(snapshot.watchlist);
  const protocols = new Map(radar.board.map((row) => [row.protocol.slug, row]));
  const age = ({ listed_at }: Protocol) =>
    listed_at === null ? null : daysBetween(listed_at, snapshot.as_of);
  const rows: BoardRow[] = radar.board.map(
    ({
      protocol,
      rank,
      status,
      implied_value_usd: value,
      launch_value_usd: launchValue,
      launchProbability12: odds,
      plan,
    }) => {
      const { slug, name, tvl_usd, change_7d, category, chains } = protocol;
      const diagnostics = evidence.get(slug);
      return {
        slug,
        name,
        rank,
        category,
        chains,
        value,
        launchValue,
        odds,
        tvl: tvl_usd,
        growth: change_7d,
        interval: diagnostics ? [diagnostics.interval_p10_usd, diagnostics.interval_p90_usd] : null,
        age: status === "traded" || status === "token-unpriced" ? null : age(protocol),
        cost: plan.totalCostUsd,
        time: plan.totalMinutes,
        watchlist: watchlisted.has(slug),
      };
    },
  );
  element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`;
  const counts = [
    snapshot.protocols.length,
    radar.model.n,
    rows.length,
    clockSampleSize(launchClock.points),
  ];
  document.querySelectorAll("#summary dd, #clock-count").forEach((count, i) => {
    count.textContent = formatInteger(counts[i] ?? null);
  });
  const { intercept, lnTvl, lnAge } = radar.model.coefficients;
  element("#formula").textContent =
    `ln V = ${intercept.toFixed(3)} ${signedTerm(lnTvl)}·ln(TVL·(1+g₇)) ${signedTerm(lnAge)}·ln(age)`;
  element("#checks").innerHTML = integrityStrip(checks);

  let updateBoard: ReturnType<typeof mountBoard> | undefined;
  let updatePlan: ReturnType<MountPlanner> | undefined;
  let lastPage: string | undefined;

  function draw(): void {
    delete main.dataset.ready;
    const route = parseRoute(location.hash);
    const page = route.page === "protocol" ? `protocol/${route.slug}` : route.page;
    const changedPage = lastPage && lastPage !== page;
    lastPage = page;
    if (changedPage) {
      updateBoard = undefined;
      updatePlan = undefined;
    }
    if (route.page === "board") {
      updateBoard ??= mountBoard(main, rows, censusSummary(data.census, protocols), formatUsd);
      updateBoard(route.state);
    } else if (route.page === "plan") {
      updatePlan ??= api.mountPlanner(main, radar.board, meta, api);
      updatePlan(location.hash);
    } else if (route.page === "census") {
      main.innerHTML = censusView(data.census, route.state, formatUsd, protocols);
    } else if (route.page === "method") {
      main.innerHTML = methodView(
        { ...data, houseRule: radar.houseRule },
        farmAssumptions,
        formatUsd,
      );
    } else {
      const back = boardHash(route.state);
      const detail = route.page === "protocol" ? protocols.get(route.slug) : undefined;
      main.innerHTML = detail
        ? protocolView(
            detail,
            {
              age: age(detail.protocol),
              coefficients: data.model.coefficients,
              lnValue: api.logValue(detail.features, data.model),
              back,
              usd: formatUsd,
              farm: farmAssumptions,
              diagnostics: evidence.get(detail.protocol.slug),
              families,
              launchClock,
              launchProbability12: api.launchProbability12,
            },
            api,
          )
        : `<h2>Page unavailable</h2><a href="${esc(back)}">Back to board</a>`;
    }
    if (changedPage) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
    main.dataset.ready = "";
  }

  main.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const sort = event.target.closest<HTMLButtonElement>("button[data-sort]")?.dataset.sort;
    const route = parseRoute(location.hash);
    const dir =
      "state" in route && route.state.sort === sort && route.state.dir === "asc" ? "desc" : "asc";
    if (route.page === "board" && isSortKey(sort)) {
      location.hash = boardHash({ ...route.state, sort, dir });
    } else if (route.page === "census" && isCensusSortKey(sort)) {
      location.hash = censusHash({ ...route.state, sort, dir });
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
  main.addEventListener("input", ({ target }) => {
    if (!(target instanceof HTMLInputElement) || target.name !== "q") return;
    const route = parseRoute(location.hash);
    if (route.page !== "board") return;
    history.replaceState(null, "", boardHash({ ...route.state, q: target.value }));
    draw();
  });
  main.addEventListener("change", (event) => {
    const target = event.target;
    const route = parseRoute(location.hash);
    if (
      route.page === "census" &&
      target instanceof HTMLSelectElement &&
      target.name === "status"
    ) {
      location.hash = censusHash({
        ...route.state,
        status: target.value as typeof route.state.status,
      });
      return;
    }
    if (route.page !== "board") return;
    const { state } = route;
    if (target instanceof HTMLSelectElement && (target.name === "cat" || target.name === "chain")) {
      location.hash = boardHash({ ...state, [target.name]: target.value });
    } else if (target instanceof HTMLInputElement && target.name === "wl") {
      location.hash = boardHash({ ...state, wl: target.checked });
    }
  });
  window.addEventListener("hashchange", draw);
  draw();
}

const root = element("main");
const { RADAR_DATA: publishedData, Radar: core } = window;
const input = publishedData && core.readPublishedSnapshot(publishedData);
if (publishedData && input) {
  start(root, input, publishedData, core);
} else {
  root.innerHTML =
    "<h2>Snapshot data unavailable</h2><p>Generate it with <code>pnpm radar</code>.</p>";
}
