import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { contactResponse, type EffectorFeedback } from "../control/effector-feedback.ts";
import type { EffectorGoal } from "../control/motor.ts";
import { hypot } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { advanceStrike, strikeTransition, STRIKE_EVENT, type StrikeCycleState, type StrikeLimits } from "./strike-cycle.ts";

/** How a strike's contact is held: for how long and how far, and how square to the surface the stroke must meet it. */
interface StrikeImpact {
  readonly impactSeconds: number;
  readonly impactTravel: number;
  /** The least share of the stroke's speed along the contact's normal that admits the contact. */
  readonly normalAlignment: number;
}

/** **What strikes**: an effector's point, the cycle's limits, and how long its chamber and return take. */
interface StrikeDef {
  readonly effector: string;
  readonly point: string;
  /** The cycle's limits; with no `impact`, a contact ends the stroke. */
  readonly limits: StrikeLimits & { readonly impact?: StrikeImpact };
  readonly chamberSeconds: number;
  readonly returnSeconds: number;
  /** Each goal's tracking response, s; the tracker's own where absent. */
  readonly response?: number;
}

/** A strike's cycle, where its point was at the last read (root frame), and what its strokes have come to. */
export interface StrikeState extends StrikeCycleState {
  previous: Vec3 | null;
  thrown: number;
  returned: number;
  failed: number;
  admitted: number;
  aborted: number;
}

/** Where a strike goes this step, in the root frame: home, the chamber, the target and the stroke's end. */
export interface StrikeCourse {
  readonly home: Vec3;
  readonly chamber: Vec3;
  readonly target: Vec3;
  /** The point's velocity on reaching the target. */
  readonly contactVelocity: Vec3;
  /** How long the stroke takes. */
  readonly seconds: number;
  readonly curve?: Vec3;
}

/** What a strike's skill reads of the body and of the attack this step. */
interface StrikeConditions {
  readonly requested: boolean;
  readonly down: boolean;
  readonly supported: boolean;
  readonly prepared: boolean;
  /** Whether a contact may be the strike's: a foot still bearing weight touches the ground, not the foe. */
  readonly free: boolean;
  readonly targetId: string | undefined;
}

const STILL: Vec3 = Object.freeze([0, 0, 0]) as unknown as Vec3;

/**
 * **One effector's strike on the shared cycle** (`advanceStrike`): its point's velocity, whether a
 * contact is the intended target's and square to it, what each stroke comes to, and the goal of
 * each phase, a held contact's included. A skill gives it the course and the conditions; the
 * stages around a strike (a kick's support transfer) stay the skill's.
 */
export function effectorStrike(def: StrikeDef) {
  const state: StrikeState = { phase: null, time: 0, ready: 0, sequence: 0, velocity: [0, 0, 0], touching: false, impact: null,
    previous: null, thrown: 0, returned: 0, failed: 0, admitted: 0, aborted: 0 };
  const direction = new Vector3();
  const aligned = (view: BodyView, feedback: EffectorFeedback | undefined, velocity: Vec3) => {
    const alignment = def.limits.impact?.normalAlignment, normal = feedback?.contact?.normal, unit = hypot(...velocity);
    if (alignment === undefined || !normal || !(unit > 0)) return false;
    direction.set(...velocity).applyRotationQuaternionToRef(view.root.rotation, direction);
    return Math.abs(direction.x * normal[0] + direction.y * normal[1] + direction.z * normal[2]) / unit >= alignment;
  };
  const seconds = (course: StrikeCourse) =>
    state.phase === "chamber" ? def.chamberSeconds : state.phase === "return" ? def.returnSeconds : course.seconds;
  return {
    state,
    /** The point's velocity by its move since the last read (zero on the first), the point kept as `previous`. */
    read(view: BodyView, dt: number): Vec3 {
      const p = view.effectors[def.effector]!.points[def.point]!, was = state.previous;
      const velocity: Vec3 = was ? [(p.x - was[0]) / dt, (p.y - was[1]) / dt, (p.z - was[2]) / dt] : [0, 0, 0];
      state.previous = [p.x, p.y, p.z];
      return velocity;
    },
    /** Begin a phase from the point's measured velocity. */
    begin(phase: StrikeCycleState["phase"], velocity: Vec3) { strikeTransition(state, phase, velocity); },
    /** Advance the cycle from the last read; the events it gives (`STRIKE_EVENT`) are counted. */
    step(view: BodyView, velocity: Vec3, course: StrikeCourse, conditions: StrikeConditions, dt: number): number {
      const feedback = view.effectors[def.effector]!.feedback, { targetId } = conditions;
      const event = advanceStrike(state, { at: state.previous!, velocity, home: course.home, chamber: course.chamber,
        requested: conditions.requested, down: conditions.down, supported: conditions.supported, prepared: conditions.prepared,
        touching: conditions.free && (feedback?.impulse ?? 0) > 0, intended: !!targetId && contactResponse(feedback, targetId) === "target",
        aligned: aligned(view, feedback, course.contactVelocity), contactVelocity: course.contactVelocity, seconds: course.seconds }, def.limits, dt);
      if (event & STRIKE_EVENT.thrown) state.thrown++;
      if (event & STRIKE_EVENT.returned) state.returned++;
      if (event & STRIKE_EVENT.failed) state.failed++;
      if (event & STRIKE_EVENT.admitted) state.admitted++;
      if (event & STRIKE_EVENT.aborted) state.aborted++;
      return event;
    },
    /** How long the phase under way takes, a held contact aside. */
    seconds,
    /** The point's goal in the phase under way, or through a held contact; `orientation` turns the effector as it goes. */
    goal(course: StrikeCourse, orientation?: EffectorGoal["orientation"]): EffectorGoal {
      const { phase, impact } = state;
      const position = impact ? impact.finish : phase === "chamber" ? course.chamber : phase === "return" ? course.home : course.target;
      return { ...(def.response === undefined ? {} : { response: def.response }), places: [{ point: def.point, position }],
        seconds: impact ? def.limits.impact!.impactSeconds : seconds(course), follows: true, initialVelocity: state.velocity, sequence: state.sequence,
        ...(orientation ? { orientation } : {}),
        ...(impact ? { terminalVelocity: STILL }
          : phase === "swing" ? { terminalVelocity: course.contactVelocity, ...(course.curve ? { curve: course.curve } : {}) } : {}) };
    },
    /** A new goal sequence, for a goal the skill gives the effector outside the cycle (a kick's placing). */
    renew() { state.sequence++; },
    /** No strike under way, and no point read. */
    reset() { strikeTransition(state, null, [0, 0, 0]); state.touching = false; state.previous = null; },
  };
}
