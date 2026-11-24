import { expect, test } from "vitest";
import { formatUsd } from "../../src/application/browser-api.ts";
import type { CensusRecord } from "../../src/domain/census/census.ts";
import { boardEntries, buildCensus } from "../../src/domain/census/census.ts";
import { censusSummary, censusView, selectCensus } from "../../src/presentation/web/census-view.ts";
import { censusHash, defaultCensus, parseRoute } from "../../src/presentation/web/state.ts";
import { protocol } from "../domain/protocol-fixture.ts";

const first: CensusRecord = {
  slug: "a",
  name: "Equal <&>",
  familyKey: "slug:a",
  category: null,
  tvl_usd: 70,
  status: "traded",
  reason: "Reason <traded>",
};
const second: CensusRecord = { ...first, slug: "b", tvl_usd: 100 };
const third: CensusRecord = { ...first, slug: "c", name: "Excluded", status: "excluded" };
const rows = [third, second, first];

test("sorts Census by TVL, name and status and uses the slug for ties", () => {
  expect(selectCensus(rows, defaultCensus).map(({ slug }) => slug)).toEqual(["b", "a", "c"]);
  expect(
    selectCensus(rows, { ...defaultCensus, sort: "name", dir: "asc" }).map(({ slug }) => slug),
  ).toEqual(["a", "b", "c"]);
  expect(
    selectCensus(rows, { ...defaultCensus, sort: "status", dir: "asc" }).map(({ slug }) => slug),
  ).toEqual(["c", "a", "b"]);
  expect(selectCensus(rows, { ...defaultCensus, status: "traded" })).toEqual([second, first]);
});

test("renders all filtered rows, with reason and TVL escaped or formatted", () => {
  const html = censusView(rows, { ...defaultCensus, status: "traded" }, formatUsd);
  expect(html).toContain('value="traded" selected');
  expect(html).toContain("2 of 3");
  expect(html.indexOf(censusSummary(rows))).toBeGreaterThan(0);
  expect(html.indexOf(censusSummary(rows))).toBeLessThan(html.indexOf("<table"));
  expect(html).toContain(
    "Equal &lt;&amp;&gt;</td><td>Token trades</td><td>Reason &lt;traded&gt;</td><td>$100</td>",
  );
  expect(html).not.toContain("<td>Excluded</td>");
});

test("links the complete census breakdown and the board's unranked counts to their statuses", () => {
  const census: CensusRecord[] = [
    ...rows,
    { ...first, slug: "pre", status: "pre-token" },
    { ...first, slug: "unpriced", status: "token-unpriced" },
  ];
  const pre = '<a href="#/census?status=pre-token">1 pre-token (ranked)</a>';
  const traded = '<a href="#/census?status=traded">2 traded</a>';
  const unpriced = '<a href="#/census?status=token-unpriced">1 token, unpriced</a>';
  const excluded = '<a href="#/census?status=excluded">1 excluded</a>';
  expect(censusSummary(census)).toContain(
    `5 protocols = ${pre} + ${traded} + ${unpriced} + ${excluded}`,
  );
  expect(() => censusSummary([{ ...first, status: "invalid" as CensusRecord["status"] }])).toThrow(
    /census counts/i,
  );
});

test("board counts and links exclude two protocols ranked by a watchlist override", () => {
  const entries = buildCensus([
    protocol({ slug: "pre" }),
    protocol({ slug: "traded", mcap_usd: 10, name: "Unranked traded" }),
    protocol({ slug: "forced-traded", mcap_usd: 10, name: "Watchlisted traded" }),
    protocol({ slug: "unpriced", symbol: "FIX" }),
    protocol({ slug: "excluded", category: "Bridge", name: "Unranked bridge" }),
    protocol({ slug: "forced-excluded", category: "Bridge", name: "Watchlisted bridge" }),
  ]);
  const board = new Set(
    boardEntries(entries, ["forced-traded", "forced-excluded"]).map(
      ({ protocol }) => protocol.slug,
    ),
  );
  const census = entries.map(({ protocol, ...entry }) => ({ ...protocol, ...entry }));
  expect([...board]).toEqual(["pre", "forced-traded", "forced-excluded"]);
  const summary = censusSummary(census, board);
  expect(summary.replace(/<[^>]+>/g, "")).toContain(
    "Not ranked: 1 traded · 1 token, unpriced · 1 excluded",
  );
  for (const [status, slug] of [
    ["traded", "traded"],
    ["excluded", "excluded"],
  ]) {
    const href = summary.match(new RegExp(`href="([^"]*status=${status}[^"]*)"`))?.[1];
    const hash = href?.replaceAll("&amp;", "&") ?? "";
    const route = parseRoute(hash);
    if (route.page !== "census") throw new Error(`Bad census link ${hash}`);
    expect(censusHash(route.state)).toBe(hash);
    expect(selectCensus(census, route.state, board).map((row) => row.slug)).toEqual([slug]);
    const html = censusView(census, route.state, formatUsd, board);
    expect(html.replace(/<[^>]+>/g, "")).toContain(
      "6 protocols = 1 pre-token (ranked) + 2 traded + 1 token, unpriced + 2 excluded",
    );
    expect(html).not.toContain("Watchlisted");
  }
});

test("sorts by displayed status and reason, with ascending slug ties in both directions", () => {
  const records: CensusRecord[] = [
    { ...second, status: "pre-token", reason: "alpha" },
    { ...third, status: "token-unpriced", reason: "Zulu" },
    { ...first, status: "pre-token", reason: "Alpha" },
  ];
  const slugs = (sort: "status" | "reason", dir: "asc" | "desc") =>
    selectCensus(records, { ...defaultCensus, sort, dir }).map(({ slug }) => slug);
  expect(slugs("status", "asc")).toEqual(["c", "a", "b"]);
  expect(slugs("status", "desc")).toEqual(["a", "b", "c"]);
  expect(slugs("reason", "asc")).toEqual(["a", "b", "c"]);
  expect(slugs("reason", "desc")).toEqual(["c", "a", "b"]);
  expect(censusView(records, { ...defaultCensus, sort: "reason" }, formatUsd)).toContain(
    `aria-sort="descending"><button type="button" data-sort="reason">Reason</button>`,
  );
});
