import { cos, hypot, sin } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { blocks, occupies, SWEEP } from "./clear-step.ts";
import type { GroundPoint } from "./movement.ts";
import type { SolidSense } from "./object-senses.ts";

/** How far outside a solid's clearance margin a route's corner is set, m: a route preference, not anatomy. */
const CORNER = .04;

/** Any solid above the supporting floor can obstruct the feet, even when it is below the trunk. */
function obstructs(solid: SolidSense, height: number, floor: number): boolean {
  switch (solid.kind) {
    case "box": return solid.centre[1] + solid.size[1] / 2 > floor + .02 && solid.centre[1] - solid.size[1] / 2 < 2 * height - floor;
    case "hull": {
      let low = Infinity, high = -Infinity;
      for (const point of solid.points) { low = Math.min(low, point[1]); high = Math.max(high, point[1]); }
      return high > floor + .02 && low < 2 * height - floor;
    }
    default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
  }
}

/** A solid's footprint: the solid at `height`, 2 m tall where it is a box. */
function footprint(solid: SolidSense, height: number): SolidSense {
  switch (solid.kind) {
    case "box": return { ...solid, centre: [solid.centre[0], height, solid.centre[2]], size: [solid.size[0], 2, solid.size[2]] };
    case "hull": return { ...solid, points: solid.points.map(p => [p[0], height, p[2]] as Vec3) };
    default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
  }
}

export function footprints(solids: readonly SolidSense[], height: number, floor = 0): readonly SolidSense[] {
  const result: SolidSense[] = [];
  for (const solid of solids) if (obstructs(solid, height, floor)) result.push(footprint(solid, height));
  return result;
}

/** No solid sensed. */
export const NO_SOLIDS: readonly SolidSense[] = Object.freeze([]);

/**
 * `footprints` in objects made once for each solid of the array sensed and moved to each call's
 * height in place: what it gives is read before the next call, and nothing keeps it.
 */
export function footprinter() {
  let source: readonly SolidSense[] | null = null, made: readonly SolidSense[] = [];
  const result: SolidSense[] = [];
  return (solids: readonly SolidSense[], height: number, floor = 0): readonly SolidSense[] => {
    if (solids !== source) { source = solids; made = solids.map(solid => footprint(solid, height)); }
    result.length = 0;
    for (let i = 0; i < solids.length; i++) {
      if (!obstructs(solids[i]!, height, floor)) continue;
      const print = made[i]!;
      switch (print.kind) {
        case "box": (print.centre as [number, number, number])[1] = height; break;
        case "hull": for (const point of print.points) (point as [number, number, number])[1] = height; break;
        default: { const never: never = print; throw new Error(`unknown sensed solid ${never}`); }
      }
      result.push(print);
    }
    return result;
  };
}

/**
 * How far past a solid's clearance margin its world bounds reach (`createRouter`), m: more than
 * the rounding of any test against the solid, so a sweep or a point outside them is outside the
 * margin as the test reads it too.
 */
const BOUNDS_SLACK = 1e-6;

/** A route search's working arrays, grown as a search needs and reused by the next. */
interface RouteWork {
  /** A sweep's work (`blocks`, `occupies`). */
  readonly w: Float64Array;
  /** Each solid's world bounds about its clearance margin, `BOUNDS_SLACK` wider: least x, most x, least z, most z. */
  bounds: Float64Array;
  /** The search's points (from, goal, then each open corner), x and z. */
  x: Float64Array;
  z: Float64Array;
  distances: Float64Array;
  estimates: Float64Array;
  previous: Int32Array;
  done: Uint8Array;
  /** Whether the sweep from one point to another is clear of every solid: 0 not yet asked, 1 clear, 2 blocked; a row a point. */
  sight: Uint8Array;
}

/** `array`, or where it is shorter than `length` a longer one that starts with it. */
function grown<T extends Float64Array | Int32Array | Uint8Array>(array: T, length: number, make: (length: number) => T): T {
  if (array.length >= length) return array;
  const longer = make(Math.max(length, 2 * array.length));
  longer.set(array);
  return longer;
}

