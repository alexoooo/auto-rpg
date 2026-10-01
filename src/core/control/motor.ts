import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { MuscleController, MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Assist } from "./assist.ts";
import { chainTo, pointNowToRef, solveReach } from "./kinematics.ts";
import { servoAsk, servoSolve } from "./servo.ts";
import { stanceControl, type StanceControl, type StanceGoal } from "./stance.ts";
import type { StanceTuning } from "./stance-tuning.ts";

/** Joint angles, rad, by channel name. */
export type Pose = Readonly<Record<string, number>>;

export type Hand = "left" | "right";

/**
 * A freedom driven flat out: its muscles pull toward `sense` (+1 or -1) at activation `level`
 * (0 to 1), a torque source at their ceiling, while the servo solves every other freedom around it.
 */
export interface MusclePush {
  readonly channel: string;
  readonly sense: 1 | -1;
  readonly level: number;
}

/**
 * **Motor control: goals in, muscle commands out.** A body is given a posture (angles for the
 * freedoms, by name, the rest held at their reference angles) and, for each hand, a place for its
 * knuckles in the body frame (the root's frame, `kinematics.ts`) and the time to get there. The
 * knuckles travel a straight, minimum-jerk path from where they are; each step the path's point
 * becomes the shoulder's and elbow's angles by inverse kinematics, with the trunk and the wrist at
 * the posture's angles, and the servo (`servo.ts`) follows those angles with their rates and
 * accelerations fed forward, bounded by the muscles. The shoulder's swing, which a place for the
 * hand leaves free, settles toward the posture's.
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
  /** The controller for `driveMuscles`. */
  readonly control: MuscleController;
  /** Hold `pose` for every freedom no hand goal owns, from `control`'s next call. */
  setPosture(pose: Pose): void;
  /** Take `hand`'s knuckles to `position` (body frame, m) over `seconds`, from `control`'s next call. */
  reach(hand: Hand, position: Vec3, seconds: number): void;
  /** Give `hand`'s arm back to the posture. */
  release(hand: Hand): void;
  /** Drive `pushes` flat out from `control`'s next call, in place of those before. */
  setPushes(pushes: readonly MusclePush[]): void;
  /** Stand on the ground as `goal` asks, or with null leave the legs to the posture, from `control`'s next call. */
  setStance(goal: StanceGoal | null): void;
  /** The stance's readings, as its last step left them. */
  readonly stance: StanceControl;
  /** Where `hand`'s path stands now (body frame), or null with no goal. */
  path(hand: Hand): Vector3 | null;
  /** Where `hand`'s knuckles are now, body frame. */
  knucklesToRef(hand: Hand, out: Vector3): Vector3;
  /** Its memory (`src/core/state.ts`): the goals it was last given, each hand's path, and the stance's. */
  readonly state: object;
}

/**
 * A freedom the inverse kinematics moves (`ReachFreedom`), by channel name, drawn toward the
 * posture's angle: `preferred`, which every step sets before it solves.
 */
interface Free { readonly joint: number; readonly k: number; readonly min: number; readonly max: number; preferred: number; readonly name: string }

/** An arm as the inverse kinematics takes it, and what motor control remembers of its hand's goal. */
interface Arm {
  readonly chain: BuiltJoint[];
  readonly hand: BuiltSegment;
  readonly knuckles: Vec3;
  /** The chain's freedoms the inverse kinematics moves: the shoulder's and the elbow's. */
  readonly free: Free[];
  readonly memory: HandMemory;
}

/** What motor control remembers of a hand's goal from one step to the next. */
interface HandMemory {
  goal: { readonly position: Vec3; readonly seconds: number } | null;
  started: boolean;
  from: Vec3;
  time: number;
  /** The angles last solved, by chain joint. */
  angles: number[][];
  readonly point: Vector3;
  /** Goal angle, rate and acceleration by channel name. */
  readonly goals: Map<string, [number, number, number]>;
}

