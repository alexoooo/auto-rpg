/**
 * **A recipe's limbs, made of a body** (`riseLimbs`): each as the bearing solve takes it (`Limb`,
 * `src/core/control/bearing.ts`), with its part of a step in which it bears. This module knows the
 * kinds of limb and no stage; the player (`staged.ts`) knows the stages and no limb's kind.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../../build/build-body.ts";
import type { Limb, LimbTask, Row } from "../../control/bearing.ts";
import type { BearingPoint } from "../../control/contact-wrench.ts";
import { lowsOf } from "../../control/ground.ts";
import { chainTo } from "../../control/kinematics.ts";
import { SOLE_MARGIN } from "../../control/stance-tuning.ts";
import { bearingSole, footStatesOf, motionAtToRef, pointOfToRef, readSupport, rolledRows, type FootState } from "../../control/support.ts";
import { hypot } from "../../math/real.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { handShapeAt, type HandPose, type ShapeSpec } from "../../spec/body.ts";
import type { OwnBody } from "../mind.ts";
import { limbChannels, type EndLimb, type FootLimb, type ProppedLimb, type Recipe } from "./stages.ts";

/**
 * How near the ground a limb's point is, m, for the limb to be down and bear, and a corner of a
 * foot's sole for the foot to prop what it hangs from: a tolerance on a reading
 * (`docs/reference/rising.md#stages`).
 */
export const DOWN = 0.03;

/**
 * The time constant, s, at which the freedoms of an end's or a propped limb's chain that take its
 * point's task are drawn toward the posture, within what the task leaves them: shorter than a
 * stage's own, so that a hip carrying a knee keeps the turn the posture gives it while the point
 * holds (`docs/reference/rising.md#stages`).
 */
const TAKES_SECONDS = 0.1;

/** A point's task: its velocity's three rows, which come after its segment's spin's three; the spin is left free. */
const POINT_ROWS: readonly Row[] = [0, 1, 2].map((axis): Row => [[3 + axis, 1]]);

/** A recipe's limbs, made of a body. */
interface RiseLimbs {
  /** The limbs as the solve takes them, in the recipe's order. */
  readonly limbs: readonly Limb[];
  /** What they keep from step to step: each limb's task, in the recipe's order. */
  readonly tasks: readonly LimbTask[];
  /**
   * Where the body is held over each limb while it bears, world, in the recipe's order, as last
   * read: its point, which for a limb propped on a foot is its patch's middle, or where the foot
   * stands. Forces shared as a stage's shares are then the forces that hold the body at the
   * stage's place.
   */
  readonly over: readonly Vector3[];
  /**
   * Read where each limb would bear, world, into its work's point, the ground's level being
   * `ground`, world; a limb propped on a foot holds the body over where the foot stands if
   * `overProp`, and otherwise over its patch's middle.
   */
  read(ground: number, overProp: boolean): void;
  /**
   * Limb `index` bears this step, if the point last read is down (within `DOWN` of the ground,
   * `ground`, world), which is returned: its task is that point held where it is across the
   * ground and kept at the ground's level, critically damped at `rate`, 1/s, its segment's spin
   * damped; the freedoms of its chain that do not take the task are asked toward `goal`, each
   * channel's angle as the muscles read it, at the same rate, and those that take it are as near
   * `goal` as the task lets them be; and it bears `share` of the load against the other limbs'
   * (`LimbWork.share`). A limb whose point is over the ground bears nothing: its task is the same,
   * which brings the point down onto the ground where it is over it, its muscles kept within their
   * strength as a free limb's are. During `transfer`, posture redundancy uses the stage's rate
   * (docs/reference/recovery-transfer.md), letting the root move over the retained supports.
   */
  bear(index: number, goal: ArrayLike<number>, rate: number, ground: number, share: number, transfer?: boolean): boolean;
  /** Limb `index` is not the solve's this step: the servo has its freedoms. */
  rest(index: number): void;
}

/** A limb, and its kind's part of a step. */
interface Part {
  readonly limb: Limb;
  readonly over: Vector3;
  read(ground: number, overProp: boolean): void;
  bear(goal: ArrayLike<number>, rate: number, ground: number, transfer: boolean): void;
}

