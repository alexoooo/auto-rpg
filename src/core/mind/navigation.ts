import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import { heldClearance } from "./held-clearance.ts";
import { clearanceExit, clearMove, clearStep } from "./clear-step.ts";
import { crowdWalk, fallenSolids } from "./crowd.ts";
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

/** Corners of inflated footprints, with hulls conservatively enclosed by their world bounds. */
function corners(solids: readonly SolidSense[], radius: number, height: number): GroundPoint[] {
  const points: GroundPoint[] = [];
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
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      points.push({ x: x + c * hx * sx + s * hz * sz, z: z - s * hx * sx + c * hz * sz });
  }
  return points;
}

/** A deterministic shortest visibility route; an empty result means the permitted geometry blocks it. */
export function navigationPath(from: GroundPoint, goal: GroundPoint, solids: readonly SolidSense[], radius: number, height = 1): readonly GroundPoint[] {
  solids = footprints(solids, height);
  const clear = (a: GroundPoint, b: GroundPoint) => clearStep(atHeight(a, height), atHeight(b, height), radius, solids);
  const open = (point: GroundPoint) => clearanceExit(atHeight(point, height), radius, solids) === null;
  if (!open(goal)) return [];
  if (clear(from, goal)) return [{ ...goal }];
  const points = [from, goal, ...corners(solids, radius, height).filter(open)];
  const distances = points.map(() => Infinity), previous = points.map(() => -1), done = points.map(() => false);
  const estimates = points.map(point => apart(point, goal));
  distances[0] = 0;
  for (let count = 0; count < points.length; count++) {
    let next = -1;
    for (let i = 0; i < points.length; i++) if (!done[i] && (next < 0 || distances[i]! + estimates[i]! < distances[next]! + estimates[next]!)) next = i;
    if (next < 0 || distances[next] === Infinity) break;
    if (next === 1) {
      const route: GroundPoint[] = [];
      for (let i = 1; i !== 0; i = previous[i]!) route.push({ ...points[i]! });
      return route.reverse();
    }
    done[next] = true;
    for (let i = 1; i < points.length; i++) if (!done[i] && i !== next) {
      const distance = distances[next]! + apart(points[next]!, points[i]!);
      if (distance < distances[i]! && clear(points[next]!, points[i]!)) { distances[i] = distance; previous[i] = next; }
    }
  }
  return [];
}

/** The navigator owns geometry and progress memory; requesters retain facing and tactical priorities. */
export function createNavigator(spec: BodySpec, config: NavigationConfig = { kind: "visibility-navigation" }) {
  const baseRadius = bodyClearance(spec) + NAV.margin, carriedRadius = heldClearance(spec);
  const radiusOf = (view: NavigationSight["view"]) => Math.max(baseRadius, carriedRadius(view) + NAV.margin);
  const printsOf = footprinter();
  const state = { request: null as MovementRequest | null, solids: "", route: [] as GroundPoint[], waypoint: 0, goal: null as GroundPoint | null,
    focus: null as GroundPoint | null,
    failure: null as { from: GroundPoint; geometry: string; radius: number; focus: GroundPoint | null } | null,
    progress: null as GroundPoint | null, bestRemaining: null as number | null, lastProgress: 0, lastTime: null as number | null, clearance: baseRadius,
    /** Whether its own side's bodies held its walk back at the last step (`crowdWalk`). */
    held: false,
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
      let solids = printsOf(view.senses.solids ?? NO_SOLIDS, centre.y, view.stance.support?.y);
      // Its own side's fallen bodies are fixed solids to route round, but the body it ranges about.
      const fallen = fallenSolids(view.senses, request?.kind === "range" ? request.focus : null);
      if (fallen.length) solids = [...solids, ...footprints(fallen, centre.y, view.stance.support?.y)];
      const radius = radiusOf(view);
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
      const geometry = fallen.length ? JSON.stringify([...view.senses.solids ?? [], ...fallen]) : JSON.stringify(view.senses.solids ?? []);
      const focus = request.kind === "range" ? view.senses.others.find(other => other.id === request.focus && !other.out) : null;
      const focusAt = focus ? { x: focus.centre.x, z: focus.centre.z } : null;
      const failure = state.failure;
      if (failure && failure.geometry === geometry && apart(failure.from, here) < NAV.moved && Math.abs(failure.radius - radius) < NAV.margin
        && (focusAt && failure.focus ? apart(focusAt, failure.focus) < NAV.moved : focusAt === failure.focus)) {
        update("unreachable", null, state.goal); return { move: null, face: null };
      }
      state.failure = null;
      const unreachable = (goal: GroundPoint | null) => {
        state.failure = { from: here, geometry, radius, focus: focusAt };
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
          for (let i = 0; i < NAV.rangeSamples; i++) {
            const offset = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2 * 3.141592653589793 / NAV.rangeSamples;
            const candidate = { x: target.x + range * sin(bearing + offset), z: target.z + range * cos(bearing + offset) };
            const preference = request.side && Math.sign(offset) !== request.side ? NAV.sideCost : 0;
            if (apart(here, candidate) + preference >= bestCost) continue;
            const route = navigationPath(here, candidate, solids, radius, centre.y);
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
      if (!state.route.length || moved || state.solids !== geometry || Math.abs(radius - state.clearance) > NAV.margin) {
        if (moved || state.solids !== geometry) { state.bestRemaining = null; state.lastProgress = view.time; }
        state.solids = geometry; state.goal = { ...goal }; state.clearance = radius;
        state.route = config.kind === "visibility-navigation" ? [...navigationPath(here, aim, solids, radius, centre.y)]
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
