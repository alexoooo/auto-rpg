import type { Position } from "../../control/ground-reading.ts";
import type { TechniquePart } from "./technique.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { PartLookup } from "../../parts/lookup.ts";

/**
 * Whether the edges of `ways` (`TechniquePart.edges`), each with a declared start, take a body at
 * `from` to standing, whatever their entries will read of it.
 */
function reachable(ways: readonly Pick<TechniquePart, "starts" | "edges">[], from: Position): boolean {
  const seen = new Set<Position>([from]), open = [from];
  for (let at = open.pop(); at !== undefined; at = open.pop()) {
    if (at === "standing") return true;
    for (const way of ways) {
      if (way.starts.length > 0) for (const edge of way.edges) if (edge.from === at && !seen.has(edge.to)) { seen.add(edge.to); open.push(edge.to); }
    }
  }
  return false;
}

/** What is wrong with `techniques` as a route up, each a sentence: a technique twice, or no route to standing from the back or the front. */
export function standUpFaults(techniques: readonly PartConfig[], parts: PartLookup): readonly string[] {
  const order = techniques.map((technique) => technique.kind);
  if (new Set(order).size !== order.length) return ["a technique may appear only once"];
  const ways = techniques.map((technique) => parts.of("technique", technique));
  return (["back", "front"] as const).filter(from => !reachable(ways, from)).map(from => `no route to standing from ${from}`);
}
