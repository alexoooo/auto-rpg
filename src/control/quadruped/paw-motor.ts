import type { BodyControl } from "../../core/bodies/body-control.ts";
import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import type { MotorPart } from "../motor-part.ts";
import { UNREACHABLE, type Carrying, type FreedomPath, type MotorUnmet, type MusclePush } from "../motor.ts";
import { effectorTracker } from "../effector-tracker.ts";
import { servoAsk, servoSolve } from "../servo.ts";
import type { StanceEnd, StanceReading } from "../stance.ts";
import { supportedMotor, type SupportGoal } from "../supported-motor.ts";
import { atan2 } from "../../core/math/real.ts";
import type { MuscleReading } from "../../core/bodies/muscle/driver.ts";
import { angularMomentumToRef, partsOn, turnOfToRef } from "../../core/bodies/read-motion.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { AssistReading } from "../../core/bodies/assist.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { fitsPaws } from "./fit.ts";
import { pawEndpoints, pawReader } from "./paws.ts";
import { REPTILE_MOTOR, REPTILE_TRAVEL } from "./tuning.ts";

/** **The paw motor**'s config. */
interface PawMotorConfig { readonly kind: "paw-motor" }

/** The goals the paw motor carries: its effectors' places, a support over its paws and freedoms along paths. */
const PAW_GOALS = Object.freeze(["effectors", "support", "paths"] as const);

/** No freedom pushed, and none carried along a path. */
const NO_PUSHES: readonly MusclePush[] = Object.freeze([]), NO_PATHS: Readonly<Record<string, FreedomPath>> = Object.freeze({});

/**
 * **The paw motor** over a body's paws (`pawEndpoints`): its effectors' places followed by an
 * effector tracker (`effectorTracker`), and a support goal (`SupportGoal`) carried out by the
 * floating-base support solve (`supportedMotor`), holding at `REPTILE_MOTOR`'s response and
 * travelling at `REPTILE_TRAVEL`'s, each paw that does not bear as asked carried along its swing.
 * A support of another count (`SupportGoal.sequence`) lets the paws' swings go and begins the solve's
 * motion afresh. A freedom carried along a path (`FreedomPath`) goes by it, at its own response
 * where it names one. With no support it servoes the posture, the paths and the effectors' places,
 * and drives the pushes. It reads its paws by the body's paw reader (`pawReader`), and what bears
 * the body as a stance reads it (`StanceReading`): a paw touches where the ground bears it; the
 * support is the touching paws' middle; the place, the plan and the pace are the support goal's.
 */
