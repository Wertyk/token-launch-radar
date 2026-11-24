import { expect, test } from "vitest";
import {
  boardEntries,
  buildCensus,
  checkHouseRule,
  classify,
  houseRuleMembership,
} from "../../../src/domain/census/census.ts";
import { protocol } from "../protocol-fixture.ts";

test("reports sorted membership, respecting the TVL floor, token fields and exclusions", () => {
  expect(
    houseRuleMembership({
      floor_usd: 100,
      watchlist: ["z-token", "z-hit", "q-absent", "b-bridge", "a-hit", "a-low"],
      protocols: [
        protocol({ slug: "z-hit", tvl_usd: 101 }),
        protocol({ slug: "z-extra", tvl_usd: 101 }),
        protocol({ slug: "z-token", tvl_usd: 101, symbol: "FIX" }),
        protocol({ slug: "b-bridge", tvl_usd: 101, category: "Bridge" }),
        protocol({ slug: "a-hit", tvl_usd: 100 }),
        protocol({ slug: "a-extra", tvl_usd: 101 }),
        protocol({ slug: "a-low", tvl_usd: 99 }),
      ],
    }),
  ).toEqual({
    truePositives: ["a-hit", "z-hit"],
    falsePositives: ["a-extra", "z-extra"],
    falseNegatives: ["a-low", "b-bridge", "q-absent", "z-token"],
  });
});

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
  ["Bridge", "wrapped and bridged products are"],
  ["Canonical Bridge", "wrapped and bridged products are"],
  ["Liquid Staking", "staked products are"],
  ["Liquid Restaking", "staked products are"],
  ["Restaked BTC", "staked products are"],
  ["CEX", "exchange custody is"],
])("names the category and house rule for %s", (category, rule) => {
  const result = classify(protocol({ category }));
  expect(result).toEqual({
    status: "excluded",
    reason: `${category} category: ${rule} not ranked (house rule).`,
  });
  expect(result.reason.length).toBeLessThan(90);
});

test.each([
  ["Foo V2", "Name ends in a version marker"],
  ["Pool\u00a0V2", "Name ends in a version marker"],
  ["Pool\tV2", "Name ends in a version marker"],
  ["Foo v3", "Name ends in a version marker"],
  ["Foo 2.0", "Name ends in a version marker"],
  ["Foo 3.1", "Name ends in a version marker"],
  ["Wrapped Bar", "Name contains “Wrapped”"],
  ["Staked Baz", "Name contains “Staked”"],
  ["Bar (STAKING)", "Name contains “STAKING”"],
  ["Binance Qux", "Name starts with the exchange name “Binance”"],
  ["kRaKeN-Test", "Name starts with the exchange name “kRaKeN”"],
] as const)("excludes %s and explains the matching rule", (name, reason) => {
  const result = classify(protocol({ name }));
  expect(result).toEqual({
    status: "excluded",
    reason: `${reason} (house rule).`,
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
