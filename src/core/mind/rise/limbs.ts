/**
 * **A recipe's limbs, made of a body** (`riseLimbs`): each as the bearing solve takes it (`Limb`,
 * `src/core/control/bearing.ts`), with its part of a step in which it bears. This module knows the
 * kinds of limb and no stage; the player (`staged.ts`) knows the stages and no limb's kind.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../../build/build-body.ts";
import type { Limb, LimbTask, Row } from "../../control/bearing.ts";
import type { BearingPoint } from "../../control/contact-wrench.ts";
import { chainTo } from "../../control/kinematics.ts";
import { SOLE_MARGIN } from "../../control/stance-tuning.ts";
import { footStatesOf, motionAtToRef, pointOfToRef, readSupport, type FootState } from "../../control/support.ts";
import { hypot } from "../../math/real.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import type { OwnBody } from "../mind.ts";
import { limbChannels, type EndLimb, type ProppedLimb, type Recipe } from "./stages.ts";

/**
 * How near the ground a limb's point is, m, for the limb to be down and bear, and a corner of a
 * foot's sole for the foot to prop what it hangs from: a tolerance on a reading
 * (`docs/reference/rising.md#stages`).
 */
const DOWN = 0.03;

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
   * read: its point, which for a limb propped on a foot is its patch's middle. Forces shared as
   * a stage's shares are then the forces that hold the body at the stage's place.
   */
  readonly over: readonly Vector3[];
  /** Read where each limb would bear, world, into its work's point, the ground's level being `ground`, world. */
  read(ground: number): void;
  /**
   * Limb `index` bears this step, if the point last read is down (within `DOWN` of the ground,
   * `ground`, world), which is returned: its task is that point held where it is across the
   * ground and kept at the ground's level, critically damped at `rate`, 1/s, its segment's spin
   * damped; the freedoms of its chain that do not take the task are asked toward `goal`, each
   * channel's angle as the muscles read it, at the same rate, and those that take it are as near
   * `goal` as the task lets them be; and it bears `share` of the load against the other limbs'
   * (`LimbWork.share`). A limb whose point is over the ground bears nothing and is the servo's
   * (`rest`): the posture it is asked brings it down.
   */
  bear(index: number, goal: ArrayLike<number>, rate: number, ground: number, share: number): boolean;
  /** Limb `index` is not the solve's this step: the servo has its freedoms. */
  rest(index: number): void;
}

/** A limb, and its kind's part of a step. */
interface Part {
  readonly limb: Limb;
  readonly over: Vector3;
  read(ground: number): void;
  bear(goal: ArrayLike<number>, rate: number, ground: number): void;
}

/** `recipe`'s limbs made of `own`'s body, which can play it (`stageFaults`). */
export function riseLimbs(own: OwnBody, recipe: Recipe): RiseLimbs {
  const feet = recipe.limbs.some((limb) => limb.kind === "propped") ? footStatesOf(own.built) : [];
  const footOf = (segment: string): FootState => feet.find((foot) => foot.segment.spec.name === segment)!;
  const support = new Vector3();
  const parts = recipe.limbs.map((limb): Part => {
    switch (limb.kind) {
      case "end": return endLimb(own, limb);
      case "propped": return proppedLimb(own, limb, footOf(limb.prop));
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
    read(ground) {
      readSupport(feet, feet, support);
      for (const part of parts) part.read(ground);
    },
    bear(index, goal, rate, ground, share) {
      const part = parts[index]!;
      if (part.limb.work.at.y - ground >= DOWN) {
        rest(index);
        return false;
      }
      part.bear(goal, rate, ground);
      part.limb.work.share = share;
      return true;
    },
    rest,
  };
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

/** A capsule's end as a limb bears on it: the end's centre, body frame, reference pose, and the capsule's radius. */
function endOf(built: BuiltBody, segment: BuiltSegment, which: ProppedLimb["end"]): { readonly at: Vec3; readonly radius: number } {
  const shape = segment.spec.shape, joint = chainTo(built, segment).at(-1);
  if (shape.kind !== "capsule" || !joint) throw new Error(`${segment.spec.name} is a ${shape.kind} that ${joint ? joint.spec.name : "no joint"} carries; a limb bears on the end of a capsule a joint carries`);
  const c = joint.spec.centre.value, from = shape.from.value, to = shape.to.value;
  const away = (p: Vec3): number => (p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1]) + (p[2] - c[2]) * (p[2] - c[2]);
  const near = away(from) <= away(to) ? from : to;
  return { at: which === "near" ? near : near === from ? to : from, radius: shape.radius.value };
}

/**
 * The chain of a limb that bears on a capsule: its channels, root outward, and its stem's; and
 * `ask`, which asks its freedoms toward a posture: those that do not take its task ahead of it
 * (`LimbWork.ahead`), those that do beneath it (`LimbWork.toward`).
 */
function chainOf(own: OwnBody, spec: EndLimb | ProppedLimb) {
  const { muscles } = own, names = limbChannels(spec, own.spec)!;
  const channels = names.chain.map((name) => muscles.channel(name)), takes = names.chain.map((name) => spec.takes.includes(name));
  const ahead = channels.map(() => NaN), toward = channels.map(() => 0);
  return {
    channels, stem: names.stem.map((name) => muscles.channel(name)), ahead, toward,
    ask(goal: ArrayLike<number>, rate: number): void {
      channels.forEach((i, k) => {
        toward[k] = rate * rate * (goal[i]! - muscles.angle(i)) - 2 * rate * muscles.rate(i);
        ahead[k] = takes[k] ? NaN : toward[k]!;
      });
    },
  };
}

/**
 * A capsule where it touches the ground: a point a radius under its lower end's centre, or, both
 * its ends down (within `DOWN` of the ground), under the middle of the two; held, the segment
 * turning about it as the body moves. Some freedoms of its chain take the point, as near the
 * posture as the point lets them; the others are asked toward the posture ahead of it.
 */
function endLimb(own: OwnBody, spec: EndLimb): Part {
  const { built } = own, segment = built.segments.get(spec.segment)!;
  const chain = chainOf(own, spec), near = endOf(built, segment, "near"), far = endOf(built, segment, "far");
  const at = new Vector3(), other = new Vector3(), patch: BearingPoint = { kind: "point", at };
  const limb: Limb = {
    segment, memory: { channels: chain.channels }, stem: chain.stem, reach: near.radius, task: taskOf(chain.channels.length),
    work: { at, rows: POINT_ROWS, ahead: chain.ahead, toward: chain.toward, patch, share: 1 },
  };
  return {
    limb, over: at,
    read(ground) {
      pointOfToRef(segment, near.at, at).y -= near.radius;
      pointOfToRef(segment, far.at, other).y -= far.radius;
      if (at.y - ground < DOWN && other.y - ground < DOWN) at.addInPlace(other).scaleInPlace(0.5);
      else if (other.y < at.y) at.copyFrom(other);
    },
    bear(goal, rate, ground) {
      hold(limb, rate, ground);
      chain.ask(goal, rate);
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
    read(ground) {
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
        over.copyFrom(at);
      }
    },
    bear(goal, rate, ground) {
      hold(limb, rate, ground);
      // A turn about up x along brings the foot down: asked by how far up it is, critically damped.
      const down = lies.span > 0 ? rate * rate * lies.up / lies.span : 0;
      limb.task.angular.scaleInPlace(2).addInPlaceFromFloats(down * along.z, 0, -down * along.x);
      chain.ask(goal, rate);
    },
  };
}
