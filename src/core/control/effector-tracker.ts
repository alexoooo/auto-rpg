import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { channelName, type MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance } from "../spec/vec.ts";
import { bodyEffectors } from "./effectors.ts";
import { pointPathTargetToRef } from "./point-path.ts";
import { pointNowToRef, reachWork, solveReach, type ReachEnd, type ReachWork, type ReachOrientation } from "./kinematics.ts";
import { turnBetweenToRef } from "../math/turn.ts";
import { hypot } from "../math/real.ts";
import type { ReadBody, ReadJoint, ReadSegment } from "../read-body.ts";
/** A segment's named rigid point and its goal in the root frame, m. */
interface Place {
  readonly point: string;
  readonly position: Vec3;
}

/** Named rigid-body points and an optional independent orientation, in the root frame. */
export interface EffectorGoal {
  /** One place, or two points of one rigid body: where it is, and how its line lies. */
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
  /** Optional muscle tracking response, s, independent of the endpoint path duration. */
  readonly response?: number;
  /** Initial point velocity in the body frame, m/s, for a measured Hermite path. One point only. */
  readonly initialVelocity?: Vec3;
  /** Desired point velocity at the target, body frame, m/s; one-point Hermite paths only. */
  readonly terminalVelocity?: Vec3;
  /** Midpath deviation from the Hermite chord, with unchanged endpoint motion; one point only. */
  readonly curve?: Vec3;
  /** Identity of a moving path segment; changing it starts a new path. */
  readonly sequence?: number;
  /**
   * Whether the chain's held freedoms (an arm's trunk) are read where the body has them, not at the
   * posture's angles: the path is then the point's from the root as the trunk actually carries the
   * limb, and a trunk turning under a blow speeds its point rather than throwing it off its line.
   */
  readonly carried?: boolean;
  /** Independent segment turn since reference, in the root frame, on a smooth finite path. */
  readonly orientation?: { readonly target: readonly [number, number, number, number]; readonly seconds: number };
}

/**
 * A freedom the inverse kinematics moves (`ReachFreedom`), by channel name, drawn toward the
 * posture's angle: `preferred`, which every step sets before it solves.
 */
interface Free { readonly joint: number; readonly k: number; readonly min: number; readonly max: number; preferred: number; readonly name: string }

/** A place's task as `solveReach` reads it: its point and target, written before each solve. */
interface Task { point: Vec3; readonly target: [number, number, number] }

/** A held freedom of a chain: its joint's index in the chain, the freedom's, and its channel's name. */
interface Held { readonly j: number; readonly k: number; readonly name: string }

/** A declared chain and the endpoint path the tracker remembers. */
interface Effector {
  readonly orientation: ReachOrientation;
  readonly chain: ReadJoint[];
  readonly segment: ReadSegment;
  /** The endpoint's named rigid-body points in the reference root frame. */
  readonly points: ReadonlyMap<string, Vec3>;
  /** The declared chain's free joint coordinates. */
  readonly free: Free[];
  /** The chain's held freedoms, in the chain's order. */
  readonly held: readonly Held[];
  /** What its reach works in (`solveReach`). */
  readonly work: ReachWork;
  /** The tasks of a goal of one place and of two. */
  readonly tasks: readonly [readonly Task[], readonly Task[]];
  /** The angles solved a step before the path's time, at it and a step after, by chain joint. */
  readonly solved: readonly [number[][], number[][], number[][]];
  /** Each free freedom's goal angle, rate and acceleration, in `free`'s order: what `memory.goals` holds. */
  readonly goals: readonly [number, number, number][];
  readonly memory: EffectorMemory;
}