/** `recipe`'s limbs made of `own`'s body, which can play it (`stageFaults`). */
export function riseLimbs(own: OwnBody, recipe: Recipe): RiseLimbs {
  const feet = recipe.limbs.some((limb) => limb.kind === "propped" || limb.kind === "foot") ? footStatesOf(own.built) : [];
  const footOf = (segment: string): FootState => feet.find((foot) => foot.segment.spec.name === segment)!;
  const support = new Vector3();
  const parts = recipe.limbs.map((limb): Part => {
    switch (limb.kind) {
      case "end": return endLimb(own, limb);
      case "propped": return proppedLimb(own, limb, footOf(limb.prop));
      case "foot": return footLimb(own, limb, footOf(limb.segment));
      default: return unknownLimb(limb);
    }
  });
  const rest = (index: number): void => {
    const { task } = parts[index]!.limb;
    task.on = false;
    task.bearing = false;
  };
  return {
    limbs: parts.map((part) => part.limb),
    tasks: parts.map((part) => part.limb.task),
    over: parts.map((part) => part.over),
    read(ground, overProp) {
      readSupport(feet, feet, support);
      for (const part of parts) part.read(ground, overProp);
    },
    bear(index, goal, rate, ground, share, transfer = false) {
      const part = parts[index]!, down = part.limb.work.at.y - ground < DOWN;
      part.bear(goal, rate, ground, transfer);
      part.limb.task.bearing = down;
      part.limb.work.share = share;
      return down;
    },
    rest,
  };
}

function unknownEnd(end: never): never {
  throw new Error(`an end of no known shape: ${JSON.stringify((end as { kind?: unknown }).kind)}`);
}

function unknownLimb(limb: never): never {
  throw new Error(`a limb of no known kind: ${JSON.stringify(limb)}`);
}

const taskOf = (freedoms: number): LimbTask => ({ on: false, bearing: false, linear: new Vector3(), angular: new Vector3(), accel: new Float64Array(freedoms) });

/** `limb` bears at its point: the point held across the ground and brought to `ground`, its segment's spin damped. */
function hold(limb: Limb, rate: number, ground: number): void {
  const { task, work } = limb;
  motionAtToRef(limb.segment, work.at, task.linear, task.angular);
  const fall = task.linear.y;
  task.linear.scaleInPlace(-rate);
  task.linear.y = rate * rate * (ground - work.at.y) - 2 * rate * fall;
  task.angular.scaleInPlace(-rate);
  task.on = true;
  task.bearing = true;
}

/** A capsule's ends as a limb bears on them, body frame, reference pose: the end nearer the joint that carries it, the other, and its radius. */
function capsuleEnds(built: BuiltBody, segment: BuiltSegment, shape: ShapeSpec): { readonly near: Vec3; readonly far: Vec3; readonly radius: number } {
  const joint = chainTo(built, segment).at(-1);
  if (shape.kind !== "capsule" || !joint) throw new Error(`${segment.spec.name} is a ${shape.kind} that ${joint ? joint.spec.name : "no joint"} carries; a limb bears on the end of a capsule a joint carries`);
  const c = joint.spec.centre.value, from = shape.from.value, to = shape.to.value;
  const away = (p: Vec3): number => (p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1]) + (p[2] - c[2]) * (p[2] - c[2]);
  const near = away(from) <= away(to) ? from : to;
  return { near, far: near === from ? to : from, radius: shape.radius.value };
}

/** `read` of a segment's shape and of each of its hand's poses; what it gives is the applied pose's, or the shape's for a segment without poses. */
function byPose<T>(built: BuiltBody, segment: BuiltSegment, read: (shape: ShapeSpec) => T): () => T {
  const base = read(segment.spec.shape);
  const poses = segment.spec.handPoses && Object.fromEntries((Object.keys(segment.spec.handPoses) as HandPose[]).map(name =>
    [name, read(handShapeAt(built.spec, segment.spec, name))]));
  return () => poses && segment.handPose ? poses[segment.handPose.applied]! : base;
}

/** A capsule's end as a limb bears on it: the end's centre, body frame, reference pose, and the capsule's radius. */
function endOf(built: BuiltBody, segment: BuiltSegment, which: ProppedLimb["end"]): { readonly at: Vec3; readonly radius: number } {
  const current = byPose(built, segment, (shape) => {
    const ends = capsuleEnds(built, segment, shape);
    return { at: which === "near" ? ends.near : ends.far, radius: ends.radius };
  });
  return { get at() { return current().at; }, get radius() { return current().radius; } };
}

/** What an end limb bears on: a capsule's two ends, a radius out, or a hull's corners. */
type EndShape =
  | { readonly kind: "capsule"; readonly near: Vec3; readonly far: Vec3; readonly radius: number }
  | { readonly kind: "hull"; readonly corners: readonly Vec3[] };

