import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import { pointPath } from "./point-path.ts";
import { bodyEffectors, type EffectorModel } from "./effectors.ts";
import { turnBetweenToRef } from "../math/turn.ts";
import { hypot } from "../math/real.ts";
import type { MuscleController, MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance } from "../spec/vec.ts";
import type { Assist } from "./assist.ts";
import { chainTo, pointNowToRef, reachWork, solveReach, type ReachEnd, type ReachWork, type ReachOrientation } from "./kinematics.ts";
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

/** Named rigid-body points and an optional independent orientation, in the root frame. */
export interface EffectorGoal {
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
  /** Optional muscle tracking response, s, independent of the endpoint path's duration. */
  readonly response?: number;
  /** Initial point velocity in the body frame, m/s, for a measured Hermite path. One point only. */
  readonly initialVelocity?: Vec3;
  /** Desired point velocity at the target, body frame, m/s; one-point Hermite paths only. */
  readonly terminalVelocity?: Vec3;
  /** Midpath deviation from the Hermite chord, with unchanged endpoint motion; one point only. */
  readonly curve?: Vec3;
  /** Identity of a moving path segment; changing it starts a new path. */
  readonly sequence?: number;
  /** Independent segment turn since reference, in the root frame, on a smooth finite path. */
  readonly orientation?: { readonly target: readonly [number, number, number, number]; readonly seconds: number };
}

/** Compatibility name for the hand adapters. */
export type HandGoal = EffectorGoal;

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
  readonly effectors: readonly EffectorModel[];
  reachEffector(segment: string, goal: EffectorGoal): void;
  releaseEffector(segment: string): void;
  effectorPointToRef(segment: string, point: string, out: Vector3): Vector3;
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

/** A declared chain and the endpoint path the tracker remembers. */
interface Effector {
  readonly orientation: ReachOrientation;
  readonly chain: BuiltJoint[];
  readonly hand: BuiltSegment;
  readonly knuckles: Vec3;
  /** The endpoint's named rigid-body points in the reference root frame. */
  readonly points: ReadonlyMap<string, Vec3>;
  /** The declared chain's free joint coordinates. */
  readonly free: Free[];
  /** What its reach works in (`solveReach`). */
  readonly work: ReachWork;
  readonly memory: EffectorMemory;
}

/** What the endpoint tracker remembers from one step to the next. */
interface EffectorMemory {
  goal: HandGoal | null;
  started: boolean;
  /** Where each place's point was when the path began, in the places' order. */
  from: Vec3[];
  time: number;
  fromRotation: [number, number, number, number];
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
  const descriptions = bodyEffectors(built);
  const limbOf = (description: typeof descriptions[number]): Effector => {
    const { segment: hand, chain, free, points } = description;
    const knuckles = points.get(description.model.point)!;
    return { chain, hand, free, points, knuckles, work: reachWork(free.length),
      orientation: { target: new Quaternion(), lever: distance(hand.spec.proximal.value, hand.spec.distal.value) },
      memory: { goal: null, started: false, from: [], time: 0, fromRotation: [0, 0, 0, 1],
        angles: chain.map(joint => joint.dofs.map(() => 0)), point: new Vector3(), goals: new Map() } };
  };
  const limbs = new Map(descriptions.map(d => [d.model.segment, limbOf(d)]));
  const arm = (side: Hand): Effector => {
    const limb = limbs.get(`hand.${side}`);
    if (!limb) throw new Error(`${built.spec.model} has no ${side} hand effector`);
    return limb;
  };
  const arms: Record<Hand, Effector> = { left: arm("left"), right: arm("right") }, both = [arms.left, arms.right, ...[...limbs.values()].filter(limb => limb !== arms.left && limb !== arms.right)];
  const state: { pose: Pose; pushes: readonly MusclePush[]; standing: StanceGoal | null; readonly hands: Record<Hand, EffectorMemory>;
    readonly effectors: Record<string, EffectorMemory>; readonly reach: ReachMeter; readonly stance: object } =
    { pose: posture, pushes: [], standing: null, hands: { left: arms.left.memory, right: arms.right.memory },
      effectors: Object.fromEntries([...limbs].map(([name, limb]) => [name, limb.memory])),
      reach: { solves: 0, passes: 0, capped: 0 }, stance: stance.state };

