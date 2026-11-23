export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

const DAY_MS = 86_400_000;
const GREGORIAN_CYCLE_DAYS = 146_097;

function utcDay(iso: string, path: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const year = Number(iso.slice(0, 4));
    const month = Number(iso.slice(5, 7)) - 1;
    const day = Number(iso.slice(8, 10));
    // Date.UTC maps years 0–99 to 1900–1999. A 400-year shift preserves leap days.
    const shifted = year < 100;
    const timestamp = Date.UTC(shifted ? year + 400 : year, month, day);
    const date = new Date(timestamp);
    if (date.getUTCMonth() === month && date.getUTCDate() === day) {
      return timestamp / DAY_MS - (shifted ? GREGORIAN_CYCLE_DAYS : 0);
    }
  }
  throw new Error(`${path}: expected a valid YYYY-MM-DD date`);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
  return value;
}

function nonEmpty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path}: expected a non-empty string`);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite number`);
  }
  return value;
}

function dateString(value: unknown, path: string): string {
  const iso = nonEmpty(value, path);
  utcDay(iso, path);
  return iso;
}

function nullable<T>(
  value: unknown,
  path: string,
  parse: (value: unknown, path: string) => T,
): T | null {
  return value === null ? null : parse(value, path);
}

function parseProtocol(value: unknown, index: number): Protocol {
  const path = `protocols[${index}]`;
  const raw = object(value, path);
  const tvlPath = `${path}.tvl_usd`;
  const tvl_usd = finite(raw.tvl_usd, tvlPath);
  if (tvl_usd <= 0) throw new Error(`${tvlPath}: expected a positive number`);

  return {
    slug: nonEmpty(raw.slug, `${path}.slug`),
    name: nonEmpty(raw.name, `${path}.name`),
    category: nullable(raw.category, `${path}.category`, nonEmpty),
    chains: array(raw.chains, `${path}.chains`).map((chain, chainIndex) =>
      nonEmpty(chain, `${path}.chains[${chainIndex}]`),
    ),
    tvl_usd,
    change_7d: nullable(raw.change_7d, `${path}.change_7d`, finite),
    mcap_usd: nullable(raw.mcap_usd, `${path}.mcap_usd`, finite),
    listed_at: nullable(raw.listed_at, `${path}.listed_at`, dateString),
    gecko_id: nullable(raw.gecko_id, `${path}.gecko_id`, nonEmpty),
    symbol: nullable(raw.symbol, `${path}.symbol`, nonEmpty),
  };
}

export function parseSnapshot(value: unknown): Snapshot {
  const raw = object(value, "snapshot");
  const as_of = dateString(raw.as_of, "as_of");
  const source = nonEmpty(raw.source, "source");
  const floor_usd = finite(raw.floor_usd, "floor_usd");
  const slugs = new Set<string>();
  const protocols = array(raw.protocols, "protocols").map((item, index) => {
    const protocol = parseProtocol(item, index);
    if (slugs.has(protocol.slug)) {
      throw new Error(`protocols[${index}].slug: duplicate slug ${JSON.stringify(protocol.slug)}`);
    }
    slugs.add(protocol.slug);
    return protocol;
  });
  const watchlist = array(raw.watchlist, "watchlist").map((item, index) => {
    const path = `watchlist[${index}]`;
    const slug = nonEmpty(item, path);
    if (!slugs.has(slug)) throw new Error(`${path}: unknown protocol slug ${JSON.stringify(slug)}`);
    return slug;
  });
  return { as_of, source, floor_usd, protocols, watchlist };
}