/**
 * The chain of a limb: its channels, root outward, and its stem's; and `ask`, which asks its
 * freedoms toward a posture: those that do not take its task ahead of it (`LimbWork.ahead`), at
 * the rate it is given, and those that do beneath it (`LimbWork.toward`), at `TAKES_SECONDS`'s,
 * or a foot's, whose every freedom takes it, at the rate it is given.
 */
function chainOf(own: OwnBody, spec: EndLimb | ProppedLimb | FootLimb) {
  const { muscles } = own, names = limbChannels(spec, own.spec)!;
  const channels = names.chain.map((name) => muscles.channel(name)), takes = names.chain.map((name) => spec.kind === "foot" || spec.takes.includes(name));
  const ahead = channels.map(() => NaN), toward = channels.map(() => 0), within = spec.kind === "foot" ? 0 : 1 / TAKES_SECONDS;
  return {
    channels, stem: names.stem.map((name) => muscles.channel(name)), ahead, toward,
    ask(goal: ArrayLike<number>, rate: number, transfer: boolean): void {
      for (let k = 0; k < channels.length; k++) {
        const i = channels[k]!, r = !transfer && takes[k] && within > 0 ? within : rate;
        toward[k] = r * r * (goal[i]! - muscles.angle(i)) - 2 * r * muscles.rate(i);
        ahead[k] = takes[k] ? NaN : toward[k]!;
      }
    },
  };
}

/**
 * A segment's end where it touches the ground. On a capsule: a point a radius under its lower
 * end's centre, or, both its ends down (within `DOWN` of the ground), under the middle of the two.
 * On a hand pose's hull: the middle of its corners that are down, or its lowest corner if none
 * is. Held, the segment turning about it as the body moves. Some freedoms of its chain take the
 * point, as near the posture as the point lets them; the others are asked toward the posture
 * ahead of it. Its reach is its own shape's capsule radius, whatever pose its hand is in.
 */
function endLimb(own: OwnBody, spec: EndLimb): Part {
  const { built } = own, segment = built.segments.get(spec.segment)!;
  const chain = chainOf(own, spec), reach = capsuleEnds(built, segment, segment.spec.shape).radius;
  const shape = byPose(built, segment, (s): EndShape => s.kind === "hull"
    ? { kind: "hull", corners: lowsOf(s, segment.frame).map((low) => low.at) }
    : { kind: "capsule", ...capsuleEnds(built, segment, s) });
  const at = new Vector3(), other = new Vector3(), corner = new Vector3(), patch: BearingPoint = { kind: "point", at };
  const limb: Limb = {
    segment, memory: { channels: chain.channels }, stem: chain.stem, reach, task: taskOf(chain.channels.length),
    work: { at, rows: POINT_ROWS, ahead: chain.ahead, toward: chain.toward, patch, share: 1 },
  };
  return {
    limb, over: at,
    read(ground) {
      const now = shape();
      switch (now.kind) {
        case "capsule":
          pointOfToRef(segment, now.near, at).y -= now.radius;
          pointOfToRef(segment, now.far, other).y -= now.radius;
          if (at.y - ground < DOWN && other.y - ground < DOWN) at.addInPlace(other).scaleInPlace(0.5);
          else if (other.y < at.y) at.copyFrom(other);
          return;
        case "hull": {
          let down = 0;
          at.setAll(0);
          other.setAll(Infinity);
          for (const point of now.corners) {
            pointOfToRef(segment, point, corner);
            if (corner.y - ground < DOWN) { at.addInPlace(corner); down++; }
            if (corner.y < other.y) other.copyFrom(corner);
          }
          if (down > 0) at.scaleInPlace(1 / down);
          else at.copyFrom(other);
          return;
        }
        default: unknownEnd(now);
      }
    },
    bear(goal, rate, ground, transfer) {
      hold(limb, rate, ground);
      chain.ask(goal, rate, transfer);
    },
  };
}

/**
 * A capsule on one of its ends, its other end held off the ground by a foot that hangs from it and
 * stands on its sole's rim: a shank on its knee, its ankle on the foot's toes. The two bear as one
 * sole of no width, from the end's point to where the foot stands (the middle of its sole's
 * corners that are on the ground), so the body may be anywhere over it; the solve takes it at the
 * middle of the two, a point of the capsule, held, and holds the capsule's tilt, which the foot
 * keeps. The foot's own freedoms are the servo's.
 *
 * While no corner of the foot's sole is on the ground the capsule bears at its end alone, and its
 * tilt is asked the way that brings the sole's lowest corner down.
 */
