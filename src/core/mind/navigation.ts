import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import { clearanceExit, clearMove, clearStep } from "./clear-step.ts";
import type { MovementRequest, GroundPoint } from "./movement.ts";
import type { SolidSense } from "./object-senses.ts";
import type { Part } from "./parts.ts";
import type { Senses } from "./senses.ts";

export type NavigationConfig = { readonly kind: "visibility-navigation" } | { readonly kind: "local-navigation" };
type NavigationStatus = "stopped" | "moving" | "arrived" | "unreachable" | "stalled" | "unavailable" | "lost-focus";

/** Navigation reports observed progress separately from the existence of a geometric route. */
export interface NavigationReport {
  readonly status: NavigationStatus;
  readonly remaining: number | null;
  readonly goal: GroundPoint | null;
  readonly route: readonly GroundPoint[];
}

/** Route clearance includes gait sway; braking and progress windows are navigation preferences, not anatomy. */
const NAV = Object.freeze({ margin: .08, corner: .04, waypoint: .18, brake: .5, cornerPace: .2,
  stalled: 3, progress: .06, moved: .3, quiet: .25, rangeSamples: 16, rangeResponse: 1, sideCost: .1 });
const apart = (a: GroundPoint, b: GroundPoint): number => hypot(a.x - b.x, a.z - b.z);
const atHeight = (at: GroundPoint, height: number): Vec3 => [at.x, height, at.z];

interface NavigationSight {
  readonly view: { readonly time: number; readonly stance: { readonly centre: { readonly x: number; readonly y: number; readonly z: number }; readonly velocity: { readonly x: number; readonly z: number }; readonly support?: { readonly y: number } };
    readonly senses: Pick<Senses, "solids" | "others">;
    readonly effectors?: Readonly<Record<string, { readonly points: Readonly<Record<string, { readonly x: number; readonly z: number }>> }>> };
  readonly report: { readonly heading: number };
}

