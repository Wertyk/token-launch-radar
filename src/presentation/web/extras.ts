import { bindControls, boardControls } from "./controls.ts";
import { mountPlanner } from "./planner.ts";
import { boardHash } from "./state.ts";

window.Radar = Object.assign(window.Radar ?? {}, {
  bindControls,
  boardControls,
  mountPlanner,
  boardHash,
}) as Window["Radar"];