function proppedLimb(own: OwnBody, spec: ProppedLimb, prop: FootState): Part {
  const { built } = own, segment = built.segments.get(spec.segment)!;
  const chain = chainOf(own, spec), end = endOf(built, segment, spec.end);
  const at = new Vector3(), over = new Vector3(), along = new Vector3(0, 0, 1), stands = new Vector3();
  const point: BearingPoint = { kind: "point", at }, sole = { kind: "sole" as const, middle: at, along, length: 0, width: 0 };
  /** How far the foot stands from the end's point across the ground, m, and its sole's lowest corner over the ground, m. */
  const lies = { span: 0, up: 0 };
  // The capsule's spin about the level line across it: its tilt's rate.
  const tilt: [number, number][] = [[0, 0], [2, 0]];
  const limb: Limb = {
    segment, memory: { channels: chain.channels }, stem: chain.stem, reach: end.radius, task: taskOf(chain.channels.length),
    work: { at, rows: [...POINT_ROWS, tilt], ahead: chain.ahead, toward: chain.toward, patch: point, share: 1 },
  };
  return {
    limb, over,
    read(ground, overProp) {
      pointOfToRef(segment, end.at, at).y -= end.radius;
      over.copyFrom(at);
      // Where the foot stands: the middle of its sole's corners on the ground, or, none there, its lowest.
      let down = 0, lowest = prop.corners[0]!;
      stands.setAll(0);
      for (const corner of prop.corners) {
        if (corner.y < lowest.y) lowest = corner;
        if (corner.y - ground >= DOWN) continue;
        stands.addInPlace(corner);
        down++;
      }
      if (down > 0) stands.scaleInPlace(1 / down);
      else stands.copyFrom(lowest);
      const dx = stands.x - at.x, dz = stands.z - at.z;
      lies.span = hypot(dx, dz);
      lies.up = lowest.y - ground;
      // Where the foot stands under the end, the way it lay when last it did not.
      if (lies.span > 0) along.set(dx / lies.span, 0, dz / lies.span);
      // up x along
      tilt[0]![1] = along.z;
      tilt[1]![1] = -along.x;
      limb.work.patch = point;
      if (down > 0 && lies.span > 0) {
        at.addInPlace(stands).scaleInPlace(0.5);
        sole.length = (1 - SOLE_MARGIN) * lies.span / 2;
        limb.work.patch = sole;
        over.copyFrom(overProp ? stands : at);
      }
    },
    bear(goal, rate, ground, transfer) {
      hold(limb, rate, ground);
      // A turn about up x along brings the foot down: asked by how far up it is, critically damped.
      const down = lies.span > 0 ? rate * rate * lies.up / lies.span : 0;
      limb.task.angular.scaleInPlace(2).addInPlaceFromFloats(down * along.z, 0, -down * along.x);
      chain.ask(goal, rate, transfer);
    },
  };
}

/**
 * A foot as the stance bears on it: on its sole, held flat, or, its heel more than `DOWN` over the
 * ground, on its sole's front edge, its turn about the edge free. Its point is the sole's middle,
 * or the edge's; its patch the sole, or the band of it at the edge (`bearingSole`). Every freedom
 * of its chain takes the task.
 */
function footLimb(own: OwnBody, spec: FootLimb, foot: FootState): Part {
  const chain = chainOf(own, spec), at = new Vector3();
  const limb: Limb = {
    segment: foot.segment, memory: { channels: chain.channels }, stem: chain.stem, reach: foot.reach, task: taskOf(chain.channels.length),
    work: { at, rows: null, ahead: chain.ahead, toward: chain.toward, patch: null, share: 1 },
  };
  return {
    limb, over: at,
    read(ground) {
      foot.memory.rolled = foot.edge.y + foot.heel - ground >= DOWN;
      at.copyFrom(foot.memory.rolled ? foot.edge : foot.middle);
    },
    bear(goal, rate, ground, transfer) {
      hold(limb, rate, ground);
      limb.work.rows = foot.memory.rolled ? rolledRows(foot) : null;
      limb.work.patch = bearingSole(foot, 1 - SOLE_MARGIN);
      chain.ask(goal, rate, transfer);
    },
  };
}
