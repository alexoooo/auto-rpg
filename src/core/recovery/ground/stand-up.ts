import { deepFreeze } from "../../state.ts";
import { graphWork, reachable } from "./graph.ts";
import type { TechniqueConfig, TechniquePart } from "./technique.ts";
import type { PartLookup } from "../../parts/lookup.ts";

/** Preferred contracts for recovering the feet, in player order. */
export interface StandUpConfig { readonly kind: "stand-up"; readonly techniques: readonly TechniqueConfig[] }

/**
 * **The game's Stand up**: the edges a body rises by on its toes
 * (`docs/reference/rising.md#the-sit-back`): the roll onto its front, then down onto hands and
 * knees and the sit-back, or the sit-back from the front, the route each body takes priced by its
 * edges' profiles.
 */
export const STAND_UP: StandUpConfig = deepFreeze({ kind: "stand-up", techniques: [{ kind: "staged-roll" }, { kind: "staged-down" }, { kind: "sit-back" }, { kind: "front-sit-back" }] });

/** The techniques a stand-up repositions the body by where no route stands it up: onto its back from its front, else onto its front. */
export const REPOSITION = deepFreeze([{ kind: "roll" }, { kind: "roll-back" }]);

/** The techniques `config` routes through and those it repositions by, by kind, as `parts` finds them. */
export const techniquesOf = (parts: PartLookup, config: StandUpConfig): Readonly<Record<string, TechniquePart>> =>
  Object.fromEntries([...config.techniques, ...REPOSITION].map((technique) => [technique.kind, parts.of("technique", technique)]));

/** What is wrong with `techniques` as a route up, each a sentence: a technique twice, or no route to standing from the back or the front. */
export function standUpFaults(techniques: readonly TechniqueConfig[], parts: PartLookup): readonly string[] {
  const order = techniques.map((technique) => technique.kind);
  if (new Set(order).size !== order.length) return ["a technique may appear only once"];
  const graph = Object.fromEntries(techniques.map((technique) => {
    const { sides, edges, moving } = parts.of("technique", technique);
    return [technique.kind, { sides, edges, raw: moving, profile: null, admits: () => true }];
  }));
  return (["back", "front"] as const).filter(from => !reachable(order, from, graph, graphWork())).map(from => `no route to standing from ${from}`);
}
