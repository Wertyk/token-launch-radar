import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { beforeAll, expect, test } from "vitest";
import { toBoardRows } from "../../src/application/board-rows.ts";
import { formatUsd } from "../../src/application/browser-api.ts";
import { buildRadar } from "../../src/application/build-radar.ts";
import { renderDataScript } from "../../src/application/data-script.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import { parseSnapshot } from "../../src/domain/snapshot.ts";
import { logValue } from "../../src/domain/valuation/model.ts";
import { readKitSnapshot } from "../radar-fixtures.ts";

const dashboard = new URL("../../dashboard/", import.meta.url);
const html = readFileSync(new URL("index.html", dashboard), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+\.js)"><\/script>/g)].flatMap(([, file]) =>
  file?.startsWith("../") || !file
    ? []
    : [{ file, source: readFileSync(new URL(file, dashboard), "utf8") }],
);

class Select {
  name = "";
  value = "";
  selectedIndex = 0;

  insertAdjacentHTML() {}
  querySelector() {
    return null;
  }
}

function open(data: Record<string, unknown>, hash = "#/", loadExtras = true) {
  const location = { hash };
  const markup = new Map<string, { innerHTML: string; textContent?: string }>();
  const listeners = new Map<string, (event: { target: Select }) => void>();
  const windowListeners = new Map<string, () => void>();
  const main = {
    innerHTML: "",
    dataset: {},
    focus() {},
    addEventListener(type: string, listener: (event: { target: Select }) => void) {
      listeners.set(type, listener);
    },
    querySelector(selector: string) {
      return selector.startsWith("[name=") ? new Select() : node(selector);
    },
    querySelectorAll() {
      return [];
    },
  };
  function node(selector: string) {
    if (selector === "main") return main;
    const element = markup.get(selector) ?? {
      innerHTML:
        selector === "#board-filters"
          ? (html.match(/<template id="board-filters">([\s\S]*?)<\/template>/)?.[1] ?? "")
          : "",
    };
    markup.set(selector, element);
    return element;
  }
  const context = createContext({
    window: {
      RADAR_DATA: data,
      scrollTo() {},
      addEventListener(type: string, listener: () => void) {
        windowListeners.set(type, listener);
      },
    },
    document: { querySelector: node, querySelectorAll: () => [] },
    location,
    URLSearchParams,
    HTMLSelectElement: Select,
  });
  for (const { file, source } of scripts) {
    if (loadExtras || file !== "5-extras.js") runInContext(source, context);
  }
  return {
    main,
    markup,
    navigate(next: string) {
      location.hash = next;
      windowListeners.get("hashchange")?.();
    },
    selectStatus(value: string) {
      listeners.get("change")?.({ target: Object.assign(new Select(), { name: "status", value }) });
      windowListeners.get("hashchange")?.();
    },
  };
}

let radar: ReturnType<typeof buildRadar>;
let script: string;
beforeAll(() => {
  const snapshot = parseSnapshot(readKitSnapshot());
  radar = buildRadar(snapshot);
  script = renderDataScript(snapshot, toBoardRows(radar), radar, farmTables());
}, 20_000);

function data() {
  return JSON.parse(script.slice("window.RADAR_DATA = ".length, -2));
}

test("clears the board link's unranked filter when changing census status", () => {
  const page = open(data());
  const excluded = page.main.innerHTML.match(/href="([^"]+)">144 excluded<\/a>/)?.[1];
  expect(excluded).toContain("unranked=1");
  if (!excluded) throw new Error("Missing board summary link");
  page.navigate(excluded.replaceAll("&amp;", "&"));
  expect(page.main.innerHTML).toContain("144 of 758 protocols");
  page.selectStatus("");
  expect(page.main.innerHTML).toContain("758 of 758 protocols");
  page.selectStatus("pre-token");
  expect(page.main.innerHTML).toContain("198 of 758 protocols");
  expect(page.main.innerHTML).toContain('value="pre-token" selected>Records no token');
}, 20_000);

test("uses the in-page model and rejects a card interval when published evidence is tampered with", () => {
  const payload = data();
  const row = radar.board[0];
  if (!row) throw new Error("Missing first board row");
  payload.model.coefficients.intercept += 1;
  delete payload.board.rows[0].interval_p10_usd;

  const page = open(payload, `#/p/${row.protocol.slug}`);
  const checks = page.markup.get("#checks")?.innerHTML;
  const lnValue = logValue(row.features, radar.model);
  expect
    .soft(page.main.innerHTML)
    .toContain(`ln V ≈ ${radar.model.coefficients.intercept.toFixed(4)}`);
  expect
    .soft(page.main.innerHTML)
    .toContain(`≈ ${lnValue.toFixed(3)} → ${formatUsd(Math.round(Math.exp(lnValue)))}`);
  expect.soft(checks).toContain('class="check-failed">✗ Recompute ≠ board.json');
  expect.soft(checks).toContain('class="check">✓ 104/128 held-out traded caps inside P10–P90');
  expect.soft(page.main.innerHTML).toContain("P10–P90 · —");
  expect.soft(page.main.innerHTML).not.toContain("$NaN");

  page.navigate("#/method");
  expect
    .soft(page.main.innerHTML)
    .toContain(`<td>Intercept</td><td>${radar.model.coefficients.intercept.toFixed(6)}</td>`);
  expect.soft(page.main.innerHTML).toContain("104/128 inside held-out P10–P90");
  expect.soft(page.main.innerHTML.match(/class="inside"/g)).toHaveLength(104);
}, 20_000);

