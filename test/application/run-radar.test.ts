import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { toBoardRows } from "../../src/application/board-rows.ts";
import * as radarApi from "../../src/application/browser-api.ts";
import { buildRadar } from "../../src/application/build-radar.ts";
import type { DossierBuilder, OutputSink, SnapshotSource } from "../../src/application/ports.ts";
import { runRadar } from "../../src/application/run-radar.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import { parseSnapshot } from "../../src/domain/snapshot.ts";
import type { ValueDiagnostics } from "../../src/domain/valuation/diagnostics.ts";
import { integrityChecks } from "../../src/presentation/web/integrity.ts";
import { boardMismatches } from "../../src/presentation/web/recompute.ts";
import { scatterCoverage } from "../../src/presentation/web/scatter-view.ts";
import { protocol } from "../domain/protocol-fixture.ts";
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
  // Project the launch values back onto the v3 board to verify that V stayed identical.
  const valuationBytes = JSON.stringify(
    [...rows]
      .sort((a, b) => b.launch_value_usd - a.launch_value_usd || (a.slug < b.slug ? -1 : 1))
      .map(({ slug, launch_value_usd }, index) => ({
        slug,
        rank: index + 1,
        implied_value_usd: launch_value_usd,
      })),
  );
  expect(createHash("sha256").update(valuationBytes).digest("hex")).toBe(
    "f4468f70d48b3e318dbf9655d0269bdd7954dedf619a04b54e15d77363e5e240",
  );
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
  expect(data.meta.protocolCount).toBe(snapshot.protocols.length);
  expect(data.meta.playbooks.lending.enter).toContain("Supply {deposit} as collateral");
  expect(data.meta.gas.chains.Base).toEqual([0.05, 0.3]);
  const publishedRows = data.board.rows as ((typeof rows)[number] &
    ValueDiagnostics & {
      launch_p12: number;
    })[];
  for (const unused of ["houseRule", "intervalCoverage", "intervalCounts"]) {
    expect(data).not.toHaveProperty(unused);
  }
  expect(data.looScatter).toHaveLength(128);
  expect(new Set(data.looScatter.map((point: { slug: string }) => point.slug)).size).toBe(128);
  for (const point of data.looScatter) {
    expect(Number.isFinite(point.p10)).toBe(true);
    expect(Number.isFinite(point.p90)).toBe(true);
    expect(point.p10).toBeLessThanOrEqual(point.p90);
    expect(point).not.toHaveProperty("inside");
  }
  expect(data.launchClock.points).toHaveLength(6);
  expect(
    data.launchClock.points.reduce((sum: number, point: { count: number }) => sum + point.count, 0),
  ).toBe(snapshot.protocols.filter(({ listed_at }) => listed_at !== null).length);
  for (const [index, row] of rows.entries()) {
    const published = publishedRows[index];
    if (!published) throw new Error(`Missing data for ${row.slug}.`);
    const { interval_p10_usd, interval_p90_usd, influence, twins, launch_p12 } = published;
    expect(Number.isInteger(interval_p10_usd)).toBe(true);
    expect(Number.isInteger(interval_p90_usd)).toBe(true);
    expect(interval_p10_usd).toBeLessThanOrEqual(row.implied_value_usd);
    expect(interval_p90_usd).toBeGreaterThanOrEqual(row.implied_value_usd);
    expect(influence === null || Number.isInteger(influence.rank_delta)).toBe(true);
    expect(new Set(twins).size).toBe(5);
    expect(launch_p12).toBeGreaterThan(0);
    expect(launch_p12).toBeLessThanOrEqual(1);
    expect(row.implied_value_usd).toBe(Math.round(row.launch_value_usd * launch_p12));
    expect(published.flags).toEqual(row.flags);
  }
  const radar = buildRadar(snapshot);
  expect(data).toMatchObject({
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      source: snapshot.source.replace(/https?:\/\//gi, ""),
    },
    protocols: snapshot.protocols,
    watchlist: snapshot.watchlist,
    census: radar.census,
    model: radar.model,
    looScatter: radar.looScatter,
  });
  expect(
    publishedRows.map(
      ({
        interval_p10_usd: _lower,
        interval_p90_usd: _upper,
        influence: _influence,
        twins: _twins,
        launch_p12: _launch,
        ...published
      }) => published,
    ),
  ).toEqual(rows);
  expect(data.model.validation.leaveOneFamilyOut.model.n).toBe(128);
  expect(data.model.ablation.withCategory.n).toBe(128);
  expect(data.model.ablation.ols.n).toBe(128);
  expect(data.model.coefficients).not.toHaveProperty("category");
  expect(data.protocols).toHaveLength(758);

  expect(radar.census).toHaveLength(snapshot.protocols.length);
  expect(radar.census.every(({ reason }) => reason.length > 0)).toBe(true);
  expect(radar.model.n).toBe(128);
  expect(board).toEqual(toBoardRows(radar));
  for (const fn of [
    radarApi.buildRadar,
    radarApi.readPublishedSnapshot,
    radarApi.daysBetween,
    radarApi.formatUsd,
  ]) {
    expect(typeof fn).toBe("function");
  }
  const browserSnapshot = radarApi.readPublishedSnapshot(data);
  if (!browserSnapshot) throw new Error("Expected a browser snapshot.");
  expect(browserSnapshot.protocols).toBe(data.protocols);
  expect(radarApi.readPublishedSnapshot({ ...data, protocols: [] })).toBeNull();
  expect(radarApi.readPublishedSnapshot({ ...data, watchlist: null })).toBeNull();
  const browserRadar = radarApi.buildRadar(
    browserSnapshot,
    data.model.lambda,
    data.launchClock,
    data.meta,
  );
  expect(browserRadar.model.lambda).toBe(data.model.lambda);
  expect(rows.every((row) => !("category" in row.decomposition.multipliers))).toBe(true);
  expect(browserRadar.model).not.toHaveProperty("validation");
  expect(radarApi).not.toHaveProperty("validateModel");
  expect(browserRadar).not.toHaveProperty("heldOutBands");
  const scatter = scatterCoverage(data.looScatter);
  expect(scatter.counts).toEqual({ missLow: 12, covered: 104, missHigh: 12 });
  const checks = integrityChecks(
    boardMismatches(browserRadar.board, publishedRows),
    publishedRows,
    browserSnapshot.watchlist,
    {
      fitted: browserRadar.model.n,
      houseRule: browserRadar.houseRule,
      intervalCounts: scatter.counts,
      invalidPoints: scatter.invalidPoints,
      loo: data.model.validation.leaveOneFamilyOut,
    },
  );
  expect(checks.filter(({ pass }) => !pass)).toEqual([]);

  expect(() =>
    radarApi.buildRadar(
      browserSnapshot,
      data.model.lambda,
      { points: [], medianAgeDays: null },
      data.meta,
    ),
  ).toThrow(/implied value rounds to \$0/);
  expect(
    board.rows.some(({ farm_economics }) =>
      farm_economics.deposits.some(({ expectedValueUsd }) => expectedValueUsd > 0),
    ),
  ).toBe(true);

  const row = radar.board.find(({ protocol: { slug } }) =>
    radar.houseRule.falsePositives.some((entry) => entry.slug === slug),
  );
  if (!row) throw new Error("Expected a ranked board row.");
  expect(Object.keys(rows[0] ?? {})).toEqual([
    "slug",
    "name",
    "rank",
    "launch_value_usd",
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
    "plan_one_time_cost_usd",
    "plan_recurring_cost_usd",
    "plan_total_cost_usd",
    "plan_total_minutes",
    "airdrop_yield_apr",
    "farm_economics",
  ]);
  expect(rows.find(({ slug }) => slug === row.protocol.slug)).toMatchObject({
    category: row.protocol.category,
    chains: row.protocol.chains,
    tvl_usd: row.protocol.tvl_usd,
    change_7d: row.protocol.change_7d,
    listed_at: row.protocol.listed_at,
    status: row.status,
    board_reasons: row.boardReasons,
    flags: [...row.flags, "parent-protocol-likely", ...row.plan.flags],
    decomposition: row.decomposition,
    plan_chain: row.plan.chain,
    plan_one_time_cost_usd: row.plan.oneTimeCostUsd,
    plan_recurring_cost_usd: row.plan.recurringCostUsd,
    plan_total_cost_usd: row.plan.totalCostUsd,
    plan_total_minutes: row.plan.totalMinutes,
    airdrop_yield_apr: row.economics.airdropYieldApr,
    farm_economics: {
      launchProbability12: row.economics.launchProbability12,
      deposits: row.economics.deposits,
      breakEvenDepositUsd: row.economics.breakEvenDepositUsd,
    },
  });
}, 20_000);

