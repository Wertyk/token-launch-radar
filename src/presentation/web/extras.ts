import { bindControls, boardControls } from "./controls.ts";
import { methodNotes } from "./method-extras.ts";
import { mountPlanner } from "./planner.ts";
import { nearestComparables, protocolClock, protocolFacts } from "./protocol-extras.ts";
import { boardHash } from "./state.ts";

window.Radar = Object.assign(window.Radar ?? {}, {
  bindControls,
  boardControls,
  methodNotes,
  mountPlanner,
  protocolFacts,
  protocolClock,
  nearestComparables,
  boardHash,
}) as Window["Radar"];
