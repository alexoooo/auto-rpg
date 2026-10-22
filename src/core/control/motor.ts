import { effectorTracker, type EffectorGoal } from "./effector-tracker.ts";
import { bodyEffectors, type EffectorModel } from "./effectors.ts";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { channelName, type MuscleController, type MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Assist } from "./assist.ts";
import type { Limb, Row } from "./bearing.ts";
import { servoAsk, servoSolve, type ServoWork } from "./servo.ts";
import { makeWholeBody, solveBody, type WholeBodyAsk } from "./solve.ts";
import { stanceControl, type StanceControl, type StanceGoal } from "./stance.ts";
import type { BalanceMaker } from "./balance-part.ts";
import type { StanceTuning } from "./stance-tuning.ts";
import { type ReadBody, type ReadSegment, rootSegment } from "../read-body.ts";

/** Joint angles, rad, by channel name. */
export type Pose = Readonly<Record<string, number>>;

/**
 * A freedom driven by its muscles alone: they pull toward `sense` (+1 or -1) at activation `level`
 * (0 to 1), a torque source at their ceiling, while the servo solves every other freedom around it.
 * With `speed`, they drive the freedom toward that speed (rad/s, its positive sense) instead, giving
 * no more than `level` of their strength either way: a damper the solver holds within the step,
 * as a torque source given at a step's end is not.
 */
export interface MusclePush {
  readonly channel: string;
  readonly sense: 1 | -1;
  readonly level: number;
  readonly speed?: number;
}

export type { EffectorGoal } from "./effector-tracker.ts";

/**
 * **A point driven**: a named point of an effector's rigid body (`BodySpec.effectors`: a hand's
 * knuckles) asked an acceleration, world, m/s^2, its segment a spin's change, world, rad/s^2, or
 * both; what it is not asked, its place or its turn, is the posture's. The whole-body solve asks
 * it of the effector's chain beside the stance (`solveBody`), the chain's other freedoms drawn
 * toward the posture and any torque past a muscle's strength held at its strength, so a point
 * asked more than the body can give gets what the muscles give. Only a standing body's solve
 * carries it out: without a stance the chain holds its posture.
 */
export interface PointTask {
  readonly segment: string;
  readonly point: string;
  readonly accel: Vec3 | null;
  readonly spin?: Vec3 | null;
}

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
 * With a stance (`StanceGoal`), the stance's asks and the posture's are one problem, the whole
 * body solved as one (`solveBody`, `solve.ts`): the stance legs carry the body on the ground
 * (`stance.ts`) and the rest follows its posture and its effectors' goals; without one, the legs
 * hold the posture from the pelvis, as a body carried or in the air, and the servo solves it.
 */
export interface MotorControl {
  /** The goals beyond a posture and pushes it carries out (`MotorGoal`): what it has the members for (`carrying`). */
  readonly carries: readonly MotorGoal[];
  /** The controller for `driveMuscles`. */
  readonly control: MuscleController;
  /** Hold `pose` for every freedom no effector's goal owns, from `control`'s next call. */
  setPosture(pose: Pose): void;
  /** Drive `pushes` flat out from `control`'s next call, in place of those before. */
  setPushes(pushes: readonly MusclePush[]): void;
  /** Forget what was under way: no pushes, and none of the goals it carries (`StanceControl.reset` with a stance). The posture stays. */
  reset(): void;
  /** The segment whose frame the body frame is carried by. */
  readonly root: ReadSegment;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
}

/**
 * **A goal a motor may carry out** beside a posture and pushes: effectors' places (`Reaching`),
 * driven points (`Pointing`) and a stance (`Balancing`). A motor says which (`MotorControl.carries`),
 * and what drives it asks for those it needs where it is made (`carrying`).
 */
export type MotorGoal = "effectors" | "points" | "stance";

/** **A motor that takes effectors to places** (`EffectorGoal`). */
export interface Reaching {
  /** What it can reach with, in declared order. */
  readonly effectors: readonly EffectorModel[];
  /**
   * Take the effector of `segment` to `goal`, from `control`'s next call. It refuses, with the
   * reason, a point its rigid body has not, no place or more than two, and two places whose
   * distance apart differs from their points' by more than `PLACES_SLACK`.
   */
  reach(segment: string, goal: EffectorGoal): void;
  /** Give the chain of `segment`'s effector back to the posture. */
  release(segment: string): void;
  /** Where the path of `segment`'s first place stands now (body frame), or null with no goal. */
  path(segment: string): Vector3 | null;
  /** Where `point` of `segment`'s rigid body is now, body frame. */
  pointToRef(segment: string, point: string, out: Vector3): Vector3;
}

