import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { FsSnapshotSource } from "../../src/infrastructure/fs-snapshot-source.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "radar-source-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("reads a snapshot from a file or from a directory with snapshot.json", () => {
  const path = join(root, "snapshot.json");
  const raw = { as_of: "2026-11-14", protocols: [] };
  writeFileSync(path, JSON.stringify(raw));

  expect(new FsSnapshotSource(path).load()).toEqual(raw);
  expect(new FsSnapshotSource(root).load()).toEqual(raw);
});

test("reports the path of a missing input or a directory's missing snapshot", () => {
  const path = join(root, "missing.json");
  expect(() => new FsSnapshotSource(path).load()).toThrow(path);
  expect(() => new FsSnapshotSource(root).load()).toThrow(join(root, "snapshot.json"));
});

test("reports the path when JSON parsing fails", () => {
  const path = join(root, "snapshot.json");
  writeFileSync(path, "{");
  expect(() => new FsSnapshotSource(root).load()).toThrow(path);
});
