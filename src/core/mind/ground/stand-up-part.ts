import { deepFreeze } from "../../state.ts";
import { STAND_UP } from "../config.ts";
import { fitsSoles } from "../../control/stance-balance.ts";
import { slotList } from "../parts.ts";
import type { SubMindPart } from "../sub-mind-part.ts";
import { graphWork, reachable } from "./graph.ts";
import { standUp, type StandUpConfig } from "./stand-up.ts";

/**
 * **Stand up** (`standUp`): its techniques in rank order, each with physical admission and
 * completion (`TechniquePart`), each a part of its list; a body its techniques fit, it fits.
 */
export const STAND_UP_PART: SubMindPart<StandUpConfig> = deepFreeze({
  role: "sub-mind", label: "Stand up", stage: "game", fields: [], slots: [slotList("techniques", "Techniques", "technique")], defaults: STAND_UP,
  keys: { kind: true, techniques: true }, fits: fitsSoles, down: { name: "get up", seconds: 5, stands: .7, shelter: 0 },
  faults: (config, parts) => {
    const order = config.techniques.map((technique) => technique.kind);
    if (new Set(order).size !== order.length) return ["a technique may appear only once"];
    const graph = Object.fromEntries(config.techniques.map((technique) => {
      const { sides, edges } = parts.of("technique", technique);
      return [technique.kind, { sides, edges, admits: () => true }];
    }));
    return (["back", "front"] as const).filter(from => !reachable(order, from, graph, graphWork())).map(from => `no route to standing from ${from}`);
  },
  make: (own, view, config, kit, clock) => standUp(own, view, clock, config, kit),
});
