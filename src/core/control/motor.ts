import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { hypot } from "../math/real.ts";
import type { MuscleController, MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance } from "../spec/vec.ts";
import type { Assist } from "./assist.ts";
import { chainTo, pointNowToRef, reachWork, solveReach, type ReachEnd, type ReachWork } from "./kinematics.ts";
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

/** A point of a hand's rigid body (`rigidPoints`), by name, and where it goes: body frame, m. */
interface Place {
  readonly point: string;
  readonly position: Vec3;
}

/** **Where a hand goes, and in what time.** */
export interface HandGoal {
  /** One place, or two points of the hand's one rigid body: where it is, and how its line lies. */
  readonly places: readonly Place[];
  readonly seconds: number;
  /**
   * How far past its place each point's path runs, m, along its own line from where the path
   * began: a blow goes through what it is thrown at. None if not given.
   */
  readonly through?: number;
  /**
   * Whether the goal is one path whose places move: given again with other positions, it keeps its
   * start and its clock, and its path ends at the new ones. Without it, a goal with other places is
   * a new path from where the points are.
   */
  readonly follows?: boolean;
}

/**
 * **Motor control: goals in, muscle commands out.** A body is given a posture (angles for the
 * freedoms, by name, the rest held at their reference angles) and, for each hand, places for
 * named points of its rigid body (its knuckles, a point of what it holds) in the body frame (the
 * root's frame, `kinematics.ts`) and the time to get there (`HandGoal`). Each point travels a
 * straight, minimum-jerk path from where it is; each step the paths' points become the
 * shoulder's, the elbow's and the wrist's angles by inverse kinematics, with the trunk at the
 * posture's angles, and the servo (`servo.ts`) follows those angles with their rates and
 * accelerations fed forward, bounded by the muscles. What a goal leaves free of the arm (one
 * place leaves four of its seven freedoms, two leave two) settles toward the posture's angles.
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
  /** The controller for `driveMuscles`. */
  readonly control: MuscleController;
  /** Hold `pose` for every freedom no hand goal owns, from `control`'s next call. */
  setPosture(pose: Pose): void;
  /**
   * Take `hand` to `goal`, from `control`'s next call. It refuses, with the reason, a point the
   * hand's rigid body has not, no place or more than two, and two places whose distance apart
   * differs from their points' by more than `PLACES_SLACK`.
   */
  reach(hand: Hand, goal: HandGoal): void;
  /** Give `hand`'s arm back to the posture. */
  release(hand: Hand): void;
  /** Drive `pushes` flat out from `control`'s next call, in place of those before. */
  setPushes(pushes: readonly MusclePush[]): void;
  /** Stand on the ground as `goal` asks, or with null leave the legs to the posture, from `control`'s next call. */
  setStance(goal: StanceGoal | null): void;
  /** The stance goal it was last given, or null: what the legs are asked to hold. */
  readonly standing: StanceGoal | null;
  /** Forget what was under way: no pushes, no stance, no hand's goal, and the stance's own memory (`StanceControl.reset`). The posture stays. */
  reset(): void;
  /** The stance's readings, as its last step left them. */
  readonly stance: StanceControl;
  /** Where the path of `hand`'s first place stands now (body frame), or null with no goal. */
  path(hand: Hand): Vector3 | null;
  /** Where `hand`'s knuckles are now, body frame. */
  knucklesToRef(hand: Hand, out: Vector3): Vector3;
  /** Where `point` of `hand`'s rigid body is now, body frame. */
  pointToRef(hand: Hand, point: string, out: Vector3): Vector3;
  /** The segment whose frame the body frame is carried by. */
  readonly root: BuiltSegment;
  /** Its memory (`src/core/state.ts`): the goals it was last given, each hand's path, its hands' solves counted (`ReachMeter`), and the stance's. */
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
  /** Its hand's rigid body's points (`rigidPoints`), body frame, reference pose, by name. */
  readonly points: ReadonlyMap<string, Vec3>;
  /** The chain's freedoms the inverse kinematics moves: the shoulder's, the elbow's and the wrist's. */
  readonly free: Free[];
  /** What its reach works in (`solveReach`). */
  readonly work: ReachWork;
  readonly memory: HandMemory;
}

/** What motor control remembers of a hand's goal from one step to the next. */
interface HandMemory {
  goal: HandGoal | null;
  started: boolean;
  /** Where each place's point was when the path began, in the places' order. */
  from: Vec3[];
  time: number;
  /** The angles last solved, by chain joint. */
  angles: number[][];
  /** Where the first place's path stands. */
  readonly point: Vector3;
  /** Goal angle, rate and acceleration by channel name. */
  readonly goals: Map<string, [number, number, number]>;
}

