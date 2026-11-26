/**
 * **A body's bearing ends, made limbs** (`riseLimbs`): each as the bearing solve takes it (`Limb`,
 * `src/control/bearing.ts`), with its part of a step in which it bears. This module knows the
 * kinds of limb and no stage; the player (`staged.ts`) knows the stages and no limb's kind.
 */
import { Vector3 } from "../../../../core/math/vector.ts";
import type { Limb, LimbTask, Row } from "../../../../control/bearing.ts";
import { UNHELD, type BearingPoint } from "../../../../control/contact-wrench.ts";
import { damping } from "../../../../control/approach.ts";
import { lowsOf } from "../../../../control/ground.ts";
import { chainTo } from "../../../../control/kinematics.ts";
import { SOLE_MARGIN } from "../../../../control/stance/stance-tuning.ts";
import { DOWN, type FootState, bearingSole, footStatesOf, readSupport, rolledEdge, rolledRows } from "../../../../control/support.ts";
import { motionAtToRef, pointOfToRef } from "../../../../core/bodies/read-motion.ts";
import { channelSpeed } from "../../../../core/bodies/muscle/driver.ts";
import { hypot } from "../../../../core/math/real.ts";
import type { Vec3 } from "../../../../core/quantity.ts";
import { configurationShapeAt, type ConfigurationName, type ShapeSpec } from "../../../../core/bodies/spec/body.ts";
import type { OwnBody } from "../../../../core/bodies/own-body.ts";
import { limbChannels, unknownLimb, type Recipe } from "./stages.ts";
import { takesOf, type BearingPolicy } from "./bearing-policy.ts";
import type { EndLimb, FootLimb, ProppedLimb } from "../../../../core/bodies/spec/body.ts";
import type { ReadBody, ReadContact, ReadSegment } from "../../../../core/bodies/read-body.ts";

/**
 * The time constant, s, at which the freedoms of an end's or a propped limb's chain that take its
 * point's task are drawn toward the posture, within what the task leaves them: shorter than a
 * stage's own, so that a hip carrying a knee keeps the turn the posture gives it while the point
 * holds. A foot's chain, whose every freedom takes its task, is not drawn.
 */
const TAKES_SECONDS = 0.1;

/** A point's task: its velocity's three rows, which come after its segment's spin's three; the spin is left free. */
const POINT_ROWS: readonly Row[] = [0, 1, 2].map((axis): Row => [[3 + axis, 1]]);

/** A body's bearing ends, made limbs. */
interface RiseLimbs {
  /** Bearing modes that affect later reads and constraints. */
  readonly state: object;
  /** The limbs as the solve takes them, in the spec's order. */
  readonly limbs: readonly Limb[];
  /** What they keep from step to step: each limb's task, in the spec's order. */
  readonly tasks: readonly LimbTask[];
  /**
   * Where the body is held over each limb while it bears, world, in the spec's order, as last
   * read: its point, which for a limb propped on a foot is its patch's middle, or where the foot
   * stands. Forces shared as a stage's shares are then the forces that hold the body at the
   * stage's place.
   */
  readonly over: readonly Vector3[];
  /** Read where each limb would bear, world, into its work's point, as `reading` says (`LimbsReading`). */
  read(reading: LimbsReading): void;
  /**
   * Limb `index` bears this step as `bearing` asks (`Bearing`), if the point last read is down
   * (within `DOWN` of the ground), which is returned, and bears `share` of the load against the
   * other limbs' (`LimbWork.share`). A limb whose point is over the ground bears nothing: its task
   * is the same, which brings the point down onto the ground where it is over it, its muscles kept
   * within their strength as a free limb's are.
   */
  bear(index: number, share: number, bearing: Bearing): boolean;
  /** Limb `index` is not the solve's this step: the servo has its freedoms. */
  rest(index: number): void;
}

/**
 * **What the rise limbs read where they bear** (`RiseLimbs.read`): the ground's level, `ground`,
 * world; a limb propped on a foot holds the body over where the foot stands if `overProp`, and
 * otherwise over its patch's middle; a foot whose `toes` is set (by the limbs' order) holds the
 * body over its sole's front edge, and bears on that edge, its heel let up, once the centre of
 * mass (`centre`, world) is past it.
 */
export interface LimbsReading {
  readonly ground: number;
  readonly overProp: boolean;
  readonly toes?: readonly boolean[];
  readonly centre?: Readonly<{ x: number; z: number }>;
}