test("preserves v3 airdrop EV where the clock window stays inside the fitted points", () => {
  const { board } = buildRadar(parseSnapshot(readKitSnapshot()));
  const row = board.find(({ protocol: { slug } }) => slug === "sentora-curator");
  expect(row?.economics.launchProbability12).toBe(0.20903935200201257);
  expect(row?.economics.deposits.map(({ expectedValueUsd }) => expectedValueUsd)).toEqual([
    1.001131156813365, 10.01131156813365,
  ]);
}, 20_000);

test.each([
  [0, 0],
  [0.0000001, 0],
  [0.5, 500_000],
  [1, 1_000_000],
])("publishes the exact rounded product or rejects it on a flat clock at %f", (share, implied) => {
  const as_of = "2024-02-28";
  const build = () =>
    radarApi.buildRadar(
      {
        as_of,
        source: "fixture",
        floor_usd: 100,
        watchlist: [],
        protocols: [
          protocol({ slug: "traded", mcap_usd: 1_000_000, gecko_id: "traded" }),
          protocol({ slug: "candidate", listed_at: as_of }),
        ],
      },
      1,
      { points: [0, 730].map((ageDays) => ({ ageDays, share, count: 1 })), medianAgeDays: 365 },
      farmTables(),
    );
  if (implied === 0) {
    expect(build).toThrow("candidate: implied value rounds to $0");
  } else {
    expect(build().board).toMatchObject([
      { launch_value_usd: 1_000_000, launchProbability12: share, implied_value_usd: implied },
    ]);
  }
});

