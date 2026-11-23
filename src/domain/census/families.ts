import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";

export interface ProtocolFamily {
  key: string;
  representative: Protocol;
  members: Protocol[];
  tvl_usd: number;
  mcap_usd: number | null;
}

export function familyKey({ slug, gecko_id }: Protocol): string {
  return gecko_id === null ? `slug:${slug}` : `gecko:${gecko_id}`;
}

export function groupFamilies(protocols: readonly Protocol[]): ProtocolFamily[] {
  const families = new Map<string, ProtocolFamily>();
  for (const protocol of [...protocols].sort((a, b) => compareText(a.slug, b.slug))) {
    const { tvl_usd, mcap_usd } = protocol;
    const key = familyKey(protocol);
    const marketCap = mcap_usd !== null && mcap_usd > 0 ? mcap_usd : null;
    const family = families.get(key);
    if (family) {
      family.members.push(protocol);
      family.tvl_usd += tvl_usd;
      // Multiple positive observations describe the same token. Keep the first by slug.
      family.mcap_usd ??= marketCap;
    } else {
      families.set(key, {
        key,
        representative: protocol,
        members: [protocol],
        tvl_usd,
        mcap_usd: marketCap,
      });
    }
  }
  return [...families.values()];
}
