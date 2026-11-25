import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { BoardRows } from "../../src/application/board-rows.ts";
import type { ValueDiagnostics } from "../../src/domain/valuation/diagnostics.ts";
import { rangeHonesty } from "../../src/domain/valuation/jackknife.ts";
import { buildDossier } from "../../vendor/makefun-board.ts";
import { dossierCaps, kitSnapshotPath, writeAssetFixture } from "../radar-fixtures.ts";

const main = fileURLToPath(new URL("../../main.ts", import.meta.url));
const gate = fileURLToPath(new URL("../../tools/gate.ts", import.meta.url));
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "radar-e2e-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(...args: string[]) {
  return spawnSync(process.execPath, [main, ...args], { encoding: "utf8", timeout: 90_000 });
}

function outputFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(path, join(entry.parentPath, entry.name)))
    .sort();
}

test("writes a byte-identical output tree and the vendor dossier on both runs", () => {
  const input = kitSnapshotPath();
  const assets = join(root, "assets");
  const first = join(root, "first");
  const second = join(root, "second");
  writeAssetFixture(assets);

  const args = ["--input", input, "--assets", assets];
  const firstRun = run(...args, "--output", first);
  const secondRun = run(...args, "--output", second);
  for (const result of [firstRun, secondRun]) {
    expect(result.status, result.stderr || result.error?.message).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(result.stdout).toMatch(/\d+ rows.*40 watchlist/);
    expect(result.stdout).toContain("dossier.json");
  }

  const files = outputFiles(first);
  expect(files).toEqual([
    "board.json",
    "dashboard/app.css",
    "dashboard/app.js",
    "dashboard/index.html",
    "data.js",
    "dossier.json",
    "screenshots/cover.png",
  ]);
  expect(outputFiles(second)).toEqual(files);
  for (const file of files) {
    expect(readFileSync(join(first, file)), file).toEqual(readFileSync(join(second, file)));
  }
  expect(readFileSync(join(first, "dossier.json"))).toEqual(
    Buffer.from(buildDossier(first, dossierCaps)),
  );
}, 180_000);

