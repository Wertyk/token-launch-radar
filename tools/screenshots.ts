import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LaunchOptions, Page } from "playwright";
import { chromium } from "playwright";
import type { BoardRows } from "../src/application/board-rows.ts";
import type { CensusRecord } from "../src/domain/census/census.ts";
import { formatUsd } from "../src/domain/shared/money.ts";
import { compareText } from "../src/domain/shared/order.ts";
import {
  boardHash,
  censusHash,
  defaultCensus,
  defaultState,
  protocolHash,
  statusLabels,
} from "../src/presentation/web/state.ts";
import { imageDimensions, shotNames } from "./gate/image.ts";

interface Shot {
  name: string;
  bytes: Buffer;
  width: number;
  height: number;
}

const repo = resolve(import.meta.dirname, "..");
export const screenshotViewport = { width: 1440, height: 1200 };
const viewport = screenshotViewport;
// Four encoded images leave room for the 65,536-byte dossier transcript and metadata.
const screenshotTarget = 278_000;

function renderRadar(out: string): BoardRows {
  const input = process.env.RADAR_SNAPSHOT
    ? resolve(process.env.RADAR_SNAPSHOT)
    : resolve(repo, "../token-radar-kit/token-radar-01-kit/input/snapshot.json");
  const result = spawnSync(
    process.execPath,
    [join(repo, "main.ts"), "--input", input, "--output", out],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  // The dashboard has already been published when the dossier rejects old or absent screenshots.
  if (result.status !== 0 && !result.stderr.startsWith("token radar: buildDossier:")) {
    throw new Error(
      result.stderr.trim() || `main.ts exited with ${result.signal ?? result.status}`,
    );
  }
  return JSON.parse(readFileSync(join(out, "board.json"), "utf8"));
}

type ShotRow = Pick<BoardRows["rows"][number], "slug" | "rank" | "farm_economics">;

export function shotStates({ rows }: { rows: readonly ShotRow[] }) {
  let detail: ShotRow | undefined;
  for (const row of rows) {
    const eligible = row.farm_economics.deposits.some(
      ({ depositUsd, verdict }) => depositUsd === 10_000 && verdict !== "SKIP",
    );
    if (eligible && (!detail || row.rank < detail.rank)) detail = row;
  }
  if (!detail) throw new Error("board.json has no non-SKIP verdict at $10K");
  return [
    { name: shotNames.board, hash: boardHash(defaultState) },
    { name: shotNames.detail, hash: protocolHash(detail.slug, defaultState) },
    { name: shotNames.filtered, hash: censusHash({ ...defaultCensus, status: "excluded" }) },
    { name: shotNames.method, hash: "#/method" },
  ];
}

export function assertExcludedRows(census: readonly CensusRecord[], visible: readonly string[][]) {
  if (!visible.length) throw new Error(`${shotNames.filtered} has no visible rows`);
  const expected = census
    .filter(({ status }) => status === "excluded")
    .sort((a, b) => b.tvl_usd - a.tvl_usd || compareText(a.slug, b.slug));
  for (const [index, cells] of visible.entries()) {
    const row = expected[index];
    const expectedCells = row && [
      row.name,
      statusLabels.excluded,
      row.reason,
      formatUsd(row.tvl_usd),
    ];
    if (
      !expectedCells ||
      cells.length !== expectedCells.length ||
      expectedCells.some((cell, column) => cell !== cells[column])
    ) {
      throw new Error(
        `${shotNames.filtered} must show excluded rows in descending TVL order (row ${index + 1})`,
      );
    }
  }
}

async function capture(page: Page, name: string): Promise<Shot> {
  let bytes = await page.screenshot({ type: "png", animations: "disabled" });
  let extension = "png";
  if (bytes.length > screenshotTarget) {
    extension = "jpg";
    for (let quality = 90; quality >= 0; quality -= 5) {
      bytes = await page.screenshot({ type: "jpeg", quality, animations: "disabled" });
      if (bytes.length <= screenshotTarget) break;
    }
  }
  if (bytes.length > screenshotTarget)
    throw new Error(`${name} exceeds ${screenshotTarget} bytes at every JPEG quality`);
  const dimensions = imageDimensions(bytes);
  if (dimensions?.width !== viewport.width || dimensions.height !== viewport.height) {
    throw new Error(`${name} is not a whole ${viewport.width}×${viewport.height} image`);
  }
  return { name: `${name}.${extension}`, bytes, ...dimensions };
}

async function takeShots(
  out: string,
  states: ReturnType<typeof shotStates>,
  options: LaunchOptions,
): Promise<Shot[]> {
  const browser = await chromium.launch({ ...options, headless: true });
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    const errors: string[] = [];
    context.on("request", (request) => {
      if (!request.url().startsWith("file://")) errors.push(`Non-file request ${request.url()}`);
    });
    await context.route(/^(?!file:\/\/)/, (route) => route.abort());

    const shots: Shot[] = [];
    for (const { name, hash } of states) {
      const page = await context.newPage();
      page.on("websocket", (socket) => errors.push(`WebSocket ${socket.url()}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const url = pathToFileURL(join(out, "dashboard", "index.html"));
      url.hash = hash;
      try {
        await page.goto(url.href);
        await page.locator("main[data-ready][data-evidence-ready]").waitFor({ state: "visible" });
        const evidence =
          name === shotNames.detail
            ? [".value-equation", ".farm"]
            : name === shotNames.method
              ? [".method-value", ".method-odds", ".method-evidence"]
              : [];
        for (const selector of evidence) {
          const box = await page.locator(selector).boundingBox();
          if (!box || box.y < 0 || box.y + box.height > viewport.height)
            throw new Error(`${name} must show all of ${selector} in the viewport`);
        }
        if (name === shotNames.filtered) {
          const status = page.locator('select[name="status"]');
          for (const item of [page.locator("main .census-summary"), status]) {
            const box = await item.boundingBox();
            if (!box || box.y < 0 || box.y + box.height > viewport.height) {
              throw new Error(`${name} must show the census summary and status filter`);
            }
          }
          if (
            (await status.inputValue()) !== "excluded" ||
            (await page.locator('th[aria-sort="descending"] button[data-sort="tvl"]').count()) !== 1
          ) {
            throw new Error(`${name} must filter to excluded and sort by descending TVL`);
          }
          const { census, visible } = await page
            .locator(".census tbody tr")
            .evaluateAll((rows) => ({
              census: (window as Window & { RADAR_DATA?: { census: CensusRecord[] } }).RADAR_DATA
                ?.census,
              visible: rows
                .filter((row) => {
                  const { top, bottom } = row.getBoundingClientRect();
                  return top < innerHeight && bottom > 0;
                })
                .map((row) =>
                  Array.from(row.querySelectorAll("td"), (cell) => cell.textContent ?? ""),
                ),
            }));
          if (!census) throw new Error(`${name} needs the published census`);
          assertExcludedRows(census, visible);
        }
        shots.push(await capture(page, name));
      } catch (error) {
        if (errors.length) throw new Error(`${name}: ${errors.join("\n")}`, { cause: error });
        throw error;
      } finally {
        await page.close();
      }
      if (errors.length) throw new Error(`${name}: ${errors.join("\n")}`);
    }
    return shots;
  } finally {
    await browser.close();
  }
}

function publish(shots: readonly Shot[]): void {
  const staging = mkdtempSync(join(repo, ".radar-shots-"));
  const next = join(staging, "next");
  const previous = join(staging, "previous");
  const destination = join(repo, "screenshots");
  let backedUp = false;
  try {
    mkdirSync(next);
    for (const shot of shots) writeFileSync(join(next, shot.name), shot.bytes);
    if (lstatSync(destination, { throwIfNoEntry: false })) {
      renameSync(destination, previous);
      backedUp = true;
    }
    try {
      renameSync(next, destination);
    } catch (error) {
      if (backedUp) {
        renameSync(previous, destination);
        backedUp = false;
      }
      throw error;
    }
    backedUp = false;
  } finally {
    if (!backedUp) rmSync(staging, { recursive: true, force: true });
  }
}

export async function generateScreenshots(options: LaunchOptions = { channel: "chrome" }) {
  const out = mkdtempSync(join(tmpdir(), "radar-shots-"));
  try {
    const states = shotStates(renderRadar(out));
    const shots = await takeShots(out, states, options);
    publish(shots);
    for (const { name, bytes, width, height } of shots) {
      console.log(`screenshots/${name} ${bytes.length} bytes, ${width}×${height}`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    await generateScreenshots();
  } catch (error) {
    console.error(`shots: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