/** **A motor that drives effectors' points** (`PointTask`). */
export interface Pointing {
  /**
   * Drive `tasks`' points from `control`'s next call, in place of those before (`PointTask`). It
   * refuses a segment with no effector, a point its rigid body has not, and two tasks on one segment.
   */
  setPoints(tasks: readonly PointTask[]): void;
}

/** **A motor that stands the body on the ground**: its balance (`BalancePart`) carries out a stance goal. */
export interface Balancing {
  /** Stand on the ground as `goal` asks, or with null leave the legs to the posture, from `control`'s next call. */
  setStance(goal: StanceGoal | null): void;
  /** The stance goal it was last given, or null: what the legs are asked to hold. */
  readonly standing: StanceGoal | null;
  /** Its balance: the stance's readings, as its last step left them. */
  readonly stance: StanceControl;
}

/** A motor with the members of each goal of `G`. */
export type Carrying<G extends MotorGoal> = MotorControl & ("effectors" extends G ? Reaching : unknown) & ("points" extends G ? Pointing : unknown) & ("stance" extends G ? Balancing : unknown);

/** What a person calls each goal, in a refusal. */
const GOAL_NAMES: Readonly<Record<MotorGoal, string>> = Object.freeze({ effectors: "effectors' places", points: "driven points", stance: "a stance" });

/**
 * `motor` as one that carries `goals`, for `who` to drive it by them: a thrown error, where it is
 * made, naming the first goal it does not carry.
 */
export function carrying<G extends MotorGoal>(motor: MotorControl, goals: readonly G[], who: string): Carrying<G> {
  for (const goal of goals) if (!motor.carries.includes(goal)) throw new Error(`${who} needs a motor that carries ${GOAL_NAMES[goal]}`);
  return motor as Carrying<G>;
}

/** **The whole-body solve**: every goal (`motorControl`). */
export type WholeBody = Carrying<MotorGoal>;

/** Every goal. */
const EVERY_GOAL: readonly MotorGoal[] = Object.freeze(["effectors", "points", "stance"]);

/**
 * Motor control of `built`, servoing at a time constant of `seconds`; its balance (`balance`, the
 * stance unless given) asks `assist` for what the soles miss.
 */
