import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import { heldClearance } from "./held-clearance.ts";
import { blocks, clearanceExit, clearMove, clearStep, occupies, SWEEP } from "./clear-step.ts";
import { crowdWalk, fallenSolids, type FallenMemory } from "./crowd.ts";
import { copyMovement, sameMovement, type MovementRequest, type GroundPoint } from "./movement.ts";
import type { SolidSense } from "./object-senses.ts";
import { anyBody, type Part } from "./parts.ts";
import type { Senses } from "./senses.ts";
import { travelSpeed, type Corner, type GaitLimits } from "./travel.ts";

export type NavigationConfig = { readonly kind: "visibility-navigation" } | { readonly kind: "local-navigation" };
type NavigationStatus = "stopped" | "moving" | "arrived" | "unreachable" | "stalled" | "unavailable" | "lost-focus";

/** Navigation reports observed progress separately from the existence of a geometric route. */
export interface NavigationReport {
  /** The request the rest of the report is of: the last one asked, which may be a tactic's rather than an order's. */
  readonly request: MovementRequest | null;
  readonly status: NavigationStatus;
  readonly remaining: number | null;
  readonly goal: GroundPoint | null;
  readonly route: readonly GroundPoint[];
}

/**
 * Route clearance includes gait sway; progress windows are navigation preferences, not anatomy. A
 * route turns onto its next leg `waypoint` m before a corner, the room its gait has to turn in there
 * (`Corner.room`).
 */
const NAV = Object.freeze({ margin: .08, corner: .04, waypoint: .18,
  stalled: 3, progress: .06, moved: .3, quiet: .25, rangeSamples: 16, rangeResponse: 1, sideCost: .1 });
const apart = (a: GroundPoint, b: GroundPoint): number => hypot(a.x - b.x, a.z - b.z);
const atHeight = (at: GroundPoint, height: number): Vec3 => [at.x, height, at.z];
/** No corner ahead. */
const NO_CORNERS: readonly Corner[] = Object.freeze([]);

interface NavigationSight {
  readonly view: Parameters<ReturnType<typeof heldClearance>>[0] & {
    readonly time: number; readonly stance: { readonly centre: { readonly x: number; readonly y: number; readonly z: number }; readonly velocity: { readonly x: number; readonly z: number }; readonly support?: { readonly y: number } };
    readonly senses: Pick<Senses, "solids" | "others" | "side"> };
  readonly report: { readonly heading: number };
}

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

function footprints(solids: readonly SolidSense[], height: number, floor = 0): readonly SolidSense[] {
  const result: SolidSense[] = [];
  for (const solid of solids) if (obstructs(solid, height, floor)) result.push(footprint(solid, height));
  return result;
}

/** No solid sensed. */
const NO_SOLIDS: readonly SolidSense[] = Object.freeze([]);

/** Whether two sensed solids are the same: the same name, kind and numbers. */
function sameSolid(a: SolidSense, b: SolidSense): boolean {
  if (a.name !== b.name || a.centre[0] !== b.centre[0] || a.centre[1] !== b.centre[1] || a.centre[2] !== b.centre[2]) return false;
  switch (a.kind) {
    case "box": return b.kind === "box" && a.turn === b.turn && a.size[0] === b.size[0] && a.size[1] === b.size[1] && a.size[2] === b.size[2];
    case "hull": {
      if (b.kind !== "hull" || a.points.length !== b.points.length) return false;
      for (let i = 0; i < a.points.length; i++) {
        const p = a.points[i]!, q = b.points[i]!;
        if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) return false;
      }
      return true;
    }
    default: { const never: never = a; throw new Error(`unknown sensed solid ${never}`); }
  }
}

/** Whether two lists of sensed solids are the same, solid by solid: at once where they are one list, as the senses give one until the geometry changes. */
function sameSolids(a: readonly SolidSense[], b: readonly SolidSense[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!sameSolid(a[i]!, b[i]!)) return false;
  return true;
}