  /**
   * Where the path of place `i` is at `time`: minimum jerk, 10 s^3 - 15 s^4 + 6 s^5 of the way
   * from where the point began to its place, and on `through` beyond it along that line.
   * A supplied initial velocity uses the shared quintic Hermite path instead.
   */
  const along = (m: EffectorMemory, i: number, time: number, out: Vector3): Vector3 => {
    const { places, seconds: length, through = 0 } = m.goal!, position = places[i]!.position, from = m.from[i]!;
    if (m.goal!.initialVelocity || m.goal!.terminalVelocity || m.goal!.curve) {
      const way = hypot(position[0] - from[0], position[1] - from[1], position[2] - from[2]);
      const scale = way > 0 ? 1 + through / way : 1;
      const finish = position.map((v, k) => from[k]! + scale * (v - from[k]!)) as unknown as Vec3;
      const terminal = m.goal!.terminalVelocity;
      const path = pointPath({ position: from, velocity: m.goal!.initialVelocity ?? [0, 0, 0] }, finish, Math.max(0, time), length, terminal, m.goal!.curve);
      // Linear continuation preserves the endpoint rate in the IK finite differences.
      const after = terminal ? Math.max(0, time - length) : 0;
      return out.set(path.target[0] + after * (terminal?.[0] ?? 0), path.target[1] + after * (terminal?.[1] ?? 0),
        path.target[2] + after * (terminal?.[2] ?? 0));
    }
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
  const fromTurn = new Quaternion(), toTurn = new Quaternion(), turn = new Quaternion(), inverse = new Quaternion();
  const solveAt = ({ chain, free, points, work, memory, orientation: rotational }: Effector, time: number): number[][] => {
    const angles = memory.angles.map((row) => [...row]);
    const tasks = memory.goal!.places.map((place, i) => {
      along(memory, i, time, at);
      return { point: points.get(place.point)!, target: [at.x, at.y, at.z] as Vec3 };
    });
    const orientation = memory.goal!.orientation;
    if (orientation) {
      const u = Math.max(0, Math.min(1, time / orientation.seconds)), amount = u * u * u * (10 - 15 * u + 6 * u * u);
      fromTurn.set(...memory.fromRotation); toTurn.set(...orientation.target);
      turnBetweenToRef(fromTurn, toTurn, amount, turn);
      rotational.target.copyFrom(turn);
    }
    solveReach(chain, angles, free, tasks, end, work, orientation ? rotational : undefined);
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
        names(joint).forEach((name, k) => { m.angles[j]![k] = standing?.pose ? driver.angle(driver.channel(name)) : pose[name] ?? 0; });
      });
      for (const f of limb.free) f.preferred = pose[f.name] ?? 0;
      if (!m.started) {
        m.from = m.goal.places.map((place) => {
          pointNowToRef(limb.hand, root, limb.points.get(place.point)!, at);
          return [at.x, at.y, at.z] as Vec3;
        });
        if (m.goal.orientation) {
          root.rest.multiplyToRef(Quaternion.InverseToRef(root.node.rotationQuaternion!, inverse), fromTurn);
          fromTurn.multiplyToRef(limb.hand.node.rotationQuaternion!, turn);
          turn.multiplyToRef(Quaternion.InverseToRef(limb.hand.rest, inverse), fromTurn).normalize();
          m.fromRotation = [fromTurn.x, fromTurn.y, fromTurn.z, fromTurn.w];
        }
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
      seconds: (i) => {
        if (!owned(i)) return standing?.pose?.seconds ?? seconds;
        const name = driver.channels[i]!.name;
        for (const limb of both) if (limb.memory.goals.has(name)) return limb.memory.goal?.response ?? seconds;
        return seconds;
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

  const reach = (segment: string, goal: HandGoal) => {
      const limb = limbs.get(segment);
      if (!limb) throw new Error(`no effector ${segment}`);
      const { memory: m, points } = limb, { places } = goal;
      if (goal.response !== undefined && (!(goal.response > 0) || !Number.isFinite(goal.response))) throw new Error("effector tracking needs finite positive response");
      if (!(goal.seconds > 0) || !Number.isFinite(goal.seconds)) throw new Error("effector path needs finite positive time");
      if (goal.orientation && (places.length !== 1 || !(goal.orientation.seconds > 0)
        || !Number.isFinite(goal.orientation.seconds) || goal.orientation.target.length !== 4
        || !goal.orientation.target.every(Number.isFinite)
        || Math.abs(goal.orientation.target.reduce((s, v) => s + v * v, 0) - 1) > 1e-8)) throw new Error("invalid effector orientation");
      if ((goal.initialVelocity || goal.terminalVelocity || goal.curve) && places.length !== 1) throw new Error("a measured point path requires one point");
      if (places.length !== 1 && places.length !== 2) throw new Error(`a hand goal is one place or two, not ${places.length}`);
      for (const place of places) {
        const label = segment.startsWith("hand.") ? `${segment.slice(5)} hand` : `${segment} effector`;
        if (!points.has(place.point)) throw new Error(`the ${label} has no point ${place.point}: it has ${[...points.keys()].join(", ")}`);
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
      const follows = goal.follows === true && was?.follows === true && was.seconds === goal.seconds && was.through === goal.through && was.sequence === goal.sequence
        && was.places.length === places.length && was.places.every((place, i) => place.point === places[i]!.point);
      m.goal = goal;
      if (!follows) m.started = false;
  };
  return {
    control, effectors: Object.freeze(descriptions.map(d => d.model)),
    setPosture(next) { state.pose = next; },
    reach: (hand, goal) => reach(`hand.${hand}`, goal),
    reachEffector: reach,
    releaseEffector(segment) {
      const limb = limbs.get(segment); if (!limb) throw new Error(`no effector ${segment}`);
      limb.memory.goal = null;
    },
    effectorPointToRef(segment, point, out) {
      const limb = limbs.get(segment), at = limb?.points.get(point);
      if (!limb || !at) throw new Error(`no effector point ${segment}/${point}`);
      return pointNowToRef(limb.hand, root, at, out);
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
