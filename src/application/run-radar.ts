import { parseSnapshot } from "../domain/snapshot.ts";
import { toBoardRows } from "./board-rows.ts";
import { buildRadar } from "./build-radar.ts";
import { renderDataScript } from "./data-script.ts";
import type { DossierBuilder, OutputSink, SnapshotSource } from "./ports.ts";

export interface RadarSummary {
  rowCount: number;
  watchlistCovered: number;
  files: string[];
}

export function runRadar(
  source: SnapshotSource,
  output: OutputSink,
  dossier: DossierBuilder,
): RadarSummary {
  const snapshot = parseSnapshot(source.load());
  const radar = buildRadar(snapshot);
  const board = toBoardRows(radar);
  output.write("board.json", `${JSON.stringify(board)}\n`);
  output.write("data.js", renderDataScript(snapshot, board, radar));
  const assets = output.publishAssets();
  output.write("dossier.json", dossier.build());

  const slugs = new Set(board.rows.map(({ slug }) => slug));
  const watchlistCovered = new Set(snapshot.watchlist.filter((slug) => slugs.has(slug))).size;
  return {
    rowCount: board.rows.length,
    watchlistCovered,
    files: ["board.json", "data.js", ...assets, "dossier.json"],
  };
}
