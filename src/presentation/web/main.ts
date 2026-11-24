import type * as BrowserApi from "../../application/browser-api.ts";
import type { Protocol, Snapshot } from "../../domain/snapshot.ts";
import type { BoardRow } from "./board.ts";
import { selectRows } from "./board.ts";
import { boardRows, boardTable } from "./board-view.ts";
import { censusSummary, censusView } from "./census-view.ts";
import { clockSampleSize } from "./clock-view.ts";
import { type bindControls, setSelect } from "./controls.ts";
import { element } from "./dom.ts";
import { escapeHtml as esc, formatInteger, signedTerm } from "./format.ts";
import { integrityChecks, integrityStrip } from "./integrity.ts";
import { type methodFarmAssumptions, methodView } from "./method-view.ts";
import type { MountPlanner } from "./planner.ts";
import type { ProtocolExtras } from "./protocol-extras.ts";
import { protocolView } from "./protocol-view.ts";
import { prepareBoard } from "./recompute.ts";
import { options } from "./render.ts";
import { scatterCoverage } from "./scatter-view.ts";
import { boot, type RadarData } from "./startup.ts";
import type { BoardState } from "./state.ts";
import { boardHash, censusHash, isCensusSortKey, isSortKey, parseRoute } from "./state.ts";

declare global {
  interface Window {
    Radar: typeof BrowserApi.browserApi &
      Partial<
        ProtocolExtras & {
          mountPlanner: MountPlanner;
          bindControls: typeof bindControls;
          methodFarmAssumptions: typeof methodFarmAssumptions;
        }
      >;
    RADAR_DATA?: RadarData;
  }
}

function mountBoard(
  main: HTMLElement,
  rows: readonly BoardRow[],
  summary: string,
  { formatUsd: usd, compareText }: Window["Radar"],
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
    const selected = selectRows(rows, state, compareText);
    results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`;
    body.innerHTML = boardRows(selected, state, maxLogValue, usd);
  };
}

function start(main: HTMLElement, snapshot: Snapshot, data: RadarData, api: Window["Radar"]): void {
  const { buildRadar, daysBetween, farmAssumptions, formatUsd } = api;
  const { launchClock, meta } = data;
  const radar = buildRadar(snapshot, data.model.lambda, launchClock, meta);
  const { validation, ablation } = data.model;
  const scatter = scatterCoverage(data.looScatter);
  // These are board.json's rows. The CLI end-to-end test checks every published field.
  const published = data.board.rows;
  const age = ({ listed_at }: Protocol) =>
    listed_at === null ? null : daysBetween(listed_at, snapshot.as_of);
  const { families, diagnostics, protocols, mismatches, rows } = prepareBoard(
    radar,
    published,
    snapshot.watchlist,
    age,
  );
  const checks = integrityChecks(mismatches, published, snapshot.watchlist, {
    fitted: radar.model.n,
    houseRule: radar.houseRule,
    intervalCounts: scatter.counts,
    invalidPoints: scatter.invalidPoints,
    loo: validation.leaveOneFamilyOut,
  });
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
      updateBoard ??= mountBoard(main, rows, censusSummary(data.census, protocols), api);
      updateBoard(route.state);
    } else if (route.page === "plan") {
      if (api.mountPlanner) {
        updatePlan ??= api.mountPlanner(main, radar.board, meta, api);
        updatePlan(location.hash);
      } else {
        main.innerHTML = "<h2>Farm planner unavailable</h2>";
      }
    } else if (route.page === "census") {
      main.innerHTML = censusView(data.census, route.state, formatUsd, api.compareText, protocols);
    } else if (route.page === "method") {
      main.innerHTML = methodView(
        {
          model: { ...radar.model, validation, ablation },
          launchClock,
          houseRule: radar.houseRule,
          scatter,
        },
        api.methodFarmAssumptions?.(farmAssumptions, formatUsd),
      );
    } else {
      const back = boardHash(route.state);
      const detail = route.page === "protocol" ? protocols.get(route.slug) : undefined;
      main.innerHTML = detail
        ? protocolView(
            detail,
            {
              age: age(detail.protocol),
              coefficients: radar.model.coefficients,
              lnValue: api.logValue(detail.features, radar.model),
              back,
              usd: formatUsd,
              farm: farmAssumptions,
              diagnostics: diagnostics.get(detail.protocol.slug),
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

  draw();
  window.addEventListener("hashchange", draw);
  api.bindControls?.(main, draw, { boardHash, censusHash, isCensusSortKey, isSortKey, parseRoute });
}

boot(start);
