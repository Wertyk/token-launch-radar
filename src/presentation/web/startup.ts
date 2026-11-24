import type * as BrowserApi from "../../application/browser-api.ts";
import type { RadarResult } from "../../application/build-radar.ts";
import type { FarmTables } from "../../domain/farming/playbook-data.ts";
import type { Snapshot } from "../../domain/snapshot.ts";
import type { ValueDiagnostics } from "../../domain/valuation/diagnostics.ts";

type PublishedRow = BrowserApi.BoardRows["rows"][number] &
  ValueDiagnostics & { launch_p12: number };

export interface RadarData
  extends BrowserApi.PublishedSnapshot,
    Pick<RadarResult, "launchClock" | "census" | "looScatter"> {
  model: Omit<RadarResult["model"], "coefficients">;
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
    const { RADAR_DATA: publishedData, Radar: core } = window;
    const input = publishedData && core.readPublishedSnapshot(publishedData);
    const validation = publishedData?.model?.validation;
    if (
      !publishedData ||
      !input ||
      !Array.isArray(publishedData.board?.rows) ||
      !Array.isArray(publishedData.launchClock?.points) ||
      !publishedData.model?.ablation?.full ||
      [validation?.leaveOneFamilyOut, validation?.seededFiveFold, validation?.walkForward].some(
        (scheme) => !scheme?.model || !scheme.flatMultiple || !scheme.categoryMultiple,
      ) ||
      !Array.isArray(publishedData.census) ||
      publishedData.census.length !== input.protocols.length
    )
      throw new Error("Incomplete snapshot");
    start(root, input, publishedData, core, fail);
  } catch {
    fail();
  }
}
