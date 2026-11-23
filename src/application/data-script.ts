import type { Snapshot } from "../domain/snapshot.ts";
import type { BoardRows } from "./board-rows.ts";
import type { RadarResult } from "./build-radar.ts";

export function renderDataScript(
  snapshot: Snapshot,
  board: BoardRows,
  { census, houseRule }: Pick<RadarResult, "census" | "houseRule">,
): string {
  const { as_of, floor_usd, source, protocols, watchlist } = snapshot;
  const scheme = /https?:\/\//gi;
  const data = {
    meta: { as_of, floor_usd, source: source.replace(scheme, "") },
    protocols,
    watchlist,
    census,
    houseRule,
    board,
  };
  // Preserve protocol and board strings when escaping any remaining URL literals.
  const json = JSON.stringify(data).replace(scheme, (match) => match.replaceAll("/", "\\u002f"));
  return `window.RADAR_DATA = ${json};\n`;
}
