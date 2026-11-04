import { deepFreeze } from "../../state.ts";
import type { Position } from "../../control/ground-reading.ts";
import type { TechniqueConfig, TechniquePart } from "./technique.ts";
import type { PartLookup } from "../../parts/lookup.ts";

/**
 * **The game's Stand up**: the ways up a body rises by on its toes, in player order: the roll onto
 * its front, then down onto hands and knees and the sit-back, or the sit-back from the front, the
 * route each body takes priced by its edges' profiles.
 */
export const STAND_UP: readonly TechniqueConfig[] = deepFreeze([{ kind: "staged-roll" }, { kind: "staged-down" }, { kind: "sit-back" }, { kind: "front-sit-back" }]);

/** The techniques a stand-up repositions the body by where no way up stands it: onto its back from its front, else onto its front. */
export const REPOSITION: readonly TechniqueConfig[] = deepFreeze([{ kind: "roll" }, { kind: "roll-back" }]);

/**
 * Whether the edges of `ways` (`TechniquePart.edges`), each begun on a side it has, take a body at
 * `from` to standing, whatever their entries will read of it.
 */
function reachable(ways: readonly Pick<TechniquePart, "sides" | "edges">[], from: Position): boolean {
  const seen = new Set<Position>([from]), open = [from];
  for (let at = open.pop(); at !== undefined; at = open.pop()) {
    if (at === "standing") return true;
    for (const way of ways) {
      if (way.sides.length > 0) for (const edge of way.edges) if (edge.from === at && !seen.has(edge.to)) { seen.add(edge.to); open.push(edge.to); }
    }
  }
  return false;
}

/** What is wrong with `techniques` as a route up, each a sentence: a technique twice, or no route to standing from the back or the front. */
export function standUpFaults(techniques: readonly TechniqueConfig[], parts: PartLookup): readonly string[] {
  const order = techniques.map((technique) => technique.kind);
  if (new Set(order).size !== order.length) return ["a technique may appear only once"];
  const ways = techniques.map((technique) => parts.of("technique", technique));
  return (["back", "front"] as const).filter(from => !reachable(ways, from)).map(from => `no route to standing from ${from}`);
}
