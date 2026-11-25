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
  onchange?: () => void;

  insertAdjacentHTML() {}
  querySelector() {
    return null;
  }
}

function open(
  data: Record<string, unknown>,
  hash = "#/",
  loadEnhancements = true,
  loadUi = true,
  beforeUi?: string,
) {
  const location = { hash };
  const markup = new Map<string, { innerHTML: string; textContent?: string; href?: string }>();
  const listeners = new Map<string, (event: { target: Select }) => void>();
  const windowListeners = new Map<string, () => void>();
  const deposit = new Select();
  const main = {
    innerHTML: html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "",
    dataset: {},
    focus() {},
    addEventListener(type: string, listener: (event: { target: Select }) => void) {
      listeners.set(type, listener);
    },
    querySelector(selector: string) {
      if (selector === '[name="deposit"]') return deposit;
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
    if (!loadUi && file === "3-ui.js") continue;
    if (file === "3-ui.js" && beforeUi) runInContext(beforeUi, context);
    runInContext(source, context);
    if (!loadEnhancements && file === "5-extras.js")
      runInContext(
        `for (const name of ["boardFarmSteps", "mountPlanner", "boardControls", "bindControls", "boardHash"])
        delete window.Radar[name];`,
        context,
      );
  }
  return {
    main,
    markup,
    navigate(next: string) {
      location.hash = next;
      windowListeners.get("hashchange")?.();
    },
    changeDeposit(value: string) {
      deposit.value = value;
      deposit.onchange?.();
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

test.each([true, false])(
  "uses the refits with loadExtras=%s even when the published fits change",
  (loadExtras) => {
    const payload = data();
    const row = radar.board[0];
    if (!row) throw new Error("Missing first board row");
    const { coefficients } = radar.model;
    payload.valueCoefficients = { ...coefficients, intercept: coefficients.intercept + 1 };
    payload.odds.coefficients = [0, -1];
    payload.odds.clock = [];

    const page = open(payload, `#/p/${row.protocol.slug}`, loadExtras);
    const checks = page.markup.get("#checks")?.innerHTML;
    const lnValue = logValue(row.features, radar.model);
    expect
      .soft(page.main.innerHTML)
      .toContain(`ln V ≈ ${radar.model.coefficients.intercept.toFixed(4)}`);
    expect
      .soft(page.main.innerHTML)
      .toContain(`≈ ${lnValue.toFixed(3)} → ${formatUsd(Math.round(Math.exp(lnValue)))}`);
    expect.soft(checks?.match(/class="check"/g)).toHaveLength(7);
    expect.soft(checks).toContain('class="check">✓ Recompute = board.json');
    expect.soft(checks).toContain('class="check">✓ 104/128 held-out traded caps inside P10–P90');

    page.navigate("#/method");
    expect
      .soft(page.main.innerHTML)
      .toContain(`<td>Intercept</td><td>${radar.model.coefficients.intercept.toFixed(6)}</td>`);
    expect.soft(page.main.innerHTML).toMatch(/P10–P90<\/td><td>[^<]+ · 104\/128<\/td>/);
    expect(page.main.innerHTML).toContain(
      `<td>logit(S(a))</td><td>${radar.odds.coefficients[1]?.toFixed(6)}</td>`,
    );
  },
  20_000,
);

test("flags a changed TVL trigger in the published exit step", () => {
  const payload = data();
  const row = payload.board.rows[0];
  const exit = row.farm_steps.findIndex((step: string) => step.includes("TVL drops under"));
  expect(exit).toBeGreaterThanOrEqual(0);
  row.farm_steps[exit] = row.farm_steps[exit].replace(
    /TVL drops under \$[\d,.]+/,
    "TVL drops under $1",
  );
  const page = open(payload);
  expect(page.markup.get("#checks")?.innerHTML).toContain(`1 mismatched · ${row.slug}`);
});

test("flags tampering with the published eligibility step", () => {
  const payload = data();
  const row = payload.board.rows[0];
  const step = row.farm_steps.findIndex((line: string) => line.includes("points or rewards page"));
  expect(step).toBeGreaterThanOrEqual(0);
  row.farm_steps[step] = "Assume the wallet is eligible without checking the terms.";
  expect(open(payload).markup.get("#checks")?.innerHTML).toContain(`1 mismatched · ${row.slug}`);
});

test("shows fitted input effects in the KPI, Method and protocol card", () => {
  const payload = data();
  const page = open(payload, "#/method");
  const tile = (opened: typeof page) =>
    opened.markup
      .get("#kpis")
      ?.innerHTML.match(/<dt>Inputs in implied value<\/dt><dd>(.+?)<\/dd>/)?.[1];
  expect(tile(page)).toBe("TVL +6.5% · growth −10.6% · age +57.7%");
  expect(page.markup.get("#kpis")?.innerHTML).toContain(
    "<small>per +10% TVL, +10pp 7-day growth, +1 yr with no token · board medians</small>",
  );
  expect(page.markup.get("#checks")?.innerHTML).toContain(
    'class="check">✓ Finite median input effects',
  );
  expect(page.main.innerHTML).toContain("How each input moves the implied value");
  expect(page.main.innerHTML).toContain("198 rows");
  expect(page.main.innerHTML).toContain("<td>+57.7%</td><td>−34.4% to +393.4%</td>");
  page.navigate(`#/p/${radar.board[0]?.protocol.slug}`);
  expect(page.main.innerHTML).toMatch(
    /<\/p>\s*<p class="caption">\+10% TVL → [^<]+ · \+1 yr → [^<]+/,
  );

  const changed = open(
    payload,
    "#/",
    true,
    true,
    `
    const originalFit = window.Radar.buildRadar;
    window.Radar.buildRadar = (...args) => {
      const radar = originalFit(...args);
      radar.odds.coefficients[radar.odds.terms.indexOf("growth") + 2] *= -1;
      return radar;
    };
  `,
  );
  expect(tile(changed)).toMatch(/growth \+[\d.]+%/);
  expect(tile(changed)).not.toBe(tile(page));

  const nonfinite = open(
    payload,
    "#/",
    true,
    true,
    `
    const originalFit = window.Radar.buildRadar;
    window.Radar.buildRadar = (...args) => {
      const radar = originalFit(...args);
      radar.model.coefficients.lnTvl = NaN;
      return radar;
    };
  `,
  );
  expect(nonfinite.markup.get("#checks")?.innerHTML).toContain(
    'class="check-failed">✗ Finite median input effects',
  );
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
  expect(page.main.innerHTML).toMatch(/P10–P90<\/td><td>[^<]+ · 103\/128<\/td>/);
});

test("ignores impossible counts injected into the payload", () => {
  const payload = data();
  payload.intervalCounts = { missLow: -1, covered: 129, missHigh: 0 };
  const page = open(payload, "#/method");
  expect(page.markup.get("#checks")?.innerHTML).toContain(
    'class="check">✓ 104/128 held-out traded caps',
  );
  expect(page.main.innerHTML).toMatch(/P10–P90<\/td><td>[^<]+ · 104\/128<\/td>/);
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
  expect(page.main.innerHTML).toMatch(/P10–P90<\/td><td>[^<]+ · 103\/127<\/td>/);
});

test("flags invalid evidence even when the valid points account for the fitted population", () => {
  const payload = data();
  payload.looScatter.push({ ...insidePoint(payload), p10: null });
  const page = open(payload, "#/method");
  expect(page.markup.get("#checks")?.innerHTML).toContain(
    'class="check-failed">✗ 104/128 held-out traded caps inside P10–P90 · 1 invalid',
  );
  expect(page.main.innerHTML).toMatch(/P10–P90<\/td><td>[^<]+ · 104\/128<\/td>/);
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
    expect(page.main.innerHTML).toContain("P10–P90</td><td>— · 0/0</td>");
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
    expect(page.main.innerHTML).toMatch(/P10–P90<\/td><td>[^<]+ · 104\/127<\/td>/);
  },
);

test("uses the computed Method selection if publication disappears after startup", () => {
  const payload = data();
  const page = open(payload);
  expect(page.main.innerHTML).toContain("198 ranked");
  const { selection } = payload.model;
  delete payload.model.selection;
  page.navigate("#/method");
  expect(page.main.innerHTML).toContain("Value term selection");
  expect(page.main.dataset).toHaveProperty("ready");
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
    ["#/method", "P10–P90</td><td>81.3% · 104/128</td>"],
    ["#/", "198 ranked"],
  ] as const) {
    page.navigate(hash);
    expect(page.main.innerHTML).toContain(marker);
    const checks = page.markup.get("#checks")?.innerHTML;
    expect(checks?.match(/class="check"/g)).toHaveLength(7);
  }
  if (!loadExtras) {
    const checks = page.markup.get("#checks")?.innerHTML;
    expect(checks).toContain('class="check">✓ Recompute = board.json');
    expect(checks).not.toContain("published fits");
    page.navigate("#/plan");
    expect(page.main.innerHTML).toContain("Farm portfolio");
    expect(page.main.dataset).toHaveProperty("ready");
  }
  page.navigate("#/method");
  expect(page.main.innerHTML).toContain("Verdict test deposits");
});

test("uses board filters and sort order without extras", () => {
  const page = open(data(), "#/?q=lend&sort=rank&dir=desc", false);
  const expected = radar.board.filter(({ protocol }) =>
    protocol.name.toLowerCase().includes("lend"),
  );
  expect(expected.length).toBeGreaterThan(1);
  const slugs = [
    ...(page.markup.get("tbody")?.innerHTML ?? "").matchAll(/href="#\/p\/([^"?]+)/g),
  ].map(([, slug]) => slug);
  expect(slugs).toEqual(expected.reverse().map(({ protocol }) => protocol.slug));
});

