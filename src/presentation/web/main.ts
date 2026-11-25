import type * as BrowserApi from "../../application/browser-api.ts";
import type { boardFarmSteps } from "../../domain/farming/board-steps.ts";
import type { planPortfolio } from "../../domain/farming/portfolio.ts";
import type { Snapshot } from "../../domain/snapshot.ts";
import { type BoardRow, selectRows } from "./board.ts";
import { serializeBoard } from "./board-export.ts";
import { boardRows, boardTable } from "./board-view.ts";
import { censusSummary, censusView } from "./census-view.ts";
import type { bindControls, boardControls } from "./controls.ts";
import { element } from "./dom.ts";
import { escapeHtml as esc, formatInteger, formatOdds } from "./format.ts";
import { integrityChecks, integrityStrip } from "./integrity.ts";
import { kpiStrip, termCounts } from "./kpis.ts";
import { methodNotes } from "./method-extras.ts";
import { methodView } from "./method-view.ts";
import type { MountPlanner } from "./planner.ts";
import { protocolView, valueFormula } from "./protocol-view.ts";
import { matchesFields, prepareBoard } from "./recompute.ts";
import { isCensusSortKey, isSortKey, parseRoute } from "./route.ts";
import { scatterCoverage } from "./scatter-view.ts";
import { boot, type RadarData } from "./startup.ts";
import type { BoardState, boardHash } from "./state.ts";
import { type ViewTools, viewTools } from "./view-tools.ts";

declare global {
  interface Window {
    Radar: typeof BrowserApi.browserApi &
      Partial<{
        mountPlanner: MountPlanner;
        planPortfolio: typeof planPortfolio;
        bindControls: typeof bindControls;
        boardControls: typeof boardControls;
        boardFarmSteps: (row: Parameters<typeof boardFarmSteps>[0]) => string[];
        boardHash: typeof boardHash;
        view: ViewTools & { element: typeof element };
      }>;
    RADAR_DATA?: RadarData;
  }
}

