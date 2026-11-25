import type * as BrowserApi from "../../application/browser-api.ts";
import type { boardFarmSteps } from "../../domain/farming/board-steps.ts";
import type { planPortfolio } from "../../domain/farming/portfolio.ts";
import type { Protocol, Snapshot } from "../../domain/snapshot.ts";
import type { BoardRow, selectRows } from "./board.ts";
import { boardRows, boardTable } from "./board-view.ts";
import { censusSummary, censusView } from "./census-view.ts";
import type { bindControls, boardControls } from "./controls.ts";
import { element } from "./dom.ts";
import { escapeHtml as esc, formatInteger, formatOdds } from "./format.ts";
import { integrityChecks, integrityStrip } from "./integrity.ts";
import type { methodNotes, termTrials } from "./method-extras.ts";
import { methodView } from "./method-view.ts";
import type { MountPlanner } from "./planner.ts";
import type { ProtocolExtras } from "./protocol-extras.ts";
import { protocolView, valueFormula } from "./protocol-view.ts";
import { prepareBoard } from "./recompute.ts";
import { scatterCoverage } from "./scatter-view.ts";
import { boot, type RadarData } from "./startup.ts";
import type { BoardState, boardHash, readBoardState } from "./state.ts";
import { isCensusSortKey, pageRoute } from "./state.ts";
import { type ViewTools, viewTools } from "./view-tools.ts";

declare global {
  interface Window {
    Radar: typeof BrowserApi.browserApi &
      Partial<
        ProtocolExtras & {
          mountPlanner: MountPlanner;
          selectRows: typeof selectRows;
          planPortfolio: typeof planPortfolio;
          bindControls: typeof bindControls;
          boardControls: typeof boardControls;
          boardFarmSteps: (row: Parameters<typeof boardFarmSteps>[0]) => string[];
          boardHash: typeof boardHash;
          readBoardState: typeof readBoardState;
          methodNotes: typeof methodNotes;
          termTrials: typeof termTrials;
          view: ViewTools & { element: typeof element };
        }
      >;
    RADAR_DATA?: RadarData;
  }
}

function mountBoard(
  main: HTMLElement,
  rows: readonly BoardRow[],
  summary: string,
  { formatUsd: usd, compareText, selectRows, boardControls, view, boardHash }: Window["Radar"],
) {
  main.innerHTML =
    summary + element<HTMLTemplateElement>("#board-filters").innerHTML + boardTable();
  const sync = view && boardControls?.(main, view, rows);
  const results = element("#results", main);
  const body = element("tbody", main);
  const maxLogValue = Math.log1p(
    Math.max(1, ...rows.flatMap(({ value, interval }) => [value, interval?.[1] ?? 0])),
  );

  return (state: BoardState) => {
    sync?.(state);
    const selected = selectRows?.(rows, state, compareText) ?? rows;
    results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`;
    body.innerHTML = boardRows(selected, boardHash?.(state) ?? "#/", maxLogValue, usd);
  };
}

function start(
  main: HTMLElement,
  snapshot: Snapshot,
  data: RadarData,
  api: Window["Radar"],
  fail: () => void,
): void {
  const { buildRadar, daysBetween, farmAssumptions, formatUsd } = api;
  api.view = { ...viewTools, element };
  const { meta } = data;
  const radar = buildRadar(snapshot, data.model.fit, data.odds.terms, meta);
  const { model, odds, houseRule } = radar;
  const { validation } = data.model;
  // These are board.json's rows. The CLI end-to-end test checks every published field.
  const published = data.board.rows;
  const age = ({ listed_at }: Protocol) =>
    listed_at === null ? null : daysBetween(listed_at, snapshot.as_of);
  const { families, diagnostics, protocols, mismatches, rows } = prepareBoard(
    radar,
    published,
    snapshot.watchlist,
    age,
    api.boardFarmSteps,
  );
  const scatter = scatterCoverage(data.looScatter ?? [], families);
  const checks = integrityChecks(mismatches, published, snapshot.watchlist, {
    fitted: model.n,
    houseRule,
    intervalCounts: scatter.counts,
    invalidPoints: scatter.invalidPoints,
    coverageUnavailable: data.looScatter === null && model.n < api.MIN_BAND_FAMILIES,
    loo: validation.leaveOneFamilyOut,
  });
  if (!api.boardFarmSteps && checks[0]) checks[0].label += " · step text unchecked";
  element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`;
  const counts = [snapshot.protocols.length, model.n, rows.length, odds.n];
  document.querySelectorAll("#summary dd, #clock-count").forEach((count, i) => {
    count.textContent = formatInteger(counts[i] ?? null);
  });
  element("#formula").textContent = `ln V = ${valueFormula(model)}`;
  element("#checks").innerHTML = integrityStrip(checks);

  let updateBoard: ReturnType<typeof mountBoard> | undefined;
  let updatePlan: ReturnType<MountPlanner> | undefined;
  let lastPage: string | undefined;
  const parseRoute = (hash: string) => pageRoute(hash, api.readBoardState);

  function render(): void {
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
      updatePlan ??= api.mountPlanner?.(main, radar.board, meta, api);
      if (updatePlan) updatePlan(location.hash);
      else main.innerHTML = element<HTMLTemplateElement>("#plan-unavailable").innerHTML;
    } else if (route.page === "census") {
      main.innerHTML = censusView(data.census, route.state, formatUsd, api.compareText, protocols);
    } else if (route.page === "method") {
      main.innerHTML = methodView(
        {
          model: { ...data.model, ...model },
          odds: { ...data.odds, ...odds },
          scatter,
        },
        (panel) =>
          api.methodNotes?.(houseRule, farmAssumptions, formatUsd, formatOdds, panel) ?? "",
        api.termTrials,
      );
    } else {
      const back = api.boardHash?.(route.state) ?? "#/";
      const detail = route.page === "protocol" ? protocols.get(route.slug) : undefined;
      main.innerHTML = detail
        ? protocolView(
            detail,
            {
              age: age(detail.protocol),
              model,
              lnValue: api.logValue(detail.features, model),
              back,
              usd: formatUsd,
              farm: farmAssumptions,
              diagnostics: diagnostics.get(detail.protocol.slug),
              families,
              maxOddsAge: odds.maxAgeDays,
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

  function draw(): void {
    try {
      render();
    } catch {
      lastPage = "error";
      fail();
    }
  }

  draw();
  window.addEventListener("hashchange", draw);
  api.bindControls?.(main, draw, { isCensusSortKey, parseRoute });
}

boot(start);
