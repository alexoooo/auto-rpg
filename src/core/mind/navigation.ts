import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import { heldClearance } from "./held-clearance.ts";
import { clearanceExit, clearMove, clearStep, stockClearance } from "./clear-step.ts";
import { crowdWalk, fallenSolids, type FallenMemory } from "./crowd.ts";
import { copyMovement, sameMovement, type MovementRequest, type GroundPoint } from "./movement.ts";
import type { NavigationReport, NavigationSight, NavigationStatus, NavigationStep, Navigator } from "./navigator.ts";
import type { SolidSense } from "./object-senses.ts";
import { createRouter, footprinter, footprints, NO_SOLIDS } from "./route-search.ts";
import { travelSpeed, type Corner, type GaitLimits } from "./travel.ts";

/**
 * Route clearance includes gait sway; progress windows are navigation preferences, not anatomy. A
 * route turns onto its next leg `waypoint` m before a corner, the room its gait has to turn in there
 * (`Corner.room`), or sooner where that leg is clear from where the body stands: a body carried or
 * crowded off its route goes on from where it is, never back to a corner it has passed. What it
 * carries is given the most room it took over the last `hold` s: an arm drawn in for a moment
 * would find a route past a jamb that the guard, back out, does not fit through. A body that has
 * come no nearer for `stalled` s, its route kept from where it was, stands that step and searches
 * afresh from where it is at the next.
 */
const NAV = Object.freeze({ margin: .08, waypoint: .18, hold: 2,
  stalled: 3, progress: .06, moved: .3, quiet: .25, rangeSamples: 16, rangeResponse: 1, sideCost: .1 });
const apart = (a: GroundPoint, b: GroundPoint): number => hypot(a.x - b.x, a.z - b.z);
const atHeight = (at: GroundPoint, height: number): Vec3 => [at.x, height, at.z];
/** No corner ahead. */
const NO_CORNERS: readonly Corner[] = Object.freeze([]);

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

/** A visibility router (`createRouter`), readied from where the body is among the step's solids. */
type Router = ReturnType<typeof createRouter>;

/**
 * **How a walker finds a route to a place**: from `here` to `aim` among `solids` (footprints at
 * `height`) for a body of clearance `radius`, empty where it finds none. `router` readies the
 * visibility router from here among them, once a step, for a search that uses it.
 */
type PlaceSearch = (here: GroundPoint, aim: GroundPoint, solids: readonly SolidSense[], radius: number, height: number, router: () => Router) => readonly GroundPoint[];

/**
 * **A walker**: a navigator (`Navigator`) for a body of `spec` that keeps a route to a place it
 * finds by `search`, and for a range finds the nearest open spot by visibility routes. It owns
 * geometry and progress memory; requesters retain facing and tactical priorities.
 */
