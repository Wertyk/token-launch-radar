import { expect, test } from "vitest";
import {
  boardEntries,
  buildCensus,
  checkHouseRule,
  classify,
} from "../../../src/domain/census/census.ts";
import { protocol } from "../protocol-fixture.ts";

test.each([
  [{ mcap_usd: 10 }, "traded", /positive market cap/],
  [{ gecko_id: "fixture-token" }, "token-unpriced", /records a token via gecko_id without/],
  [{ symbol: "FIX", mcap_usd: 0 }, "token-unpriced", /records a token via symbol without/],
  [
    { gecko_id: "fixture-token", symbol: "FIX", mcap_usd: -10 },
    "token-unpriced",
    /records a token via gecko_id and symbol without/,
  ],
  [{ name: "Wrapped Bar", category: "CEX", mcap_usd: 10 }, "traded", /positive market cap/],
  [{ name: "Foo V2", category: "Bridge", symbol: "FIX" }, "token-unpriced", /records a token/],
  [{ mcap_usd: 0 }, "pre-token", /records no token/],
  [{}, "pre-token", /records no token/],
] as const)("classifies %j as %s", (fields, status, reason) => {
  expect(classify(protocol(fields))).toEqual({ status, reason: expect.stringMatching(reason) });
});

test.each([
  ["Bridge", "A bridged or wrapped product of a traded token"],
  ["Canonical Bridge", "A bridged or wrapped product of a traded token"],
  ["Liquid Staking", "A staked product of a traded token"],
  ["Liquid Restaking", "A staked product of a traded token"],
  ["Restaked BTC", "A staked product of a traded token"],
  ["CEX", "An exchange custody product"],
])("explains the excluded product in category %s", (category, product) => {
  const result = classify(protocol({ category }));
  expect(result).toEqual({
    status: "excluded",
    reason: `${product} (category ${category}).`,
  });
  expect(result.reason.length).toBeLessThan(90);
});

test.each([
  ["Foo V2", /version marker.*existing protocol/i],
  ["Pool\u00a0V2", /version marker/i],
  ["Pool\tV2", /version marker/i],
  ["Foo v3", /version marker/i],
  ["Foo 2.0", /version marker/i],
  ["Foo 3.1", /version marker/i],
  ["Wrapped Bar", /“Wrapped”.*wrapped product/i],
  ["Staked Baz", /“Staked”.*staked product/i],
  ["Bar (STAKING)", /“STAKING”.*staked product/],
  ["Binance Qux", /exchange name.*exchange product/i],
  ["kRaKeN-Test", /exchange name/i],
] as const)("excludes %s and explains the matching rule", (name, reason) => {
  const result = classify(protocol({ name }));
  expect(result).toEqual({
    status: "excluded",
    reason: expect.stringMatching(reason),
  });
  expect(result.reason.length).toBeLessThan(90);
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

test("classifies every member of a priced family as traded", () => {
  const census = buildCensus([
    protocol({ slug: "a-unpriced", gecko_id: "shared", mcap_usd: null }),
    protocol({ slug: "b-priced", gecko_id: "shared", mcap_usd: 10 }),
  ]);
  expect(census.map(({ status, reason, familyKey }) => ({ status, reason, familyKey }))).toEqual([
    {
      status: "traded",
      reason: "The family records a positive market cap.",
      familyKey: "gecko:shared",
    },
    {
      status: "traded",
      reason: "The family records a positive market cap.",
      familyKey: "gecko:shared",
    },
  ]);
});

test("reports sorted house-rule matches and differences with precision and recall", () => {
  const protocols = [
    protocol({ slug: "z-match", tvl_usd: 150 }),
    protocol({ slug: "a-match", tvl_usd: 100 }),
    protocol({ slug: "off-list", tvl_usd: 100 }),
    protocol({ slug: "below", tvl_usd: 99 }),
    protocol({ slug: "token", tvl_usd: 150, symbol: "FIX" }),
    protocol({ slug: "bridge", tvl_usd: 150, category: "Canonical Bridge" }),
    protocol({ slug: "version", tvl_usd: 150, name: "Sample V2" }),
  ];
  expect(
    checkHouseRule({
      protocols,
      floor_usd: 100,
      watchlist: ["z-match", "token", "a-match", "bridge"],
    }),
  ).toEqual({
    truePositives: ["a-match", "z-match"],
    falsePositives: [
      {
        slug: "off-list",
        reason:
          "DefiLlama names a parent protocol for it (parentProtocol), a field the snapshot does not carry",
      },
    ],
    falseNegatives: ["bridge", "token"],
    recall: 1 / 2,
    precision: 2 / 3,
  });
});

test("reports zero precision and recall when both sets are empty", () => {
  expect(checkHouseRule({ protocols: [], floor_usd: 100, watchlist: [] })).toEqual({
    truePositives: [],
    falsePositives: [],
    falseNegatives: [],
    recall: 0,
    precision: 0,
  });
});
