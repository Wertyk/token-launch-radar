import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { FsOutputSink } from "../../src/infrastructure/fs-output-sink.ts";

let root: string;
let assets: string;
let output: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "radar-sink-"));
  assets = join(root, "assets");
  output = join(root, "out");
  mkdirSync(join(assets, "dashboard", "nested"), { recursive: true });
  mkdirSync(join(assets, "screenshots"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("writes text and bytes and copies assets recursively in name order, skipping dot-files", () => {
  writeFileSync(join(assets, "dashboard", "z.js"), "z");
  writeFileSync(join(assets, "dashboard", "nested", "a.css"), "a");
  writeFileSync(join(assets, "dashboard", "A.html"), "A");
  writeFileSync(join(assets, "dashboard", "nested", ".hidden"), "hidden");
  writeFileSync(join(assets, "screenshots", ".DS_Store"), "hidden");
  const png = Uint8Array.of(137, 80, 78, 71);
  writeFileSync(join(assets, "screenshots", "cover.png"), png);
  const sink = new FsOutputSink(output, assets);

  sink.write("data.js", "test\n");
  sink.write("other/bytes", png);
  expect(sink.publishAssets()).toEqual([
    "dashboard/A.html",
    "dashboard/nested/a.css",
    "dashboard/z.js",
    "screenshots/cover.png",
  ]);
  expect(readFileSync(join(output, "data.js"), "utf8")).toBe("test\n");
  expect(readFileSync(join(output, "dashboard", "A.html"), "utf8")).toBe("A");
  expect(readFileSync(join(output, "dashboard", "nested", "a.css"), "utf8")).toBe("a");
  expect(readFileSync(join(output, "other", "bytes"))).toEqual(Buffer.from(png));
  expect(readFileSync(join(output, "screenshots", "cover.png"))).toEqual(Buffer.from(png));
  expect(existsSync(join(output, "dashboard", "nested", ".hidden"))).toBe(false);
  expect(existsSync(join(output, "screenshots", ".DS_Store"))).toBe(false);
});

test.each(["dashboard", "screenshots"])("rejects dot-directories in %s", (directory) => {
  mkdirSync(join(assets, directory, ".hidden"));
  expect(() => new FsOutputSink(output, assets).publishAssets()).toThrow(
    `${directory}/.hidden is a dot-directory`,
  );
});

test("rejects an output root inside an asset tree before copying it", () => {
  const nestedOutput = join(assets, "dashboard", "out");
  const sink = new FsOutputSink(nestedOutput, assets);
  expect(() => sink.publishAssets()).toThrow("is inside asset directory");
  expect(existsSync(join(nestedOutput, "dashboard"))).toBe(false);
});

test.each([".", "dashboard/fixtures"])("rejects assets in an output asset tree (%s)", (path) => {
  const assetsInOutput = join(output, path);
  const dashboard = join(assetsInOutput, "dashboard");
  mkdirSync(dashboard, { recursive: true });
  const source = join(dashboard, "index.html");
  writeFileSync(source, "original");

  expect(() => new FsOutputSink(output, assetsInOutput).publishAssets()).toThrow(
    "is inside an output asset directory",
  );
  expect(readFileSync(source, "utf8")).toBe("original");
});

test("keeps writes inside the output root even with links and traversal paths", () => {
  const sink = new FsOutputSink(output, assets);
  sink.write("data.js", "test\n");
  const outside = join(root, "outside.txt");
  writeFileSync(outside, "original");
  symlinkSync(root, join(output, "linked-dir"), "dir");
  symlinkSync(outside, join(output, "linked-file"));
  linkSync(outside, join(output, "hard-link"));

  expect(() => sink.write("../outside.txt", "escape")).toThrow();
  expect(() => sink.write(outside, "escape")).toThrow();
  expect(() => sink.write("linked-dir/outside.txt", "escape")).toThrow();
  sink.write("linked-file", "replacement");
  sink.write("hard-link", "replacement");
  expect(readFileSync(outside, "utf8")).toBe("original");

  symlinkSync(root, join(output, "dashboard"), "dir");
  writeFileSync(join(assets, "dashboard", "outside.txt"), "escape");
  expect(() => sink.publishAssets()).toThrow();
  expect(readFileSync(outside, "utf8")).toBe("original");
});
