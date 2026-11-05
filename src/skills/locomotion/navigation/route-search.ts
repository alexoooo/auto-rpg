import { cos, hypot, sin } from "../../../core/math/real.ts";
import { blocks, occupies, SWEEP, footprints, NO_SOLIDS } from "./clear-step.ts";
import type { GroundPoint } from "../../intent/movement.ts";
import type { SolidSense } from "../../../core/bodies/object-senses.ts";

/** How far outside a solid's clearance margin a route's corner is set, m: a route preference, not anatomy. */
const CORNER = .04;

/**
 * How far past a solid's clearance margin its world bounds reach (`createRouter`), m: more than
 * the rounding of any test against the solid, so a sweep or a point outside them is outside the
 * margin as the test reads it too.
 */
const BOUNDS_SLACK = 1e-6;

/**
 * How far a sweep's cells reach past the sweep (`createRouter`), m: more than the rounding of where
 * the sweep crosses a cell's edge and less than `BOUNDS_SLACK`, so a solid whose bounds the sweep
 * crosses is in a cell it reaches, and one in none it reaches is one it passes outside the margin.
 */
const CELL_REACH = 1e-7;

/** The side of a cell of the solids' grid (`createRouter`), m, and the most cells along a side: a search's cost, not geometry. */
const GRID = Object.freeze({ cell: 2, most: 64 });

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
  /** The solids in each cell of the grid, by index: `cells` a cell's start in `members` and, one on, its end; a cell's row along x a column of cells along z. */
  cells: Int32Array;
  members: Int32Array;
  /** The sweep each solid was last asked of, so a sweep asks each once. */
  asked: Int32Array;
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
    distances: new Float64Array(64), estimates: new Float64Array(64), previous: new Int32Array(64), done: new Uint8Array(64), sight: new Uint8Array(256),
    cells: new Int32Array(64), members: new Int32Array(64), asked: new Int32Array(64) };
  let solids: readonly SolidSense[] = NO_SOLIDS, radius = 0, height = 0, fromX = 0, fromZ = 0, count = -1;
  // The grid: its least x and z, its cell's side, its cells along x and along z; and the sweeps asked of it.
  let gridX = 0, gridZ = 0, side: number = GRID.cell, alongX = 0, alongZ = 0, sweeps = 0;
  // The solid that last blocked a sweep, and where that sweep began; -1 for none since readied.
  let blocker = -1, blockedX = 0, blockedZ = 0;
  /** The grid's column (along x) or row (along z) at `at`, from `low`, of `cells`, held to the grid. */
  const cellAt = (at: number, low: number, cells: number): number => Math.min(cells - 1, Math.max(0, Math.floor((at - low) / side)));
  /** Put each solid in each cell its bounds reach. */
  const grid = (): void => {
    const { bounds } = work, n = solids.length;
    if (n === 0) { alongX = alongZ = 0; return; }
    let lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity;
    for (let i = 0; i < n; i++) {
      lowX = Math.min(lowX, bounds[4 * i]!); highX = Math.max(highX, bounds[4 * i + 1]!); lowZ = Math.min(lowZ, bounds[4 * i + 2]!); highZ = Math.max(highZ, bounds[4 * i + 3]!);
    }
    gridX = lowX; gridZ = lowZ; side = Math.max(GRID.cell, (highX - lowX) / GRID.most, (highZ - lowZ) / GRID.most);
    alongX = Math.floor((highX - lowX) / side) + 1; alongZ = Math.floor((highZ - lowZ) / side) + 1;
    const all = alongX * alongZ, cells = work.cells = grown(work.cells, all + 1, (k) => new Int32Array(k));
    cells.fill(0, 0, all + 1);
    // Counted into the next cell's place and summed, each cell's place holds its start; filling a cell moves its place to its end, the next cell's start, so the places are moved back one.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const x0 = cellAt(bounds[4 * i]!, gridX, alongX), x1 = cellAt(bounds[4 * i + 1]!, gridX, alongX), z0 = cellAt(bounds[4 * i + 2]!, gridZ, alongZ), z1 = cellAt(bounds[4 * i + 3]!, gridZ, alongZ);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
          const cell = cx * alongZ + cz;
          if (pass === 0) cells[cell + 1]!++;
          else work.members[cells[cell]!++] = i;
        }
      }
      if (pass === 0) {
        for (let cell = 0; cell < all; cell++) cells[cell + 1]! += cells[cell]!;
        work.members = grown(work.members, cells[all]!, (k) => new Int32Array(k));
      }
    }
    for (let cell = all; cell > 0; cell--) cells[cell] = cells[cell - 1]!;
    cells[0] = 0;
    work.asked = grown(work.asked, n, (k) => new Int32Array(k));
    work.asked.fill(0, 0, n);
    sweeps = 0; blocker = -1;
  };
  /** Whether a body at (`x`, `z`) is clear of every solid's clearance margin (`clearanceExit`): its cell holds every solid whose bounds hold it. */
  const open = (x: number, z: number): boolean => {
    if (alongX === 0) return true;
    const { w, bounds, cells, members } = work, cell = cellAt(x, gridX, alongX) * alongZ + cellAt(z, gridZ, alongZ);
    for (let k = cells[cell]!; k < cells[cell + 1]!; k++) {
      const i = members[k]!;
      if (x < bounds[4 * i]! || x > bounds[4 * i + 1]! || z < bounds[4 * i + 2]! || z > bounds[4 * i + 3]!) continue;
      if (occupies(w, solids[i]!, x, height, z, radius)) return false;
    }
    return true;
  };
  /**
   * Whether the sweep from (`ax`, `az`) to (`bx`, `bz`) is clear of every solid (`clearStep`): of
   * the solids in the cells it crosses, `CELL_REACH` wider, from its start. A solid in none of them
   * has bounds the sweep passes outside, so it does not block it. A search asks the sweeps from one
   * point together, so the solid that blocked the last from the same point is asked first.
   */
  const clear = (ax: number, az: number, bx: number, bz: number): boolean => {
    if (alongX === 0) return true;
    const { w, bounds, cells, members, asked } = work, lowX = Math.min(ax, bx), highX = Math.max(ax, bx), lowZ = Math.min(az, bz), highZ = Math.max(az, bz);
    if (blocker >= 0 && ax === blockedX && az === blockedZ) {
      const i = blocker;
      if (!(highX < bounds[4 * i]! || lowX > bounds[4 * i + 1]! || highZ < bounds[4 * i + 2]! || lowZ > bounds[4 * i + 3]!) && blocks(w, solids[i]!, ax, height, az, bx, height, bz, radius)) return false;
    }
    sweeps++;
    // Stepped a cell at a time along the axis it goes further along, so where it crosses a cell's edge moves at most as far across.
    const byZ = Math.abs(bz - az) > Math.abs(bx - ax);
    const a = byZ ? az : ax, b = byZ ? bz : bx, across = byZ ? ax : az, acrossEnd = byZ ? bx : bz;
    const low = byZ ? gridZ : gridX, lowAcross = byZ ? gridX : gridZ, cellsAlong = byZ ? alongZ : alongX, cellsAcross = byZ ? alongX : alongZ;
    const slope = b === a ? 0 : (acrossEnd - across) / (b - a), least = Math.min(across, acrossEnd), most = Math.max(across, acrossEnd);
    const first = cellAt(Math.min(a, b) - CELL_REACH, low, cellsAlong), last = cellAt(Math.max(a, b) + CELL_REACH, low, cellsAlong), way = b >= a ? 1 : -1;
    for (let c = way > 0 ? first : last; way > 0 ? c <= last : c >= first; c += way) {
      const from = Math.max(Math.min(a, b), low + c * side), to = Math.min(Math.max(a, b), low + (c + 1) * side);
      const at = across + (from - a) * slope, end = across + (to - a) * slope;
      const near = cellAt(Math.max(least, Math.min(at, end)) - CELL_REACH, lowAcross, cellsAcross), far = cellAt(Math.min(most, Math.max(at, end)) + CELL_REACH, lowAcross, cellsAcross);
      for (let d = near; d <= far; d++) {
        const cell = byZ ? d * alongZ + c : c * alongZ + d;
        for (let k = cells[cell]!; k < cells[cell + 1]!; k++) {
          const i = members[k]!;
          if (asked[i] === sweeps) continue;
          asked[i] = sweeps;
          if (highX < bounds[4 * i]! || lowX > bounds[4 * i + 1]! || highZ < bounds[4 * i + 2]! || lowZ > bounds[4 * i + 3]!) continue;
          if (blocks(w, solids[i]!, ax, height, az, bx, height, bz, radius)) { blocker = i; blockedX = ax; blockedZ = az; return false; }
        }
      }
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
      grid();
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