/**
 * `footprints` in objects made once for each solid of the array sensed and moved to each call's
 * height in place: what it gives is read before the next call, and nothing keeps it.
 */
function footprinter() {
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
function createRouter() {
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
      hx += radius + NAV.corner; hz += radius + NAV.corner;
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

/** The navigator owns geometry and progress memory; requesters retain facing and tactical priorities. */
export function createNavigator(spec: BodySpec, config: NavigationConfig = { kind: "visibility-navigation" }) {
  const baseRadius = bodyClearance(spec) + NAV.margin, carriedRadius = heldClearance(spec);
  const radiusOf = (view: NavigationSight["view"]) => Math.max(baseRadius, carriedRadius(view) + NAV.margin);
  const printsOf = footprinter(), router = createRouter();
  /**
   * `solids` and `fallen` are the geometry its route was found in: the solids sensed and its own
   * side's fallen bodies (`fallenSolids`); `failure` keeps the same of a search that found none.
   * `lying` is where it keeps its side's fallen bodies (`FallenMemory`).
   */
  const state = { request: null as MovementRequest | null, solids: null as readonly SolidSense[] | null, fallen: NO_SOLIDS, route: [] as GroundPoint[], waypoint: 0, goal: null as GroundPoint | null,
    focus: null as GroundPoint | null,
    failure: null as { from: GroundPoint; solids: readonly SolidSense[]; fallen: readonly SolidSense[]; radius: number; focus: GroundPoint | null } | null,
    progress: null as GroundPoint | null, bestRemaining: null as number | null, lastProgress: 0, lastTime: null as number | null, clearance: baseRadius,
    /** Whether its own side's bodies held its walk back at the last step (`crowdWalk`). */
    held: false, lying: new Map() as FallenMemory,
    report: { status: "stopped", remaining: null, goal: null } as { status: NavigationStatus; remaining: number | null; goal: GroundPoint | null } };
  const update = (status: NavigationStatus, remaining: number | null, goal: GroundPoint | null) => {
    state.report.status = status; state.report.remaining = remaining; state.report.goal = goal;
  };
  const report: NavigationReport = { get status() { return state.report.status; }, get remaining() { return state.report.remaining; },
    get goal() { return state.report.goal; }, get route() { return state.route; }, get request() { return state.request; } };
  return { state, report,
    steer(view: NavigationSight["view"], heading: number, move: readonly [number, number] | null) {
      return clearMove(view.stance.centre, printsOf(view.senses.solids ?? NO_SOLIDS, view.stance.centre.y, view.stance.support?.y), heading, move, radiusOf(view), .5);
    },
    resume() { state.route = []; state.failure = null; state.progress = null; state.bestRemaining = null; state.lastTime = null; state.held = false; update("unavailable", null, null); },
    /**
     * The walk toward `request` this step, forward and to the right in the heading's frame, m/s, at
     * the speed rule's speed (`travelSpeed`) for `gait` under `ceiling`: the way the walk goes
     * relative to the heading, or forward where the body turns to face its way (`travelFacing`).
     * A gait that states no limit, under no ceiling, gives no speed: the body does not go.
     */
    step(sight: NavigationSight, request: MovementRequest | null, gait: GaitLimits, ceiling: number, dt: number, available = true, travelFacing = false): { readonly move: readonly [number, number] | null; readonly face: number | null; readonly destination?: number } {
      const { view, report } = sight, centre = view.stance.centre, here = { x: centre.x, z: centre.z };
      const sensed = view.senses.solids ?? NO_SOLIDS;
      let solids = printsOf(sensed, centre.y, view.stance.support?.y);
      // Its own side's fallen bodies are fixed solids to route round, but the body it ranges about.
      const fallen = fallenSolids(view.senses, request?.kind === "range" ? request.focus : null, state.lying);
      if (fallen.length) solids = [...solids, ...footprints(fallen, centre.y, view.stance.support?.y)];
      const radius = radiusOf(view);
      // Whether the router is ready from here among this step's solids.
      let readied = false;
      const previous = state.request, same = sameMovement(request, previous);
      const following = request?.kind === "place" && previous?.kind === "place" && request.near === previous.near
        && request.points.length >= previous.points.length && previous.points.every((p, i) => apart(p, request.points[i]!) < NAV.moved);
      const changed = !same && !following;
      if (!same) state.request = request && copyMovement(request);
      if (changed) { state.route = []; state.failure = null; state.waypoint = 0; state.goal = null; state.focus = null; state.progress = here; state.bestRemaining = null; state.lastProgress = view.time; }
      const elapsed = state.lastTime === null ? dt : view.time - state.lastTime;
      state.lastTime = view.time;
      if (!available) { state.lastProgress += Math.max(0, elapsed); update("unavailable", state.report.remaining, state.goal); return { move: null, face: null }; }
      if (!request) { state.route = []; update("stopped", 0, null); return { move: null, face: null }; }
      const along = (x: number, z: number, speed: number) => {
        const distance = hypot(x, z), h = report.heading;
        return distance > 0 && speed > 0 ? [(x * sin(h) + z * cos(h)) * speed / distance, (x * cos(h) - z * sin(h)) * speed / distance] as const : null;
      };
      /**
       * The walk the ground way (`x`, `z`) at `speed`, kept clear of its own side's standing bodies
       * (`crowdWalk`) and, where turned for them, of the solids, in the heading's frame; and the way
       * it goes, or, held to a stop, the way asked.
       */
      const steered = (x: number, z: number, speed: number): { readonly move: readonly [number, number] | null; readonly face: number | null } => {
        const distance = hypot(x, z), crowd = distance > 0 && speed > 0 ? crowdWalk(view, radius, report.heading, { x: x * speed / distance, z: z * speed / distance }, gait) : null;
        state.held = crowd?.held ?? false;
        if (!crowd) return { move: along(x, z, speed), face: distance > 0 && speed > 0 ? atan2(x, z) : null };
        const most = hypot(crowd.x, crowd.z);
        return { move: clearMove(centre, solids, report.heading, along(crowd.x, crowd.z, most), radius, .5), face: most > 0 ? atan2(crowd.x, crowd.z) : atan2(x, z) };
      };
      /** The speed going the ground way (`x`, `z`) with `left` m to stop in and `corners` ahead. */
      const going = (x: number, z: number, left: number, corners: readonly Corner[]): number => {
        const h = report.heading, speed = travelSpeed(gait, travelFacing ? [1, 0] : [x * sin(h) + z * cos(h), x * cos(h) - z * sin(h)], left, corners, ceiling);
        return Number.isFinite(speed) ? speed : 0;
      };
      if (request.kind === "direct") {
        const direction = request.direction, speed = going(direction.x, direction.z, Infinity, NO_CORNERS);
        const move = clearMove(centre, solids, report.heading, steered(direction.x, direction.z, speed).move, radius, .5);
        update(move ? "moving" : "stopped", null, null);
        return { move, face: hypot(direction.x, direction.z) > 0 ? atan2(direction.x, direction.z) : null };
      }
      const focus = request.kind === "range" ? view.senses.others.find(other => other.id === request.focus && !other.out) : null;
      const focusAt = focus ? { x: focus.centre.x, z: focus.centre.z } : null;
      const failure = state.failure;
      if (failure && sameSolids(failure.solids, sensed) && sameSolids(failure.fallen, fallen) && apart(failure.from, here) < NAV.moved && Math.abs(failure.radius - radius) < NAV.margin
        && (focusAt && failure.focus ? apart(focusAt, failure.focus) < NAV.moved : focusAt === failure.focus)) {
        update("unreachable", null, state.goal); return { move: null, face: null };
      }
      state.failure = null;
      const unreachable = (goal: GroundPoint | null) => {
        state.failure = { from: here, solids: sensed, fallen, radius, focus: focusAt };
        state.route = []; state.goal = goal; update("unreachable", null, goal);
        return { move: null, face: null };
      };
      let goal: GroundPoint, near: number;
      switch (request.kind) {
        case "place": {
          while (state.waypoint < request.points.length - 1 && apart(here, request.points[state.waypoint]!) <= request.near) { state.waypoint++; state.route = []; }
          goal = request.points[state.waypoint]!; near = request.near;
          break;
        }
        case "range": {
          if (!focus) { state.route = []; update("lost-focus", null, null); return { move: null, face: null }; }
          const target = { x: focus.centre.x, z: focus.centre.z }, distance = apart(here, target);
          if (distance >= request.near && distance <= request.far) { state.route = []; state.progress = null; state.bestRemaining = null; state.lastProgress = view.time;
            const correction = (distance - (request.near + request.far) / 2) / NAV.rangeResponse;
            const dx = (focus.velocity?.x ?? 0) + (distance > 0 ? (target.x - here.x) * correction / distance : 0);
            const dz = (focus.velocity?.z ?? 0) + (distance > 0 ? (target.z - here.z) * correction / distance : 0);
            const speed = Math.min(going(dx, dz, Infinity, NO_CORNERS), hypot(dx, dz)), walk = steered(dx, dz, speed);
            update("arrived", 0, here);
            return { move: clearMove(centre, solids, report.heading, walk.move, radius, .5), face: walk.face, destination: 0 };
          }
          const range = (request.near + request.far) / 2, bearing = atan2(here.x - target.x, here.z - target.z);
          const focusRadius = focus.spec ? bodyClearance(focus.spec) : .2;
          solids = [...solids, { name: `focus:${focus.id}`, kind: "box", centre: [target.x, centre.y, target.z], size: [2 * focusRadius, 2, 2 * focusRadius] }];
          if (state.focus && state.goal && apart(state.focus, target) < NAV.moved
            && apart(state.goal, target) >= request.near && apart(state.goal, target) <= request.far) {
            goal = state.goal; near = Math.min(.15, (request.far - request.near) / 2); break;
          }
          let best: GroundPoint | null = null, bestCost = Infinity;
          router.ready(here, solids, radius, centre.y); readied = true;
          for (let i = 0; i < NAV.rangeSamples; i++) {
            const offset = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2 * 3.141592653589793 / NAV.rangeSamples;
            const candidate = { x: target.x + range * sin(bearing + offset), z: target.z + range * cos(bearing + offset) };
            const preference = request.side && Math.sign(offset) !== request.side ? NAV.sideCost : 0;
            if (apart(here, candidate) + preference >= bestCost) continue;
            const route = router.route(candidate);
            if (!route.length) continue;
            let cost = 0, previous = here;
            for (const point of route) { cost += apart(previous, point); previous = point; }
            cost += preference;
            if (cost < bestCost) { best = candidate; bestCost = cost; }
          }
          if (!best) return unreachable(null);
          state.focus = target;
          goal = best; near = Math.min(.15, (request.far - request.near) / 2);
          break;
        }
        default: { const never: never = request; throw new Error(`unknown movement ${JSON.stringify(never)}`); }
      }
      // A place routes to itself, or where the body's clearance does not fit there, to the first point that fits within its `near`
      // (half way out, then all the way, on eight bearings): it arrives once within `near` of the place either way.
      let aim = goal;
      if (request.kind === "place" && clearanceExit(atHeight(goal, centre.y), radius, solids) !== null) {
        for (let k = 1; k <= 2 && aim === goal; k++) for (let i = 0; i < 8; i++) {
          const ring = near * k / 2, at = { x: goal.x + sin(i * Math.PI / 4) * ring, z: goal.z + cos(i * Math.PI / 4) * ring };
          if (clearanceExit(atHeight(at, centre.y), radius, solids) === null) { aim = at; break; }
        }
      }
      const moved = !state.goal || apart(state.goal, goal) > NAV.moved;
      const reshaped = !state.solids || !sameSolids(state.solids, sensed) || !sameSolids(state.fallen, fallen);
      if (!reshaped) state.solids = sensed;
      if (!state.route.length || moved || reshaped || Math.abs(radius - state.clearance) > NAV.margin) {
        if (moved || reshaped) { state.bestRemaining = null; state.lastProgress = view.time; }
        state.solids = sensed; state.fallen = fallen; state.goal = { ...goal }; state.clearance = radius;
        if (config.kind === "visibility-navigation" && !readied) router.ready(here, solids, radius, centre.y);
        state.route = config.kind === "visibility-navigation" ? [...router.route(aim)]
          : clearStep(atHeight(here, centre.y), atHeight(aim, centre.y), radius, solids) ? [{ ...aim }] : [];
      }
      else if (state.route.length && clearStep(atHeight(state.route.length > 1 ? state.route[state.route.length - 2]! : here, centre.y), atHeight(aim, centre.y), radius, solids)) {
        state.route[state.route.length - 1] = { ...aim };
      }
      const distance = apart(here, goal), speed = hypot(view.stance.velocity.x, view.stance.velocity.z);
      if (distance <= near) { update(speed <= NAV.quiet ? "arrived" : "moving", distance, goal); return { move: null, face: null, destination: distance }; }
      while (state.route.length > 1 && apart(here, state.route[0]!) <= NAV.waypoint) state.route.shift();
      if (!state.route.length) return unreachable(goal);
      let remaining = 0, from = here;
      for (const point of state.route) { remaining += apart(from, point); from = point; }
      if (state.bestRemaining === null || remaining <= state.bestRemaining - NAV.progress) {
        state.progress = here; state.bestRemaining = remaining; state.lastProgress = view.time;
      }
      // A body still going the other way while it brakes, or held back by its own side, is not stalled.
      const next = state.route[0]!, velocity = view.stance.velocity, ahead = apart(here, next);
      if (state.held || ahead > 0 && (velocity.x * (next.x - here.x) + velocity.z * (next.z - here.z)) / ahead < -NAV.quiet) {
        state.progress = here; state.bestRemaining = remaining; state.lastProgress = view.time;
      }
      if (view.time - state.lastProgress > NAV.stalled) { state.held = false; update("stalled", remaining, goal); return { move: null, face: null }; }
      // Each corner of the route ahead: how far along it, and the tangent of half its turn.
      const corners: Corner[] = [];
      let to = apart(here, state.route[0]!);
      for (let k = 0; k + 1 < state.route.length; k++) {
        const from = k === 0 ? here : state.route[k - 1]!, at = state.route[k]!, after = state.route[k + 1]!;
        const ax = at.x - from.x, az = at.z - from.z, bx = after.x - at.x, bz = after.z - at.z, la = hypot(ax, az), lb = hypot(bx, bz);
        const sum = la * lb + ax * bx + az * bz;
        corners.push({ distance: to, halfTurn: la === 0 || lb === 0 ? 0 : sum > 0 ? Math.abs(ax * bz - az * bx) / sum : Infinity, room: NAV.waypoint });
        to += lb;
      }
      update("moving", remaining, goal);
      const walk = steered(next.x - here.x, next.z - here.z, going(next.x - here.x, next.z - here.z, remaining - near, corners));
      return { move: walk.move, face: walk.face ?? atan2(next.x - here.x, next.z - here.z), destination: remaining };
    },
  };
}

/** Navigation alternatives share the request, observation, feedback and replay contract. */
export const NAVIGATION_PARTS: { readonly [K in NavigationConfig["kind"]]: Part<Extract<NavigationConfig, { kind: K }>> } = deepFreeze({
  "visibility-navigation": { role: "navigation", label: "Visibility routes", stage: "game", fields: [], slots: [], defaults: { kind: "visibility-navigation" }, fits: anyBody, faults: () => [] },
  "local-navigation": { role: "navigation", label: "Local clearance", stage: "experimental", fields: [], slots: [], defaults: { kind: "local-navigation" }, fits: anyBody, faults: () => [] },
});
