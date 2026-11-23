import { expect, test } from "vitest";
import { formatUsd } from "../../src/application/browser-api.ts";
import type { CensusRecord } from "../../src/domain/census/census.ts";
import { censusView, selectCensus } from "../../src/presentation/web/census-view.ts";
import { defaultCensus } from "../../src/presentation/web/state.ts";

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
  expect(html).toContain(
    "Equal &lt;&amp;&gt;</td><td>Token trades</td><td>Reason &lt;traded&gt;</td><td>$100</td>",
  );
  expect(html).not.toContain("<td>Excluded</td>");
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
