import type * as BrowserApi from "../../application/browser-api.ts";
import type { RadarResult } from "../../application/build-radar.ts";
import type { FarmTables } from "../../domain/farming/playbook-data.ts";
import type { Snapshot } from "../../domain/snapshot.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";

type PublishedRow = BrowserApi.BoardRows["rows"][number] &
  ValueDiagnostics & { launch_p12: number };

export interface RadarData
  extends BrowserApi.PublishedSnapshot,
    Pick<RadarResult, "odds" | "census" | "looScatter" | "rangeHonesty" | "bootstrap" | "placebo"> {
  model: Omit<RadarResult["model"], "coefficients">;
  valueCoefficients: RadarResult["model"]["coefficients"];
  meta: BrowserApi.PublishedSnapshot["meta"] & FarmTables;
  board: { rows: (PublishedRow | null)[] };
}

export function boot(
  start: (
    root: HTMLElement,
    input: Snapshot,
    data: RadarData,
    api: Window["Radar"],
    fail: () => void,
  ) => void,
): void {
  const root = document.querySelector("main");
  if (!root) return;
  const fallback = root.innerHTML;
  const fail = () => {
    delete root.dataset.ready;
    root.innerHTML = fallback;
  };
  try {
    const { RADAR_DATA: data, Radar } = window;
    const input = data && Radar.readPublishedSnapshot(data);
    if (!data || !input) throw new Error("Missing snapshot");
    const { board, census, model, odds } = data;
    const validation = model?.validation;
    if (
      ![
        board?.rows,
        odds?.terms,
        odds?.validation?.steps,
        model?.fit?.terms,
        model?.selection?.steps,
        census,
      ].every(Array.isArray) ||
      census.length !== input.protocols.length ||
      [validation?.leaveOneFamilyOut, validation?.seededFiveFold, validation?.walkForward].some(
        (scheme) => !scheme?.model || !scheme.flatMultiple || !scheme.categoryMultiple,
      )
    )
      throw new Error("Incomplete snapshot");
    start(root, input, data, Radar, fail);
  } catch {
    fail();
  }
}