test("shows the startup alert when the protected model fit throws", () => {
  const payload = data();
  for (const protocol of payload.protocols) protocol.mcap_usd = null;
  const page = open(payload, "#/", false);
  expect(page.main.innerHTML).toContain('role="alert"');
  expect(page.main.dataset).not.toHaveProperty("ready");
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

test("reproduces both selections and renders recomputed trials if a published trial is tampered", () => {
  const payload = data();
  const clean = open(payload, "#/method", false);
  const label = "Term selection reproduced · value 0/3 kept · odds 3/4 kept";
  expect(clean.markup.get("#checks")?.innerHTML).toContain(`class="check">✓ ${label}`);
  expect(clean.main.innerHTML).toContain("Value term selection");
  expect(clean.main.innerHTML).toContain(
    "<td>category</td><td>1.3018</td><td>1.3580</td><td>Not kept</td>",
  );
  expect(clean.main.innerHTML).toContain("Category trial λ 0.1 × 16");
  expect(clean.main.innerHTML).toContain("Odds term selection");
  payload.model.selection.steps[0].trials[0].scores[0] = 99;
  const tampered = open(payload, "#/method", false);
  expect(tampered.markup.get("#checks")?.innerHTML).toContain(
    'class="check-failed">✗ Term selection',
  );
  expect(tampered.main.innerHTML).toBe(clean.main.innerHTML);
});

test("keeps the KPI strip on every route and uses held-out band data", () => {
  const payload = data();
  const page = open(payload);
  const kpis = page.markup.get("#kpis");
  expect(kpis?.innerHTML.match(/<dt>/g)).toHaveLength(6);
  expect(kpis?.innerHTML).toContain("40/40 watchlist");
  const original = kpis?.innerHTML;
  page.navigate("#/census");
  expect(page.markup.get("#kpis")?.innerHTML).toBe(original);
  payload.model.validation.walkForward.model.medianMultiplier = 6;
  expect(open(payload).markup.get("#kpis")?.innerHTML).toContain("×6.00");
  payload.rangeHonesty.middle.covered -= 1;
  expect(open(payload).markup.get("#checks")?.innerHTML).toContain(
    'class="check-failed">✗ Held-out coverage totals differ',
  );
  const point = insidePoint(payload);
  point.p10 = point.actual + 1;
  point.p90 = point.actual + 2;
  expect(open(payload).markup.get("#kpis")?.innerHTML).not.toBe(original);
});

test("changes the board verdict and net per hour when the deposit changes", () => {
  const candidate = radar.board.find(({ economics: { deposits } }) =>
    deposits.some(({ verdict }) => verdict !== deposits[0]?.verdict),
  );
  if (!candidate) throw new Error("Expected different verdicts across deposits");
  const page = open(data(), `#/?q=${encodeURIComponent(candidate.protocol.name)}`, false);
  const body = page.markup.get("tbody");
  const at10K = candidate.economics.deposits.find(({ depositUsd }) => depositUsd === 10_000);
  const other = candidate.economics.deposits.find(({ verdict }) => verdict !== at10K?.verdict);
  if (!at10K || !other) throw new Error("Expected deposits with different verdicts");
  expect(body?.innerHTML).toContain(
    `<td>${at10K.verdict}</td><td>${formatUsd(at10K.netPerHourUsd)}</td>`,
  );
  page.changeDeposit(String(other.depositUsd));
  expect(body?.innerHTML).toContain(
    `<td>${other.verdict}</td><td>${formatUsd(other.netPerHourUsd)}</td>`,
  );
});

test("exports the same sorted filtered rows shown on the board after edits", () => {
  const page = open(data(), "#/?wl=1&sort=rank&dir=desc");
  const href = (format: string) => page.markup.get(`[download="radar.${format}"]`)?.href ?? "";
  const slugs = () =>
    [...(page.markup.get("tbody")?.innerHTML ?? "").matchAll(/href="#\/p\/([^"?]+)/g)].map(
      ([, slug]) => slug,
    );
  const json = () => JSON.parse(decodeURIComponent(href("json").split(",")[1] ?? ""));
  expect(json().map(({ slug }: { slug: string }) => slug)).toEqual(slugs());
  expect(slugs()).toHaveLength(40);
  expect(decodeURIComponent(href("csv")).split("\r\n")).toHaveLength(41);
  page.navigate("#/?q=----");
  expect(json()).toEqual([]);
  expect(slugs()).toEqual([]);
});
