import type * as BrowserApi from "../../application/browser-api.ts";
import type { FarmTables } from "../../domain/farming/playbook-data.ts";
import type { PlanState, Sliders } from "./plan-state.ts";
import { parsePlanState, planHash } from "./plan-state.ts";
import { plannerForm, plannerResults, plannerSettings, sliderValues } from "./plan-view.ts";

export function mountPlanner(
  main: HTMLElement,
  board: readonly BrowserApi.RadarRow[],
  tables: FarmTables,
  api: typeof BrowserApi.browserApi & Pick<Window["Radar"], "planPortfolio" | "view">,
) {
  const { estimateFarmEconomics, farmAssumptions, formatUsd, planPortfolio, view } = api;
  if (!planPortfolio || !view) throw new Error("Missing portfolio optimizer.");
  const { element, escapeHtml, table } = view;
  const optimize = planPortfolio;
  const names = new Map(board.map(({ protocol }) => [protocol.slug, protocol.name]));
  main.innerHTML = plannerForm(
    board.flatMap(({ protocol }) => protocol.chains),
    escapeHtml,
  );
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
    const assumptions = { ...plannerSettings(farmAssumptions, state.sliders), tables };
    const economics = board.map(({ plan, launch_value_usd, protocol, launchProbability12 }) =>
      estimateFarmEconomics(
        plan,
        launch_value_usd,
        protocol.tvl_usd,
        launchProbability12,
        assumptions,
      ),
    );
    const result = optimize(board, {
      budgetUsd,
      hoursPerWeek,
      assumptions,
      ...(state.chains.length ? { chains: state.chains } : {}),
    });
    results.innerHTML = plannerResults(
      result,
      economics,
      (slug) => names.get(slug) ?? slug,
      formatUsd,
      { escapeHtml, table },
    );
  }
  return (hash: string) => update(parsePlanState(hash));
}

export type MountPlanner = typeof mountPlanner;
