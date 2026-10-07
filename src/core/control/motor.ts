import { effectorTracker, type EffectorGoal } from "./effector-tracker.ts";
import type { EffectorModel } from "./effectors.ts";
import { type Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rootSegment, type BuiltBody, type BuiltSegment } from "../build/build-body.ts";
import type { MuscleController, MuscleDriver } from "../muscle/driver.ts";
import type { Assist } from "./assist.ts";
import { servoAsk, servoSolve } from "./servo.ts";
import { stanceControl, type StanceControl, type StanceGoal } from "./stance.ts";
import type { StanceTuning } from "./stance-tuning.ts";

/** Joint angles, rad, by channel name. */
export type Pose = Readonly<Record<string, number>>;

/**
 * A freedom driven flat out: its muscles pull toward `sense` (+1 or -1) at activation `level`
 * (0 to 1), a torque source at their ceiling, while the servo solves every other freedom around it.
 */
export interface MusclePush {
  readonly channel: string;
  readonly sense: 1 | -1;
  readonly level: number;
}

export type { EffectorGoal } from "./effector-tracker.ts";

/**
 * **Motor control: goals in, muscle commands out.** A body is given a posture (angles for the
 * freedoms, by name, the rest held at their reference angles) and, for each effector (`BodySpec.effectors`:
 * a hand, a foot), places for named points of its rigid body (a hand's knuckles, a point of what it
 * holds) in the body frame (the root's frame, `kinematics.ts`) and the time to get there
 * (`EffectorGoal`). Each point travels a straight, minimum-jerk path from where it is; each step the
 * paths' points become the angles of the effector's chain (an arm's shoulder, elbow and wrist) by
 * inverse kinematics, with the rest of the body at the posture's angles, and the servo
 * (`servo.ts`) follows those angles with their rates and accelerations fed forward, bounded by the
 * muscles. What a goal leaves free of an arm (one place leaves four of its seven freedoms, two leave
 * two) settles toward the posture's angles.
 * The wrist is the arm's: held at the posture's angle, a point of a held item half a metre from
 * the hand has no path the solve can follow (`docs/reference/human-and-strikes.md#ik`).
 *
 * The rates and accelerations are the inverse kinematics differenced a step either side along the
 * path, each solved from the angles the last step found.
 *
 * A pushed freedom (`MusclePush`) is left to its muscles, whichever goal would own it, and the
 * servo solves the others around the torque it gives.
 *
 * With a stance (`StanceGoal`), the stance legs carry the body on the ground (`stance.ts`) and the
 * posture and the servo keep the rest; without one, the legs hold the posture from the pelvis, as a
 * body carried or in the air.
 */
export interface MotorControl {
  /** What it can reach with, in declared order. */
  readonly effectors: readonly EffectorModel[];
  /** The controller for `driveMuscles`. */
  readonly control: MuscleController;
  /** Hold `pose` for every freedom no effector's goal owns, from `control`'s next call. */
  setPosture(pose: Pose): void;
  /**
   * Take the effector of `segment` to `goal`, from `control`'s next call. It refuses, with the
   * reason, a point its rigid body has not, no place or more than two, and two places whose
   * distance apart differs from their points' by more than `PLACES_SLACK`.
   */
  reach(segment: string, goal: EffectorGoal): void;
  /** Give the chain of `segment`'s effector back to the posture. */
  release(segment: string): void;
  /** Drive `pushes` flat out from `control`'s next call, in place of those before. */
  setPushes(pushes: readonly MusclePush[]): void;
  /** Stand on the ground as `goal` asks, or with null leave the legs to the posture, from `control`'s next call. */
  setStance(goal: StanceGoal | null): void;
  /** The stance goal it was last given, or null: what the legs are asked to hold. */
  readonly standing: StanceGoal | null;
  /** Forget what was under way: no pushes, no stance, no effector's goal, and the stance's own memory (`StanceControl.reset`). The posture stays. */
  reset(): void;
  /** The stance's readings, as its last step left them. */
  readonly stance: StanceControl;
  /** Where the path of `segment`'s first place stands now (body frame), or null with no goal. */
  path(segment: string): Vector3 | null;
  /** Where `point` of `segment`'s rigid body is now, body frame. */
  pointToRef(segment: string, point: string, out: Vector3): Vector3;
  /** The segment whose frame the body frame is carried by. */
  readonly root: BuiltSegment;
  /** Its memory (`src/core/state.ts`): the goals it was last given, each effector's path, their solves counted (`ReachMeter`), and the stance's. */
  readonly state: object;
}

/** Motor control of `built`, servoing at a time constant of `seconds`; its stance asks `assist` for what the soles miss. */
export function motorControl(built: BuiltBody, seconds: number, posture: Pose = {}, stanceTuning?: StanceTuning, assist: Assist | null = null): MotorControl {
  const stance = stanceControl(built, stanceTuning, assist);
  const root = rootSegment(built);
  const tracker = effectorTracker(built, root);
  const state = { pose: posture, pushes: [] as readonly MusclePush[], standing: null as StanceGoal | null,
    effectors: tracker.state.effectors, reach: tracker.state.reach, stance: stance.state };
  const control: MuscleController = (driver: MuscleDriver, dt: number) => {
    const { pose, pushes, standing } = state;
    const owned = tracker.step(driver, pose, dt, !!standing?.pose);
    stance.command(driver, standing, dt);
    const work = servoAsk(driver, (i) => {
      const name = driver.channels[i]!.name;
      const push = pushes.find((p) => p.channel === name);
      if (!push) return standing && stance.owned[i] ? undefined : owned(i)?.[0] ?? pose[name] ?? 0;
      driver.velocity[i] = push.sense * UNREACHABLE;
      driver.activation[i] = push.level;
      return undefined;
    }, seconds, dt, {
      seconds: (i) => {
        if (!owned(i)) return standing?.pose?.seconds ?? seconds;
        const name = driver.channels[i]!.name;
        return tracker.response(name) ?? seconds;
      },
      rate: (i) => owned(i)?.[1] ?? 0,
      acceleration: (i) => owned(i)?.[2] ?? 0,
    });
    // Standing by torque, the stance asks the root's acceleration, the servo carries the rest of the
    // body with it, and the stance legs take what that leaves the ground to give.
    const carried = standing ? stance.carry(driver, work) : null;
    servoSolve(driver, work, carried ?? undefined, standing?.pose ? stance.owned : undefined);
    if (carried) stance.bear(driver, work);
  };

  return {
    control, effectors: tracker.models,
    setPosture(next) { state.pose = next; },
    reach: tracker.reach,
    release: tracker.release,
    setPushes(next) { state.pushes = next; },
    setStance(next) { state.standing = next; },
    get standing() { return state.standing; },
    reset() {
      state.pushes = NO_PUSHES;
      state.standing = null;
      tracker.reset();
      stance.reset();
    },
    stance, state,
    path: tracker.path,
    pointToRef: tracker.pointToRef,
    root,
  };
}

/** No freedom pushed. */
const NO_PUSHES: readonly MusclePush[] = Object.freeze([]);

/**
 * Rad/s beyond any joint's unloaded speed: a pushed motor's target, which the driver holds to the
 * muscles' reach (`forceVelocityReach`), so the motor pushes at its ceiling until the joint gets there.
 * A numeric setting: any speed no joint reaches does.
 */
const UNREACHABLE = 1e3;
