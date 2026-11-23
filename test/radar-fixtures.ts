import { accessSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const dossierCaps = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};

export function kitSnapshotPath(): string {
  const path =
    process.env.RADAR_SNAPSHOT ?? "../token-radar-kit/token-radar-01-kit/input/snapshot.json";
  try {
    accessSync(path);
  } catch (cause) {
    throw new Error(`Could not read kit snapshot at ${path}. Set RADAR_SNAPSHOT to its path.`, {
      cause,
    });
  }
  return path;
}

export function readKitSnapshot(): unknown {
  return JSON.parse(readFileSync(kitSnapshotPath(), "utf8"));
}

export function writeAssetFixture(root: string): void {
  const dashboard = join(root, "dashboard");
  const screenshots = join(root, "screenshots");
  mkdirSync(dashboard, { recursive: true });
  mkdirSync(screenshots, { recursive: true });
  writeFileSync(
    join(dashboard, "index.html"),
    '<!doctype html><title>Radar test</title><link rel="stylesheet" href="app.css"><script src="../data.js"></script><script src="app.js"></script>\n',
  );
  writeFileSync(join(dashboard, "app.css"), "body { margin: 0; }\n");
  writeFileSync(join(dashboard, "app.js"), '"use strict";\n');
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQzIj7DwADfAHnmt6SegAAAABJRU5ErkJggg==",
    "base64",
  );
  writeFileSync(join(screenshots, "cover.png"), png);
}
