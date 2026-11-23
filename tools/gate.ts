import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { compareText } from "../src/domain/shared/order.ts";
import { buildDossier, DOSSIER_MAX_BYTES } from "../vendor/makefun-board.ts";
import type { AssetEntry } from "./gate/checks.ts";
import {
  boardLimit,
  checkBoardFile,
  checkCoverage,
  checkDashboard,
  checkDossier,
  checkFarmSteps,
  checkScreenshots,
  checkSortedByValue,
  dashboardLimits,
  readBoard,
  readSnapshotSlugs,
  textLimit,
} from "./gate/checks.ts";
import { screenshotLimit, screenshotTarget } from "./gate/image.ts";
import { dossierReport, dossierSize } from "./gate/report.ts";

function readRegular(path: string, limit: number, label: string): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`${label} is not a regular file`);
  if (stat.size > limit) throw new Error(`${label} has ${stat.size} bytes, limit ${limit}`);
  return readFileSync(path);
}

function assetEntries(root: string, dashboard: boolean): AssetEntry[] {
  if (!lstatSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
  const entries: AssetEntry[] = [];
  const pending = [""];
  for (const directory of pending) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (!dashboard && entry.name.startsWith(".")) continue;
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      const kind = entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other";
      const size = kind === "file" ? lstatSync(join(root, path)).size : 0;
      entries.push({ path, kind, size });
      if (dashboard && kind === "directory" && !entry.name.startsWith(".")) pending.push(path);
    }
  }
  entries.sort((a, b) => compareText(a.path, b.path));

  let dashboardBytes = 0;
  let dashboardFiles = 0;
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    if (dashboard) {
      dashboardBytes += entry.size;
      dashboardFiles++;
      if (dashboardBytes > dashboardLimits.bytes || dashboardFiles > dashboardLimits.files) break;
    } else if (entries.length > 4 || entry.size > screenshotLimit) {
      continue;
    }
    entry.bytes = readFileSync(join(root, entry.path));
  }
  return entries;
}

type Result<T> = { value: T } | { error: unknown };

function capture<T>(operation: () => T): Result<T> {
  try {
    return { value: operation() };
  } catch (error) {
    return { error };
  }
}

function unwrap<T>(result: Result<T>): T {
  if ("error" in result) throw result.error;
  return result.value;
}

function oneLine(value: unknown): string {
  return (value instanceof Error ? value.message : String(value)).replace(/[\r\n]+/g, " ");
}

function run(out: string, input: string): void {
  const rows = capture(() =>
    readBoard(readRegular(join(out, "board.json"), boardLimit, "board.json")),
  );
  const snapshot = capture(() => readSnapshotSlugs(readFileSync(input)));
  const screenshots = capture(() => assetEntries(join(out, "screenshots"), false));
  const dossierPath = join(out, "dossier.json");
  const dossier = capture(() => readRegular(dossierPath, DOSSIER_MAX_BYTES, "dossier.json"));

  const checks = [
    ["dashboard_files", () => checkDashboard(assetEntries(join(out, "dashboard"), true))],
    ["board_file", () => checkBoardFile(unwrap(rows), unwrap(snapshot))],
    ["sorted_by_value", () => checkSortedByValue(unwrap(rows))],
    ["coverage", () => checkCoverage(unwrap(rows), unwrap(snapshot))],
    ["farm_steps", () => checkFarmSteps(unwrap(rows))],
    ["screenshots", () => checkScreenshots(unwrap(screenshots))],
    [
      "dossier_matches",
      () => checkDossier(unwrap(dossier), buildDossier(out, { text_max_bytes: textLimit })),
    ],
  ] as const;
  for (const [name, check] of checks) {
    const result = capture(check);
    if ("error" in result) {
      console.log(`FAIL ${name} — ${oneLine(result.error)}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS ${name} — ${oneLine(result.value)}`);
    }
  }

  console.log("\nDossier report");
  const report = capture(() => dossierReport(unwrap(dossier)));
  if ("error" in report) console.log(`Report unavailable — ${oneLine(report.error)}`);
  else for (const line of report.value) console.log(oneLine(line));

  const size = lstatSync(dossierPath, { throwIfNoEntry: false });
  if (size?.isFile()) console.log(dossierSize(size.size));
  if ("value" in screenshots) {
    for (const { path, size } of screenshots.value) {
      if (size > screenshotTarget)
        console.log(`WARN screenshots/${oneLine(path)} exceeds 350 KB (${size} bytes)`);
    }
  }
}

try {
  const { values } = parseArgs({ options: { out: { type: "string" }, input: { type: "string" } } });
  if (!values.out || !values.input)
    throw new Error("Usage: node tools/gate.ts --out <dir> --input <snapshot.json>");
  run(resolve(values.out), resolve(values.input));
} catch (error) {
  console.error(`gate: ${oneLine(error)}`);
  process.exitCode = 1;
}
