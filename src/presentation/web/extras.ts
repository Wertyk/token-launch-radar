import { bindControls } from "./controls.ts";
import { methodFarmAssumptions } from "./method-view.ts";
import { mountPlanner } from "./planner.ts";
import { nearestComparables, protocolClock, protocolFacts } from "./protocol-extras.ts";

Object.assign(window.Radar, {
  bindControls,
  methodFarmAssumptions,
  mountPlanner,
  protocolFacts,
  protocolClock,
  nearestComparables,
});
