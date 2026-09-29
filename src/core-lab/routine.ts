import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import { servoToward } from "../core/control/servo.ts";
import { driveMuscles, type MuscleDriver } from "../core/muscle/driver.ts";

/**
 * **The core lab's routine**: a human walks forward, strikes three times, turns, walks back to
 * where it started and turns again, on a loop. It is an instrument for watching stage 2's muscles,
 * not a mind or a gait, and two parts of it are scaffolds that later stages replace:
 *
 * - **The pelvis is carried** along the path as a kinematic body. Standing and walking are stage 4's
 *   (the plan's "standing on the feet"); until then the legs swing in the air of a carried pelvis
 *   and bear nothing.
 * - **Poses are held joint by joint** (`servoToward`, `src/core/control/servo.ts`), each freedom
 *   on its own. Stage 3's motor control builds its goals on the servo; hand-set joint poses are the
 *   scaffold.
 *
 * Every torque comes from the muscle driver (`src/core/muscle/driver.ts`), so the strikes are as
 * fast as the muscles make them: that is what the page is for. The strikes are hand-set onsets
 * until the strike search chooses them.
 */

/**
 * The servo's time constant, s. At 0.1 s, on this routine, the Warrior and the Rogue at 120 Hz and
 * 480 Hz: late in each settle no joint's speed reversed by more than 0.02 rad/s from one step to
 * the next, and at the end of the first second the guard was held within 0.004 rad (Node stand).
 */
export const SERVO_SECONDS = 0.1;

/** Joint angles, rad, by channel name; a freedom not named is held at its reference angle. */
type Pose = Readonly<Record<string, number>>;

/** Fists up before the chin, elbows in. */
const GUARD: Pose = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

/** One freedom pushed flat out: which way (+1 or -1), from when to when after the strike starts, s. */
interface Push { readonly channel: string; readonly sense: 1 | -1; readonly from: number; readonly to: number }

export interface Strike {
  readonly name: string;
  readonly hand: "left" | "right";
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
  readonly driver: MuscleDriver;
  state(): RoutineState;
  /** The fist speed of the striking hand (or the right one), m/s, last sub-step. */
  fistSpeed(): number;
  /** Each strike thrown so far, most recent last. */
  readonly strikes: readonly StrikeReading[];
  dispose(): void;
}

/**
 * The speed of the hand's far end, from the hand body's velocity: its centre's, plus its spin
 * across the arm from the centre to the end (Havok's linear velocity is the centre of mass's,
 * H49). Not from the nodes: after a limit's impulse Havok moves them behind the body for several
 * steps (`src/core/build/joint-state.ts`), and a fist read from them jumped from 6.7 to 11.4 m/s
 * for one step as the elbow met its stop (Node stand, 120 Hz).
 */
const fistOf = (hand: BuiltSegment) => {
  const length = Math.hypot(...hand.spec.distal.value.map((v, i) => v - hand.spec.proximal.value[i]!));
  const { origin, x, y, z } = hand.frame;
  const offset = hand.spec.centreOfMass.value.map((c, i) => c - origin[i]!);
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  // From the centre of mass to the far end, in the hand's own frame.
  const arm = new Vector3(dot(offset, x), dot(offset, y), dot(offset, z)).scaleInPlace(-1).addInPlaceFromFloats(0, length, 0);
  const lever = new Vector3(), linear = new Vector3(), angular = new Vector3();
  return (): number => {
    arm.applyRotationQuaternionToRef(hand.node.rotationQuaternion!, lever);
    hand.body.getLinearVelocityToRef(linear);
    hand.body.getAngularVelocityToRef(angular);
    return Vector3.CrossToRef(angular, lever, angular).addInPlace(linear).length();
  };
};

/** Run `ROUTINE` on `built`, a human in its reference pose at the origin, facing +z. */
export function startRoutine(built: BuiltBody, scene: Scene, routine: readonly Step[] = ROUTINE): Routine {
  const pelvis = built.segments.get("lowerTrunk");
  const hands = { left: built.segments.get("hand.left"), right: built.segments.get("hand.right") };
  if (!pelvis || !hands.left || !hands.right) throw new Error(`${built.spec.model} is not a human the routine knows`);
  pelvis.body.setMotionType(PhysicsMotionType.ANIMATED);
  const pelvisOrigin = pelvis.node.position.clone(), pelvisRest = pelvis.rest.clone();
  const fist = { left: fistOf(hands.left), right: fistOf(hands.right) };
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

  const driver = driveMuscles(built, scene, (d, dt) => {
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
    for (const side of ["left", "right"] as const) speed[side] = fist[side]();
    if (step.kind === "strike") peak = Math.max(peak, speed[step.strike.hand]);

    // The legs' swing (scaffold), phased by the distance walked.
    const phase = (2 * Math.PI * place.walked) / STRIDE_METRES;
    const walking = step.kind === "walk";
    const legs: Record<string, number> = walking ? {
      "hip.left flexion": HIP_SWING * Math.sin(phase), "hip.right flexion": -HIP_SWING * Math.sin(phase),
      "knee.left flexion": KNEE_SWING * Math.max(0, Math.cos(phase)), "knee.right flexion": KNEE_SWING * Math.max(0, -Math.cos(phase)),
    } : {};

    for (let i = 0; i < d.channels.length; i++) {
      const name = d.channels[i]!.name;
      d.activation[i] = 1;
      const push = step.kind === "strike"
        ? step.strike.pushes.find((p) => p.channel === name && into >= p.from && into < p.to) : undefined;
      if (push) {
        // A speed no joint reaches: the motor is a torque source at the muscles' ceiling.
        d.velocity[i] = push.sense * UNREACHABLE;
      } else {
        servoToward(d, i, legs[name] ?? GUARD[name] ?? 0, SERVO_SECONDS, dt);
      }
    }
  });

  return {
    driver,
    strikes,
    state: () => ({ time, step: routine[stepIndex]!, stepIndex, into }),
    fistSpeed: () => {
      const step = routine[stepIndex]!;
      return step.kind === "strike" ? speed[step.strike.hand] : Math.max(speed.left, speed.right);
    },
    dispose: () => driver.dispose(),
  };
}

/** Rad/s beyond any joint's unloaded speed. */
const UNREACHABLE = 1e3;