/** The hands' solves since the body was made: how many, their passes, and how many ran to the cap. */
interface ReachMeter { solves: number; passes: number; capped: number }

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
    const moved = [`shoulder.${side}`, `elbow.${side}`, `wrist.${side}`];
    const free = chain.flatMap((joint, j) => moved.includes(joint.spec.name)
      ? joint.dofs.map((dof, k) => ({ joint: j, k, min: dof.spec.min.value, max: dof.spec.max.value, preferred: 0, name: names(joint)[k]! }))
      : []);
    const points = new Map([...rigidPoints(built.spec, hand.spec)].map(([name, point]) => [name, point.value]));
    return { chain, hand, knuckles, points, free, work: reachWork(free.length),
      memory: { goal: null, started: false, from: [], time: 0,
        angles: chain.map((joint) => joint.dofs.map(() => 0)), point: new Vector3(), goals: new Map() } };
  };
  const arms: Record<Hand, Arm> = { left: arm("left"), right: arm("right") }, both = [arms.left, arms.right];
  const state: { pose: Pose; pushes: readonly MusclePush[]; standing: StanceGoal | null; readonly hands: Record<Hand, HandMemory>;
    readonly reach: ReachMeter; readonly stance: object } =
    { pose: posture, pushes: [], standing: null, hands: { left: arms.left.memory, right: arms.right.memory },
      reach: { solves: 0, passes: 0, capped: 0 }, stance: stance.state };

  /**
   * Where the path of place `i` is at `time`: minimum jerk, 10 s^3 - 15 s^4 + 6 s^5 of the way
   * from where the point began to its place, and on `through` beyond it along that line.
   */
  const along = (m: HandMemory, i: number, time: number, out: Vector3): Vector3 => {
    const { places, seconds: length, through = 0 } = m.goal!, position = places[i]!.position, from = m.from[i]!;
    const s = Math.max(0, Math.min(1, time / length));
    let f = s * s * s * (10 - 15 * s + 6 * s * s);
    if (through !== 0) {
      const way = hypot(position[0] - from[0], position[1] - from[1], position[2] - from[2]);
      if (way > 0) f = f * (1 + through / way);
    }
    return out.set(from[0] + f * (position[0] - from[0]), from[1] + f * (position[1] - from[1]),
      from[2] + f * (position[2] - from[2]));
  };
  const at = new Vector3(), end: ReachEnd = { passes: 0, still: false };
  const solveAt = ({ chain, free, points, work, memory }: Arm, time: number): number[][] => {
    const angles = memory.angles.map((row) => [...row]);
    const tasks = memory.goal!.places.map((place, i) => {
      along(memory, i, time, at);
      return { point: points.get(place.point)!, target: [at.x, at.y, at.z] as Vec3 };
    });
    solveReach(chain, angles, free, tasks, end, work);
    state.reach.solves++;
    state.reach.passes += end.passes;
    if (!end.still) state.reach.capped++;
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
        m.from = m.goal.places.map((place) => {
          pointNowToRef(limb.hand, root, limb.points.get(place.point)!, at);
          return [at.x, at.y, at.z] as Vec3;
        });
        m.time = 0;
        m.started = true;
      } else m.time += dt;
      const before = solveAt(limb, m.time - dt), now = solveAt(limb, m.time), after = solveAt(limb, m.time + dt);
      m.angles = now;
      along(m, 0, m.time, m.point);
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
    reach(hand, goal) {
      const { memory: m, points } = arms[hand], { places } = goal;
      if (places.length !== 1 && places.length !== 2) throw new Error(`a hand goal is one place or two, not ${places.length}`);
      for (const place of places) {
        if (!points.has(place.point)) throw new Error(`the ${hand} hand has no point ${place.point}: it has ${[...points.keys()].join(", ")}`);
      }
      if (places.length === 2) {
        const [a, b] = places as [Place, Place];
        const apart = distance(a.position, b.position), built = distance(points.get(a.point)!, points.get(b.point)!);
        if (Math.abs(apart - built) > PLACES_SLACK) {
          throw new Error(`${a.point} and ${b.point} are ${built.toFixed(3)} m apart and their places ${apart.toFixed(3)} m: one rigid body cannot be at both`);
        }
      }
      // A goal that follows keeps the path it is the next places of: the same points, time and run beyond.
      const was = m.goal;
      const follows = goal.follows === true && was?.follows === true && was.seconds === goal.seconds && was.through === goal.through
        && was.places.length === places.length && was.places.every((place, i) => place.point === places[i]!.point);
      m.goal = goal;
      if (!follows) m.started = false;
    },
    release(hand) { arms[hand].memory.goal = null; },
    setPushes(next) { state.pushes = next; },
    setStance(next) { state.standing = next; },
    get standing() { return state.standing; },
    reset() {
      state.pushes = NO_PUSHES;
      state.standing = null;
      for (const limb of both) limb.memory.goal = null;
      stance.reset();
    },
    stance, state,
    path: (hand) => arms[hand].memory.goal ? arms[hand].memory.point : null,
    knucklesToRef: (hand, out) => pointNowToRef(arms[hand].hand, root, arms[hand].knuckles, out),
    pointToRef(hand, point, out) {
      const at = arms[hand].points.get(point);
      if (!at) throw new Error(`the ${hand} hand has no point ${point}`);
      return pointNowToRef(arms[hand].hand, root, at, out);
    },
    root,
  };
}

/**
 * How far two places' distance apart may differ from their points', m, before the goal is refused:
 * a centimetre. A numeric setting: places made from the points' own distance miss it by rounding alone.
 */
const PLACES_SLACK = 0.01;

/** No freedom pushed. */
const NO_PUSHES: readonly MusclePush[] = Object.freeze([]);

/**
 * Rad/s beyond any joint's unloaded speed: a pushed motor's target, which the driver holds to the
 * muscles' reach (`forceVelocityReach`), so the motor pushes at its ceiling until the joint gets there.
 * A numeric setting: any speed no joint reaches does.
 */
const UNREACHABLE = 1e3;
