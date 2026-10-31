import type { BodyView } from "../../body.ts";
import { cos, hypot, sin } from "../../math/real.ts";
import type { Side, BodySpec } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { GROUND_APPROACH, beside, highestOpening, hold, lapse, lowered, rise, turned, walkToward, type GroundPhase, type GroundStage } from "./approach.ts";
import type { GroundReading, GroundIntent } from "./position.ts";
import { groundRoute } from "./route.ts";
import { upperSurface } from "../openings.ts";
import { clearFootTranslation, lowOpponent, sensedObstacle } from "../../navigation/sensed-bounds.ts";
import type { BodySense } from "../../mind/senses.ts";
import { lyingAxis } from "../../intent/targets.ts";
import { segmentOf } from "../../spec/body.ts";

/** The wider approach's placement, reach and physical probes: `docs/reference/ground-combat.md#policy-settings`. */
const GROUND_COMBAT = Object.freeze({ across: .1, ahead: .65, reach: .8, footRadius: .12, lookahead: 1, orientations: 8 });

/** The length of `route` walked from `from`, along the floor. */
function routeLength(from: Vec3, route: readonly Vec3[]): number {
  let length = 0, at = from;
  for (const point of route) {
    length += hypot(point[0] - at[0], point[2] - at[2]);
    at = point;
  }
  return length;
}