export function routeWalker(spec: BodySpec, search: PlaceSearch): Navigator {
  const baseRadius = bodyClearance(spec) + NAV.margin, carriedRadius = heldClearance(spec);
  const radiusOf = (view: NavigationSight["view"]) => {
    const now = carriedRadius(view), held = state.reach;
    if (held === null || now >= held.radius || view.time - held.at > NAV.hold) state.reach = { radius: now, at: view.time };
    return Math.max(baseRadius, state.reach!.radius + NAV.margin);
  };
  const printsOf = footprinter(), router = createRouter();
  /**
   * `solids` and `fallen` are the geometry its route was found in: the solids sensed and the
   * fallen bodies (`fallenSolids`); `failure` keeps the same of a search that found none.
   * `lying` is where it keeps the fallen bodies (`FallenMemory`). `goal` is the goal progress
   * is reckoned toward; `offset` is a range's spot kept, from the foe.
   */
  const state = { request: null as MovementRequest | null, solids: null as readonly SolidSense[] | null, fallen: NO_SOLIDS, route: [] as GroundPoint[], waypoint: 0, goal: null as GroundPoint | null,
    offset: null as GroundPoint | null,
    failure: null as { from: GroundPoint; solids: readonly SolidSense[]; fallen: readonly SolidSense[]; radius: number; focus: GroundPoint | null } | null,
    progress: null as GroundPoint | null, bestRemaining: null as number | null, lastProgress: 0, lastTime: null as number | null, clearance: baseRadius,
    /** The most room what it carries took over the last `NAV.hold` s, m from its centre, and when it last took it. */
    reach: null as { radius: number; at: number } | null,
    /** Whether its own side's bodies held its walk back at the last step (`crowdWalk`). */
    held: false, lying: new Map() as FallenMemory,
    report: { status: "stopped", remaining: null, goal: null } as { status: NavigationStatus; remaining: number | null; goal: GroundPoint | null } };
  const update = (status: NavigationStatus, remaining: number | null, goal: GroundPoint | null) => {
    state.report.status = status; state.report.remaining = remaining; state.report.goal = goal;
  };
  const report: NavigationReport = { get status() { return state.report.status; }, get remaining() { return state.report.remaining; },
    get goal() { return state.report.goal; }, get route() { return state.route; }, get request() { return state.request; } };
  return { state, report, ...stockClearance(spec),
    steer(view: NavigationSight["view"], heading: number, move: readonly [number, number] | null) {
      return clearMove(view.stance.centre, printsOf(view.senses.solids ?? NO_SOLIDS, view.stance.centre.y, view.stance.support?.y), heading, move, radiusOf(view), .5);
    },
    resume() { state.route = []; state.failure = null; state.progress = null; state.bestRemaining = null; state.lastTime = null; state.held = false; update("unavailable", null, null); },
    /**
     * The walk toward `request` this step, forward and to the right in the heading's frame, m/s, at
     * the speed rule's speed (`travelSpeed`) for `gait` under `ceiling`, the way the walk goes
     * relative to the heading; and the way it goes, which a body that faces its travel turns to. A gait that states no limit, under no ceiling, gives no speed: the body does not go.
     */
    step(sight: NavigationSight, request: MovementRequest | null, gait: GaitLimits, ceiling: number, dt: number, available = true): NavigationStep {
      const { view, report } = sight, centre = view.stance.centre, here = { x: centre.x, z: centre.z };
      const sensed = view.senses.solids ?? NO_SOLIDS;
      let solids = printsOf(sensed, centre.y, view.stance.support?.y);
      // The fallen bodies, foe or friend, are fixed solids to route round, but the body it ranges about or goes to a place by.
      const fallen = fallenSolids(view.senses, request?.kind === "range" ? request.focus : request?.kind === "place" ? request.by ?? null : null, state.lying);
      const lying = fallen.length ? footprints(fallen, centre.y, view.stance.support?.y) : NO_SOLIDS;
      if (lying.length) solids = [...solids, ...lying];
      const radius = radiusOf(view);
      // Whether the router is ready from here among this step's solids.
      let readied = false;
      const previous = state.request, same = sameMovement(request, previous);
      const following = request?.kind === "place" && previous?.kind === "place" && request.near === previous.near
        && request.points.length >= previous.points.length && previous.points.every((p, i) => apart(p, request.points[i]!) < NAV.moved);
      const changed = !same && !following;
      if (!same) state.request = request && copyMovement(request);
      if (changed) { state.route = []; state.failure = null; state.waypoint = 0; state.goal = null; state.offset = null; state.progress = here; state.bestRemaining = null; state.lastProgress = view.time; }
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
        const h = report.heading, speed = travelSpeed(gait, [x * sin(h) + z * cos(h), x * cos(h) - z * sin(h)], left, corners, ceiling);
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
      // Whether the solids sensed are not those its route was found among.
      const reshaped = !state.solids || !sameSolids(state.solids, sensed);
      if (!reshaped) state.solids = sensed;
      // Whether its route crosses where the fallen bodies lie now, where they have changed: a route clear of them stands, found among them.
      let crossed = false;
      if (!reshaped && !sameSolids(state.fallen, fallen)) {
        let from = here;
        for (const point of state.route) {
          if (!clearStep(atHeight(from, centre.y), atHeight(point, centre.y), radius, lying)) { crossed = true; break; }
          from = point;
        }
        if (!crossed) state.fallen = fallen;
      }
      // Whether the route no longer fits: the geometry changed across it, the body takes more room than it was found for, or much less.
      const refit = reshaped || crossed || radius > state.clearance || state.clearance - radius > NAV.margin;
      /**
       * Whether a route reaches `aim`: the route kept, its end moved there where `aim` moved, while it
       * still fits; straight from here, as a search would find it; or by the kept route's last leg
       * from the corner before it. Where that leg is not clear, a route that ends within `NAV.moved`
       * of `aim` keeps its end and still leads there. Its other legs stand while the geometry does;
       * the body turns onto the next `NAV.waypoint` m before a corner, so a sweep from here along it
       * may graze the corner by design.
       */
      const reaches = (aim: GroundPoint): boolean => {
        const route = state.route, n = route.length;
        if (!refit && n && route[n - 1]!.x === aim.x && route[n - 1]!.z === aim.z) return true;
        const to = atHeight(aim, centre.y);
        if (clearStep(atHeight(here, centre.y), to, radius, solids)) {
          state.route = [{ ...aim }]; state.solids = sensed; state.fallen = fallen; state.clearance = radius; return true;
        }
        if (refit) return false;
        if (n >= 2 && clearStep(atHeight(route[n - 2]!, centre.y), to, radius, solids)) { route[n - 1] = { ...aim }; return true; }
        return n > 0 && apart(route[n - 1]!, aim) <= NAV.moved;
      };
      // A route this step's search has found already.
      let planned: readonly GroundPoint[] | null = null;
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
          near = Math.min(.15, (request.far - request.near) / 2);
          // The nearest spot, where no side is asked and it is open and straight ahead, is the one a search would find.
          const nearest = { x: target.x + range * sin(bearing), z: target.z + range * cos(bearing) };
          if (!request.side && clearanceExit(atHeight(nearest, centre.y), radius, solids) === null && clearStep(atHeight(here, centre.y), atHeight(nearest, centre.y), radius, solids)) {
            state.offset = { x: nearest.x - target.x, z: nearest.z - target.z }; goal = nearest; planned = [nearest]; break;
          }
          // Else the spot kept goes where the foe goes: it stays at the range, on the side it was chosen on, while it is open and the route still reaches it.
          const kept = state.offset && { x: target.x + state.offset.x, z: target.z + state.offset.z };
          if (kept && apart(kept, target) >= request.near && apart(kept, target) <= request.far
            && clearanceExit(atHeight(kept, centre.y), radius, solids) === null && reaches(kept)) { goal = kept; break; }
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
            if (cost < bestCost) { best = candidate; bestCost = cost; planned = route; }
          }
          if (!best) return unreachable(null);
          state.offset = { x: best.x - target.x, z: best.z - target.z };
          goal = best;
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
      // Progress is reckoned toward the goal as it was when it last moved `NAV.moved` or the geometry changed across its route.
      if (!state.goal || apart(state.goal, goal) > NAV.moved || reshaped || crossed) { state.goal = { ...goal }; state.bestRemaining = null; state.lastProgress = view.time; }
      // A route is searched for only where none found reaches the goal: a range's spot is kept only where its route reaches it.
      if (planned || request.kind === "place" && !reaches(aim)) {
        state.solids = sensed; state.fallen = fallen; state.clearance = radius;
        if (planned) state.route = [...planned];
        else {
          const among = solids;
          state.route = [...search(here, aim, among, radius, centre.y, () => {
            if (!readied) { router.ready(here, among, radius, centre.y); readied = true; }
            return router;
          })];
        }
      }
      const distance = apart(here, goal), speed = hypot(view.stance.velocity.x, view.stance.velocity.z);
      if (distance <= near) { update(speed <= NAV.quiet ? "arrived" : "moving", distance, goal); return { move: null, face: null, destination: distance }; }
      // A corner is passed within `NAV.waypoint` of it, or once the leg past it is clear from here.
      while (state.route.length > 1 && (apart(here, state.route[0]!) <= NAV.waypoint
        || clearStep(atHeight(here, centre.y), atHeight(state.route[1]!, centre.y), radius, solids))) state.route.shift();
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
      if (view.time - state.lastProgress > NAV.stalled) {
        state.held = false; state.route = []; state.solids = null; state.progress = here; state.bestRemaining = null; state.lastProgress = view.time;
        update("stalled", remaining, goal); return { move: null, face: null };
      }
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