function pawMotor(built: ReadBody, muscles: MuscleReading, posture: Pose = {}, assist: AssistReading | null = null): Carrying<"effectors" | "support" | "paths"> {
  const endpoints = pawEndpoints(built), reader = pawReader(built), names = endpoints.map((end) => end.segment);
  const supported = supportedMotor({ built, muscles, assist }, endpoints, REPTILE_MOTOR, reader);
  const root = supported.root, tracker = effectorTracker(built, root, { seedActual: true });
  const channels = muscles.channels, freedoms = channels.length;
  const unmet: MotorUnmet = { pushes: new Uint8Array(freedoms), points: 0 };
  const state = { pose: posture, pushes: NO_PUSHES, paths: NO_PATHS, goal: null as SupportGoal | null, sequence: -1,
    motor: supported.state, tracker: tracker.state, unmet };
  const parts = partsOn(built), turn = new Quaternion(), front = new Vector3(), forward = new Vector3(0, 0, 1);
  const work = { offset: new Vector3(), motion: new Vector3(), local: new Vector3(), turn: new Quaternion() };
  const zero = (): StanceEnd["asked"] => ({ at: new Vector3(), force: new Vector3(), moment: new Vector3() });
  const ends: Record<string, StanceEnd> = Object.fromEntries(endpoints.map((end, i) => {
    const paw = reader.state.endpoints[i]!, asked = zero();
    return [end.segment, { middle: paw.at, get touching() { return paw.contact; }, asked }];
  }));
  const reading = {
    centre: reader.state.centre, velocity: reader.state.velocity, momentum: new Vector3(), support: new Vector3(), facing: 0, ends,
    place: new Vector3(), plan: new Vector3(), planVelocity: new Vector3(), phase: "stand" as StanceReading["phase"], own: null, recoveries: 0, strides: 0,
    pace: [0, 0] as [number, number], shortfall: supported.state.shortfall,
  };
  /** Channel `i`'s path this step (`FreedomPath`), where one carries it. */
  const path = (i: number): FreedomPath | undefined => state.paths[channels[i]!.name];
  const along = (i: number): readonly [number, number, number] | undefined => { const p = path(i); return p ? [p.angle, p.rate, p.acceleration] : undefined; };
  const read = (): void => {
    supported.read();
    turnOfToRef(root, turn); forward.applyRotationQuaternionToRef(turn, front);
    reading.facing = atan2(front.x, front.z);
    angularMomentumToRef(parts().segments, reading.centre, reading.velocity, reading.momentum, work.offset, work.motion, work.local, work.turn);
    let touching = 0;
    reading.support.setAll(0);
    for (const paw of reader.state.endpoints) if (paw.contact) { reading.support.addInPlace(paw.at); touching++; }
    if (touching) reading.support.scaleInPlace(1 / touching); else reading.support.copyFrom(reading.centre);
    const goal = state.goal;
    if (goal) {
      reading.place.set(goal.centre[0], 0, goal.centre[2]); reading.plan.set(...goal.centre); reading.planVelocity.set(...goal.velocity);
      reading.pace[0] = goal.velocity[0]; reading.pace[1] = goal.velocity[2];
      reading.phase = goal.ends.every((end) => end.bearing) ? "stand" : "swing";
    } else {
      reading.place.copyFrom(reading.centre); reading.plan.copyFrom(reading.centre); reading.planVelocity.setAll(0);
      reading.pace[0] = 0; reading.pace[1] = 0; reading.phase = "stand";
    }
  };
  const control = (driver: MuscleReading, command: BodyControl, dt: number): void => {
    const goal = state.goal, pushes = state.pushes;
    unmet.pushes.fill(0);
    if (goal) {
      goal.ends.forEach((end, i) => { if (end.swing) tracker.reach(names[i]!, end.swing); else tracker.release(names[i]!); });
      const tracked = tracker.step(driver, state.pose, dt);
      // A support's solve drives every freedom: a push asked beside it is not carried out.
      for (const push of pushes) unmet.pushes[muscles.channel(push.channel)] = 1;
      supported.control({ centre: goal.centre, velocity: goal.velocity, rotation: goal.rotation, endpoints: goal.ends, posture: state.pose }, command, dt,
        (i) => along(i) ?? tracked(i), goal.hold ? REPTILE_MOTOR : REPTILE_TRAVEL,
        (i) => path(i)?.seconds ?? tracker.response(channels[i]!.name), (i) => tracker.firm(i));
      return;
    }
    const tracked = tracker.step(driver, state.pose, dt);
    const work = servoAsk(driver, command.muscles, (i) => {
      const name = channels[i]!.name, push = pushes.find((p) => p.channel === name);
      if (!push) return path(i)?.angle ?? tracked(i)?.[0] ?? state.pose[name] ?? 0;
      command.muscles.velocity[i] = push.speed ?? push.sense * UNREACHABLE;
      command.muscles.activation[i] = push.level;
      return undefined;
    }, REPTILE_MOTOR.posture, dt, {
      seconds: (i) => path(i)?.seconds ?? tracker.response(channels[i]!.name) ?? REPTILE_MOTOR.posture,
      rate: (i) => along(i)?.[1] ?? tracked(i)?.[1] ?? 0,
      acceleration: (i) => along(i)?.[2] ?? tracked(i)?.[2] ?? 0,
    });
    servoSolve(driver, command.muscles, work);
  };
  read();
  return {
    carries: PAW_GOALS, read, reading, control, root, unmet, state,
    effectors: tracker.models, reach: tracker.reach, release: tracker.release, path: tracker.path, pointToRef: tracker.pointToRef,
    setPosture(next) { state.pose = next; },
    setPushes(next) { state.pushes = next; },
    setPaths(next) { state.paths = next; },
    setSupport(next) {
      // A support of another count begins afresh: the paws' swings are let go, and the solve's motion is read anew.
      if (next && next.sequence !== state.sequence) { for (const name of names) tracker.release(name); supported.resume(); state.sequence = next.sequence; }
      state.goal = next;
    },
    get supported() { return state.goal; },
    reset() {
      state.pushes = NO_PUSHES; state.paths = NO_PATHS; state.goal = null; state.sequence = -1;
      tracker.reset(); supported.resume();
    },
  };
}

/** **The paw motor** (`pawMotor`) as a motor control: a body on three paws or more (`fitsPaws`). */
export const PAW_MOTOR: MotorPart<PawMotorConfig> = deepFreeze({
  role: "motor", label: "Paw support", stage: "game", fields: [], slots: [], defaults: { kind: "paw-motor" }, keys: { kind: true },
  fits: fitsPaws, faults: () => [],
  make: () => (built, muscles, _seconds, posture, _tuning, assist) => pawMotor(built, muscles, posture, assist),
});
