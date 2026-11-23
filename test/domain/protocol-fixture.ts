import type { Protocol } from "../../src/domain/snapshot.ts";

export function protocol(overrides: Partial<Protocol> = {}): Protocol {
  return {
    slug: "sample",
    name: "Sample Protocol",
    category: null,
    chains: ["Ethereum"],
    tvl_usd: 16_000_000,
    change_7d: 0,
    mcap_usd: null,
    listed_at: "2024-02-28",
    gecko_id: null,
    symbol: null,
    ...overrides,
  };
}
