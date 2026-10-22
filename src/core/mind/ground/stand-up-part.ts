import { deepFreeze } from "../../state.ts";
import { STAND_UP } from "../config.ts";
import { fitsAll, takesCommands } from "../parts.ts";
import type { SubMindPart } from "../sub-mind-part.ts";
import { graphWork, reachable } from "./graph.ts";
import { standUp, type StandUpConfig } from "./stand-up.ts";
import { TECHNIQUES, type TechniqueName } from "./techniques.ts";

/**
 * **Stand up** (`standUp`): its techniques in rank order, each with physical admission and
 * completion (`TECHNIQUES`); it fits a body every technique it lists fits, and reads the learned
 * rise's network where it lists the learned rise.
 */
export const STAND_UP_PART: SubMindPart<StandUpConfig> = deepFreeze({
  role: "sub-mind", label: "Stand up", stage: "game", fields: [], slots: [], defaults: STAND_UP, keys: { kind: true, techniques: true },
  fits: fitsAll<StandUpConfig>(takesCommands, (spec, config) => {
    if (!Array.isArray(config.techniques)) return "its techniques are no list";
    const unfit: TechniqueName | undefined = config.techniques.find((name: TechniqueName) => !TECHNIQUES[name]?.fits(spec));
    return unfit === undefined ? null : `${TECHNIQUES[unfit]?.label ?? JSON.stringify(unfit)} does not fit it`;
  }),
  faults: (config) => {
    if (!Array.isArray(config.techniques)) return ["techniques must be a ranked list"];
    if (config.techniques.some(name => !Object.hasOwn(TECHNIQUES, name))) return ["unknown technique"];
    if (new Set(config.techniques).size !== config.techniques.length) return ["a technique may appear only once"];
    const graph = Object.fromEntries(Object.entries(TECHNIQUES).map(([name, spec]) => [name, { ...spec, admits: () => true }]));
    return (["back", "front"] as const).filter(from => !reachable(config.techniques, from, graph, graphWork())).map(from => `no route to standing from ${from}`);
  },
  reads: (config) => config.techniques.includes("learned-rise") ? ["learned-rise"] : [],
  make: (own, view, config, kit, clock) => standUp(own, view, clock, config, kit),
});
