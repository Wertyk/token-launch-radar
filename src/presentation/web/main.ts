import type * as BrowserApi from "../../application/browser-api.ts";
import type { RadarResult } from "../../application/build-radar.ts";
import type { FarmTables } from "../../domain/farming/playbook-data.ts";
import type { Protocol, Snapshot } from "../../domain/snapshot.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";
import type { BoardRow } from "./board.ts";
import { selectRows } from "./board.ts";
import { boardRows, boardView } from "./board-view.ts";
import { censusView } from "./census-view.ts";
import { escapeHtml as esc, formatInteger } from "./format.ts";
import { integrityChecks } from "./integrity.ts";
import { methodView } from "./method-view.ts";
import { plannerForm, plannerResults, plannerSettings, sliderValues } from "./plan-view.ts";
import { protocolView } from "./protocol-view.ts";
import type { BoardState, PlanState, Sliders } from "./state.ts";
import {
  boardHash,
  censusHash,
  isCensusSortKey,
  isSortKey,
  parseRoute,
  planHash,
} from "./state.ts";

type PublishedRow = BrowserApi.BoardRows["rows"][number] &
  ValueDiagnostics & { launch_p12: number };

interface RadarData
  extends BrowserApi.PublishedSnapshot,
    Pick<RadarResult, "model" | "launchClock" | "census" | "intervalCounts"> {
  meta: BrowserApi.PublishedSnapshot["meta"] & FarmTables;
  board: { rows: PublishedRow[] };
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
  checks: ReturnType<typeof integrityChecks>,
): string {
  const { intercept, lnTvl, lnAge } = coefficients;
  return `
<dl class="kpis">${counts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
<section class="model" aria-label="Value model">
<p class="equation">ln V = ${intercept.toFixed(3)} ${signedTerm(lnTvl)}·ln(TVL·(1+g₇)) ${signedTerm(lnAge)}·ln(age)</p>
<p class="caption">Implied value is conditional market cap at launch if the record stays as it is. Launch odds are separate.
Age is days since listing (min 1). g₇ is 7-day TVL growth clipped to −50%…+100%.</p>
<ul class="integrity">${checks
    .map(
      ({ pass, label }) =>
        `<li class="${pass ? "check" : "check-failed"}">${pass ? "✓" : "✗"} ${esc(label)}</li>`,
    )
    .join("")}</ul>
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
  const buttons = main.querySelectorAll<HTMLButtonElement>("button[data-sort]");

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

function start(
  main: HTMLElement,
  snapshot: Snapshot,
  data: RadarData,
  api: typeof BrowserApi,
): void {
  const { buildRadar, daysBetween, farmAssumptions, formatUsd } = api;
  const { launchClock, meta } = data;
  const radar = buildRadar(snapshot, data.model.lambda, launchClock, meta);
  const published = data.board.rows;
  const families = new Map(radar.families.map((family) => [family.representative.slug, family]));
  const evidence = new Map(published.map((row) => [row.slug, row]));
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
    ({ protocol, rank, status, implied_value_usd, plan }) => {
      const { slug, name, tvl_usd, change_7d, category, chains } = protocol;
      const diagnostics = evidence.get(slug);
      return {
        slug,
        name,
        rank,
        category,
        chains,
        value: implied_value_usd,
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
  const maxLogValue = Math.log1p(
    Math.max(1, ...rows.map((row) => Math.max(row.value, row.interval?.[1] ?? 0))),
  );
  element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`;
  element("#summary").innerHTML = header(
    [
      ["Protocols scanned", formatInteger(snapshot.protocols.length)],
      ["Traded comparables", formatInteger(radar.model.n)],
      ["Board rows", formatInteger(rows.length)],
    ],
    radar.model.coefficients,
    checks,
  );

  let updateBoard: ReturnType<typeof mountBoard> | undefined;
  let updatePlan: ReturnType<typeof mountPlanner> | undefined;
  let lastPage: string | undefined;

  function mountPlanner() {
    main.innerHTML = plannerForm(rows.flatMap((row) => row.chains));
    const form = element<HTMLFormElement>("form", main);
    const budget = element<HTMLInputElement>('[name="budget"]', form);
    const hours = element<HTMLInputElement>('[name="hours"]', form);
    const select = element<HTMLSelectElement>('[name="chains"]', form);
    const results = element("#portfolio-results", main);
    const sliders = form.querySelectorAll<HTMLInputElement>('input[type="range"]');
    let state: PlanState;

    const save = () => {
      if (!form.checkValidity()) return;
      location.hash = planHash({
        budgetUsd: budget.valueAsNumber,
        hoursPerWeek: hours.valueAsNumber,
        chains: Array.from(select.selectedOptions, (option) => option.value),
        sliders: state.sliders,
      });
    };
    form.onchange = save;
    form.onsubmit = (event) => {
      event.preventDefault();
      save();
    };
    const setSliders = (sliders: Sliders) => {
      const next = { ...state, sliders };
      history.replaceState(null, "", planHash(next));
      update(next);
    };
    form.oninput = ({ target }) => {
      if (target instanceof HTMLInputElement && target.type === "range") {
        setSliders({ ...state.sliders, [target.name]: target.valueAsNumber });
      }
    };
    element("[data-reset]", form).onclick = () => setSliders({});

    function update(next: PlanState): void {
      state = next;
      budget.value = String(state.budgetUsd);
      hours.value = String(state.hoursPerWeek);
      for (const chain of state.chains) {
        if (![...select.options].some((option) => option.value === chain)) {
          select.add(new Option(chain, chain));
        }
      }
      for (const option of select.options) option.selected = state.chains.includes(option.value);
      const { budgetUsd, hoursPerWeek } = state;
      const values = { ...sliderValues(farmAssumptions), ...state.sliders };
      for (const slider of sliders) {
        slider.value = String(values[slider.name as keyof Sliders]);
        const output = slider.previousElementSibling as HTMLOutputElement;
        output.value = slider.value;
      }
      const assumptions = { ...plannerSettings(farmAssumptions, state.sliders), tables: meta };
      const economics = radar.board.map((row) =>
        api.estimateFarmEconomics(
          row.plan,
          row.implied_value_usd,
          row.protocol.tvl_usd,
          row.economics.launchProbability12,
          assumptions,
        ),
      );
      const result = api.planPortfolio(radar.board, {
        budgetUsd,
        hoursPerWeek,
        assumptions,
        ...(state.chains.length ? { chains: state.chains } : {}),
      });
      results.innerHTML = plannerResults(
        result,
        economics,
        (slug) => protocols.get(slug)?.protocol.name ?? slug,
        formatUsd,
      );
    }
    return update;
  }

  function draw(): void {
    delete main.dataset.ready;
    const route = parseRoute(location.hash);
    const page = route.page === "protocol" ? `protocol/${route.slug}` : route.page;
    const changedPage = lastPage && lastPage !== page;
    lastPage = page;
    if (route.page !== "board") updateBoard = undefined;
    if (route.page !== "plan") updatePlan = undefined;
    if (route.page === "board") {
      updateBoard ??= mountBoard(main, rows, maxLogValue, formatUsd);
      updateBoard(route.state);
    } else if (route.page === "plan") {
      updatePlan ??= mountPlanner();
      updatePlan(route.state);
    } else if (route.page === "census") {
      main.innerHTML = censusView(data.census, route.state, formatUsd);
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
        ? protocolView(detail, {
            age: age(detail.protocol),
            back,
            usd: formatUsd,
            farm: farmAssumptions,
            diagnostics: evidence.get(detail.protocol.slug),
            families,
            launchClock,
            clockShareAt: api.clockShareAt,
          })
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
    if (route.page === "board" && isSortKey(sort)) {
      const { state } = route;
      const dir = state.sort === sort && state.dir === "asc" ? "desc" : "asc";
      location.hash = boardHash({ ...state, sort, dir });
    } else if (route.page === "census" && isCensusSortKey(sort)) {
      const { state } = route;
      const dir = state.sort === sort && state.dir === "asc" ? "desc" : "asc";
      location.hash = censusHash({ ...state, sort, dir });
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

const main = element("main");
const { RADAR_DATA: data, Radar: api } = window;
const snapshot = data && api.readPublishedSnapshot(data);
if (data && snapshot) {
  start(main, snapshot, data, api);
} else {
  main.innerHTML =
    "<h2>Snapshot data unavailable</h2><p>Generate it with <code>pnpm radar</code>.</p>";
}
