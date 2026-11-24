import { mountPlanner } from "./planner.ts";
import { nearestComparables, protocolClock, protocolFacts } from "./protocol-extras.ts";

Object.assign(window.Radar, { mountPlanner, protocolFacts, protocolClock, nearestComparables });
