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
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";
import { chromium } from "playwright";
import type { BoardRows } from "../src/application/board-rows.ts";
import { boardHash, defaultState, protocolHash } from "../src/presentation/web/state.ts";
import { imageDimensions, screenshotTarget } from "./gate/image.ts";

interface Shot {
  name: string;
  bytes: Buffer;
  width: number;
  height: number;
}

const repo = resolve(import.meta.dirname, "..");
const viewport = { width: 1440, height: 900 };

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

function shotStates({ rows }: BoardRows) {
  const first = rows.find(({ rank }) => rank === 1);
  if (!first) throw new Error("board.json needs a rank-1 row");
  return [
    { name: "1-board", hash: boardHash(defaultState) },
    { name: "2-detail", hash: protocolHash(first.slug, defaultState) },
    { name: "3-method", hash: "#/method" },
    { name: "4-census", hash: "#/census" },
  ];
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
    throw new Error(`${name} exceeds 350 KB at every JPEG quality`);
  const dimensions = imageDimensions(bytes);
  if (dimensions?.width !== viewport.width || dimensions.height !== viewport.height) {
    throw new Error(`${name} is not a whole ${viewport.width}×${viewport.height} image`);
  }
  return { name: `${name}.${extension}`, bytes, ...dimensions };
}

async function takeShots(out: string, states: ReturnType<typeof shotStates>): Promise<Shot[]> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
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
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const url = pathToFileURL(join(out, "dashboard", "index.html"));
      url.hash = hash;
      try {
        await page.goto(url.href);
        await page.locator("main[data-ready]").waitFor({ state: "visible" });
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

const out = mkdtempSync(join(tmpdir(), "radar-shots-"));
try {
  const states = shotStates(renderRadar(out));
  const shots = await takeShots(out, states);
  publish(shots);
  for (const { name, bytes, width, height } of shots) {
    console.log(`screenshots/${name} ${bytes.length} bytes, ${width}×${height}`);
  }
} catch (error) {
  console.error(`shots: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
