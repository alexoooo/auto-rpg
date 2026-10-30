import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Pose } from "../../spec/pose.ts";
import type { MotionCommand } from "../../control/whole-body/tasks.ts";
import { turnAboutToRef } from "../../math/turn.ts";
import type { Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";
import type { ReadSegment } from "../../read-body.ts";

/**
 * **The whole-body solve's settings** (`wholeBodyTracking`), the spike's own choices
 * (`docs/reference/whole-body-spike.md#settings`). The contact model is the support task's, as are
 * the joints' feedback and weights; the rest were set by the spike's prototypes.
 */
export const WHOLE_BODY = deepFreeze({
  contact: { maxPoints: 64, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
    iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 },
  effortCost: 1e-6, capacity: 5,
  /** The pelvis this far under its height over the soles in the reference pose, where a body is built, m, and the knees' bend, rad. */
  lower: 0.04, knee: 0.3,
  /** Joints toward the guard: their feedback, s, and weights, legs and the rest. */
  jointSeconds: 0.3, legWeight: 0.02, otherWeight: 0.1,
  /** The mass centre over the soles' middle and the pelvis's height and turn: feedback, s, and weights. */
  holdSeconds: 0.25, centreWeight: 10, rootWeight: 1,
  /** The timed punch: the fist's path, s; how far past the target it aims, m; the pelvis's and chest's turn, rad; each link's lead, s. */
  punch: { seconds: 0.12, through: 0.2, pelvis: 0.25, chest: 0.45, lead: 0.06,
    /** The fist's and the turns' feedback, s, and weights; the arm's joints' weight while the fist is driven. */
    fistSeconds: 0.05, fistWeight: 3, turnSeconds: 0.15, turnWeight: 1, armWeight: 0.001,
    /** How long after contact the fist is driven on, s; a blow and its return at most, s; returned within, m. */
    follow: 0.03, cycle: 2, returned: 0.05 },
});

/**
 * **The flat-out drive's settings**: the fist driven along the line from where its drive begins to
 * `through` m past the target at `push` m/s^2, beyond what any muscle gives, so the bounded solve
 * gives what it can; held to the line over `fistSeconds`. With `runup`, the fist is first drawn back
 * along the line to that far from the target, over `windSeconds` until within `wound` m. The
 * channels of `free` are let go of the guard (weight `armWeight`) while the fist is driven; `turns`
 * adds the timed punch's pelvis and chest turns. A drive lasts `longest` s at most. The grid's best
 * (`docs/reference/whole-body-spike.md#flat-out`).
 */
export const FLAT_OUT = deepFreeze({
  push: 240, through: 0.2, fistSeconds: 0.05, fistWeight: 3,
  runup: 0.25 as number | null, windSeconds: 0.06, wound: 0.03,
  free: "arm,trunk", armWeight: 0.001, turns: true,
  longest: 0.45, follow: 0.03, cycle: 2, returned: 0.05,
});

/** The channels each name in a flat-out drive's `free` lets go, for `hand`. */
const FREE: Readonly<Record<string, (hand: Side) => string>> = Object.freeze({
  arm: (hand: Side) => `(shoulder|elbow|wrist)\\.${hand}`, trunk: () => "thoracic|lumbar", hips: () => "hip\\.", legs: () => "hip\\.|knee\\.|ankle\\.",
});

/** The channels `free` names (`FlatOut.free`), for `hand`. */
export function freeChannels(free: string, hand: Side): RegExp {
  return new RegExp(free.split(",").map((name) => {
    const named = FREE[name];
    if (!named) throw new Error(`no channels named ${JSON.stringify(name)}`);
    return named(hand);
  }).join("|"));
}

const ZERO: Vec3 = Object.freeze([0, 0, 0]) as unknown as Vec3;
const UP = new Vector3(0, 1, 0);

/** Minimum-jerk progress `s`, rate `v` and acceleration `a`, `t` s into a move of `span` s. */
export function minimumJerk(t: number, span: number): { s: number; v: number; a: number } {
  const u = Math.max(0, Math.min(1, t / span)), u2 = u * u, u3 = u2 * u;
  return { s: u3 * (10 - 15 * u + 6 * u2), v: (30 * u2 - 60 * u3 + 30 * u2 * u2) / span, a: (60 * u - 180 * u2 + 120 * u3) / (span * span) };
}

/** `point`, body frame, reference pose, in `segment`'s node frame: where a frame goal's `at` is read. */
export function localPoint(segment: Pick<ReadSegment, "frame">, point: Vec3): Vec3 {
  const { origin, x, y, z } = segment.frame, d0 = point[0] - origin[0], d1 = point[1] - origin[1], d2 = point[2] - origin[2];
  return [d0 * x[0] + d1 * x[1] + d2 * x[2], d0 * y[0] + d1 * y[1] + d2 * y[2], d0 * z[0] + d1 * z[1] + d2 * z[2]];
}

/** Every channel of `model` toward `guard`, the knees bent, the channels `light` names at `lightWeight`. */
export function guardJoints(model: { readonly channels: readonly { readonly name: string; readonly min: number; readonly max: number }[] }, guard: Pose,
  light: RegExp | null = null, lightWeight: number = WHOLE_BODY.otherWeight): MotionCommand["joints"] {
  return model.channels.map((c) => ({ channel: c.name,
    angle: Math.max(c.min, Math.min(c.max, guard[c.name] ?? (/knee/.test(c.name) ? WHOLE_BODY.knee : 0))), rate: 0, acceleration: 0,
    seconds: WHOLE_BODY.jointSeconds, weight: /hip|knee|ankle/.test(c.name) ? WHOLE_BODY.legWeight : light?.test(c.name) ? lightWeight : WHOLE_BODY.otherWeight }));
}

type SegmentFrame = { readonly kind: "segment"; readonly name: string };

/** The goals the stance holds: the mass centre of `segments` over the soles' `middle` (x, z), and the pelvis at `height`. */
export function holdGoals(middle: Vec3, height: number, segments: readonly SegmentFrame[]) {
  return {
    frame: { id: "height", frame: { kind: "segment" as const, name: "lowerTrunk" }, at: ZERO, translation: { target: [0, height, 0] as Vec3,
      velocity: ZERO, acceleration: ZERO, seconds: WHOLE_BODY.holdSeconds, weight: WHOLE_BODY.rootWeight, axes: ["y" as const] } },
    centre: { id: "centre", frames: segments, translation: { target: middle, velocity: ZERO, acceleration: ZERO,
      seconds: WHOLE_BODY.holdSeconds, weight: WHOLE_BODY.centreWeight, axes: ["x" as const, "z" as const] } },
  };
}

/** The turn about up that brings `hand`'s shoulder forward: a turn of a positive angle about up carries a body's right (+x) back (-z). */
export const turnSense = (hand: Side): 1 | -1 => hand === "right" ? -1 : 1;

/** A minimum-jerk turn about up of `angle` rad the `sense` way, `t` s into `span` s, from the turn `from`: an orientation goal. */
export function trunkTurn(from: readonly [number, number, number, number], sense: number, angle: number, t: number, span: number, weight: number) {
  const m = minimumJerk(t, span), q = turnAboutToRef(UP, sense * angle * m.s, new Quaternion());
  q.multiplyToRef(new Quaternion(from[0], from[1], from[2], from[3]), q);
  return { target: [q.x, q.y, q.z, q.w] as [number, number, number, number], velocity: [0, sense * angle * m.v, 0] as Vec3,
    acceleration: [0, sense * angle * m.a, 0] as Vec3, seconds: WHOLE_BODY.punch.turnSeconds, weight };
}
