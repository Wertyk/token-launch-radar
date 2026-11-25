import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildDossier } from "../../vendor/makefun-board.ts";

const gate = fileURLToPath(new URL("../../tools/gate.ts", import.meta.url));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const checks = [
  "dashboard_files",
  "board_file",
  "sorted_by_value",
  "coverage",
  "farm_steps",
  "screenshots",
  "dossier_matches",
  "board_matches_data",
];
const steps = [
  "Confirm the protocol's supported networks.",
  "Check the route and estimate the gas fees.",
  "Record the transaction and review it later.",
];

let out: string;
let input: string;
let rows: ReturnType<typeof boardRows>;

function boardRows() {
  return Array.from({ length: 100 }, (_, index) => ({
    slug: `protocol-${index + 1}`,
    name: `Protocol ${index + 1}`,
    rank: index + 1,
    implied_value_usd: 100 - index,
    farm_steps: [...steps],
  }));
}

// Header and chunk boundaries only. The gate does not decode the pixels.
function png(width: number, height: number, size = 45): Buffer {
  const bytes = Buffer.alloc(size);
  bytes.set(pngSignature);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.set([8, 2], 24);
  if (size > 45) {
    bytes.writeUInt32BE(size - 57, 33);
    bytes.write("IDAT", 37);
  }
  bytes.write("IEND", size - 8);
  return bytes;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4);
  chunk.set(data, 8);
  const crcOffset = chunk.length - 4;
  chunk.writeUInt32BE(crc32(chunk.subarray(4, crcOffset)), crcOffset);
  return chunk;
}

function validPng(): Buffer {
  const side = 800;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8; // 8-bit grayscale
  // Each scanline starts with filter byte 0, followed by one byte per black pixel.
  const scanlines = Buffer.alloc(side * (side + 1));
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function jpeg(width: number, height: number, frame: number): Buffer {
  const bytes = Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    4,
    1,
    2,
    0xff,
    frame,
    0,
    11,
    8,
    0,
    0,
    0,
    0,
    1,
    1,
    0x11,
    0,
    0xff,
    0xd9,
  ]);
  bytes.writeUInt16BE(height, 13);
  bytes.writeUInt16BE(width, 15);
  return bytes;
}

function saveBoard(bare = false): void {
  writeFileSync(join(out, "board.json"), JSON.stringify(bare ? rows : { rows }));
}

function savePublished(embedded = rows): void {
  writeFileSync(
    join(out, "data.js"),
    `window.RADAR_DATA = ${JSON.stringify({ board: { rows: embedded } })};\n`,
  );
}

function saveSnapshot(watchlist = ["protocol-1"]): void {
  const protocols = [...rows.map(({ slug }) => ({ slug })), { slug: "unranked" }];
  writeFileSync(input, JSON.stringify({ protocols, watchlist }));
}

function saveDossier(): void {
  writeFileSync(join(out, "dossier.json"), buildDossier(out, { text_max_bytes: 65_536 }));
}

function runGate(failed: string[] = []): string {
  const result = spawnSync(process.execPath, [gate, "--out", out, "--input", input], {
    encoding: "utf8",
  });
  expect(result.status, result.stderr || result.error?.message).toBe(failed.length ? 1 : 0);
  const lines = result.stdout.split("\n");
  for (const [index, check] of checks.entries()) {
    expect(lines[index]).toMatch(
      new RegExp(`^${failed.includes(check) ? "FAIL" : "PASS"} ${check} .+`),
    );
  }
  return result.stdout;
}

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "radar-gate-"));
  input = join(out, "snapshot.json");
  rows = boardRows();
  saveBoard();
  savePublished();
  saveSnapshot();
  mkdirSync(join(out, "dashboard"));
  writeFileSync(join(out, "dashboard", "index.html"), "<!doctype html><title>Test</title>");
  writeFileSync(join(out, "dashboard", "0-guide.md"), "# Radar");
  writeFileSync(join(out, "dashboard", "2-core.js"), "void 0;");
  writeFileSync(join(out, "dashboard", "4-app.css"), "body {}");
  writeFileSync(join(out, "dashboard", "3-ui.js"), "void 0;");
  mkdirSync(join(out, "screenshots"));
  writeFileSync(join(out, "screenshots", "a.png"), png(1440, 800, 512 * 1024));
  writeFileSync(join(out, "screenshots", "b.jpg"), jpeg(800, 1440, 0xc0));
  writeFileSync(join(out, "screenshots", "c.jpg"), jpeg(1440, 800, 0xc2));
  writeFileSync(join(out, "screenshots", ".ignored"), "not an image");
  saveDossier();
});

afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

test("passes all eight checks and reports what the judge sees", () => {
  const stdout = runGate();
  expect(stdout).toMatch(/text: \d+ bytes, \d+ bytes of headroom/);
  expect(stdout).toContain("dashboard/4-app.css shown whole");
  expect(stdout).toContain("a.png 524288 bytes, 1440×800");
  expect(stdout).toContain("b.jpg 23 bytes, 800×1440");
  expect(stdout).toMatch(/dossier\.json: \d+ \/ 1572864 bytes/);
  expect(stdout).toMatch(/WARN.*a\.png.*350 KB/);
  expect(stdout).toMatch(/WARN.*3-filtered.*pnpm shots/);
});