/** Side approach, supported lowering, refreshed strokes and standing return behind the neutral intent. */
export function groundWide(spec: BodySpec, clearMove: (view: BodyView, heading: number, move: readonly [number, number] | null) => readonly [number, number] | null) {
  const left = segmentOf(spec, "foot.left")!, right = segmentOf(spec, "foot.right")!;
  const width = Math.abs(left.centreOfMass.value[0] - right.centreOfMass.value[0]) / 2;
  const state = { phase: "guard" as GroundPhase, stage: "approach" as GroundStage,
    active: false, hand: null as Side | null, foe: null as string | null, face: 0, target: null as Vec3 | null, surface: null as string | null,
    route: null as readonly Vec3[] | null, walk: null as readonly [number, number] | null, stride: -1, planned: false, next: 0, elapsed: 0, retry: 0, lowTime: 0 };
  const reset = () => {
    state.active = false;
    state.hand = null;
    state.stage = "approach";
    state.foe = null;
    state.target = null;
    state.route = null;
    state.walk = null;
    state.stride = -1;
    state.planned = false;
    state.next = 0;
    state.elapsed = 0;
    state.lowTime = 0;
    state.retry = 0;
    state.phase = "guard";
  };

  /** Reads the target again, the top of the foe's middle seen from here; false, the episode returning, when there is none or it moved more than `targetShift` while lowered. */
  const refresh = (view: BodyView, foe: BodySense): boolean => {
    const c = view.stance.centre, from: Vec3 = [c.x, c.y, c.z];
    const opening = highestOpening(foe, segment => upperSurface(foe, segment, from));
    if (!opening || (state.stage !== "approach" && state.target
      && hypot(opening.target[0] - state.target[0], opening.target[2] - state.target[2]) > GROUND_APPROACH.targetShift)) {
      state.stage = "rise";
      return false;
    }
    state.target = opening.target;
    state.surface = opening.segment;
    state.next = view.time + GROUND_APPROACH.refresh;
    return true;
  };

  /**
   * Chooses the facing to approach the target from: of `orientations` turns from along the foe, the planned facing
   * first, the one whose place has both feet clear of the foe and whose route round it is shortest, keeping the
   * planned one while the target moved less than `targetShift` since `previous`. False when no facing has both feet
   * clear and a route.
   */
  const plan = (view: BodyView, foe: BodySense, previous: Vec3 | null): boolean => {
    const target = state.target!, axis = lyingAxis(foe), obstacle = sensedObstacle(foe), clear = obstacle.clear, c = view.stance.centre;
    const from: Vec3 = [c.x, view.stance.support.y, c.z];
    let best = Infinity, chosen: number | null = null;
    for (let n = 0; n < GROUND_COMBAT.orientations; n++) {
      const face = state.planned && n === 0 ? state.face : axis + n * 2 * Math.PI / GROUND_COMBAT.orientations, side = state.hand === "right" ? 1 : -1;
      const rx = cos(face), rz = -sin(face), [x, z] = beside(target, face, side, GROUND_COMBAT.across, GROUND_COMBAT.ahead);
      if (![-1, 1].every(s => {
        const foot: Vec3 = [x + s * width * rx, view.stance.support.y, z + s * width * rz];
        return clear(foot, foot, GROUND_COMBAT.footRadius);
      })) continue;
      const route = groundRoute(obstacle, from, [x, view.stance.support.y, z], GROUND_COMBAT.footRadius);
      if (!route) continue;
      const length = routeLength(from, route);
      if (length < best) {
        best = length;
        chosen = face;
        state.route = route;
      }
      if (state.planned && n === 0 && chosen !== null && previous && hypot(target[0] - previous[0], target[2] - previous[2]) < GROUND_APPROACH.targetShift) break;
    }
    if (chosen === null) return false;
    state.face = chosen;
    return true;
  };

  /**
   * The first walk the clear move keeps of, toward (dx, dz): as asked, either component of it alone, then a full-speed
   * step each way; each only if both soles sweep clear of the foe over the lookahead. Null if none.
   */
  const clearWalk = (view: BodyView, foe: BodySense, heading: number, dx: number, dz: number): readonly [number, number] | null => {
    const asked = walkToward(heading, dx, dz), speed = GROUND_APPROACH.speed;
    let move: readonly [number, number] | null = null;
    if (!view.stance.soles.left || !view.stance.soles.right) return move;
    for (const candidate of [asked, [asked[0], 0], [0, asked[1]], [0, -speed], [0, speed], [speed, 0], [-speed, 0]] as const) {
      if (candidate[0] === 0 && candidate[1] === 0) continue;
      const step = turned(heading, candidate[0], candidate[1]);
      if (clearFootTranslation(view, foe, step[0] * GROUND_COMBAT.lookahead, step[1] * GROUND_COMBAT.lookahead, GROUND_COMBAT.footRadius)) {
        move = clearMove(view, heading, candidate);
        if (move) break;
      }
    }
    return move;
  };

  /**
   * Walks the planned route's next waypoint, its last the place beside the target, holding a walk's world direction
   * until the stride counter advances, and lowers once within `settle` of the waypoint, still and standing.
   */
  const approach = (view: BodyView, report: GroundReading, foe: BodySense): GroundIntent => {
    const c = view.stance.centre, heading = report.heading;
    let route = state.route!;
    while (route.length > 1 && hypot(route[0]![0] - c.x, route[0]![2] - c.z) < GROUND_APPROACH.near) route = route.slice(1);
    state.route = route;
    const waypoint = route[0]!;
    const dx = waypoint[0] - c.x, dz = waypoint[2] - c.z, far = hypot(dx, dz);
    if (far < GROUND_APPROACH.near) state.walk = null;
    else if (!state.walk || state.stride !== view.stance.strides) {
      // A distance that is not a number searches no walk.
      const move = far >= GROUND_APPROACH.near ? clearWalk(view, foe, heading, dx, dz) : null;
      state.stride = view.stance.strides;
      state.walk = move ? turned(heading, move[0], move[1]) : null;
    }
    const move = state.walk ? turned(heading, state.walk[0], state.walk[1]) : null;
    if (far < GROUND_APPROACH.settle && view.stance.velocity.lengthSquared() < GROUND_APPROACH.quiet * GROUND_APPROACH.quiet && view.stance.phase === "stand") {
      state.stage = "lower";
      state.lowTime = 0;
    }
    state.phase = "low-approach";
    return { move, face: state.face, allow: false };
  };

  return { state, reset, withdraw() { state.stage = "rise"; }, decide(view: BodyView, report: GroundReading, foe: BodySense, hand: Side, dt: number): GroundIntent | null {
    state.retry = Math.max(0, state.retry - dt);
    const busy = report.actions.find(action => action.target.body === foe.id), low = lowOpponent(view, foe), support = report.support;
    if (!support) return null;
    if (!state.active) {
      if (!low || busy || support.stage !== "stand") return null;
      if (state.retry > 0) return { move: null, face: report.heading, allow: false };
      state.active = true;
      state.hand = hand;
      state.foe = foe.id;
      state.stage = "approach";
      state.elapsed = 0;
      state.next = 0;
    }
    lapse(state, !low || state.foe !== foe.id || view.down, dt);
    if (state.stage === "rise") return rise(state, busy, support, reset);
    if (view.time >= state.next && !busy) {
      const previous = state.target;
      if (!refresh(view, foe)) return hold(state);
      if (state.stage === "approach") {
        state.planned = plan(view, foe, previous);
        if (!state.planned) {
          state.phase = "low-wait";
          return { move: null, face: report.heading, allow: false };
        }
      }
    }
    if (!state.target || !state.planned) return hold(state);
    switch (state.stage) {
      case "approach": return approach(view, report, foe);
      case "lower":
      case "attack": return lowered(state, view.stance.centre, GROUND_COMBAT.reach, busy, support);
      default: {
        const never: never = state.stage;
        throw new Error(`unknown ground stage ${never}`);
      }
    }
  } };
}
