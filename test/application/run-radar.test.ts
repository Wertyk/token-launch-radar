import { expect, test } from "vitest";
import { toBoardRows } from "../../src/application/board-rows.ts";
import * as radarApi from "../../src/application/browser-api.ts";
import { buildRadar } from "../../src/application/build-radar.ts";
import type { DossierBuilder, OutputSink, SnapshotSource } from "../../src/application/ports.ts";
import { runRadar } from "../../src/application/run-radar.ts";
import { parseSnapshot } from "../../src/domain/snapshot.ts";
import { readKitSnapshot } from "../radar-fixtures.ts";

class MemoryOutput implements OutputSink {
  readonly files = new Map<string, string | Uint8Array>();
  readonly events: string[] = [];

  write(path: string, contents: string | Uint8Array): void {
    this.events.push(path);
    this.files.set(path, contents);
  }

  publishAssets(): string[] {
    this.events.push("publish assets");
    const path = "dashboard/index.html";
    this.files.set(path, "<title>Test radar</title>");
    return [path];
  }

  text(path: string): string {
    const value = this.files.get(path);
    if (typeof value !== "string") throw new Error(`Expected a text file at ${path}.`);
    return value;
  }
}

test("runs the ports in order and publishes the kit board and browser data", () => {
  const raw = readKitSnapshot();
  const snapshot = parseSnapshot(raw);
  const output = new MemoryOutput();
  const source: SnapshotSource = {
    load() {
      output.events.push("load");
      return raw;
    },
  };
  const dossier: DossierBuilder = {
    build() {
      output.events.push("build dossier");
      return new TextEncoder().encode(JSON.stringify([...output.files.keys()]));
    },
  };

  const summary = runRadar(source, output, dossier);

  expect(output.events).toEqual([
    "load",
    "board.json",
    "data.js",
    "publish assets",
    "build dossier",
    "dossier.json",
  ]);
  expect(output.files.get("dossier.json")).toEqual(
    new TextEncoder().encode('["board.json","data.js","dashboard/index.html"]'),
  );

  const board = JSON.parse(output.text("board.json")) as ReturnType<typeof toBoardRows>;
  const { rows } = board;
  expect(summary).toEqual({
    rowCount: rows.length,
    watchlistCovered: 40,
    files: ["board.json", "data.js", "dashboard/index.html", "dossier.json"],
  });
  expect(rows.length).toBeGreaterThanOrEqual(100);
  expect(rows.length).toBeLessThanOrEqual(4000);
  const slugs = new Set(rows.map(({ slug }) => slug));
  expect(slugs.size).toBe(rows.length);
  const snapshotSlugs = new Set(snapshot.protocols.map(({ slug }) => slug));
  expect(snapshot.watchlist).toHaveLength(40);
  for (const slug of snapshot.watchlist) expect(slugs.has(slug)).toBe(true);
  expect(new Set(rows.map(({ implied_value_usd }) => implied_value_usd)).size).toBeGreaterThan(1);
  let previousValue = Number.POSITIVE_INFINITY;
  for (const [index, row] of rows.entries()) {
    expect(snapshotSlugs.has(row.slug)).toBe(true);
    expect(row.name.trim()).not.toBe("");
    expect(row.rank).toBe(index + 1);
    expect(Number.isInteger(row.implied_value_usd)).toBe(true);
    expect(row.implied_value_usd).toBeGreaterThan(0);
    expect(row.implied_value_usd).toBeLessThanOrEqual(1e14);
    expect(row.implied_value_usd).toBeLessThanOrEqual(previousValue);
    previousValue = row.implied_value_usd;
    expect(row.farm_steps.length).toBeGreaterThanOrEqual(3);
    expect(row.farm_steps.length).toBeLessThanOrEqual(12);
    for (const step of row.farm_steps) {
      expect(typeof step).toBe("string");
      expect(step.trim().length).toBeGreaterThanOrEqual(20);
      expect(step.trim().length).toBeLessThanOrEqual(600);
    }
  }

  const dataScript = output.text("data.js");
  const prefix = "window.RADAR_DATA = ";
  expect(dataScript.startsWith(prefix)).toBe(true);
  expect(dataScript.endsWith(";\n")).toBe(true);
  expect(dataScript).not.toMatch(/https?:\/\//i);
  const data = JSON.parse(dataScript.slice(prefix.length, -2));
  expect(data).toEqual({
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      source: snapshot.source.replace(/https?:\/\//gi, ""),
    },
    protocols: snapshot.protocols,
    watchlist: snapshot.watchlist,
    board,
  });
  expect(data.protocols).toHaveLength(758);

  const radar = buildRadar(snapshot);
  expect(radar.census).toHaveLength(snapshot.protocols.length);
  expect(radar.census.every(({ reason }) => reason.length > 0)).toBe(true);
  expect(radar.model.n).toBe(128);
  expect(board).toEqual(toBoardRows(radar));
  for (const fn of [
    radarApi.buildRadar,
    radarApi.toBoard,
    radarApi.parseSnapshot,
    radarApi.daysBetween,
    radarApi.formatUsd,
  ]) {
    expect(typeof fn).toBe("function");
  }
  const browserSnapshot = radarApi.parseSnapshot({
    ...data.meta,
    protocols: data.protocols,
    watchlist: data.watchlist,
  });
  expect(radarApi.toBoard(radarApi.buildRadar(browserSnapshot))).toEqual(board);

  const row = radar.board[0];
  if (!row) throw new Error("Expected a ranked board row.");
  expect(Object.keys(rows[0] ?? {})).toEqual([
    "slug",
    "name",
    "rank",
    "implied_value_usd",
    "farm_steps",
    "category",
    "chains",
    "tvl_usd",
    "change_7d",
    "listed_at",
    "status",
    "board_reasons",
    "flags",
    "decomposition",
    "plan_chain",
    "plan_total_cost_usd",
    "plan_total_minutes",
  ]);
  expect(rows[0]).toMatchObject({
    category: row.protocol.category,
    chains: row.protocol.chains,
    tvl_usd: row.protocol.tvl_usd,
    change_7d: row.protocol.change_7d,
    listed_at: row.protocol.listed_at,
    status: row.status,
    board_reasons: row.boardReasons,
    flags: row.flags,
    decomposition: row.decomposition,
    plan_chain: row.plan.chain,
    plan_total_cost_usd: row.plan.totalCostUsd,
    plan_total_minutes: row.plan.totalMinutes,
  });
});

test("stops before writing if parsing the snapshot fails", () => {
  const output = new MemoryOutput();
  const source: SnapshotSource = { load: () => null };
  const dossier: DossierBuilder = { build: () => new Uint8Array() };

  expect(() => runRadar(source, output, dossier)).toThrow("snapshot: expected an object");
  expect(output.events).toEqual([]);
});
