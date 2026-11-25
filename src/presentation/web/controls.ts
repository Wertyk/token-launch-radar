import type { BoardRow } from "./board.ts";
import { options } from "./filter-options.ts";
import type * as State from "./state.ts";
import { boardHash, censusHash, isSortKey } from "./state.ts";

export function bindControls(
  main: HTMLElement,
  draw: () => void,
  { isCensusSortKey, parseRoute }: Pick<typeof State, "isCensusSortKey" | "parseRoute">,
): void {
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
        unranked: false,
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
}

function setSelect(select: HTMLSelectElement, value: string): void {
  select.querySelector("[data-temporary]")?.remove();
  select.value = value;
  if (select.selectedIndex < 0) {
    const option = new Option(value, value, false, true);
    option.dataset.temporary = "";
    select.add(option);
  }
}

export function boardControls(
  main: HTMLElement,
  { element, escapeHtml }: NonNullable<Window["Radar"]["view"]>,
  rows: readonly BoardRow[],
) {
  const search = element<HTMLInputElement>('[name="q"]', main);
  const category = element<HTMLSelectElement>('[name="cat"]', main);
  const chain = element<HTMLSelectElement>('[name="chain"]', main);
  category.insertAdjacentHTML(
    "beforeend",
    options(
      rows.flatMap(({ category }) => category ?? []),
      escapeHtml,
    ),
  );
  chain.insertAdjacentHTML(
    "beforeend",
    options(
      rows.flatMap(({ chains }) => chains),
      escapeHtml,
    ),
  );
  const watchlist = element<HTMLInputElement>('[name="wl"]', main);
  const buttons = main.querySelectorAll<HTMLButtonElement>("button[data-sort]");
  return (state: State.BoardState) => {
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
  };
}
