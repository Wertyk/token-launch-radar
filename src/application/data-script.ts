import type { FarmTables } from "../domain/farming/playbook-data.ts";
import type { Snapshot } from "../domain/snapshot.ts";
import type { BoardRows } from "./board-rows.ts";
import type { RadarResult } from "./build-radar.ts";

export function renderDataScript(
  snapshot: Snapshot,
  board: BoardRows,
  {
    census,
    model,
    rowDiagnostics,
    looScatter,
    odds,
  }: Pick<RadarResult, "census" | "model" | "rowDiagnostics" | "looScatter" | "odds">,
  tables: FarmTables,
): string {
  const { as_of, floor_usd, source, protocols, watchlist } = snapshot;
  const { coefficients: _, ...publishedModel } = model;
  const scheme = /https?:\/\//gi;
  const data = {
    meta: {
      as_of,
      floor_usd,
      source: source.replace(scheme, ""),
      protocolCount: protocols.length,
      ...tables,
    },
    protocols,
    watchlist,
    census,
    model: publishedModel,
    valueCoefficients: model.coefficients,
    looScatter,
    odds,
    board: {
      rows: board.rows.map((row) => {
        const diagnostics = rowDiagnostics.get(row.slug);
        if (!diagnostics) throw new Error(`Missing diagnostics for board row ${row.slug}.`);
        return { ...row, ...diagnostics, launch_p12: row.farm_economics.launchProbability12 };
      }),
    },
  };
  // Preserve protocol and board strings when escaping any remaining URL literals.
  const json = JSON.stringify(data).replace(scheme, (match) => match.replaceAll("/", "\\u002f"));
  return `window.RADAR_DATA = ${json};\n`;
}