/** Any solid above the supporting floor can obstruct the feet, even when it is below the trunk. */
function footprints(solids: readonly SolidSense[], height: number, floor = 0): readonly SolidSense[] {
  const result: SolidSense[] = [];
  for (const solid of solids) switch (solid.kind) {
    case "box":
      if (solid.centre[1] + solid.size[1] / 2 > floor + .02 && solid.centre[1] - solid.size[1] / 2 < 2 * height - floor)
        result.push({ ...solid, centre: [solid.centre[0], height, solid.centre[2]], size: [solid.size[0], 2, solid.size[2]] });
      break;
    case "hull": {
      let low = Infinity, high = -Infinity;
      for (const point of solid.points) { low = Math.min(low, point[1]); high = Math.max(high, point[1]); }
      if (high > floor + .02 && low < 2 * height - floor) result.push({ ...solid, points: solid.points.map(p => [p[0], height, p[2]] as Vec3) });
      break;
    }
    default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
  }
  return result;
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
  const baseRadius = bodyClearance(spec) + NAV.margin;
  const state = { request: "", solids: "", route: [] as GroundPoint[], waypoint: 0, goal: null as GroundPoint | null,
    focus: null as GroundPoint | null,
    failure: null as { from: GroundPoint; geometry: string; radius: number; focus: GroundPoint | null } | null,
    progress: null as GroundPoint | null, bestRemaining: null as number | null, lastProgress: 0, lastTime: null as number | null, clearance: baseRadius,
    report: { status: "stopped", remaining: null, goal: null } as { status: NavigationStatus; remaining: number | null; goal: GroundPoint | null } };
  const update = (status: NavigationStatus, remaining: number | null, goal: GroundPoint | null) => {
    state.report.status = status; state.report.remaining = remaining; state.report.goal = goal;
  };
  const report: NavigationReport = { get status() { return state.report.status; }, get remaining() { return state.report.remaining; },
    get goal() { return state.report.goal; }, get route() { return state.route; } };
  return { state, report,
    steer(view: NavigationSight["view"], heading: number, move: readonly [number, number] | null) {
      return clearMove(view.stance.centre, footprints(view.senses.solids ?? [], view.stance.centre.y, view.stance.support?.y), heading, move, baseRadius, .5);
    },
    resume() { state.route = []; state.failure = null; state.progress = null; state.bestRemaining = null; state.lastTime = null; update("unavailable", null, null); },
    step(sight: NavigationSight, request: MovementRequest | null, pace: number, dt: number, available = true): { readonly move: readonly [number, number] | null; readonly face: number | null; readonly destination?: number } {
      const { view, report } = sight, centre = view.stance.centre, here = { x: centre.x, z: centre.z };
      let solids = footprints(view.senses.solids ?? [], centre.y, view.stance.support?.y), radius = baseRadius;
      for (const held of spec.held ?? []) for (const name of Object.keys(held.item.points)) {
        const point = view.effectors?.[held.segment]?.points[name];
        if (point) radius = Math.max(radius, hypot(point.x, point.z) + NAV.margin);
      }
      const key = JSON.stringify(request);
      const previous: MovementRequest | null = state.request ? JSON.parse(state.request) as MovementRequest | null : null;
      const following = request?.kind === "place" && previous?.kind === "place" && request.near === previous.near
        && request.points.length >= previous.points.length && previous.points.every((p, i) => apart(p, request.points[i]!) < NAV.moved);
      const changed = key !== state.request && !following;
      if (changed) { state.request = key; state.route = []; state.failure = null; state.waypoint = 0; state.goal = null; state.focus = null; state.progress = here; state.bestRemaining = null; state.lastProgress = view.time; }
      else if (following) state.request = key;
      const elapsed = state.lastTime === null ? dt : view.time - state.lastTime;
      state.lastTime = view.time;
      if (!available) { state.lastProgress += Math.max(0, elapsed); update("unavailable", state.report.remaining, state.goal); return { move: null, face: null }; }
      if (!request) { state.route = []; update("stopped", 0, null); return { move: null, face: null }; }
      const along = (x: number, z: number, speed: number) => {
        const distance = hypot(x, z), h = report.heading;
        return distance > 0 && speed > 0 ? [(x * sin(h) + z * cos(h)) * speed / distance, (x * cos(h) - z * sin(h)) * speed / distance] as const : null;
      };
      if (request.kind === "direct") {
        const direction = request.direction, move = clearMove(centre, solids, report.heading, along(direction.x, direction.z, pace), radius, .5);
        update(move ? "moving" : "stopped", null, null);
        return { move, face: hypot(direction.x, direction.z) > 0 ? atan2(direction.x, direction.z) : null };
      }
      const geometry = JSON.stringify(view.senses.solids ?? []);
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
            const speed = Math.min(pace, hypot(dx, dz));
            update("arrived", 0, here);
            return { move: clearMove(centre, solids, report.heading, along(dx, dz, speed), radius, .5), face: speed > 0 ? atan2(dx, dz) : null, destination: 0 };
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
      const moved = !state.goal || apart(state.goal, goal) > NAV.moved;
      if (!state.route.length || moved || state.solids !== geometry || Math.abs(radius - state.clearance) > NAV.margin) {
        if (moved || state.solids !== geometry) { state.bestRemaining = null; state.lastProgress = view.time; }
        state.solids = geometry; state.goal = { ...goal }; state.clearance = radius;
        state.route = config.kind === "visibility-navigation" ? [...navigationPath(here, goal, solids, radius, centre.y)]
          : clearStep(atHeight(here, centre.y), atHeight(goal, centre.y), radius, solids) ? [{ ...goal }] : [];
      }
      else if (state.route.length && clearStep(atHeight(state.route.length > 1 ? state.route[state.route.length - 2]! : here, centre.y), atHeight(goal, centre.y), radius, solids)) {
        state.route[state.route.length - 1] = { ...goal };
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
      if (view.time - state.lastProgress > NAV.stalled) { update("stalled", remaining, goal); return { move: null, face: null }; }
      const next = state.route[0]!, untilCorner = apart(here, next), final = state.route.length === 1;
      const limit = Math.sqrt((final ? 0 : NAV.cornerPace * NAV.cornerPace) + 2 * NAV.brake * Math.max(0, untilCorner - (final ? near : 0)));
      update("moving", remaining, goal);
      return { move: along(next.x - here.x, next.z - here.z, Math.min(pace, limit)), face: atan2(next.x - here.x, next.z - here.z), destination: remaining };
    },
  };
}

/** Navigation alternatives share the request, observation, feedback and replay contract. */
export const NAVIGATION_PARTS: { readonly [K in NavigationConfig["kind"]]: Part<Extract<NavigationConfig, { kind: K }>> } = deepFreeze({
  "visibility-navigation": { role: "navigation", label: "Visibility routes", stage: "game", fields: [], slots: [], defaults: { kind: "visibility-navigation" }, fits: () => true, faults: () => [] },
  "local-navigation": { role: "navigation", label: "Local clearance", stage: "experimental", fields: [], slots: [], defaults: { kind: "local-navigation" }, fits: () => true, faults: () => [] },
});