test("recognizes the new screenshot set and flags obsolete names", () => {
  for (const name of ["a.png", "b.jpg", "c.jpg"]) rmSync(join(out, "screenshots", name));
  for (const name of ["1-board", "2-detail", "3-filtered", "4-method"]) {
    writeFileSync(join(out, "screenshots", `${name}.png`), png(1440, 900));
  }
  saveDossier();
  expect(runGate()).not.toMatch(/WARN.*pnpm shots/);

  rmSync(join(out, "screenshots", "4-method.png"));
  writeFileSync(join(out, "screenshots", "3-method.png"), png(1440, 900));
  saveDossier();
  expect(runGate()).toMatch(/WARN.*4-method.*pnpm shots/);
});

test("accepts a bare board array and checks order by rank", () => {
  rows.reverse();
  saveBoard(true);
  savePublished();
  runGate();
});

test("dashboard_files rejects links in comments and names the first file", () => {
  writeFileSync(join(out, "dashboard", "3-ui.js"), "// https://example.test/");
  writeFileSync(join(out, "dashboard", "index.html"), "<!-- http://example.test/ -->");
  saveDossier();
  expect(runGate(["dashboard_files"])).toMatch(/FAIL dashboard_files .*dashboard\/3-ui\.js/);
});

test("board_file identifies invented slugs", () => {
  const row = rows[1];
  if (!row) throw new Error("No second fixture row");
  row.slug = "invented";
  saveBoard();
  expect(runGate(["board_file", "board_matches_data"])).toMatch(/FAIL board_file .*invented/);
});

test("sorted_by_value rejects a rise in value as rank increases", () => {
  const row = rows[1];
  if (!row) throw new Error("No second fixture row");
  row.implied_value_usd = 101;
  saveBoard();
  runGate(["sorted_by_value", "board_matches_data"]);
});

test.each([
  ["implied_value_usd", 101],
  ["farm_steps", ["A different but otherwise valid farm step.", ...steps.slice(1)]],
  ["unexpected_field", 1],
])("rejects a board.json-only change to %s", (field, value) => {
  Object.assign(rows[0] ?? {}, { [field]: value });
  saveBoard();
  expect(runGate(["board_matches_data"])).toContain(`protocol-1.${field}`);
});

test("coverage identifies a missing watchlist slug", () => {
  saveSnapshot(["protocol-1", "unranked"]);
  expect(runGate(["coverage"])).toMatch(/FAIL coverage .*unranked/);
});

test("farm_steps checks the length of trimmed strings", () => {
  rows[0]?.farm_steps.splice(0, 1, "  too short to count  ");
  saveBoard();
  runGate(["farm_steps", "board_matches_data"]);
});

test.each([
  ["a PNG short side of 799", () => png(1440, 799)],
  ["a PNG long side of 1441", () => png(1441, 800)],
  ["a PNG over 512 KiB", () => png(1440, 800, 512 * 1024 + 1)],
  ["a PNG without IEND", () => png(1440, 800).subarray(0, 33)],
  ["a JPEG short side of 799", () => jpeg(799, 1440, 0xc0)],
  ["a JPEG long side of 1441", () => jpeg(800, 1441, 0xc2)],
  ["a JPEG without EOI", () => jpeg(1440, 800, 0xc2).subarray(0, -2)],
])("screenshots rejects %s", (_, bytes) => {
  writeFileSync(join(out, "screenshots", "a.png"), bytes());
  saveDossier();
  expect(runGate(["screenshots"])).toMatch(/FAIL screenshots .*a\.png/);
});

test.each(["IHDR", "IEND"])("screenshots rejects a PNG with a high bit flipped in %s", (chunk) => {
  const bytes = validPng();
  const path = join(out, "screenshots", "a.png");
  writeFileSync(path, bytes);
  saveDossier();
  runGate();

  const offset = chunk === "IHDR" ? 12 : bytes.length - 8;
  expect(bytes.subarray(offset, offset + 4)).toEqual(Buffer.from(chunk));
  bytes.writeUInt8(bytes.readUInt8(offset) ^ 0x80, offset);
  writeFileSync(path, bytes);
  saveDossier();
  expect(runGate(["screenshots"])).toContain(
    "FAIL screenshots — screenshots/a.png is not a whole PNG or JPEG with dimensions",
  );
});

test("dossier_matches rejects a valid JSON file with different bytes", () => {
  const path = join(out, "dossier.json");
  writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
  runGate(["dossier_matches"]);
});

test("the dossier report shows cuts and dropped files without counting source headings", () => {
  writeFileSync(
    join(out, "dashboard", "3-ui.js"),
    `/*\n### index.html\n*/\n${"// Long line of script content.\n".repeat(2400)}`,
  );
  writeFileSync(join(out, "dashboard", "tile.png"), png(12, 12));
  saveDossier();
  const stdout = runGate();
  expect(stdout).toMatch(/dashboard\/3-ui\.js cut \(\d+ of \d+ lines not shown\)/);
  expect(stdout).toContain("dashboard/index.html dropped");
  expect(stdout).toContain("dashboard/tile.png dropped");
});