export function motorControl(built: ReadBody, seconds: number, posture: Pose = {}, stanceTuning?: StanceTuning, assist: Assist | null = null,
  balance: BalanceMaker = stanceControl): WholeBody {
  const stance = balance(built, stanceTuning, assist);
  const root = rootSegment(built);
  const tracker = effectorTracker(built, root);
  const points = pointLimbs(built);
  const whole = makeWholeBody([...built.joints.values()].reduce((count, joint) => count + joint.dofs.length, 0), 2, points.length);
  let driven: WholeBodyAsk | null = null;
  const state = { pose: posture, pushes: [] as readonly MusclePush[], points: [] as readonly PointTask[], standing: null as StanceGoal | null,
    effectors: tracker.state.effectors, reach: tracker.state.reach, stance: stance.state };
  const control: MuscleController = (driver: MuscleDriver, dt: number) => {
    const { pose, pushes, standing } = state;
    const owned = tracker.step(driver, pose, dt, !!standing?.pose);
    stance.command(driver, standing, dt);
    const work = servoAsk(driver, (i) => {
      const name = driver.channels[i]!.name;
      const push = pushes.find((p) => p.channel === name);
      if (!push) return standing && stance.owned[i] ? undefined : owned(i)?.[0] ?? pose[name] ?? 0;
      driver.velocity[i] = push.speed ?? push.sense * UNREACHABLE;
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
    const ask = standing ? stance.ask(driver) : null;
    if (ask) {
      let asked = ask;
      if (state.points.length) {
        driven ??= drivenAsk(ask, points);
        driven.lever = ask.lever;
        for (const one of points) aimPoint(one, state.points, driver, work);
        asked = driven;
      }
      solveBody(whole, driver, work, asked, assist);
      stance.launch(driver);
    }
    else servoSolve(driver, work, undefined, standing?.pose ? stance.owned : undefined);
  };

  return {
    carries: EVERY_GOAL, control, effectors: tracker.models,
    setPosture(next) { state.pose = next; },
    reach: tracker.reach,
    release: tracker.release,
    setPushes(next) { state.pushes = next; },
    setPoints(next) {
      for (const [k, task] of next.entries()) {
        const one = points.find((limb) => limb.limb.segment.spec.name === task.segment);
        if (!one) throw new Error(`no effector ${task.segment}`);
        if (!one.points.has(task.point)) throw new Error(`no effector point ${task.segment}/${task.point}`);
        if (next.findIndex((other) => other.segment === task.segment) !== k) throw new Error(`two points driven on ${task.segment}`);
      }
      state.points = next;
    },
    setStance(next) { state.standing = next; },
    get standing() { return state.standing; },
    reset() {
      state.pushes = NO_PUSHES;
      state.points = NO_POINTS;
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
/** No point driven. */
const NO_POINTS: readonly PointTask[] = Object.freeze([]);

/** The three rows of a point's linear motion, and of its segment's spin. */
const LINEAR: readonly Row[] = Object.freeze([Object.freeze([[3, 1]] as const), Object.freeze([[4, 1]] as const), Object.freeze([[5, 1]] as const)]);
const ANGULAR: readonly Row[] = Object.freeze([Object.freeze([[0, 1]] as const), Object.freeze([[1, 1]] as const), Object.freeze([[2, 1]] as const)]);

/**
 * **An effector as the solve drives its point**: its limb, its rigid body's named points
 * (reference pose, body frame), and its chain's and stem's channels by name, which the limb takes
 * as the driver numbers them at its first task.
 */
interface PointLimb {
  readonly limb: Limb & { readonly memory: { channels: number[] }; readonly stem: number[]; readonly work: { readonly ahead: number[]; toward: number[] | null } };
  readonly points: ReadonlyMap<string, Vec3>;
  readonly chain: readonly string[];
  readonly stem: readonly string[];
}

/**
 * Each effector's limb: its chain the freedoms it owns (an arm's), its stem those between the root
 * and them (the trunk's), asked its point's linear motion, its spin, or both.
 */
function pointLimbs(built: ReadBody): PointLimb[] {
  return bodyEffectors(built).map(({ segment, chain, points, free }) => {
    const m = free.length;
    return {
      limb: {
        segment, memory: { channels: [] }, stem: [], reach: 1,
        task: { on: false, bearing: false, linear: new Vector3(), angular: new Vector3(), accel: new Float64Array(m), given: new Float64Array(m).fill(NaN) },
        work: { at: new Vector3(), rows: LINEAR, ahead: new Array<number>(m).fill(NaN), toward: new Array<number>(m).fill(0), patch: null, share: 1 },
      },
      points, chain: free.map((f) => f.name),
      stem: chain.slice(0, free[0]!.joint).flatMap((joint) => joint.dofs.map((_, k) => channelName(joint, k))),
    };
  });
}

/** The stance's ask with the effectors' limbs after its own, sharing its records. */
function drivenAsk(ask: WholeBodyAsk, points: readonly PointLimb[]): WholeBodyAsk {
  return { aim: ask.aim, limbs: [...ask.limbs, ...points.map((one) => one.limb)], lever: ask.lever, root: ask.root, helped: ask.helped,
    shortfall: ask.shortfall, asked: [...ask.asked, ...points.map(() => ({ at: new Vector3(), force: new Vector3(), moment: new Vector3() }))] };
}

/**
 * `one`'s task for the step, from the point task on its segment among `tasks`: on, its point where
 * it is and its acceleration asked, its freedoms drawn toward what the servo asks them; off with none.
 */
function aimPoint(one: PointLimb, tasks: readonly PointTask[], driver: MuscleDriver, work: ServoWork): void {
  const { limb } = one, task = tasks.find((t) => t.segment === limb.segment.spec.name);
  limb.task.on = task !== undefined;
  if (!task) return;
  if (limb.memory.channels.length !== one.chain.length) {
    limb.memory.channels = one.chain.map((name) => driver.channel(name));
    limb.stem.push(...one.stem.map((name) => driver.channel(name)));
  }
  pointNow(limb.segment, one.points.get(task.point)!, limb.work.at);
  const { accel, spin } = task;
  limb.work.rows = accel && spin ? null : accel ? LINEAR : ANGULAR;
  if (accel) limb.task.linear.set(accel[0], accel[1], accel[2]);
  if (spin) limb.task.angular.set(spin[0], spin[1], spin[2]);
  const toward = limb.work.toward!, channels = limb.memory.channels;
  for (let c = 0; c < channels.length; c++) toward[c] = work.accel[channels[c]!]!;
}

const turned = new Quaternion();
/** Where `point` (reference pose, body frame) of `segment` is now, world, into `at`. */
function pointNow(segment: ReadSegment, point: Vec3, at: Vector3): void {
  const origin = segment.frame.origin, node = segment.node;
  Quaternion.InverseToRef(segment.rest, turned);
  node.rotationQuaternion!.multiplyToRef(turned, turned);
  at.set(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]).applyRotationQuaternionToRef(turned, at).addInPlace(node.position);
}

/**
 * Rad/s beyond any joint's unloaded speed: a pushed motor's target, which the driver holds to the
 * muscles' reach (`forceVelocityReach`), so the motor pushes at its ceiling until the joint gets there.
 * A numeric setting: any speed no joint reaches does.
 */
const UNREACHABLE = 1e3;
