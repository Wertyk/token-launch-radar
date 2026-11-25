import { isDeepStrictEqual } from "node:util";
import { PLAIN_NAME } from "../../vendor/makefun-board.ts";
import { imageDimensions, screenshotLimit } from "./image.ts";

export const dashboardLimits = { files: 400, bytes: 4 * 1024 * 1024 };
export const boardLimit = 8 * 1024 * 1024;
export const dossierLimit = 1.5 * 1024 * 1024;
export const textLimit = 65_536;

export interface AssetEntry {
  path: string;
  kind: "file" | "directory" | "other";
  size: number;
  bytes?: Buffer;
}

interface SnapshotSlugs {
  protocols: Set<string>;
  watchlist: string[];
}

const utf8 = new TextDecoder("utf-8", { fatal: true });
const webTextFile = /\.(?:html?|css|[cm]?js|json|svg|md|txt)$/i;
const urls = /https?:\/\//i;

export function json(bytes: Buffer): unknown {
  return JSON.parse(utf8.decode(bytes));
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function containsUrl(path: string, bytes: Buffer): boolean {
  if (!urls.test(bytes.toString("utf8"))) return false;
  if (webTextFile.test(path)) return true;
  // Other file types can contain plain text too. Leave opaque binary assets alone.
  if (bytes.includes(0)) return false;
  try {
    utf8.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function checkDashboard(entries: readonly AssetEntry[]): string {
  const paths = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    const { path, kind, size, bytes } = entry;
    const name = path.slice(path.lastIndexOf("/") + 1);
    const label = `dashboard/${path}`;
    if (kind === "directory") {
      if (name.startsWith(".")) throw new Error(`${label} is a dot-directory`);
      continue;
    }
    if (kind !== "file") throw new Error(`${label} is not a regular file`);
    if (!PLAIN_NAME.test(name)) throw new Error(`${label} has an invalid name`);
    paths.add(path);
    total += size;
    if (paths.size > dashboardLimits.files) {
      throw new Error(`${label} puts dashboard/ over ${dashboardLimits.files} files`);
    }
    if (total > dashboardLimits.bytes) {
      throw new Error(`${label} puts dashboard/ over ${dashboardLimits.bytes} bytes`);
    }
    if (!bytes) throw new Error(`${label} cannot be read`);
    if (containsUrl(path, bytes)) throw new Error(`${label} contains an HTTP(S) URL`);
  }
  if (!paths.has("index.html")) throw new Error("dashboard/index.html is missing");
  const files = [...paths];
  if (!files.some((path) => path.endsWith(".css")) || !files.some((path) => path.endsWith(".js"))) {
    throw new Error("dashboard/ needs at least one .css and one .js file");
  }
  return `${paths.size} files, ${total} bytes`;
}

export function readBoard(bytes: Buffer): Record<string, unknown>[] {
  const value = json(bytes);
  const rows = Array.isArray(value) ? value : record(value).rows;
  if (!Array.isArray(rows)) throw new Error("board.json needs a rows array");
  return rows.map(record);
}

const browserFields = new Set([
  "interval_p10_usd",
  "interval_p90_usd",
  "influence",
  "twins",
  "launch_p12",
]);

export function checkBoardMatchesData(
  rows: readonly Record<string, unknown>[],
  data: Buffer,
): string {
  const prefix = "window.RADAR_DATA = ";
  const script = utf8.decode(data).trimEnd();
  if (!script.startsWith(prefix) || !script.endsWith(";"))
    throw new Error("data.js needs a RADAR_DATA JSON assignment");
  const { board } = record(JSON.parse(script.slice(prefix.length, -1)));
  const embedded = record(board).rows;
  if (!Array.isArray(embedded) || embedded.length !== rows.length)
    throw new Error("board.json and data.js row counts differ");
  for (const [index, row] of rows.entries()) {
    // Browser-only diagnostics extend the published board rows.
    const saved = record(embedded[index]);
    const keys = new Set([
      ...Object.keys(row),
      ...Object.keys(saved).filter((key) => !browserFields.has(key)),
    ]);
    for (const key of keys) {
      if (
        !Object.hasOwn(row, key) ||
        !Object.hasOwn(saved, key) ||
        !isDeepStrictEqual(row[key], saved[key])
      )
        throw new Error(`${row.slug ?? index + 1}.${key} differs between board.json and data.js`);
    }
  }
  return `${rows.length} board rows match data.js field by field`;
}

export function readSnapshotSlugs(bytes: Buffer): SnapshotSlugs {
  const { protocols, watchlist } = record(json(bytes));
  if (!Array.isArray(protocols) || !Array.isArray(watchlist)) {
    throw new Error("snapshot needs protocols and watchlist arrays");
  }
  const slugs = protocols.map((protocol: unknown) => record(protocol).slug);
  if (
    !slugs.every((slug) => typeof slug === "string") ||
    !watchlist.every((slug) => typeof slug === "string")
  ) {
    throw new Error("snapshot protocols and watchlist need string slugs");
  }
  return { protocols: new Set(slugs), watchlist };
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function sample(values: readonly string[]): string {
  return values.slice(0, 5).join(", ") + (values.length > 5 ? ", …" : "");
}

function checkDistinctValues(rows: readonly Record<string, unknown>[]): void {
  if (
    rows.length > 1 &&
    rows.every((row) => row.implied_value_usd === rows[0]?.implied_value_usd)
  ) {
    throw new Error("all implied values are equal");
  }
}

export function checkBoardFile(
  rows: readonly Record<string, unknown>[],
  snapshot: SnapshotSlugs,
): string {
  if (rows.length < 100 || rows.length > 4000) {
    throw new Error(`board.json has ${rows.length} rows, expected 100–4000`);
  }
  const slugs = new Set<string>();
  const invented: string[] = [];
  for (const [index, row] of rows.entries()) {
    const { slug, name, rank, implied_value_usd: value, farm_steps: steps } = row;
    if (typeof slug !== "string" || slug.length === 0 || slug.length > 128 || /\s/.test(slug)) {
      throw new Error(`row ${index + 1} has an invalid slug`);
    }
    if (slugs.has(slug)) throw new Error(`duplicate slug ${slug}`);
    slugs.add(slug);
    if (!snapshot.protocols.has(slug)) invented.push(slug);
    if (typeof name !== "string" || name.trim() === "")
      throw new Error(`${slug} has an empty or invalid name`);
    if (!positiveInteger(rank)) throw new Error(`${slug} has an invalid rank`);
    if (!positiveInteger(value) || value > 100_000_000_000_000) {
      throw new Error(`${slug} has an invalid implied_value_usd`);
    }
    if (!Array.isArray(steps)) throw new Error(`${slug} needs a farm_steps array`);
  }
  if (invented.length) throw new Error(`slugs absent from the snapshot: ${sample(invented)}`);
  checkDistinctValues(rows);
  return `${rows.length} rows with valid fields and unique snapshot slugs`;
}

export function checkSortedByValue(rows: readonly Record<string, unknown>[]): string {
  const values = new Map<number, number>();
  for (const { slug, rank, implied_value_usd: value } of rows) {
    if (!positiveInteger(rank) || rank > rows.length || values.has(rank)) {
      throw new Error(`expected ranks 1–${rows.length} once each, invalid rank for ${slug}`);
    }
    if (typeof value !== "number") throw new Error(`rank ${rank} has no numeric implied value`);
    values.set(rank, value);
  }
  checkDistinctValues(rows);
  let previous = Infinity;
  for (let rank = 1; rank <= rows.length; rank++) {
    const value = values.get(rank);
    if (value === undefined || value > previous) {
      throw new Error(`implied value rises at rank ${rank}`);
    }
    previous = value;
  }
  return `ranks 1–${rows.length} in non-increasing value order`;
}

export function checkCoverage(
  rows: readonly Record<string, unknown>[],
  snapshot: SnapshotSlugs,
): string {
  const slugs = new Set(rows.map(({ slug }) => slug));
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length) throw new Error(`missing watchlist slugs: ${sample(missing)}`);
  return `all ${snapshot.watchlist.length} watchlist entries covered`;
}

export function checkFarmSteps(rows: readonly Record<string, unknown>[]): string {
  for (const { slug, farm_steps: steps } of rows) {
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) {
      throw new Error(`${slug} needs 3–12 farm steps`);
    }
    for (const [index, step] of steps.entries()) {
      const length = typeof step === "string" ? step.trim().length : 0;
      if (length < 20 || length > 600)
        throw new Error(`${slug} step ${index + 1} needs 20–600 trimmed characters`);
    }
  }
  return `${rows.length} rows with valid farm steps`;
}

export function checkScreenshots(entries: readonly AssetEntry[]): string {
  if (entries.length < 3 || entries.length > 4) {
    throw new Error(`screenshots/ has ${entries.length} entries, expected 3–4 images`);
  }
  for (const { path, kind, size, bytes } of entries) {
    const label = `screenshots/${path}`;
    if (kind !== "file") throw new Error(`${label} is not a regular file`);
    if (!PLAIN_NAME.test(path)) throw new Error(`${label} has an invalid name`);
    if (size > screenshotLimit)
      throw new Error(`${label} has ${size} bytes, limit ${screenshotLimit}`);
    const dimensions = bytes && imageDimensions(bytes);
    if (!dimensions) throw new Error(`${label} is not a whole PNG or JPEG with dimensions`);
    const { width, height } = dimensions;
    if (Math.min(width, height) < 800 || Math.max(width, height) > 1440) {
      throw new Error(
        `${label} is ${width}×${height}, expected short side ≥ 800 and long side ≤ 1440`,
      );
    }
  }
  return `${entries.length} whole PNG/JPEG images within size and dimension limits`;
}

export function checkDossier(actual: Buffer, expected: Uint8Array): string {
  if (actual.length > dossierLimit) throw new Error(`dossier.json exceeds ${dossierLimit} bytes`);
  if (!actual.equals(expected)) throw new Error("dossier.json bytes differ from buildDossier");
  return `${actual.length} bytes, identical to buildDossier`;
}
