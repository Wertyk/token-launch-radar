import { expect, test } from "vitest";
import { boardEntries, buildCensus, classify } from "../../../src/domain/census/census.ts";
import { protocol } from "../protocol-fixture.ts";

test.each([
  [{ mcap_usd: 10 }, "traded", /positive market cap/],
  [{ gecko_id: "fixture-token" }, "token-unpriced", /records a token/],
  [{ symbol: "FIX", mcap_usd: 0 }, "token-unpriced", /records a token/],
  [{ name: "Wrapped Bar", category: "CEX", mcap_usd: 10 }, "traded", /positive market cap/],
  [{ name: "Foo V2", category: "Bridge", symbol: "FIX" }, "token-unpriced", /records a token/],
  [{ mcap_usd: 0 }, "pre-token", /records no token/],
  [{}, "pre-token", /records no token/],
] as const)("classifies %j as %s", (fields, status, reason) => {
  expect(classify(protocol(fields))).toEqual({ status, reason: expect.stringMatching(reason) });
});

test.each([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
])("excludes a protocol recording no token in category %s", (category) => {
  expect(classify(protocol({ category }))).toEqual({
    status: "excluded",
    reason: expect.stringContaining(`Category ${category}`),
  });
});

test.each([
  ["Foo V2", /version marker/i],
  ["Pool\u00a0V2", /version marker/i],
  ["Pool\tV2", /version marker/i],
  ["Foo v3", /version marker/i],
  ["Foo 2.0", /version marker/i],
  ["Foo 3.1", /version marker/i],
  ["Wrapped Bar", /wrapped/i],
  ["Staked Baz", /staked/i],
  ["Bar (STAKING)", /staking/i],
  ["Binance Qux", /exchange name/i],
  ["kRaKeN-Test", /exchange name/i],
] as const)("excludes %s and explains the matching rule", (name, reason) => {
  expect(classify(protocol({ name }))).toEqual({
    status: "excluded",
    reason: expect.stringMatching(reason),
  });
});

test.each([
  ["Restaking Hub", "Staking Pool"],
  ["Stakewise", "Dexs"],
  ["Unwrapped Bars", null],
  ["Krakenfi", null],
  ["Foo V2 Pool", null],
  ["Hub for Gemini", "Cross Chain Bridge"],
] as const)("keeps %s eligible with category %s", (name, category) => {
  expect(classify(protocol({ name, category })).status).toBe("pre-token");
});

test("records all admission reasons and forces in watchlisted traded and excluded protocols", () => {
  const protocols = [
    protocol({ slug: "pre" }),
    protocol({ slug: "both" }),
    protocol({ slug: "forced", mcap_usd: 10 }),
    protocol({ slug: "unpriced", gecko_id: "fixture-token" }),
    protocol({ slug: "excluded", name: "Wrapped Bar" }),
    protocol({ slug: "forced-exclusion", category: "Bridge" }),
  ];
  const census = buildCensus(protocols);
  expect(census.map(({ status }) => status)).toEqual([
    "pre-token",
    "pre-token",
    "traded",
    "token-unpriced",
    "excluded",
    "excluded",
  ]);
  expect(
    boardEntries(census, ["both", "forced", "forced-exclusion"]).map(
      ({ protocol: { slug }, boardReasons }) => [slug, boardReasons],
    ),
  ).toEqual([
    ["pre", ["pre-token"]],
    ["both", ["pre-token", "watchlist"]],
    ["forced", ["watchlist"]],
    ["forced-exclusion", ["watchlist"]],
  ]);
});
