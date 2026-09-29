import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { createBody, type BodyCommand, type CoreBody, type Fist } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { MusclePush, Pose } from "../core/control/motor.ts";
import type { World } from "../core/world.ts";

/**
 * **The core lab's routine**: a human walks forward, strikes three times, turns, walks back to
 * where it started and turns again, on a loop. It is an instrument for watching stage 2's muscles,
 * not a mind or a gait, and two parts of it are scaffolds that later stages replace:
 *
 * - **The pelvis is carried** along the path as a kinematic body. Standing and walking are stage 4's
 *   (the plan's "standing on the feet"); until then the legs swing in the air of a carried pelvis
 *   and bear nothing.
 * - **Its commands are hand-set joint poses and pushes**, given to the body (`src/core/body.ts`)
 *   each step as a posture for the servo to hold around the pushes. A mind would give hand goals.
 *
 * Every torque comes from the muscle driver (`src/core/muscle/driver.ts`), so the strikes are as
 * fast as the muscles make them: that is what the page is for. The strikes are hand-set onsets
 * until the strike search chooses them.
 */

/**
 * The servo's time constant, s. At 0.1 s, on this routine, the Warrior and the Rogue at 120 Hz and
 * 480 Hz: late in each settle no joint's speed reversed by more than 0.006 rad/s from one step to
 * the next but the Rogue's wrists at 120 Hz, whose pronation flickered at 0.04 rad/s (`servo`) and
 * radial deviation reversed once at 0.021; and from the end of the first second the guard was held
 * within 0.032 rad at 120 Hz and 0.030 at 480 Hz, the worst at a wrist or the neck (Node stand).
 * That band is Havok's brake on slow bodies (`servo`), and shrinks about as the square of the time
 * constant: at 0.05 s and 960 Hz a wrist's was 0.008 rad. But a time constant needs ten steps (`servo`), 0.083 s at 120 Hz, and
 * under that the wrists ring about pronation.
 */
export const SERVO_SECONDS = 0.1;

export type { Fist, Pose };

/** Fists up before the chin, elbows in. */
const GUARD: Pose = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

/**
 * One freedom pushed toward a speed no joint reaches: which way (+1 or -1), from when to when after
 * the chamber, s, and at what activation (1, flat out, when not given).
 */
export interface Push {
  readonly channel: string;
  readonly sense: 1 | -1;
  readonly from: number;
  readonly to: number;
  readonly level?: number;
}

export interface Strike {
  readonly name: string;
  readonly hand: "left" | "right";
  /** A pose held first, for `seconds`, before the pushes begin; the guard when not given. */
  readonly chamber?: { readonly seconds: number; readonly pose: Pose };
  readonly pushes: readonly Push[];
}

/** A straight from `hand`: the trunk turns away from it, the shoulder drives forward, the elbow opens. */
export function straight(hand: "left" | "right"): Strike {
  const turn = hand === "right" ? -1 : 1;
  return {
    name: `${hand} straight`, hand,
    pushes: [
      { channel: "lumbar rotation right", sense: turn, from: 0, to: 0.2 },
      { channel: "thoracic rotation right", sense: turn, from: 0, to: 0.2 },
      { channel: `shoulder.${hand} flexion`, sense: 1, from: 0.03, to: 0.18 },
      { channel: `elbow.${hand} flexion`, sense: -1, from: 0.06, to: 0.16 },
    ],
  };
}

/** A step of the routine, `seconds` long. */
export type Step =
  | { readonly kind: "settle"; readonly seconds: number }
  | { readonly kind: "walk"; readonly seconds: number; readonly metres: number }
  | { readonly kind: "turn"; readonly seconds: number; readonly radians: number }
  | { readonly kind: "strike"; readonly seconds: number; readonly strike: Strike };

export const ROUTINE: readonly Step[] = [
  { kind: "settle", seconds: 1 },
  { kind: "walk", seconds: 3, metres: 3 },
  { kind: "settle", seconds: 0.5 },
  { kind: "strike", seconds: 0.8, strike: straight("right") },
  { kind: "strike", seconds: 0.8, strike: straight("left") },
  { kind: "strike", seconds: 0.8, strike: straight("right") },
  { kind: "settle", seconds: 0.5 },
  { kind: "turn", seconds: 1, radians: Math.PI },
  { kind: "walk", seconds: 3, metres: 3 },
  { kind: "turn", seconds: 1, radians: Math.PI },
];

/** The walk's scaffold: a stride, and how far each leg swings. */
const STRIDE_METRES = 1.4;
const HIP_SWING = 0.35, KNEE_SWING = 0.7;

/** Where the routine is. */
export interface RoutineState {
  /** Seconds since the routine began. */
  readonly time: number;
  readonly step: Step;
  readonly stepIndex: number;
  /** Seconds into the step. */
  readonly into: number;
}

export interface StrikeReading {
  readonly name: string;
  /** Peak fist speed in the world, m/s, over the strike's window. */
  readonly peak: number;
}

export interface Routine {
  readonly body: CoreBody;
  readonly fists: { readonly left: Fist; readonly right: Fist };
  state(): RoutineState;
  /** The fist speed of the striking hand (or the right one), m/s, last sub-step. */
  fistSpeed(): number;
  /** Each strike thrown so far, most recent last. */
  readonly strikes: readonly StrikeReading[];
  /**
   * How far `hand` is closed into a fist, 0 relaxed to 1 closed, for the skin to draw. The routine
   * owns the strike timing, so it says when; nothing physical reads this.
   */
  closure(hand: "left" | "right"): number;
  dispose(): void;
}

