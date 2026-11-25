import { selectRows } from "./board.ts";
import { bindControls, boardControls } from "./controls.ts";
import { methodNotes, termTrials } from "./method-extras.ts";
import { mountPlanner } from "./planner.ts";
import { nearestComparables, protocolClock, protocolFacts } from "./protocol-extras.ts";
import { boardHash, readBoardState } from "./state.ts";

Object.assign(window.Radar, {
  bindControls,
  boardControls,
  selectRows,
  methodNotes,
  termTrials,
  mountPlanner,
  protocolFacts,
  protocolClock,
  nearestComparables,
  boardHash,
  readBoardState,
});
