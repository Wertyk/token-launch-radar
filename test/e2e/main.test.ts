import { spawnSync } from "node:child_process";
import {
  copyFileSync,
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
import { buildDossier } from "../../vendor/makefun-board.ts";
import { dossierCaps, kitSnapshotPath, writeAssetFixture } from "../radar-fixtures.ts";

const main = fileURLToPath(new URL("../../main.ts", import.meta.url));
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "radar-e2e-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(...args: string[]) {
  return spawnSync(process.execPath, [main, ...args], { encoding: "utf8" });
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
});

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
});

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
});