/** Run `ROUTINE` on `built`, a human in its reference pose at the origin, facing +z. */
export function startRoutine(built: BuiltBody, world: World, routine: readonly Step[] = ROUTINE): Routine {
  const pelvis = built.segments.get("lowerTrunk");
  if (!pelvis) throw new Error(`${built.spec.model} is not a human the routine knows`);
  pelvis.body.setMotionType(PhysicsMotionType.ANIMATED);
  const pelvisOrigin = pelvis.node.position.clone(), pelvisRest = pelvis.rest.clone();
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  const fists = body.view.fists;
  const speed = { left: 0, right: 0 };

  const cycle = routine.reduce((sum, step) => sum + step.seconds, 0);
  let time = 0, stepIndex = 0, into = 0;
  // Where the walk has got to: the start of the current step, and the heading.
  const place = { at: new Vector3(), heading: 0, walked: 0 };
  const start = { at: new Vector3(), heading: 0, walked: 0 };
  const strikes: StrikeReading[] = [];
  let peak = 0;

  const heading = new Quaternion(), target = new Vector3(), rotation = new Quaternion();
  /** Where the path is `seconds` into the current step. */
  const locate = (seconds: number) => {
    const step = routine[stepIndex]!;
    const f = Math.min(1, seconds / step.seconds);
    place.at.copyFrom(start.at);
    place.heading = start.heading;
    place.walked = start.walked;
    switch (step.kind) {
      case "walk": {
        const d = step.metres * f;
        place.at.addInPlaceFromFloats(Math.sin(start.heading) * d, 0, Math.cos(start.heading) * d);
        place.walked += d;
        break;
      }
      case "turn": place.heading += step.radians * f; break;
      case "settle": case "strike": break;
      default: { const never: never = step; throw new Error(`unknown step ${JSON.stringify(never)}`); }
    }
  };

  const pushes: MusclePush[] = [];
  const command = { posture: {} as Pose, hands: { left: null, right: null }, pushes, stance: null } satisfies BodyCommand;
  body.drive((_view, dt) => {
    time += dt;
    into += dt;
    while (into >= routine[stepIndex]!.seconds) {
      const done = routine[stepIndex]!;
      locate(done.seconds);
      into -= done.seconds;
      if (done.kind === "strike") strikes.push({ name: done.strike.name, peak });
      peak = 0;
      start.at.copyFrom(place.at);
      start.heading = place.heading;
      start.walked = place.walked;
      stepIndex = (stepIndex + 1) % routine.length;
      if (stepIndex === 0) time = time % cycle;
    }
    locate(into);
    const step = routine[stepIndex]!;

    // The carried pelvis (scaffold): the reference pose turned to the heading, at the path's point.
    Quaternion.RotationYawPitchRollToRef(place.heading, 0, 0, heading);
    pelvisOrigin.applyRotationQuaternionToRef(heading, target).addInPlace(place.at);
    heading.multiplyToRef(pelvisRest, rotation);
    pelvis.body.setTargetTransform(target, rotation);

    // The fists, as the last sub-step left them.
    for (const side of ["left", "right"] as const) speed[side] = fists[side].velocity.length();
    if (step.kind === "strike") peak = Math.max(peak, speed[step.strike.hand]);

    // The legs' swing (scaffold), phased by the distance walked.
    const phase = (2 * Math.PI * place.walked) / STRIDE_METRES;
    const walking = step.kind === "walk";
    const legs: Record<string, number> = walking ? {
      "hip.left flexion": HIP_SWING * Math.sin(phase), "hip.right flexion": -HIP_SWING * Math.sin(phase),
      "knee.left flexion": KNEE_SWING * Math.max(0, Math.cos(phase)), "knee.right flexion": KNEE_SWING * Math.max(0, -Math.cos(phase)),
    } : {};

    // A strike's chamber, then its pushes, timed from the chamber's end.
    const strike = step.kind === "strike" ? step.strike : undefined;
    const chambered = strike?.chamber && into < strike.chamber.seconds ? strike.chamber.pose : undefined;
    const since = into - (strike?.chamber?.seconds ?? 0);
    pushes.length = 0;
    if (strike && !chambered) {
      for (const p of strike.pushes) if (since >= p.from && since < p.to) pushes.push({ channel: p.channel, sense: p.sense, level: p.level ?? 1 });
    }
    command.posture = { ...GUARD, ...chambered, ...legs };
    return command;
  });

  return {
    body,
    fists,
    strikes,
    state: () => ({ time, step: routine[stepIndex]!, stepIndex, into }),
    fistSpeed: () => {
      const step = routine[stepIndex]!;
      return step.kind === "strike" ? speed[step.strike.hand] : Math.max(speed.left, speed.right);
    },
    closure: (hand) => {
      const step = routine[stepIndex]!, before = routine[(stepIndex + routine.length - 1) % routine.length]!;
      if (step.kind === "strike" && step.strike.hand === hand) return Math.min(1, into / FIST_CLOSING);
      if (before.kind === "strike" && before.strike.hand === hand) return Math.max(0, 1 - into / FIST_OPENING);
      return 0;
    },
    dispose: () => body.dispose(),
  };
}

/**
 * A striking hand closes over `FIST_CLOSING` seconds from its strike's start, before the elbow's
 * push begins at 0.06 s, and opens over `FIST_OPENING` seconds of the step after. Chosen by eye.
 */
const FIST_CLOSING = 0.1, FIST_OPENING = 0.25;
