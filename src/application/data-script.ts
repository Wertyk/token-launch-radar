import type { Snapshot } from "../domain/snapshot.ts";
import type { BoardRows } from "./board-rows.ts";

export function renderDataScript(snapshot: Snapshot, board: BoardRows): string {
  const { as_of, floor_usd, source, protocols, watchlist } = snapshot;
  const scheme = /https?:\/\//gi;
  const data = {
    meta: { as_of, floor_usd, source: source.replace(scheme, "") },
    protocols,
    watchlist,
    board,
  };
  // Preserve protocol and board strings when escaping any remaining URL literals.
  const json = JSON.stringify(data).replace(scheme, (match) => match.replaceAll("/", "\\u002f"));
  return `window.RADAR_DATA = ${json};\n`;
}