/**
 * **How a limb bears a step** (`RiseLimbs.bear`): its task is its point held where it is across the
 * ground and kept at the ground's level, `ground`, world, critically damped at `rate`, 1/s, its
 * segment's spin damped; the freedoms of its chain that do not take the task are asked toward
 * `goal`, each channel's angle as the muscles read it, at the same rate, and those that take it are
 * as near `goal` as the task lets them be. During `transfer` (a stage that leaves a limb), the
 * chain's redundant freedoms follow `goal` at the stage's rate rather than their posture rate,
 * letting the root move over the retained supports; a leaving limb is let go only once the centre
 * of mass is within the outline of those that stay.
 */
export interface Bearing {
  readonly goal: ArrayLike<number>;
  readonly rate: number;
  readonly ground: number;
  readonly transfer: boolean;
  /** The world's step, s: the gains at `rate` are exact over it (`damping`). */
  readonly dt: number;
}

/** A limb, and its kind's part of a step. */
interface Part {
  readonly memory?: object;
  readonly limb: Limb;
  readonly over: Vector3;
  read(reading: LimbsReading): void;
  bear(bearing: Bearing): void;
}

/** The bearing ends of `own`'s body (`BodySpec.ends`) as limbs, in its spec's order, which a rise can play (`stageFaults`). */
export function riseLimbs(own: OwnBody, options: Pick<Recipe, "heldSupport" | "takes"> = {}): RiseLimbs {
  const ends = own.spec.ends ?? [];
  const feet = ends.some((limb) => limb.kind === "propped" || limb.kind === "foot") ? footStatesOf(own.built) : [];
  const footOf = (segment: string): FootState => feet.find((foot) => foot.segment.spec.name === segment)!;
  const support = new Vector3();
  const parts = ends.map((limb, index): Part => {
    switch (limb.kind) {
      case "end": return endLimb(own, limb, options);
      case "propped": return proppedLimb(own, limb, footOf(limb.prop), options.takes);
      case "foot": return footLimb(own, limb, footOf(limb.segment), index);
      // A rise bears on no paw: its stages' faults refuse a body that bears on one (`stageFaults`).
      case "paw": throw new Error(`${own.spec.model}: a rise bears on no paw, and ${limb.name} is one`);
      default: return unknownLimb(limb);
    }
  });
  const rest = (index: number): void => {
    const { task } = parts[index]!.limb;
    task.on = false;
    task.bearing = false;
  };
  return {
    state: { feet: feet.map(foot => foot.memory), limbs: parts.map(part => part.memory ?? {}) },
    limbs: parts.map((part) => part.limb),
    tasks: parts.map((part) => part.limb.task),
    over: parts.map((part) => part.over),
    read(reading) {
      readSupport(feet, feet, support);
      for (const part of parts) part.read(reading);
    },
    bear(index, share, bearing) {
      const part = parts[index]!, down = part.limb.work.at.y - bearing.ground < DOWN;
      part.bear(bearing);
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

const taskOf = (freedoms: number): LimbTask => ({ on: false, bearing: false, linear: new Vector3(), angular: new Vector3(), accel: new Float64Array(freedoms) });

/** `limb` bears at its point: the point held across the ground and brought to `ground`, its segment's spin damped. */
function hold(limb: Limb, { rate, ground, dt }: Bearing): void {
  const { task, work } = limb, gain = damping(rate, dt);
  motionAtToRef(limb.segment, work.at, task.linear, task.angular);
  const fall = task.linear.y;
  task.linear.scaleInPlace(-gain.decay);
  task.linear.y = gain.error * (ground - work.at.y) - gain.rate * fall;
  task.angular.scaleInPlace(-gain.decay);
  task.on = true;
  task.bearing = true;
}

/** A capsule's ends as a limb bears on them, body frame, reference pose: the end nearer the joint that carries it, the other, and its radius. */
function capsuleEnds(built: ReadBody, segment: ReadSegment, shape: ShapeSpec): { readonly near: Vec3; readonly far: Vec3; readonly radius: number } {
  const joint = chainTo(built, segment).at(-1);
  if (shape.kind !== "capsule" || !joint) throw new Error(`${segment.spec.name} is a ${shape.kind} that ${joint ? joint.spec.name : "no joint"} carries; a limb bears on the end of a capsule a joint carries`);
  const c = joint.spec.centre.value, from = shape.from.value, to = shape.to.value;
  const away = (p: Vec3): number => (p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1]) + (p[2] - c[2]) * (p[2] - c[2]);
  const near = away(from) <= away(to) ? from : to;
  return { near, far: near === from ? to : from, radius: shape.radius.value };
}

/** `read` of a segment's shape and of each of its hand's poses; what it gives is the applied pose's, or the shape's for a segment without poses. */
function byPose<T>(built: ReadBody, segment: ReadSegment, read: (shape: ShapeSpec) => T): () => T {
  const base = read(segment.spec.shape);
  const poses = segment.spec.configurations && Object.fromEntries((Object.keys(segment.spec.configurations.shapes) as ConfigurationName[]).map(name =>
    [name, read(configurationShapeAt(built.spec, segment.spec, name))]));
  return () => poses && segment.configuration ? poses[segment.configuration.applied]! : base;
}

/** A capsule's end as a limb bears on it: the end's centre, body frame, reference pose, and the capsule's radius. */
function endOf(built: ReadBody, segment: ReadSegment, which: ProppedLimb["end"]): { readonly at: Vec3; readonly radius: number } {
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
function chainOf(own: OwnBody, spec: EndLimb | ProppedLimb | FootLimb, policy?: BearingPolicy) {
  const { muscles } = own, names = limbChannels(spec, own.spec)!;
  const channels = names.chain.map((name) => muscles.channel(name)), takes = names.chain.map((name) => spec.kind === "foot" || takesOf(spec, policy).includes(name));
  const ahead = channels.map(() => NaN), toward = channels.map(() => 0), within = spec.kind === "foot" ? 0 : 1 / TAKES_SECONDS;
  const jointAcceleration = new Float64Array(channels.length);
  return {
    channels, stem: names.stem.map((name) => muscles.channel(name)), ahead, toward,
    ask({ goal, rate, transfer, dt }: Bearing): void {
      for (let k = 0; k < channels.length; k++) {
        const i = channels[k]!, gain = damping(!transfer && takes[k] && within > 0 ? within : rate, dt);
        jointAcceleration[k] = gain.error * (goal[i]! - muscles.angle(i)) - gain.rate * muscles.rate(i);
      }
      // The posture closes joint angles; the bearing task and dynamics use motor-axis speeds.
      for (let k = 0; k < channels.length; k++) {
        const i = channels[k]!;
        toward[k] = channelSpeed(muscles, i, jointAcceleration, k - muscles.channels[i]!.index);
        ahead[k] = takes[k] ? NaN : toward[k]!;
      }
    },
  };
}

/**
 * A segment's end where it touches the ground. On a capsule: a point a radius under its lower
 * end's centre, or, both its ends down (within `DOWN` of the ground), under the middle of the two.
 * On a configuration's hull: the middle of its corners that are down, or its lowest corner if none
 * is. A hand held off the ground bears through the rigid body's loaded contact (`pressedOn`):
 * a hand on a club's end or a buckler's rim bears through it. With loaded held support, that
 * contact is the force patch even under a nearby hand. Its motion is held at its own end
 * while that end is down, otherwise at the loaded contact. The segment turns about the held point
 * as the body moves. Some freedoms of its chain take the
 * point, as near the posture as the point lets them; the others are asked toward the posture
 * ahead of it. Its reach is its own shape's capsule radius, whatever pose its hand is in.
 */
function endLimb(own: OwnBody, spec: EndLimb, support: Pick<Recipe, "heldSupport" | "takes">): Part {
  const { built } = own, segment = built.segments.get(spec.segment)!;
  const loaded = support.heldSupport === "loaded";
  const chain = chainOf(own, spec, support.takes), reach = capsuleEnds(built, segment, segment.spec.shape).radius;
  const shape = byPose(built, segment, (s): EndShape => s.kind === "hull"
    ? { kind: "hull", corners: lowsOf(s, segment.frame).map((low) => low.at) }
    : { kind: "capsule", ...capsuleEnds(built, segment, s) });
  const at = new Vector3(), contact = new Vector3(), other = new Vector3(), corner = new Vector3(), patch: BearingPoint = { kind: "point", at: contact };
  const limb: Limb = {
    segment, memory: { channels: chain.channels }, stem: chain.stem, reach, task: taskOf(chain.channels.length),
    work: { at, rows: POINT_ROWS, ahead: chain.ahead, toward: chain.toward, patch, share: 1 },
  };
  const heldContact = (contact: ReadContact): boolean => contact.pairs.some(pair => {
    const kind = segment.rigid.owners[pair.mine]!.kind;
    return pair.impulse > 0 && (kind === "held" || kind === "held-region");
  });
  return {
    limb, over: at,
    read({ ground }) {
      readEnd(ground);
      contact.copyFrom(at);
      // The loaded variant reads item force separately from a nearby hand's motion target.
      if (segment.rigid.shapes.length > 1) {
        if (at.y - ground >= DOWN) {
          pressedOn(own, segment, at);
          contact.copyFrom(at);
        } else if (loaded) pressedOn(own, segment, contact, heldContact);
      }
    },
    bear(bearing) {
      hold(limb, bearing);
      chain.ask(bearing);
    },
  };

  /** The end's point by its own shape: a capsule's or a configuration's hull's, as the limb's comment says. */
  function readEnd(ground: number): void {
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
  }
}

/**
 * Where `segment`'s rigid body presses the ground in the contacts `accepts` admits, into `at`:
 * their points weighed by the impulse each was pushed with; `at` as it was where none pressed.
 */
function pressedOn(own: OwnBody, segment: ReadSegment, at: Vector3, accepts?: (contact: ReadContact) => boolean): void {
  let x = 0, y = 0, z = 0, sum = 0;
  for (const contact of own.built.physics.contactsOf(segment.body, (other) => other === null)) {
    if (!(contact.impulse > 0) || accepts && !accepts(contact)) continue;
    x += contact.impulse * contact.point[0]; y += contact.impulse * contact.point[1]; z += contact.impulse * contact.point[2];
    sum += contact.impulse;
  }
  if (sum > 0) at.set(x / sum, y / sum, z / sum);
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
function proppedLimb(own: OwnBody, spec: ProppedLimb, prop: FootState, policy?: BearingPolicy): Part {
  const { built } = own, segment = built.segments.get(spec.segment)!;
  const chain = chainOf(own, spec, policy), end = endOf(built, segment, spec.end);
  const at = new Vector3(), over = new Vector3(), along = new Vector3(0, 0, 1), stands = new Vector3();
  const point: BearingPoint = { kind: "point", at }, sole = { kind: "sole" as const, middle: at, along, length: 0, width: 0, ankle: at, hold: UNHELD };
  /** How far the foot stands from the end's point across the ground, m, and its sole's lowest corner over the ground, m. */
  const lies = { span: 0, up: 0 };
  // The capsule's spin about the level line across it: its tilt's rate.
  const tilt: [number, number][] = [[0, 0], [2, 0]];
  const limb: Limb = {
    segment, memory: { channels: chain.channels }, stem: chain.stem, reach: end.radius, task: taskOf(chain.channels.length),
    work: { at, rows: [...POINT_ROWS, tilt], ahead: chain.ahead, toward: chain.toward, patch: point, share: 1 },
  };
  return {
    limb, over, memory: { along },
    read({ ground, overProp }) {
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
    bear(bearing) {
      hold(limb, bearing);
      // A turn about up x along brings the foot down: asked by how far up it is, critically damped.
      const down = lies.span > 0 ? damping(bearing.rate, bearing.dt).error * lies.up / lies.span : 0;
      limb.task.angular.scaleInPlace(2).addInPlaceFromFloats(down * along.z, 0, -down * along.x);
      chain.ask(bearing);
    },
  };
}

/**
 * A foot as the stance bears on it: on its sole, held flat, or, its heel more than `DOWN` over the
 * ground, on its sole's front edge, its turn about the edge free. Asked onto its toes, it holds the
 * body over that edge, and bears on it once the centre of mass is ahead of the sole's middle, the
 * posture's ankle then letting the heel up. Its point is the sole's middle,
 * or the edge's; its patch the sole, or the band of it at the edge (`bearingSole`). Every freedom
 * of its chain takes the task. It is the `index`th of the limbs, by which it finds its `toes`.
 */
function footLimb(own: OwnBody, spec: FootLimb, foot: FootState, index: number): Part {
  const chain = chainOf(own, spec), at = new Vector3();
  const limb: Limb = {
    segment: foot.segment, memory: { channels: chain.channels }, stem: chain.stem, get reach() { return foot.reach; }, task: taskOf(chain.channels.length),
    work: { at, rows: null, ahead: chain.ahead, toward: chain.toward, patch: null, share: 1 },
  };
  return {
    limb, over: at,
    read({ ground, toes: each, centre }) {
      const toes = each?.[index] ?? false, was = foot.memory.rolled;
      foot.memory.ground = ground;
      foot.memory.lifted = 0;
      const up = foot.ends.front.middle.y + foot.heel - ground >= DOWN;
      const onto = toes && centre !== undefined && (was === "front" || aheadOf(foot, centre));
      foot.memory.rolled = up || onto ? "front" : null;
      at.copyFrom(toes ? foot.ends.front.middle : rolledEdge(foot)?.middle ?? foot.middle);
    },
    bear(bearing) {
      hold(limb, bearing);
      limb.work.rows = foot.memory.rolled ? rolledRows(foot) : null;
      limb.work.patch = bearingSole(foot, 1 - SOLE_MARGIN);
      chain.ask(bearing);
    },
  };
}

/** Whether `centre` is ahead of `foot`'s sole's middle, toward its front edge. */
function aheadOf(foot: FootState, centre: Readonly<{ x: number; z: number }>): boolean {
  const edge = foot.ends.front.middle;
  return (centre.x - foot.middle.x) * (edge.x - foot.middle.x) + (centre.z - foot.middle.z) * (edge.z - foot.middle.z) > 0;
}