/** What the endpoint tracker remembers from one step to the next. */
interface EffectorMemory {
  goal: EffectorGoal | null;
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

/** Endpoint solves since construction: their count, passes and capped solves. */
interface ReachMeter { solves: number; passes: number; capped: number }

/**
 * How a tracker reads the body: `fromActual`, its held freedoms at their actual angles rather
 * than the posture's, unless a step says otherwise; `seedActual`, a goal's free freedoms begun
 * from their actual angles.
 */
export interface TrackerSettings { readonly fromActual?: boolean; readonly seedActual?: boolean }

/** Named physical endpoint paths and bounded IK, independent of a body's support controller. */
export function effectorTracker(built: ReadBody, root: ReadSegment, settings: TrackerSettings = {}) {
  const { fromActual: actualByDefault = false, seedActual = false } = settings;
  const names = (joint: ReadJoint) => joint.dofs.map((_, k) => channelName(joint, k));
  const descriptions = bodyEffectors(built);
  const limbOf = (description: typeof descriptions[number]): Effector => {
    const { segment, chain, free, points } = description;
    const held = chain.flatMap((joint, j) => free.some((f) => f.joint === j) ? [] : names(joint).map((name, k) => ({ j, k, name })));
    const task = (): Task => ({ point: [0, 0, 0], target: [0, 0, 0] }), first = task(), angles = () => chain.map((joint) => joint.dofs.map(() => 0));
    return { chain, segment, free, held, points, work: reachWork(free.length), tasks: [[first], [first, task()]],
      solved: [angles(), angles(), angles()], goals: free.map(() => [0, 0, 0] as [number, number, number]),
      orientation: { target: new Quaternion(), lever: distance(segment.spec.proximal.value, segment.spec.distal.value) },
      memory: { goal: null, started: false, from: [], time: 0, fromRotation: [0, 0, 0, 1],
        angles: chain.map(joint => joint.dofs.map(() => 0)), point: new Vector3(), goals: new Map() } };
  };
  const limbs = new Map(descriptions.map(d => [d.model.segment, limbOf(d)]));
  // In declared order: no two own a freedom (`bodyEffectors`), so the order decides nothing.
  const all = [...limbs.values()];
  // A measured path's place, start, target and the scalar path's sample (`along`).
  const finish: [number, number, number] = [0, 0, 0], target: [number, number, number] = [0, 0, 0], sample: [number, number, number] = [0, 0, 0];
  const start: { position: Vec3; velocity: Vec3 } = { position: STILL, velocity: STILL };
  const state = { effectors: Object.fromEntries([...limbs].map(([name, limb]) => [name, limb.memory])), reach: { solves: 0, passes: 0, capped: 0 } as ReachMeter };
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
      for (let k = 0; k < 3; k++) finish[k] = from[k]! + scale * (position[k]! - from[k]!);
      const terminal = m.goal!.terminalVelocity;
      start.position = from;
      start.velocity = m.goal!.initialVelocity ?? STILL;
      pointPathTargetToRef(start, finish, Math.max(0, time), length, target, sample, terminal, m.goal!.curve);
      // Linear continuation preserves the endpoint rate in the IK finite differences.
      const after = terminal ? Math.max(0, time - length) : 0;
      return out.set(target[0] + after * (terminal?.[0] ?? 0), target[1] + after * (terminal?.[1] ?? 0),
        target[2] + after * (terminal?.[2] ?? 0));
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
  /** The angles that put the path's places where they are at `time`, solved from the angles last solved, into `angles`. */
  const solveAt = ({ chain, free, points, work, memory, orientation: rotational, tasks: lists }: Effector, time: number, angles: number[][]): number[][] => {
    for (let j = 0; j < angles.length; j++) {
      const row = angles[j]!, was = memory.angles[j]!;
      for (let k = 0; k < row.length; k++) row[k] = was[k]!;
    }
    const { places } = memory.goal!, tasks = lists[places.length - 1]!;
    for (let i = 0; i < places.length; i++) {
      along(memory, i, time, at);
      const task = tasks[i]!;
      task.point = points.get(places[i]!.point)!;
      task.target[0] = at.x; task.target[1] = at.y; task.target[2] = at.z;
    }
    const orientation = memory.goal!.orientation;
    if (orientation) {
      const u = Math.max(0, Math.min(1, time / orientation.seconds)), amount = u * u * u * (10 - 15 * u + 6 * u * u);
      const was = memory.fromRotation, to = orientation.target;
      fromTurn.set(was[0], was[1], was[2], was[3]); toTurn.set(to[0], to[1], to[2], to[3]);
      turnBetweenToRef(fromTurn, toTurn, amount, turn);
      rotational.target.copyFrom(turn);
    }
    solveReach(chain, angles, free, tasks, end, work, orientation ? rotational : undefined);
    state.reach.solves++;
    state.reach.passes += end.passes;
    if (!end.still) state.reach.capped++;
    return angles;
  };

  const reach = (segment: string, goal: EffectorGoal) => {
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
      if (places.length !== 1 && places.length !== 2) throw new Error(`an effector goal is one place or two, not ${places.length}`);
      for (const place of places) {
        if (!points.has(place.point)) throw new Error(`effector ${segment} has no point ${place.point}: it has ${[...points.keys()].join(", ")}`);
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
  /** The driver of the step last taken, whose channels `owned` reads by index. */
  let driving: MuscleDriver | null = null;
  /** Channel `i`'s goal angle, rate and acceleration this step, if a limb's path owns it. */
  const owned = (i: number): [number, number, number] | undefined => {
    const name = driving!.channels[i]!.name;
    for (const limb of all) { const g = limb.memory.goals.get(name); if (g) return g; }
    return undefined;
  };
  return {
    state, models: Object.freeze(descriptions.map(d => d.model)), reach,
    response(channel: string) {
      for (const limb of all) if (limb.memory.goals.has(channel)) return limb.memory.goal?.response;
      return undefined;
    },
    release(segment: string) { const limb = limbs.get(segment); if (!limb) throw new Error(`no effector ${segment}`); limb.memory.goal = null; },
    reset() { for (const limb of all) limb.memory.goal = null; },
    path(segment: string) { const limb = limbs.get(segment); return limb?.memory.goal ? limb.memory.point : null; },
    pointToRef(segment: string, point: string, out: Vector3) {
      const limb = limbs.get(segment), at = limb?.points.get(point);
      if (!limb || !at) throw new Error(`no effector point ${segment}/${point}`);
      return pointNowToRef(limb.segment, root, at, out);
    },
    step(driver: MuscleDriver, pose: Readonly<Record<string, number>>, dt: number, fromActual = actualByDefault) {
    driving = driver;
    for (const limb of all) {
      const m = limb.memory;
      // A limb with a goal sets every free freedom's goal below, so only one without clears them.
      if (!m.goal) { if (m.goals.size) m.goals.clear(); continue; }
      // The held freedoms at the posture's angles, the free ones drawn toward it.
      const actual = fromActual || m.goal.carried;
      for (let h = 0; h < limb.held.length; h++) {
        const { j, k, name } = limb.held[h]!;
        m.angles[j]![k] = actual ? driver.angle(driver.channel(name)) : pose[name] ?? 0;
      }
      for (const f of limb.free) f.preferred = pose[f.name] ?? 0;
      if (!m.started) {
        if (seedActual) for (const f of limb.free) m.angles[f.joint]![f.k] = driver.angle(driver.channel(f.name));
        m.from = m.goal.places.map((place) => {
          pointNowToRef(limb.segment, root, limb.points.get(place.point)!, at);
          return [at.x, at.y, at.z] as Vec3;
        });
        if (m.goal.orientation) {
          root.rest.multiplyToRef(Quaternion.InverseToRef(root.node.rotationQuaternion!, inverse), fromTurn);
          fromTurn.multiplyToRef(limb.segment.node.rotationQuaternion!, turn);
          turn.multiplyToRef(Quaternion.InverseToRef(limb.segment.rest, inverse), fromTurn).normalize();
          m.fromRotation = [fromTurn.x, fromTurn.y, fromTurn.z, fromTurn.w];
        }
        m.time = 0;
        m.started = true;
      } else m.time += dt;
      const { solved } = limb;
      const before = solveAt(limb, m.time - dt, solved[0]), now = solveAt(limb, m.time, solved[1]), after = solveAt(limb, m.time + dt, solved[2]);
      for (let j = 0; j < now.length; j++) {
        const row = m.angles[j]!, answer = now[j]!;
        for (let k = 0; k < answer.length; k++) row[k] = answer[k]!;
      }
      along(m, 0, m.time, m.point);
      for (let c = 0; c < limb.free.length; c++) {
        const f = limb.free[c]!, goal = limb.goals[c]!;
        const q0 = before[f.joint]![f.k]!, q1 = now[f.joint]![f.k]!, q2 = after[f.joint]![f.k]!;
        goal[0] = q1; goal[1] = (q2 - q0) / (2 * dt); goal[2] = (q2 - 2 * q1 + q0) / (dt * dt);
        m.goals.set(f.name, goal);
      }
    }
      return owned;
    },
  };
}

/**
 * How far two places' distance apart may differ from their points', m, before the goal is refused:
 * a centimetre. A numeric setting: places made from the points' own distance miss it by rounding alone.
 */
const PLACES_SLACK = .01;

/** A point path's start velocity when its goal gives none: at rest. */
const STILL: Vec3 = Object.freeze([0, 0, 0] as const);
