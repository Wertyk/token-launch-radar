import { compareText } from "../shared/order.ts";
import type { Protocol, Snapshot } from "../snapshot.ts";
import type { ProtocolFamily } from "./families.ts";
import { familyKey, groupFamilies } from "./families.ts";

const BRIDGE_PRODUCT = "wrapped and bridged products are";
const STAKED_PRODUCT = "staked products are";
const HOUSE_RULE = " (house rule).";
const EXCLUDED_CATEGORIES = new Map([
  ["Bridge", BRIDGE_PRODUCT],
  ["Canonical Bridge", BRIDGE_PRODUCT],
  ["Liquid Staking", STAKED_PRODUCT],
  ["Liquid Restaking", STAKED_PRODUCT],
  ["Restaked BTC", STAKED_PRODUCT],
  ["CEX", "exchange custody is"],
]);
const VERSION_SUFFIX = /\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i;
const PRODUCT_WORD = /(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu;
const EXCHANGE_NAME =
  /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu;

export type TokenStatus = "traded" | "token-unpriced" | "pre-token" | "excluded";

interface Classification {
  status: TokenStatus;
  reason: string;
}

interface CensusEntry extends Classification {
  protocol: Protocol;
  familyKey: string;
}

export interface CensusRecord
  extends Classification,
    Pick<Protocol, "slug" | "name" | "category" | "tvl_usd"> {
  familyKey: string;
}

export interface HouseRuleCheck {
  truePositives: string[];
  falsePositives: { slug: string; reason: string }[];
  falseNegatives: string[];
  recall: number;
  precision: number;
}

type BoardReason = "pre-token" | "watchlist";

export interface BoardEntry extends CensusEntry {
  boardReasons: BoardReason[];
}

function tokenFields({ gecko_id, symbol }: Protocol): string | null {
  if (gecko_id !== null) return symbol === null ? "gecko_id" : "gecko_id and symbol";
  return symbol === null ? null : "symbol";
}

function exclusionReason(protocol: Protocol): string | null {
  const { category } = protocol;
  const product = category === null ? undefined : EXCLUDED_CATEGORIES.get(category);
  if (product) return `${category} category: ${product} not ranked${HOUSE_RULE}`;
  const name = protocol.name.trim();
  if (VERSION_SUFFIX.test(name)) {
    return `Name ends in a version marker${HOUSE_RULE}`;
  }
  const productWord = name.match(PRODUCT_WORD)?.[0];
  if (productWord !== undefined) {
    return `Name contains “${productWord}”${HOUSE_RULE}`;
  }
  const exchange = name.match(EXCHANGE_NAME)?.[0];
  return exchange === undefined
    ? null
    : `Name starts with the exchange name “${exchange}”${HOUSE_RULE}`;
}

export function classify(protocol: Protocol, marketCap = protocol.mcap_usd): Classification {
  if (marketCap !== null && marketCap > 0) {
    return { status: "traded", reason: "The family records a positive market cap." };
  }
  const fields = tokenFields(protocol);
  if (fields !== null) {
    return {
      status: "token-unpriced",
      reason: `The protocol records a token via ${fields} without a positive market cap.`,
    };
  }
  const reason = exclusionReason(protocol);
  if (reason !== null) return { status: "excluded", reason };
  return { status: "pre-token", reason: "The protocol records no token." };
}

export function buildCensus(
  protocols: readonly Protocol[],
  families: readonly ProtocolFamily[] = groupFamilies(protocols),
): CensusEntry[] {
  const marketCaps = new Map(families.map(({ key, mcap_usd }) => [key, mcap_usd]));
  return protocols.map((protocol) => {
    const key = familyKey(protocol);
    return { protocol, familyKey: key, ...classify(protocol, marketCaps.get(key) ?? null) };
  });
}

export function houseRuleMembership({
  protocols,
  floor_usd,
  watchlist,
}: Pick<Snapshot, "protocols" | "floor_usd" | "watchlist">) {
  const watchlisted = new Set(watchlist);
  const matches = new Set(
    protocols
      .filter(
        (protocol) =>
          protocol.tvl_usd >= floor_usd &&
          tokenFields(protocol) === null &&
          exclusionReason(protocol) === null,
      )
      .map(({ slug }) => slug)
      .sort(compareText),
  );
  const truePositives: string[] = [];
  const falsePositives: string[] = [];
  for (const slug of matches) {
    (watchlisted.has(slug) ? truePositives : falsePositives).push(slug);
  }
  const falseNegatives = [...watchlisted].filter((slug) => !matches.has(slug)).sort(compareText);
  return { truePositives, falsePositives, falseNegatives };
}

export function checkHouseRule(
  snapshot: Pick<Snapshot, "protocols" | "floor_usd" | "watchlist">,
): HouseRuleCheck {
  const { truePositives, falsePositives, falseNegatives } = houseRuleMembership(snapshot);
  const hits = truePositives.length;
  const watchlistSize = hits + falseNegatives.length;
  const matchCount = hits + falsePositives.length;
  return {
    truePositives,
    falsePositives: falsePositives.map((slug) => ({
      slug,
      reason:
        "DefiLlama names a parent protocol for it (parentProtocol), a field the snapshot does not carry",
    })),
    falseNegatives,
    recall: watchlistSize === 0 ? 0 : hits / watchlistSize,
    precision: matchCount === 0 ? 0 : hits / matchCount,
  };
}

export function boardEntries(
  census: readonly CensusEntry[],
  watchlist: readonly string[],
): BoardEntry[] {
  const watchlisted = new Set(watchlist);
  const entries: BoardEntry[] = [];
  for (const entry of census) {
    const boardReasons: BoardReason[] = [];
    if (entry.status === "pre-token") boardReasons.push("pre-token");
    if (watchlisted.has(entry.protocol.slug)) boardReasons.push("watchlist");
    if (boardReasons.length > 0) entries.push({ ...entry, boardReasons });
  }
  return entries;
}