/**
 * **A deterministic shortest visibility route** among `solids` for a body of clearance `radius`:
 * from where it is made `ready`, to each goal asked of it (`route`). Readying finds what every
 * route from there shares, the solids' footprints and their world bounds; the first search that
 * needs them finds the open corners, and what one search learns of whether a point sees another
 * the next reuses. Every route is the one a search of its own finds; nothing carries from one
 * `ready` to the next.
 */
export function createRouter() {
  const work: RouteWork = { w: new Float64Array(SWEEP), bounds: new Float64Array(64), x: new Float64Array(64), z: new Float64Array(64),
    distances: new Float64Array(64), estimates: new Float64Array(64), previous: new Int32Array(64), done: new Uint8Array(64), sight: new Uint8Array(256) };
  let solids: readonly SolidSense[] = NO_SOLIDS, radius = 0, height = 0, fromX = 0, fromZ = 0, count = -1;
  /** Whether a body at (`x`, `z`) is clear of every solid's clearance margin (`clearanceExit`). */
  const open = (x: number, z: number): boolean => {
    const { w, bounds } = work;
    for (let i = 0; i < solids.length; i++) {
      if (x < bounds[4 * i]! || x > bounds[4 * i + 1]! || z < bounds[4 * i + 2]! || z > bounds[4 * i + 3]!) continue;
      if (occupies(w, solids[i]!, x, height, z, radius)) return false;
    }
    return true;
  };
  /** Whether the sweep from (`ax`, `az`) to (`bx`, `bz`) is clear of every solid (`clearStep`). */
  const clear = (ax: number, az: number, bx: number, bz: number): boolean => {
    const { w, bounds } = work, lowX = Math.min(ax, bx), highX = Math.max(ax, bx), lowZ = Math.min(az, bz), highZ = Math.max(az, bz);
    for (let i = 0; i < solids.length; i++) {
      if (highX < bounds[4 * i]! || lowX > bounds[4 * i + 1]! || highZ < bounds[4 * i + 2]! || lowZ > bounds[4 * i + 3]!) continue;
      if (blocks(w, solids[i]!, ax, height, az, bx, height, bz, radius)) return false;
    }
    return true;
  };
  /** The search's points: from, the goal's place, then the corners of the inflated footprints that are open, hulls enclosed by their world bounds. */
  const corners = (): void => {
    count = 2;
    for (const solid of solids) {
      let x: number, z: number, hx: number, hz: number, low: number, high: number, turn = 0;
      switch (solid.kind) {
        case "box":
          [x, , z] = solid.centre; hx = solid.size[0] / 2; hz = solid.size[2] / 2;
          low = solid.centre[1] - solid.size[1] / 2; high = solid.centre[1] + solid.size[1] / 2; turn = solid.turn ?? 0;
          break;
        case "hull": {
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          low = Infinity; high = -Infinity;
          for (const p of solid.points) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); low = Math.min(low, p[1]); high = Math.max(high, p[1]); }
          x = (minX + maxX) / 2; z = (minZ + maxZ) / 2; hx = (maxX - minX) / 2; hz = (maxZ - minZ) / 2;
          break;
        }
        default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
      }
      if (high <= height - radius || low >= height + radius) continue;
      hx += radius + CORNER; hz += radius + CORNER;
      const c = cos(turn), s = sin(turn);
      for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
        const cx = x + c * hx * sx + s * hz * sz, cz = z - s * hx * sx + c * hz * sz;
        if (!open(cx, cz)) continue;
        work.x = grown(work.x, count + 1, (n) => new Float64Array(n)); work.z = grown(work.z, count + 1, (n) => new Float64Array(n));
        work.x[count] = cx; work.z[count] = cz; count++;
      }
    }
    work.x[0] = fromX; work.z[0] = fromZ;
    work.distances = grown(work.distances, count, (n) => new Float64Array(n)); work.estimates = grown(work.estimates, count, (n) => new Float64Array(n));
    work.previous = grown(work.previous, count, (n) => new Int32Array(n)); work.done = grown(work.done, count, (n) => new Uint8Array(n));
    work.sight = grown(work.sight, count * count, (n) => new Uint8Array(n));
    work.sight.fill(0, 0, count * count);
  };
  return {
    /** Ready to search from `from` among `among`, made footprints at `at` where they obstruct there, for a body of clearance `clearance`. */
    ready(from: GroundPoint, among: readonly SolidSense[], clearance: number, at: number): void {
      if (!(clearance >= 0) || !Number.isFinite(clearance)) throw new Error("invalid body clearance radius");
      solids = footprints(among, at); radius = clearance; height = at; fromX = from.x; fromZ = from.z; count = -1;
      work.bounds = grown(work.bounds, 4 * solids.length, (n) => new Float64Array(n));
      const bounds = work.bounds, reach = radius + BOUNDS_SLACK;
      for (let i = 0; i < solids.length; i++) {
        const solid = solids[i]!;
        switch (solid.kind) {
          case "box": {
            const c = Math.abs(cos(solid.turn ?? 0)), s = Math.abs(sin(solid.turn ?? 0)), hx = solid.size[0] / 2 + radius, hz = solid.size[2] / 2 + radius;
            const ex = c * hx + s * hz + BOUNDS_SLACK, ez = s * hx + c * hz + BOUNDS_SLACK;
            bounds[4 * i] = solid.centre[0] - ex; bounds[4 * i + 1] = solid.centre[0] + ex; bounds[4 * i + 2] = solid.centre[2] - ez; bounds[4 * i + 3] = solid.centre[2] + ez;
            break;
          }
          case "hull": {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const p of solid.points) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); }
            bounds[4 * i] = minX - reach; bounds[4 * i + 1] = maxX + reach; bounds[4 * i + 2] = minZ - reach; bounds[4 * i + 3] = maxZ + reach;
            break;
          }
          default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
        }
      }
    },
    /** The route from where it was readied to `goal`; empty where the permitted geometry blocks it. */
    route(goal: GroundPoint): readonly GroundPoint[] {
      if (!open(goal.x, goal.z)) return [];
      if (clear(fromX, fromZ, goal.x, goal.z)) return [{ ...goal }];
      if (count < 0) corners();
      const { x, z, distances, estimates, previous, done, sight } = work;
      x[1] = goal.x; z[1] = goal.z;
      for (let i = 0; i < count; i++) { distances[i] = Infinity; previous[i] = -1; done[i] = 0; estimates[i] = hypot(x[i]! - goal.x, z[i]! - goal.z); }
      distances[0] = 0;
      for (let step = 0; step < count; step++) {
        let next = -1;
        for (let i = 0; i < count; i++) if (!done[i] && (next < 0 || distances[i]! + estimates[i]! < distances[next]! + estimates[next]!)) next = i;
        if (next < 0 || distances[next] === Infinity) break;
        if (next === 1) {
          const route: GroundPoint[] = [];
          for (let i = 1; i !== 0; i = previous[i]!) route.push(i === 1 ? { ...goal } : { x: x[i]!, z: z[i]! });
          return route.reverse();
        }
        done[next] = 1;
        for (let i = 1; i < count; i++) if (!done[i] && i !== next) {
          const distance = distances[next]! + hypot(x[next]! - x[i]!, z[next]! - z[i]!);
          if (!(distance < distances[i]!)) continue;
          // Whether a corner sees another is the same for every goal; whether it sees the goal is asked afresh.
          let seen: boolean;
          if (i === 1) seen = clear(x[next]!, z[next]!, x[i]!, z[i]!);
          else {
            const k = next * count + i;
            if (!sight[k]) sight[k] = clear(x[next]!, z[next]!, x[i]!, z[i]!) ? 1 : 2;
            seen = sight[k] === 1;
          }
          if (seen) { distances[i] = distance; previous[i] = next; }
        }
      }
      return [];
    },
  };
}

/** A deterministic shortest visibility route; an empty result means the permitted geometry blocks it. */
export function navigationPath(from: GroundPoint, goal: GroundPoint, solids: readonly SolidSense[], radius: number, height = 1): readonly GroundPoint[] {
  const router = createRouter();
  router.ready(from, solids, radius, height);
  return router.route(goal);
}
