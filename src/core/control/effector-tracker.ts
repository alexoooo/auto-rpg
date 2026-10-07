import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance } from "../spec/vec.ts";
import { bodyEffectors } from "./effectors.ts";
import { pointPath } from "./point-path.ts";
import { pointNowToRef, reachWork, solveReach, type ReachEnd, type ReachWork, type ReachOrientation } from "./kinematics.ts";
import { turnBetweenToRef } from "../math/turn.ts";
import { hypot } from "../math/real.ts";
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
  /** Independent segment turn since reference, in the root frame, on a smooth finite path. */
  readonly orientation?: { readonly target: readonly [number, number, number, number]; readonly seconds: number };
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
  readonly segment: BuiltSegment;
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

/** Named physical endpoint paths and bounded IK, independent of a body's support controller. */
export function effectorTracker(built: BuiltBody, root: BuiltSegment) {
  const names = (joint: BuiltJoint) => joint.dofs.map((dof) => `${joint.spec.name} ${dof.spec.positive}`);
  const descriptions = bodyEffectors(built);
  const limbOf = (description: typeof descriptions[number]): Effector => {
    const { segment, chain, free, points } = description;
    return { chain, segment, free, points, work: reachWork(free.length),
      orientation: { target: new Quaternion(), lever: distance(segment.spec.proximal.value, segment.spec.distal.value) },
      memory: { goal: null, started: false, from: [], time: 0, fromRotation: [0, 0, 0, 1],
        angles: chain.map(joint => joint.dofs.map(() => 0)), point: new Vector3(), goals: new Map() } };
  };
  const limbs = new Map(descriptions.map(d => [d.model.segment, limbOf(d)]));
  const both = ["hand.left", "hand.right"].flatMap(name => limbs.has(name) ? [limbs.get(name)!] : []);
  both.push(...[...limbs.values()].filter(limb => !both.includes(limb)));
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
    state, models: Object.freeze(descriptions.map(d => d.model)), reach,
    response(channel: string) {
      for (const limb of both) if (limb.memory.goals.has(channel)) return limb.memory.goal?.response;
      return undefined;
    },
    release(segment: string) { const limb = limbs.get(segment); if (!limb) throw new Error(`no effector ${segment}`); limb.memory.goal = null; },
    reset() { for (const limb of both) limb.memory.goal = null; },
    path(segment: string) { const limb = limbs.get(segment); return limb?.memory.goal ? limb.memory.point : null; },
    pointToRef(segment: string, point: string, out: Vector3) {
      const limb = limbs.get(segment), at = limb?.points.get(point);
      if (!limb || !at) throw new Error(`no effector point ${segment}/${point}`);
      return pointNowToRef(limb.segment, root, at, out);
    },
    step(driver: MuscleDriver, pose: Readonly<Record<string, number>>, dt: number, fromActual = false, seedActual = false) {
    for (const limb of both) {
      const m = limb.memory;
      m.goals.clear();
      if (!m.goal) continue;
      // The held freedoms at the posture's angles, the free ones drawn toward it.
      limb.chain.forEach((joint, j) => {
        if (limb.free.some((f) => f.joint === j)) return;
        names(joint).forEach((name, k) => { m.angles[j]![k] = fromActual ? driver.angle(driver.channel(name)) : pose[name] ?? 0; });
      });
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
      return owned;
    },
  };
}

/**
 * How far two places' distance apart may differ from their points', m, before the goal is refused:
 * a centimetre. A numeric setting: places made from the points' own distance miss it by rounding alone.
 */
const PLACES_SLACK = .01;
