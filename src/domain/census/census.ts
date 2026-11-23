import type { Protocol } from "../snapshot.ts";

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);
const VERSION_SUFFIX = / (?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i;
const PRODUCT_WORD = /(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu;
const EXCHANGE_NAME =
  /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu;

export type TokenStatus = "traded" | "token-unpriced" | "pre-token" | "excluded";

export interface Classification {
  status: TokenStatus;
  reason: string;
}

export interface CensusEntry extends Classification {
  protocol: Protocol;
}

export type BoardReason = "pre-token" | "watchlist";

export interface BoardEntry extends CensusEntry {
  boardReasons: BoardReason[];
}

export function classify(protocol: Protocol): Classification {
  if (protocol.mcap_usd !== null && protocol.mcap_usd > 0) {
    return { status: "traded", reason: "The snapshot records a positive market cap." };
  }
  if (protocol.gecko_id !== null || protocol.symbol !== null) {
    return {
      status: "token-unpriced",
      reason: "The protocol records a token without a positive market cap.",
    };
  }
  const { category } = protocol;
  if (category !== null && EXCLUDED_CATEGORIES.has(category)) {
    return { status: "excluded", reason: `Category ${category} is excluded by the house rule.` };
  }
  const name = protocol.name.trim();
  if (VERSION_SUFFIX.test(name)) {
    return { status: "excluded", reason: "Name ends in a version marker." };
  }
  const productWord = name.match(PRODUCT_WORD)?.[0];
  if (productWord !== undefined) {
    return { status: "excluded", reason: `Name contains the word “${productWord}”.` };
  }
  if (EXCHANGE_NAME.test(name)) {
    return { status: "excluded", reason: "Name begins with an exchange name." };
  }
  return { status: "pre-token", reason: "The protocol records no token." };
}

export function buildCensus(protocols: readonly Protocol[]): CensusEntry[] {
  return protocols.map((protocol) => ({ protocol, ...classify(protocol) }));
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