function insidePoint(payload: ReturnType<typeof data>) {
  const point = payload.looScatter.find(
    ({ actual, p10, p90 }: { actual: number; p10: number; p90: number }) =>
      p10 <= actual && actual <= p90,
  );
  if (!point) throw new Error("Expected a point inside a published band");
  return point;
}

test("updates both coverage displays when a published band changes the point's classification", () => {
  const payload = data();
  const point = insidePoint(payload);
  point.p10 = point.actual + 1;
  point.p90 = point.actual + 2;
  const page = open(payload, "#/method");
  expect(page.markup.get("#checks")?.innerHTML).toContain("103/128 held-out traded caps");
  expect(page.main.innerHTML).toContain("103/128 inside held-out P10–P90");
  expect(page.main.innerHTML.match(/class="inside"/g)).toHaveLength(103);
});

test("ignores impossible counts injected into the payload", () => {
  const payload = data();
  payload.intervalCounts = { missLow: -1, covered: 129, missHigh: 0 };
  const page = open(payload, "#/method");
  expect(page.markup.get("#checks")?.innerHTML).toContain(
    'class="check">✓ 104/128 held-out traded caps',
  );
  expect(page.main.innerHTML).toContain("104/128 inside held-out P10–P90");
});

test.each(["missing", "non-finite", "reversed"])("flags a band with %s endpoints", (tampering) => {
  const payload = data();
  const point = insidePoint(payload);
  if (tampering === "missing") delete point.p10;
  else if (tampering === "non-finite") point.p90 = Number.POSITIVE_INFINITY;
  else [point.p10, point.p90] = [point.p90, point.p10];
  const page = open(payload, "#/method");
  expect(page.markup.get("#checks")?.innerHTML).toContain(
    'class="check-failed">✗ 103/127 held-out traded caps inside P10–P90 · 127/128 families',
  );
  expect(page.main.innerHTML).toContain("103/127 inside held-out P10–P90");
});

test("flags invalid evidence even when the valid points account for the fitted population", () => {
  const payload = data();
  payload.looScatter.push({ ...insidePoint(payload), p10: null });
  const page = open(payload, "#/method");
  expect(page.markup.get("#checks")?.innerHTML).toContain(
    'class="check-failed">✗ 104/128 held-out traded caps inside P10–P90 · 1 invalid',
  );
  expect(page.main.innerHTML).toContain("104/128 inside held-out P10–P90");
});

test.each([true, false])("renders all required routes with loadExtras=%s", (loadExtras) => {
  const page = open(data(), "#/", loadExtras);
  expect(page.main.innerHTML).toContain("198 ranked");
  expect(page.markup.get("tbody")?.innerHTML.match(/data-protocol/g)).toHaveLength(198);
  const slug = radar.board[0]?.protocol.slug;
  for (const [hash, marker] of [
    [`#/p/${slug}`, "Farm plan"],
    ["#/census", "758 of 758 protocols"],
    ["#/method", "104/128 inside held-out P10–P90"],
    ["#/", "198 ranked"],
  ] as const) {
    page.navigate(hash);
    expect(page.main.innerHTML).toContain(marker);
    const checks = page.markup.get("#checks")?.innerHTML;
    expect(checks?.match(/class="check"/g)).toHaveLength(5);
  }
  page.navigate("#/method");
  expect(page.main.innerHTML.includes("Verdict test deposits")).toBe(loadExtras);
});

test("shows the startup alert for incomplete data even without extras", () => {
  const payload = data();
  delete payload.board;
  expect(open(payload, "#/", false).main.innerHTML).toContain('role="alert"');
});

test.each([
  "board",
  "launchClock",
  "model.validation",
  "model.validation.seededFiveFold",
  "census",
])("shows a startup failure in main when %s is missing", (field) => {
  const payload = data();
  if (field === "model.validation") delete payload.model.validation;
  else if (field === "model.validation.seededFiveFold")
    delete payload.model.validation.seededFiveFold;
  else delete payload[field];
  expect(open(payload, "#/census").main.innerHTML).toContain('role="alert"');
});

test("hides a successful summary on census while keeping failed checks visible", () => {
  const css = readFileSync(new URL("4-app.css", dashboard), "utf8");
  expect(css).toMatch(
    /body:has\(main \.census\) #summary:not\(:has\(\.check-failed\)\)\s*\{\s*display: none/,
  );
});
