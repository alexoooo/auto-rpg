import type { BodyView } from "../body.ts";
import { sin, cos, hypot } from "../math/real.ts";
import type { Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { GROUND_APPROACH, beside, highestOpening, hold, lapse, lowered, rise, walkToward, type GroundPhase, type GroundStage } from "./ground-approach.ts";
import type { GroundReading, GroundIntent } from "./ground-position.ts";
import { highestSurface } from "./openings.ts";
import { lowOpponent } from "./sensed-bounds.ts";
import type { BodySense } from "./senses.ts";
import { lyingAxis } from "./targets.ts";

/** The close approach's placement and reach: `docs/reference/ground-combat.md#policy-settings`. */
const GROUND_NEAR = Object.freeze({ across: .35, ahead: .04, outside: .35, along: .12, reach: .6 });

/** Approach beside a quiet observed torso, lower through the shared executor, and return standing. */
export function groundNear(clearMove: (view: BodyView, heading: number, move: readonly [number, number] | null) => readonly [number, number] | null) {
  const state = { phase: "guard" as GroundPhase, surface: null as string | null, stage: "approach" as GroundStage, active: false, foe: null as string | null,
    hand: null as Side | null, face: 0, target: null as Vec3 | null, next: 0, elapsed: 0, lowTime: 0, retry: 0 };
  const reset = () => {
    state.stage = "approach";
    state.phase = "guard";
    state.active = false;
    state.foe = null;
    state.hand = null;
    state.target = null;
    state.next = 0;
    state.elapsed = 0;
    state.lowTime = 0;
    state.retry = 0;
  };

  /**
   * Reads the target again, the highest point of the foe's middle seen from here, and faces along the foe while
   * approaching; false, the episode returning, when there is none or it moved more than `targetShift` while lowered.
   */
  const refresh = (view: BodyView, foe: BodySense): boolean => {
    const c = view.stance.centre, from: Vec3 = [c.x, c.y, c.z];
    const opening = highestOpening(foe, segment => highestSurface(foe, segment, from));
    if (!opening || (state.stage !== "approach" && state.target
      && hypot(opening.target[0] - state.target[0], opening.target[2] - state.target[2]) > GROUND_APPROACH.targetShift)) {
      state.stage = "rise";
      return false;
    }
    state.target = opening.target;
    state.surface = opening.segment;
    state.next = view.time + GROUND_APPROACH.refresh;
    if (state.stage === "approach") state.face = lyingAxis(foe);
    return true;
  };

  /**
   * Walks to the place beside the target, by a waypoint `outside` farther out while it is more than `along` ahead or
   * behind, and lowers once settled there, standing and still.
   */
  const approach = (view: BodyView, report: GroundReading): GroundIntent => {
    const c = view.stance.centre, side = state.hand === "right" ? 1 : -1;
    const [x, z] = beside(state.target!, state.face, side, GROUND_NEAR.across, GROUND_NEAR.ahead);
    const outside = Math.abs((x - c.x) * sin(state.face) + (z - c.z) * cos(state.face)) > GROUND_NEAR.along;
    const dx = (outside ? x - side * GROUND_NEAR.outside * cos(state.face) : x) - c.x, dz = (outside ? z + side * GROUND_NEAR.outside * sin(state.face) : z) - c.z;
    const far = hypot(dx, dz);
    const move = far < GROUND_APPROACH.near ? null : clearMove(view, report.heading, walkToward(report.heading, dx, dz));
    if (far < GROUND_APPROACH.settle && view.stance.phase === "stand" && view.stance.velocity.lengthSquared() < GROUND_APPROACH.quiet * GROUND_APPROACH.quiet) {
      state.stage = "lower";
      state.lowTime = 0;
    }
    state.phase = "low-approach";
    return { move, face: state.face, allow: false };
  };

  return { state, reset, withdraw() { state.stage = "rise"; }, decide(view: BodyView, report: GroundReading, foe: BodySense, hand: Side, dt: number): GroundIntent | null {
    const busy = report.actions.find(action => action.target.body === foe.id), support = report.support;
    if (!support) return null;
    state.retry = Math.max(0, state.retry - dt);
    const low = lowOpponent(view, foe);
    if (!state.active) {
      if (!low || busy || support.stage !== "stand") return null;
      if (state.retry) return { move: null, face: report.heading, allow: false };
      state.active = true;
      state.foe = foe.id;
      state.hand = hand;
      state.face = report.heading;
    }
    lapse(state, !low || foe.id !== state.foe || view.down, dt);
    if (state.stage === "rise") return rise(state, busy, support, reset);
    if (view.time >= state.next && !busy && !refresh(view, foe)) return hold(state);
    if (!state.target) return hold(state);
    switch (state.stage) {
      case "approach": return approach(view, report);
      case "lower":
      case "attack": return lowered(state, view.stance.centre, GROUND_NEAR.reach, busy, support);
      default: {
        const never: never = state.stage;
        throw new Error(`unknown ground stage ${never}`);
      }
    }
  } };
}
