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
import { protocol } from "../domain/protocol-fixture.ts";
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

function open(data: Record<string, unknown>, hash = "#/", loadExtras = true, loadUi = true) {
  const location = { hash };
  const markup = new Map<string, { innerHTML: string; textContent?: string }>();
  const listeners = new Map<string, (event: { target: Select }) => void>();
  const windowListeners = new Map<string, () => void>();
  const main = {
    innerHTML: html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "",
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
  const templates = new Map(
    [...html.matchAll(/<template id="([\w-]+)">([\s\S]*?)<\/template>/g)].map(([, id, content]) => [
      `#${id}`,
      content,
    ]),
  );
  function node(selector: string) {
    if (selector === "main") return main;
    const element = markup.get(selector) ?? {
      innerHTML: templates.get(selector) ?? "",
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
    if ((!loadExtras && file === "5-extras.js") || (!loadUi && file === "3-ui.js")) continue;
    runInContext(source, context);
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

function data(published = script) {
  return JSON.parse(published.slice("window.RADAR_DATA = ".length, -2));
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

test("uses the refit when the only injected field is a changed intercept", () => {
  const payload = data();
  const row = radar.board[0];
  if (!row) throw new Error("Missing first board row");
  const { coefficients } = radar.model;
  payload.model.coefficients = { ...coefficients, intercept: coefficients.intercept + 1 };
  payload.odds.coefficients = [0, -1];
  payload.odds.clock = [];

  const page = open(payload, `#/p/${row.protocol.slug}`);
  const checks = page.markup.get("#checks")?.innerHTML;
  const lnValue = logValue(row.features, radar.model);
  expect
    .soft(page.main.innerHTML)
    .toContain(`ln V ≈ ${radar.model.coefficients.intercept.toFixed(4)}`);
  expect
    .soft(page.main.innerHTML)
    .toContain(`≈ ${lnValue.toFixed(3)} → ${formatUsd(Math.round(Math.exp(lnValue)))}`);
  expect.soft(checks?.match(/class="check"/g)).toHaveLength(5);
  expect.soft(checks).toContain('class="check">✓ 104/128 held-out traded caps inside P10–P90');

  page.navigate("#/method");
  expect
    .soft(page.main.innerHTML)
    .toContain(`<td>Intercept</td><td>${radar.model.coefficients.intercept.toFixed(6)}</td>`);
  expect.soft(page.main.innerHTML).toContain("104/128 inside held-out P10–P90");
  expect.soft(page.main.innerHTML.match(/class="inside"/g)).toHaveLength(104);
  expect(page.main.innerHTML).toContain(
    `<td>logit(S(a))</td><td>${radar.odds.coefficients[1]?.toFixed(6)}</td>`,
  );
}, 20_000);

test("matches recomputed farm-step text with the browser serializers loaded", () => {
  const payload = data();
  const row = payload.board.rows[0];
  row.farm_steps[0] += " Changed.";
  const page = open(payload);
  expect(page.markup.get("#checks")?.innerHTML).toContain(`1 mismatched · ${row.slug}`);
});

test.each([undefined, -2])("rejects P10=%s on the board and detail card", (low) => {
  const payload = data();
  const row = payload.board.rows[0];
  row.interval_p10_usd = low;
  const page = open(payload);
  const table = page.markup.get("tbody")?.innerHTML;
  expect(page.markup.get("#checks")?.innerHTML).toContain('class="check-failed">✗ Recompute');
  expect(table?.match(/class="band"/g)).toHaveLength(197);
  expect(table).not.toContain('x="NaN"');
  page.navigate(`#/p/${row.slug}`);
  expect(page.main.innerHTML).toContain("P10–P90 · —");
  expect(page.main.innerHTML).not.toContain("$NaN");
});

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

test.each([9, 10])("respects the publisher's held-out band decision at %i families", (n) => {
  const snapshot = parseSnapshot({
    as_of: "2026-11-14",
    floor_usd: 10,
    source: "small sample",
    watchlist: ["sample"],
    protocols: [
      protocol({ listed_at: "2026-11-01" }),
      ...Array.from({ length: n }, (_, i) =>
        protocol({ slug: `priced-${i}`, mcap_usd: 100_000_000 + i }),
      ),
    ],
  });
  const result = buildRadar(snapshot);
  const payload = data(renderDataScript(snapshot, toBoardRows(result), result, farmTables()));
  const page = open(payload, "#/method", false);
  const checks = page.markup.get("#checks")?.innerHTML;
  if (n === 9) {
    expect(payload.looScatter).toBeNull();
    expect(checks).toContain(
      'class="check-unavailable">Coverage unavailable · too few traded families',
    );
    expect(checks).not.toContain("0/0 held-out traded caps");
    expect(page.main.innerHTML).toContain("No valid held-out bands to display.");
  } else {
    expect(payload.looScatter).toHaveLength(n);
    expect(checks).toContain("/10 held-out traded caps");
    expect(checks).not.toContain("Coverage unavailable");
  }
});

test("reports missing bands as a failure for a sample large enough to score", () => {
  const payload = data();
  payload.looScatter = null;
  const page = open(payload, "#/method");
  expect(page.markup.get("#checks")?.innerHTML).toContain(
    'class="check-failed">✗ 0/0 held-out traded caps',
  );
});

test.each(["steakhouse-financial", "aave-v2", "across"])(
  "rejects a copy of across under the slug %s",
  (slug) => {
    const payload = data();
    const index = payload.looScatter.findIndex((p: { slug: string }) => p.slug === "aave-v2");
    const covered = payload.looScatter.find((p: { slug: string }) => p.slug === "across");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(covered).toBeDefined();
    payload.looScatter[index] = { ...covered, slug };
    const page = open(payload, "#/method");
    expect(page.markup.get("#checks")?.innerHTML).toContain(
      'class="check-failed">✗ 104/127 held-out traded caps inside P10–P90 · 127/128 families',
    );
    expect(page.main.innerHTML).toContain("104/127 inside held-out P10–P90");
  },
);

test("replaces a rendered board with the alert when Method data disappears before navigation", () => {
  const payload = data();
  const page = open(payload);
  expect(page.main.innerHTML).toContain("198 ranked");
  const { selection } = payload.model;
  delete payload.model.selection;
  page.navigate("#/method");
  expect(page.main.innerHTML).toContain('role="alert"');
  expect(page.main.dataset).not.toHaveProperty("ready");
  payload.model.selection = selection;
  page.navigate("#/");
  expect(page.main.innerHTML).toContain("198 ranked");
  expect(page.main.dataset).toHaveProperty("ready");
});

test("the initial HTML gives a fallback if the UI script fails to load", () => {
  expect(open(data(), "#/", true, false).main.innerHTML).toContain('role="alert"');
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
  if (!loadExtras) {
    expect(page.markup.get("#checks")?.innerHTML).toContain("step text unchecked");
    page.navigate("#/plan");
    expect(page.main.innerHTML).toContain("Farm portfolio");
    expect(page.main.dataset).toHaveProperty("ready");
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
  "odds",
  "model.validation",
  "model.validation.seededFiveFold",
  "model.selection",
  "census",
])("shows a startup failure in main when %s is missing", (field) => {
  const payload = data();
  if (field === "model.validation") delete payload.model.validation;
  else if (field === "model.validation.seededFiveFold")
    delete payload.model.validation.seededFiveFold;
  else if (field === "model.selection") delete payload.model.selection;
  else delete payload[field];
  expect(open(payload, "#/census").main.innerHTML).toContain('role="alert"');
});

test("hides a successful summary on census while keeping failed checks visible", () => {
  const css = readFileSync(new URL("4-app.css", dashboard), "utf8");
  expect(css).toMatch(
    /body:has\(main \.census\) #summary:not\(:has\(\.check-failed\)\)\s*\{\s*display: none/,
  );
});