function mountBoard(
  main: HTMLElement,
  rows: readonly BoardRow[],
  summary: string,
  protocols: ReadonlyMap<string, BrowserApi.RadarRow>,
  { formatUsd: usd, compareText, boardControls, view, boardHash, farmAssumptions }: Window["Radar"],
) {
  main.innerHTML =
    summary + element<HTMLTemplateElement>("#board-filters").innerHTML + boardTable();
  const sync = view && boardControls?.(main, view, rows);
  const results = element("#results", main);
  const body = element("tbody", main);
  const maxLogValue = Math.log1p(
    Math.max(1, ...rows.flatMap(({ value, interval }) => [value, interval?.[1] ?? 0])),
  );

  const deposit = element<HTMLSelectElement>('[name="deposit"]', main);
  deposit.innerHTML = farmAssumptions.depositsUsd
    .map(
      (amount) =>
        `<option value="${amount}"${amount === 10_000 ? " selected" : ""}>$${amount / 1000}K</option>`,
    )
    .join("");
  const exports = (["csv", "json"] as const).map((format) => ({
    format,
    link: element<HTMLAnchorElement>(`[download="radar.${format}"]`, main),
  }));
  const render = (state: BoardState) => {
    sync?.(state);
    const amount = Number(deposit.value) || 10_000;
    const live = rows.map((row) => {
      const economics = protocols
        .get(row.slug)
        ?.economics.deposits.find(({ depositUsd }) => depositUsd === amount);
      return economics
        ? { ...row, verdict: economics.verdict, netPerHour: economics.netPerHourUsd }
        : row;
    });
    const selected = selectRows(live, state, compareText);
    results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`;
    body.innerHTML = boardRows(selected, boardHash?.(state) ?? "#/", maxLogValue, usd);
    for (const { format, link } of exports) {
      link.href = `data:text/${format};charset=utf-8,${encodeURIComponent(serializeBoard(selected, format, amount))}`;
    }
  };
  return (state: BoardState) => {
    deposit.onchange = () => render(state);
    render(state);
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
  const { model, odds, houseRule, census } = radar;
  const { bootstrap, placebo } = api.reproduceDiagnostics(
    radar,
    data.model.fit.terms,
    snapshot.as_of,
  );
  const effects = new Map(
    radar.board.map(({ protocol }) => [
      protocol.slug,
      api.impliedValueEffects(protocol, snapshot.as_of, model, odds),
    ]),
  );
  const effectSummary = api.summarizeEffects(effects);
  const coefficientSummary = api.summarizeEffects(
    new Map(
      radar.board.map(({ protocol }) => [
        protocol.slug,
        api.coefficientEffects(protocol, snapshot.as_of, model, odds),
      ]),
    ),
  );
  const {
    board: { rows: published },
  } = data;
  const { families, diagnostics, protocols, mismatches, rows } = prepareBoard(
    radar,
    published,
    snapshot.watchlist,
    (date) => daysBetween(date, snapshot.as_of),
    bootstrap.ranks,
    api.boardFarmSteps,
  );
  const scatter = scatterCoverage(data.looScatter ?? [], families);
  const selection = api.reproduceSelection(radar);
  const rangeHonesty = api.rangeHonesty(scatter.valid);
  const validation = api.scoreValueEvidence(radar.comparables, data.model.evidence);
  const oddsValidation = api.scoreOddsEvidence(radar.population, data.odds.validation.evidence);
  const noScore = { n: 0, medianMultiplier: null, spearman: null };
  const noValue = { model: noScore, flatMultiple: noScore, categoryMultiple: noScore };
  const noOdds = [null, null];
  const valueModel = {
    ...data.model,
    ...model,
    selection: selection.value,
    validation: validation ?? {
      leaveOneFamilyOut: noValue,
      seededFiveFold: noValue,
      walkForward: noValue,
    },
  };
  const oddsModel = {
    ...data.odds,
    ...odds,
    standardErrors: bootstrap.oddsErrors,
    validation: {
      evidence: data.odds.validation.evidence,
      selection: selection.odds,
      ...(oddsValidation ?? {
        scores: noOdds,
        baselines: { baseRate: noOdds, pava: noOdds, clockOnly: noOdds },
      }),
    },
  };
  const checks = integrityChecks(mismatches, published, snapshot.watchlist, {
    fitted: model.n,
    houseRule,
    intervalCounts: scatter.counts,
    invalidPoints: scatter.invalidPoints,
    coverageUnavailable: data.looScatter === null && model.n < api.MIN_BAND_FAMILIES,
    loo: valueModel.validation.leaveOneFamilyOut,
  });
  if (!api.boardFarmSteps) checks.push({ pass: null, label: "Step text comparison unavailable" });
  element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`;
  const selectionMatches =
    matchesFields(selection.value, data.model.selection, "", true) &&
    matchesFields(selection.value.terms, data.model.fit.terms) &&
    matchesFields(selection.odds, data.odds.validation.selection, "", true) &&
    matchesFields(selection.odds.terms, data.odds.terms);
  checks.push({
    pass: selectionMatches,
    label: `Term selection ${selectionMatches ? "reproduced" : "differs"} · ${termCounts(selection.value)} · ${termCounts(selection.odds)}`,
  });
  if (!matchesFields(rangeHonesty, data.rangeHonesty))
    checks.push({ pass: false, label: "Held-out coverage totals differ from published data" });
  const sign = (value: number) => (Math.abs(value) <= 1e-9 ? 0 : Math.sign(value));
  checks.push(
    {
      pass: matchesFields(census, data.census),
      label: "Census = recompute",
    },
    {
      pass:
        effectSummary.every(
          ([median], i) =>
            Number.isFinite(median) && sign(median) === sign(coefficientSummary[i]?.[0] ?? NaN),
        ) &&
        matchesFields(
          effectSummary.map(([median]) => median),
          data.effectMedians,
          "",
          true,
        ),
      label: "Input effects = reference",
    },
    {
      pass:
        validation !== null &&
        oddsValidation !== null &&
        matchesFields(validation, data.model.validation, "", true) &&
        matchesFields(oddsValidation, data.odds.validation, "", true),
      label: "Validation = fold predictions",
    },
    {
      pass:
        bootstrap.replicates === data.bootstrap?.replicates &&
        matchesFields(bootstrap.seeds, data.bootstrap?.seeds) &&
        matchesFields(bootstrap.valueErrors, data.bootstrap?.valueErrors, "", true) &&
        matchesFields(bootstrap.oddsErrors, data.odds.standardErrors, "", true) &&
        bootstrap.ranks.size === published.length &&
        published.every((row) => {
          const band = row && bootstrap.ranks.get(row.slug);
          return !!band && matchesFields(band, row);
        }),
      label: `Bootstrap · ${bootstrap.replicates} refits match`,
    },
    {
      pass:
        placebo.shuffles === data.placebo?.shuffles &&
        placebo.seed === data.placebo?.seed &&
        matchesFields(placebo, data.placebo, "", true),
      label: `Placebo · ${placebo.shuffles} refits match`,
    },
  );
  element("#kpis").innerHTML = kpiStrip(
    valueModel,
    oddsModel.validation,
    rangeHonesty,
    effectSummary,
    rows,
    census.length,
    new Set(snapshot.watchlist).size,
  );
  element("#formula").textContent = `ln V = ${valueFormula(model)}`;
  element("#checks").innerHTML = integrityStrip(checks);

  let updateBoard: ReturnType<typeof mountBoard> | undefined;
  let updatePlan: ReturnType<MountPlanner> | undefined;
  let lastPage: string | undefined;

  function draw(): void {
    try {
      const route = parseRoute(location.hash);
      const page = route.page === "protocol" ? `p/${route.slug}` : route.page;
      const changedPage = lastPage && lastPage !== page;
      lastPage = page;
      if (changedPage) {
        updateBoard = undefined;
        updatePlan = undefined;
      }
      if (route.page === "board") {
        updateBoard ??= mountBoard(main, rows, censusSummary(census, protocols), protocols, api);
        updateBoard(route.state);
      } else if (route.page === "plan") {
        updatePlan ??= api.mountPlanner?.(main, radar.board, meta, api);
        if (updatePlan) updatePlan(location.hash);
        else main.innerHTML = element<HTMLTemplateElement>("#plan-unavailable").innerHTML;
      } else if (route.page === "census") {
        main.innerHTML = censusView(census, route.state, formatUsd, api.compareText, protocols);
      } else if (route.page === "method") {
        main.innerHTML = methodView(
          {
            model: valueModel,
            odds: oddsModel,
            rangeHonesty,
            bootstrap,
            placebo,
            effectSummary,
            boardSize: rows.length,
          },
          (panel) => methodNotes(houseRule, farmAssumptions, formatUsd, formatOdds, panel),
        );
      } else {
        const back = api.boardHash?.(route.state) ?? "#/";
        const detail = route.page === "protocol" ? protocols.get(route.slug) : undefined;
        const listed = detail?.protocol.listed_at;
        main.innerHTML = detail
          ? protocolView(detail, {
              age: listed ? daysBetween(listed, snapshot.as_of) : null,
              model,
              lnValue: api.logValue(detail.features, model),
              back,
              usd: formatUsd,
              farm: farmAssumptions,
              diagnostics: diagnostics.get(detail.protocol.slug),
              families,
              maxOddsAge: odds.maxAgeDays,
              effects: effects.get(detail.protocol.slug),
            })
          : `<h2>Page unavailable</h2><a href="${esc(back)}">Back to board</a>`;
      }
      if (changedPage) {
        window.scrollTo(0, 0);
        main.focus({ preventScroll: true });
      }
      main.dataset.ready = "";
    } catch {
      lastPage = "error";
      fail();
    }
  }

  draw();
  window.addEventListener("hashchange", draw);
  api.bindControls?.(main, draw, { isCensusSortKey, isSortKey, parseRoute });
}

boot?.(start);
