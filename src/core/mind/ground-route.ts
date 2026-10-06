import { hypot } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { BodySense } from "./senses.ts";
import { sensedBounds, sensedFootClearance } from "./sensed-bounds.ts";

/** Corner separation for the visibility graph: `docs/reference/ground-combat.md#policy-settings`. */
const ROUTE_MARGIN = .02;

/** Bounded visibility search around the observed body's envelope; every edge checks its actual colliders. */
export function groundRoute(foe: BodySense, from: Vec3, to: Vec3, radius: number): readonly Vec3[] | null {
  const clear = sensedFootClearance(foe);
  if (!clear(to, to, radius)) return null;
  if (clear(from, to, radius)) return [to];
  const margin = ROUTE_MARGIN;
  const bounds = sensedBounds(foe), low = [Infinity, Infinity], high = [-Infinity, -Infinity];
  for (const b of bounds) {
    if (b.kind !== "box") throw new Error("collider bounds must be boxes");
    for (const [i, k] of [[0, 0], [1, 2]] as const) {
      low[i] = Math.min(low[i]!, b.centre[k] - b.size[k] / 2 - radius - margin);
      high[i] = Math.max(high[i]!, b.centre[k] + b.size[k] / 2 + radius + margin);
    }
  }
  const nodes: Vec3[] = [from, to];
  for (const x of [low[0]!, high[0]!]) for (const z of [low[1]!, high[1]!]) nodes.push([x, from[1], z]);
  const distance = nodes.map(() => Infinity), previous = nodes.map(() => -1), done = nodes.map(() => false);
  distance[0] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let next = -1;
    for (let k = 0; k < nodes.length; k++) if (!done[k] && (next < 0 || distance[k]! < distance[next]!)) next = k;
    if (next < 0 || !Number.isFinite(distance[next]!)) return null;
    if (next === 1) {
      const path: Vec3[] = [];
      for (let k = 1; k !== 0; k = previous[k]!) path.unshift(nodes[k]!);
      return path;
    }
    done[next] = true;
    for (let k = 0; k < nodes.length; k++) if (!done[k]) {
      const a = nodes[next]!, b = nodes[k]!;
      if (!clear(a, b, radius)) continue;
      const cost = distance[next]! + hypot(a[0] - b[0], a[2] - b[2]);
      if (cost < distance[k]!) { distance[k] = cost; previous[k] = next; }
    }
  }
  return null;
}