/** Motor control of `built`, servoing at a time constant of `seconds`; its stance asks `assist` for what the soles miss. */
export function motorControl(built: BuiltBody, seconds: number, posture: Pose = {}, stanceTuning?: StanceTuning, assist: Assist | null = null): MotorControl {
  const stance = stanceControl(built, stanceTuning, assist);
  const root = chainTo(built, built.segments.get("hand.left")!)[0]!.parent;
  const names = (joint: BuiltJoint) => joint.dofs.map((dof) => `${joint.spec.name} ${dof.spec.positive}`);
  const arm = (side: Hand): Arm => {
    const hand = built.segments.get(`hand.${side}`);
    const knuckles = hand?.spec.points?.knuckles?.value;
    if (!hand || !knuckles) throw new Error(`${built.spec.model} has no ${side} hand with knuckles`);
    const chain = chainTo(built, hand);
    const free = chain.flatMap((joint, j) => joint.spec.name === `shoulder.${side}` || joint.spec.name === `elbow.${side}`
      ? joint.dofs.map((dof, k) => ({ joint: j, k, min: dof.spec.min.value, max: dof.spec.max.value, preferred: 0, name: names(joint)[k]! }))
      : []);
    return { chain, hand, knuckles, free, memory: { goal: null, started: false, from: [0, 0, 0], time: 0,
      angles: chain.map((joint) => joint.dofs.map(() => 0)), point: new Vector3(), goals: new Map() } };
  };
  const arms: Record<Hand, Arm> = { left: arm("left"), right: arm("right") }, both = [arms.left, arms.right];
  const state: { pose: Pose; pushes: readonly MusclePush[]; standing: StanceGoal | null; readonly hands: Record<Hand, HandMemory>; readonly stance: object } =
    { pose: posture, pushes: [], standing: null, hands: { left: arms.left.memory, right: arms.right.memory }, stance: stance.state };

  /** Where the path is at `time`: minimum jerk, 10 s^3 - 15 s^4 + 6 s^5 of the way. */
  const along = (m: HandMemory, time: number, out: Vector3): Vector3 => {
    const { position, seconds: length } = m.goal!;
    const s = Math.max(0, Math.min(1, time / length)), f = s * s * s * (10 - 15 * s + 6 * s * s);
    return out.set(m.from[0] + f * (position[0] - m.from[0]), m.from[1] + f * (position[1] - m.from[1]),
      m.from[2] + f * (position[2] - m.from[2]));
  };
  const at = new Vector3();
  const solveAt = ({ chain, free, knuckles, memory }: Arm, time: number): number[][] => {
    const angles = memory.angles.map((row) => [...row]);
    along(memory, time, at);
    solveReach(chain, angles, free, knuckles, [at.x, at.y, at.z]);
    return angles;
  };

  const control: MuscleController = (driver: MuscleDriver, dt: number) => {
    const { pose, pushes, standing } = state;
    for (const limb of both) {
      const m = limb.memory;
      m.goals.clear();
      if (!m.goal) continue;
      // The held freedoms at the posture's angles, the free ones drawn toward it.
      limb.chain.forEach((joint, j) => {
        if (limb.free.some((f) => f.joint === j)) return;
        names(joint).forEach((name, k) => { m.angles[j]![k] = pose[name] ?? 0; });
      });
      for (const f of limb.free) f.preferred = pose[f.name] ?? 0;
      if (!m.started) {
        pointNowToRef(limb.hand, root, limb.knuckles, at);
        m.from = [at.x, at.y, at.z];
        m.time = 0;
        m.started = true;
      } else m.time += dt;
      const before = solveAt(limb, m.time - dt), now = solveAt(limb, m.time), after = solveAt(limb, m.time + dt);
      m.angles = now;
      along(m, m.time, m.point);
      for (const f of limb.free) {
        const q0 = before[f.joint]![f.k]!, q1 = now[f.joint]![f.k]!, q2 = after[f.joint]![f.k]!;
        m.goals.set(f.name, [q1, (q2 - q0) / (2 * dt), (q2 - 2 * q1 + q0) / (dt * dt)]);
      }
    }
    const owned = (i: number) => {
      const name = driver.channels[i]!.name;
      for (const limb of both) { const g = limb.memory.goals.get(name); if (g) return g; }
      return undefined;
    };
    stance.command(driver, standing, dt);
    const work = servoAsk(driver, (i) => {
      const name = driver.channels[i]!.name;
      const push = pushes.find((p) => p.channel === name);
      if (!push) return standing && stance.owned[i] ? undefined : owned(i)?.[0] ?? pose[name] ?? 0;
      driver.velocity[i] = push.sense * UNREACHABLE;
      driver.activation[i] = push.level;
      return undefined;
    }, seconds, dt, {
      rate: (i) => owned(i)?.[1] ?? 0,
      acceleration: (i) => owned(i)?.[2] ?? 0,
    });
    // Standing by torque, the stance asks the root's acceleration, the servo carries the rest of the
    // body with it, and the stance legs take what that leaves the ground to give.
    const carried = standing ? stance.carry(driver, work) : null;
    servoSolve(driver, work, carried ?? undefined);
    if (carried) stance.bear(driver, work);
  };

  return {
    control,
    setPosture(next) { state.pose = next; },
    reach(hand, position, time) {
      const m = arms[hand].memory;
      m.goal = { position, seconds: time };
      m.started = false;
    },
    release(hand) { arms[hand].memory.goal = null; },
    setPushes(next) { state.pushes = next; },
    setStance(next) { state.standing = next; },
    stance, state,
    path: (hand) => arms[hand].memory.goal ? arms[hand].memory.point : null,
    knucklesToRef: (hand, out) => pointNowToRef(arms[hand].hand, root, arms[hand].knuckles, out),
  };
}

/**
 * Rad/s beyond any joint's unloaded speed: a pushed motor's target, which the driver holds to the
 * muscles' reach (`forceVelocityReach`), so the motor pushes at its ceiling until the joint gets there.
 */
const UNREACHABLE = 1e3;