test("passes all gate checks, reproduces every byte and rejects coordinated replacements", () => {
  const screenshots = fileURLToPath(new URL("../../screenshots/", import.meta.url));
  expect(existsSync(screenshots), "Missing repo screenshots. Run pnpm shots.").toBe(true);

  const input = kitSnapshotPath();
  const first = join(root, "first");
  const second = join(root, "second");
  for (const output of [first, second]) {
    const result = run("--input", input, "--output", output);
    expect(result.status, result.stderr || result.error?.message).toBe(0);
  }
  const { rows }: BoardRows = JSON.parse(readFileSync(join(first, "board.json"), "utf8"));
  const script = readFileSync(join(first, "data.js"), "utf8");
  const payload = JSON.parse(script.slice("window.RADAR_DATA = ".length, -2));
  const embedded: (BoardRows["rows"][number] & ValueDiagnostics & { launch_p12: number })[] =
    payload.board.rows;
  const { middle, broad } = rangeHonesty(payload.looScatter);
  expect
    .soft(readme)
    .toContain(
      `Held-out coverage is ${middle.covered}/${middle.n} for the middle 50% band and ${broad.covered}/${broad.n} for the middle 80% band.`,
    );
  expect(
    embedded.map(
      ({ interval_p10_usd, interval_p90_usd, influence, twins, launch_p12, ...row }) => row,
    ),
  ).toEqual(rows);
  const watchlist: string[] = JSON.parse(readFileSync(input, "utf8")).watchlist;
  const slugs = new Set(rows.map(({ slug }) => slug));
  expect(watchlist).toHaveLength(40);
  expect(watchlist.filter((slug) => !slugs.has(slug))).toEqual([]);
  for (const row of rows) {
    expect(Number.isInteger(row.implied_value_usd), row.slug).toBe(true);
    expect(row.implied_value_usd, row.slug).toBe(
      Math.max(1, Math.round(row.launch_value_usd * row.farm_economics.launchProbability12)),
    );
    expect(row.implied_value_usd, row.slug).toBeGreaterThanOrEqual(1);
  }
  const result = spawnSync(process.execPath, [gate, "--out", first, "--input", input], {
    encoding: "utf8",
  });
  expect(result.status, result.stderr || result.stdout || result.error?.message).toBe(0);
  const passedChecks = [...result.stdout.matchAll(/^PASS (\w+)/gm)].map(([, name]) => name);
  expect(passedChecks).toHaveLength(9);
  expect(passedChecks.at(-1)).toBe("regenerated_output");
  expect.soft(readme).toContain(`${passedChecks.length - 1} contract checks`);
  expect
    .soft(readme)
    .toContain(
      `Check ${passedChecks.length} rebuilds \`board.json\` and \`data.js\` in memory from the snapshot and compares the published files field by field.`,
    );
  for (const file of ["0-guide.md", "2-core.js", "3-ui.js"]) {
    expect(result.stdout).toContain(`dashboard/${file} shown whole`);
  }
  expect(result.stdout).toContain("dashboard/5-extras.js dropped");
  expect(result.stdout).toMatch(/dashboard\/(4-app\.css|index\.html) cut \(/);
  const { text }: { text: string } = JSON.parse(readFileSync(join(first, "dossier.json"), "utf8"));
  expect(text).toContain("function farmCapitalApr(");
  expect(text).toContain("function jackknifePlusBands(");
  expect(text).toContain("function describeBoardValues(");
  expect(text).toContain("function fitOuterFold(");
  expect.soft(text.includes("function fitOuterOddsFold("), "protected nested odds fit").toBe(true);

  const files = outputFiles(first);
  expect(outputFiles(second)).toEqual(files);
  for (const file of files) {
    expect(readFileSync(join(first, file)).equals(readFileSync(join(second, file))), file).toBe(
      true,
    );
  }

  payload.board.rows[0].interval_p10_usd++;
  payload.board.rows[0].influence.rank_delta += 25;
  payload.looScatter[0].p10 -= 1;
  payload.bootstrap.seeds[0]++;
  payload.model.evidence.walkForward[0].model[0].predicted += 0.01;
  payload.board.rows[0].farm_steps[0] =
    "Changed farm step, coordinated between both published files.";
  const firstRow = rows[0];
  if (!firstRow) throw new Error("Missing first board row");
  firstRow.farm_steps[0] = payload.board.rows[0].farm_steps[0];
  writeFileSync(join(first, "data.js"), `window.RADAR_DATA = ${JSON.stringify(payload)};\n`);
  writeFileSync(join(first, "board.json"), `${JSON.stringify({ rows })}\n`);
  const edited = spawnSync(process.execPath, [gate, "--out", first, "--input", input], {
    encoding: "utf8",
  });
  expect(edited.status).toBe(1);
  expect(edited.stdout.match(/^PASS /gm)).toHaveLength(8);
  expect(edited.stdout).toContain("FAIL regenerated_output — board.json $.rows[0].farm_steps[0]");
}, 360_000);

test("a rerun replaces the asset trees and builds the dossier from the new files", () => {
  const firstAssets = join(root, "first-assets");
  const secondAssets = join(root, "second-assets");
  const output = join(root, "out");
  writeAssetFixture(firstAssets);
  writeAssetFixture(secondAssets);

  const firstShots = join(firstAssets, "screenshots");
  copyFileSync(join(firstShots, "cover.png"), join(firstShots, "old.png"));
  const obsolete = join(firstAssets, "dashboard", "obsolete");
  mkdirSync(obsolete);
  writeFileSync(join(obsolete, "old.css"), "body {}\n");
  const secondShots = join(secondAssets, "screenshots");
  renameSync(join(secondShots, "cover.png"), join(secondShots, "renamed.png"));

  const args = ["--input", kitSnapshotPath(), "--output", output];
  const firstRun = run(...args, "--assets", firstAssets);
  expect(firstRun.status, firstRun.stderr).toBe(0);
  expect(readdirSync(join(output, "screenshots")).sort()).toEqual(["cover.png", "old.png"]);
  expect(readFileSync(join(output, "dashboard", "obsolete", "old.css"), "utf8")).toBe("body {}\n");

  const keep = join(output, "keep.txt");
  writeFileSync(keep, "keep this file");
  symlinkSync(secondAssets, join(output, "screenshots", "outside"), "dir");

  const secondRun = run(...args, "--assets", secondAssets);
  expect(secondRun.status, secondRun.stderr).toBe(0);
  expect(readdirSync(join(output, "screenshots"))).toEqual(["renamed.png"]);
  expect(readdirSync(join(output, "dashboard")).sort()).toEqual([
    "app.css",
    "app.js",
    "index.html",
  ]);
  expect(readFileSync(join(secondShots, "renamed.png"))).toEqual(
    readFileSync(join(output, "screenshots", "renamed.png")),
  );
  expect(readFileSync(keep, "utf8")).toBe("keep this file");
  expect(readFileSync(join(output, "dossier.json"))).toEqual(
    Buffer.from(buildDossier(output, dossierCaps)),
  );
}, 180_000);

test("reports a missing snapshot on a single stderr line", () => {
  const missing = join(root, "missing.json");
  const result = run("--input", missing, "--output", join(root, "out"));

  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(result.stderr).toMatch(/^token radar: /);
  expect(result.stderr).toContain(missing);
});

test("reports the vendor error when the dashboard has yet to be published", () => {
  const result = run(
    "--input",
    kitSnapshotPath(),
    "--output",
    join(root, "out"),
    "--assets",
    join(root, "missing-assets"),
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(
    "token radar: buildDossier: no dashboard/ directory: the page and its source are what the judge reads\n",
  );
}, 90_000);