test("fits a traded family once using its summed TVL, market cap and representative age", () => {
  const radar = buildRadar({
    as_of: "2024-03-17",
    source: "fixture",
    floor_usd: 100,
    protocols: [
      protocol({ slug: "z-member", gecko_id: "shared", tvl_usd: 30, mcap_usd: 100 }),
      protocol({ slug: "a-member", gecko_id: "shared", tvl_usd: 20, listed_at: "2024-03-01" }),
      protocol({ slug: "candidate", tvl_usd: 40 }),
    ],
    watchlist: [],
  });
  expect(radar.model.n).toBe(1);
  expect(radar.looScatter).toEqual([]);
  expect(radar.model.featureMeans).toEqual({ lnTvl: Math.log(50), lnAge: Math.log(16) });
  expect(radar.model.coefficients.intercept).toBeCloseTo(Math.log(100), 12);
  expect(radar.census[1]).toEqual({
    slug: "a-member",
    name: "Sample Protocol",
    category: null,
    tvl_usd: 20,
    status: "traded",
    reason: "The family records a positive market cap.",
    familyKey: "gecko:shared",
  });
});

test("stops before writing if parsing the snapshot fails", () => {
  const output = new MemoryOutput();
  const source: SnapshotSource = { load: () => null };
  const dossier: DossierBuilder = { build: () => new Uint8Array() };

  expect(() => runRadar(source, output, dossier)).toThrow("snapshot: expected an object");
  expect(output.events).toEqual([]);
});
