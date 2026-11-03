import { Quaternion, Vector3 } from "../../math/vector.ts";
import type { BodyView } from "../../body.ts";
import { heldFrame, rigidPoints } from "../../build/rigid.ts";
import { copyFreedoms, effectorFreedoms } from "../../control/effectors.ts";
import { intoFrameToRef, pointAtToRef, solveReach, specChainTo } from "../../control/kinematics.ts";
import type { EffectorGoal, PointTask } from "../../control/motor.ts";
import type { Pose } from "../../spec/pose.ts";
import type { Cover, Intent } from "../../intent/intent.ts";
import type { BodySpec, HandPose, ItemSpec } from "../../spec/body.ts";
import { standingFooting, standingHeight } from "../../control/support.ts";
import type { ReadBody } from "../../read-body.ts";
import { STANDARD_GRAVITY } from "../../spec/constants.ts";
import { channelName } from "../../muscle/driver.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { add, cross, distance, dot, length, scale, sub } from "../../spec/vec.ts";
import { acos, sin } from "../../math/real.ts";
import type { Skill } from "../framework/skill.ts";
import { segmentOf } from "../../spec/body.ts";

/**
 * **The guard**: fists up before the chin, elbows in; the arms' posture when no skill owns them,
 * rad (`docs/reference/human-and-strikes.md#guard`); a body holds it as `guardPosture` says.
 */
export const GUARD: Pose = Object.freeze({
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
});

/**
 * **How a cover is held**: the covering point, or the middle of the two, `out` m from the place
 * guarded toward the threat, reached in `seconds`. Set: `docs/reference/blows.md#cover`.
 */
export const GUARD_COVER: Covering = Object.freeze({ out: 0.3, seconds: 0.15 });

/**
 * **The guard a body holds**: `GUARD`, with each hand that holds an item turned at the wrist so
 * that the item stands as near upright, along the body frame's up, as the wrist's range allows.
 * Out of a fist held as `GUARD` holds it, a haft leans back over the head, and the head bears it.
 * The arm is `GUARD`'s, read within its freedoms' ranges, which is where it holds the hand; the
 * wrist's freedoms alone are solved (`solveReach`) for the grip's place there and the haft's
 * line, so the arm's posture is the guard's and the wrist turns no further than it can. An empty
 * hand's arm is `GUARD`'s, and a body that holds nothing holds `GUARD`. It is solved from the spec
 * (`specChainTo`), so a fighter is built holding it (`poseAngles`, `Controller.builtIn`).
 */
export function guardPosture(spec: BodySpec): Pose {
  const held = spec.held ?? [];
  if (!held.length) return GUARD;
  const posture: Record<string, number> = { ...GUARD };
  const at = new Vector3();
  for (const effector of spec.effectors ?? []) {
    const holding = held.find((h) => h.segment === effector.segment);
    if (!holding) continue;
    const chain = specChainTo(spec, effector.segment), free = effectorFreedoms(chain, effector.base);
    if (!free) throw new Error(`${spec.model}'s ${effector.segment} has no joint from ${effector.base}`);
    const angles = chain.map((joint) => joint.dofs.map((dof) => GUARD[`${joint.spec.name} ${dof.spec.positive}`] ?? 0));
    for (const f of free) angles[f.joint]![f.k] = Math.min(f.max, Math.max(f.min, angles[f.joint]![f.k]!));
    const grip = holding.origin.value, haft = add(grip, holding.along.value);
    pointAtToRef(chain, angles, grip, at);
    const place: Vec3 = [at.x, at.y, at.z], wrist = free.filter((f) => f.joint === chain.length - 1);
    solveReach(chain, angles, copyFreedoms(wrist, (f) => GUARD[f.name] ?? 0),
      [{ point: grip, target: place }, { point: haft, target: add(place, scale(UP, length(holding.along.value))) }]);
    for (const f of wrist) posture[f.name] = angles[f.joint]![f.k]!;
  }
  return Object.freeze(posture);
}

/** A cover's settings (`GUARD_COVER`). */
export interface Covering {
  readonly out: number;
  readonly seconds: number;
}

/** `hand`'s chain from the root, split where its arm begins: the trunk's joints, and the arm's from the first off its effector's base (the shoulder) to the hand. */
function armOf(spec: BodySpec, hand: string): { readonly trunk: ReturnType<typeof specChainTo>; readonly arm: ReturnType<typeof specChainTo> } {
  const base = spec.effectors?.find((effector) => effector.segment === hand)?.base, chain = specChainTo(spec, hand);
  const from = chain.findIndex((joint) => joint.spec.parent === base);
  if (from < 0) throw new Error(`${spec.model}'s ${hand} has no joint off its base ${base}`);
  return { trunk: chain.slice(0, from), arm: chain.slice(from) };
}

/** How far `point` (in the reference body frame) of what `hand` holds reaches from the shoulder, m: the arm's joints to the point, at full stretch. */
function armReach(spec: BodySpec, hand: string, point: Vec3): number {
  const points = [...armOf(spec, hand).arm.map((joint) => joint.spec.centre.value), point];
  let reach = 0;
  for (let k = 1; k < points.length; k++) reach += distance(points[k - 1]!, points[k]!);
  return reach;
}

/**
 * How far `point` (in the reference body frame) of what `hand` holds reaches from the body's
 * middle, m: the shoulder's distance across from the middle and the arm from there (`armReach`).
 */
function faceReach(spec: BodySpec, hand: string, point: Vec3): number {
  return Math.abs(armOf(spec, hand).arm[0]!.spec.centre.value[0]) + armReach(spec, hand, point);
}

/**
 * **How fast a ward may move `hand`'s face about `built`'s body**, m/s: the speed at which the arm
 * and what it holds carry as much momentum as the whole body can take at its centre of mass and
 * still stop over its soles without a step. That centre speed is half the shorter sole's length
 * (`standingFooting`) over the time the body falls from its standing height (`standingHeight`),
 * `√(h / g)`, a capture point's; the arm's speed is it scaled by the body's mass over the arm's,
 * what it holds included. A heavy item or a light body moves its ward slower.
 */
export function wardSpeed(built: ReadBody, hand: string): number {
  let body = 0, arm = 0;
  for (const segment of built.segments.values()) body += segment.rigid.mass;
  for (const joint of armOf(built.spec, hand).arm) arm += built.segments.get(joint.spec.child)!.rigid.mass;
  return body / arm * standingFooting(built).length / 2 * Math.sqrt(STANDARD_GRAVITY.value / standingHeight(built));
}

/**
 * **How a shield's ward is held by `hand` of a body of `spec` holding `item` there**, moving at
 * most `speed` m/s (`wardSpeed`): its face's centre as far from the place guarded toward the
 * threat (the hand that holds the foe's weapon, `READINGS.ward`) as the arm reaches (`faceReach`),
 * or at it where that is nearer, held out at the threat, meeting a blow early, not hugged to the
 * body; a place further from the shoulder than the arm reaches (`armReach`) brought back along
 * that line to where it does; a path to its
 * place in the time the place takes to go out at that speed; its face turned to the threat at most
 * `speed / reach` rad/s. Set: `docs/reference/blows.md#a-shields-ward`.
 */
function wardOf(spec: BodySpec, hand: string, item: ItemSpec, speed: number): Ward {
  const segment = segmentOf(spec, hand)!, face = rigidPoints(spec, segment).get(item.cover![0]!)!.value, out = faceReach(spec, hand, face);
  const { trunk, arm } = armOf(spec, hand);
  return { out, seconds: out / speed, speed, reach: armReach(spec, hand, face), trunk, shoulder: arm[0]!.spec.centre.value };
}

/**
 * A shield's ward (`wardOf`): a cover whose place moves at most `speed` m/s about the body and
 * lies within `reach` m of the shoulder, its joint at `shoulder` (reference body frame) carried
 * by the `trunk`'s joints.
 */
interface Ward extends Covering {
  readonly speed: number;
  readonly reach: number;
  readonly trunk: ReturnType<typeof specChainTo>;
  readonly shoulder: Vec3;
}

/**
 * **The place on the line from `from` along unit `toward`, `out` m, brought within `reach` of
 * `shoulder`**: where it lies further, drawn toward the shoulder to its reach, so the arm points
 * where it would reach for it.
 */
function withinReach(from: Vec3, toward: Vec3, out: number, shoulder: Vec3, reach: number): Vec3 {
  const place = add(from, scale(toward, out)), off = sub(place, shoulder), far = length(off);
  return far <= reach ? place : add(shoulder, scale(off, reach / far));
}

/**
 * What a hand covers with: the points of its rigid body it puts before a threat, one or two, and
 * how far apart two are, m. What it holds says (`ItemSpec.cover`); an item that says nothing, and
 * an empty hand, cover with the hand's knuckles.
 */
interface Covers {
  readonly points: readonly string[];
  readonly span: number;
  readonly normal: Vec3 | null;
}

function coversOf(spec: BodySpec, hand: string): Covers {
  const segment = segmentOf(spec, hand);
  if (!segment) throw new Error(`${spec.model} has no ${hand}`);
  const held = spec.held?.find((h) => h.segment === segment.name), points = held?.item.cover ?? ["knuckles"];
  const normal = held?.item.coverNormal, frame = held ? heldFrame(held) : null;
  const known = rigidPoints(spec, segment);
  const at = points.map((name) => {
    const point = known.get(name);
    if (!point) throw new Error(`${spec.model}'s ${hand} has no point ${name} to cover with`);
    return point.value;
  });
  if (normal && Math.abs(length(normal.value) - 1) > 1e-8) throw new Error(`${spec.model}'s ${hand} covering normal must be unit length`);
  if (normal && points.length !== 1) throw new Error(`${spec.model}'s ${hand} covering face needs one centre point`);
  return { points, span: at.length === 2 ? distance(at[0]!, at[1]!) : 0,
    normal: normal && frame ? add(scale(frame.x, normal.value[0]), add(scale(frame.y, normal.value[1]), scale(frame.z, normal.value[2]))) : null };
}

/** No hand given a goal. */
const NO_HANDS: Readonly<Record<string, EffectorGoal | null>> = Object.freeze({});

/**
 * **A body's hands**: its effectors that can cover, by segment, in the spec's order: each with
 * knuckles (`SegmentSpec.points`) or holding an item that says how it covers (`ItemSpec.cover`).
 */
export function handsOf(spec: BodySpec): readonly string[] {
  return (spec.effectors ?? []).map((effector) => effector.segment).filter((name) =>
    !!segmentOf(spec, name)?.points?.knuckles || spec.held?.some((h) => h.segment === name && h.item.cover !== undefined));
}

/** The body frame's up and right: the ways an item's line is laid when how it lies now says nothing. */
const UP: Vec3 = [0, 1, 0], RIGHT: Vec3 = [1, 0, 0];

/** Under this length, m, a line names no direction. A numeric setting: any length rounding alone does not reach. */
const NO_LINE = 1e-6;

/**
 * **The guard skill**: a guarding hand told what to cover (`Cover`) puts what it covers with
 * between the threat and the place guarded, by a hand goal that follows the two as they move.
 *
 * - One point (the knuckles) goes to the line from the place guarded to the threat, `out` from
 *   the place guarded, or to the threat itself where that is nearer.
 * - Two points (a club's swell) have their middle there, and their line square to the line from
 *   the place guarded to the threat: of the ways square to it, the one nearest how the item lies
 *   now, so it is not swung end over end. Each point is half their distance to either side.
 * - A face, where the skill wards with it (`GuardOptions.wardSpeeds`), has one centre point, held at
 *   the ward's `out` and brought there from where it stands no faster than the ward's speed
 *   (`wardSpeed`), and an independent orientation target, turning its declared outward normal
 *   toward the threat while preserving its current roll as closely as possible. Without a ward a
 *   face covers as a point.
 *
 * A hand whose guard names no cover has no goal: its arm is the posture's (`GUARD`). So has the
 * hand a strike has. A free hand that can change its pose is opened. The skill remembers where each
 * ward stands (`state`), and forgets it when the hand stops warding.
 */
export interface GuardSkill extends Skill {
  /** The hands it guards with, by segment (`handsOf` for the stock guards): what the arbiter asks it of, each free hand. */
  readonly hands: readonly string[];
  /** What it remembers, plain data saved and loaded with the mind (`src/core/state.ts`); none where it remembers nothing. */
  readonly state?: object;
  /** The arms' rest: where the arms no skill holds are put, and where a blow returns (`guardPosture` for the stock guards). */
  readonly posture: Pose;
  /** A free hand's hold of what it holds (`holdUp`), asked of each hand neither a cover nor an action drives; null, the posture's. */
  readonly hold: ((hand: string) => PointTask | null) | null;
  /** The pose a free hand that can change its pose is asked (`BodyCommand.handPoses`); absent or null, it keeps what it was asked last. */
  handPose?(hand: string): HandPose | null;
  /** Each hand's goal this step, by segment: a cover's places for a hand that guards with one; absent or null otherwise. */
  command(view: BodyView, guard: Intent["guard"]): Readonly<Record<string, EffectorGoal | null>>;
}

/**
 * How a guard skill is made beside its cover: `wardSpeeds`, each hand that wards with the covering
 * face it holds, by segment, and the most speed its ward moves at (`wardSpeed`), none where it
 * wards with none; `hold`, a free hand's hold (`GuardSkill.hold`).
 */
export interface GuardOptions {
  readonly wardSpeeds?: Readonly<Record<string, number>> | null;
  readonly hold?: GuardSkill["hold"];
}

/**
 * Where each warding hand's ward stands now, by segment: its face's place in the body frame, its
 * hand's turn there (a quaternion, x y z w; null until it is first turned) and the clock each was
 * set at; null where the hand is not warding.
 */
interface GuardState { wards: Record<string, { at: Vec3; time: number; turn: [number, number, number, number] | null; turned: number } | null> }

export function guardSkill(spec: BodySpec, covering: Covering = GUARD_COVER, { wardSpeeds = null, hold = null }: GuardOptions = {}): GuardSkill {
  const hands = handsOf(spec), covers = Object.fromEntries(hands.map((hand) => [hand, coversOf(spec, hand)]));
  /** Each hand's ward, by segment: a hand holding a covering face that it wards with. */
  const wards: Readonly<Record<string, Ward>> = Object.fromEntries((spec.held ?? [])
    .filter(({ segment, item }) => hands.includes(segment) && item.coverNormal !== undefined && wardSpeeds?.[segment] !== undefined)
    .map(({ segment, item }) => [segment, wardOf(spec, segment, item, wardSpeeds![segment]!)]));
  const state: GuardState = { wards: Object.fromEntries(Object.keys(wards).map((hand) => [hand, null])) };
  /** `hand`'s ward's place now: from where it stood toward `want`, at most its speed since; begun where its face `point` is. */
  const paced = (view: BodyView, hand: string, point: string, want: Vec3): Vec3 => {
    let was = state.wards[hand];
    if (!was) {
      const at = view.effectors[hand]!.points[point]!;
      was = state.wards[hand] = { at: [at.x, at.y, at.z], time: view.time, turn: null, turned: view.time };
    }
    const gap = sub(want, was.at), far = length(gap), most = wards[hand]!.speed * (view.time - was.time);
    was.at = far <= most ? want : add(was.at, scale(gap, most / far));
    was.time = view.time;
    return was.at;
  };
  /**
   * `hand`'s ward's turn now: from where it stood toward `want`, at most `speed / reach` rad/s
   * since, so the face's rim turns no faster than its centre moves; begun at the hand's turn.
   * Called after `paced`, which begins the ward.
   */
  const turnedTo = (view: BodyView, hand: string, want: Quaternion): [number, number, number, number] => {
    const was = state.wards[hand]!, ward = wards[hand]!;
    if (!was.turn) { const now = view.effectors[hand]!.rotation; was.turn = [now.x, now.y, now.z, now.w]; was.turned = view.time; }
    const [x, y, z, w] = was.turn, along = x * want.x + y * want.y + z * want.z + w * want.w, sign = along < 0 ? -1 : 1;
    const half = acos(Math.min(1, sign * along)), most = ward.speed / ward.reach * (view.time - was.turned) / 2;
    if (half <= most) was.turn = [want.x, want.y, want.z, want.w];
    else {
      const from = sin(half - most) / sin(half), to = sign * sin(most) / sin(half);
      const q: [number, number, number, number] = [from * x + to * want.x, from * y + to * want.y, from * z + to * want.z, from * w + to * want.w];
      const size = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
      was.turn = [q[0] / size, q[1] / size, q[2] / size, q[3] / size];
    }
    was.turned = view.time;
    return was.turn;
  };
  const guarded = new Vector3(), threat = new Vector3(), shoulderAt = new Vector3();
  /** Where `ward`'s shoulder is now in the body frame: its joint carried by the trunk's joints at their angles (`pointAtToRef`). */
  const shoulderOf = (view: BodyView, ward: Ward): Vec3 => {
    if (!ward.trunk.length) return ward.shoulder;
    pointAtToRef(ward.trunk, ward.trunk.map((joint) => joint.dofs.map((_, k) => view.angles[channelName(joint, k)] ?? 0)), ward.shoulder, shoulderAt);
    return [shoulderAt.x, shoulderAt.y, shoulderAt.z];
  };
  const normalNow = new Vector3(), align = new Quaternion(), oriented = new Quaternion();
  /** `hand`'s goal for `cover`, in the body frame (`BodyView.root`); null where the threat is at the place guarded, and names no line. */
  const goalOf = (view: BodyView, hand: string, cover: Cover): EffectorGoal | null => {
    intoFrameToRef(view.root, cover.guarded, guarded);
    intoFrameToRef(view.root, cover.threat, threat);
    const from: Vec3 = [guarded.x, guarded.y, guarded.z], way = sub([threat.x, threat.y, threat.z], from), far = length(way);
    if (far < NO_LINE) return null;
    const { points, span, normal } = covers[hand]!, held = wards[hand] ?? covering;
    const toward = scale(way, 1 / far), ward = wards[hand];
    const middle = ward ? withinReach(from, toward, Math.min(held.out, far), shoulderOf(view, ward), ward.reach) : add(from, scale(toward, Math.min(held.out, far)));
    const seconds = cover.seconds === undefined ? held.seconds : Math.min(held.seconds, cover.seconds);
    if (points.length === 1) {
      const goal = { places: [{ point: points[0]!, position: wards[hand] ? paced(view, hand, points[0]!, middle) : middle }], seconds, follows: true };
      if (!wards[hand] || !normal) return goal;
      const rotation = view.effectors[hand]!.rotation;
      normalNow.set(...normal).applyRotationQuaternionToRef(rotation, normalNow).normalize();
      const current: Vec3 = [normalNow.x, normalNow.y, normalNow.z], axis = cross(current, toward), cosine = dot(current, toward);
      if (cosine < -1 + NO_LINE) {
        let across = cross(current, UP);
        if (length(across) < NO_LINE) across = cross(current, RIGHT);
        const size = length(across); align.set(across[0] / size, across[1] / size, across[2] / size, 0);
      } else align.set(axis[0], axis[1], axis[2], 1 + cosine).normalize();
      align.multiplyToRef(rotation, oriented).normalize();
      return { ...goal, orientation: { target: turnedTo(view, hand, oriented), seconds } };
    }
    // The item's line as it lies, less what of it runs along the threat's line.
    const now = view.effectors[hand]!.points, a = now[points[0]!]!, b = now[points[1]!]!;
    const square = (line: Vec3): Vec3 => sub(line, scale(toward, dot(line, toward)));
    let across = square([b.x - a.x, b.y - a.y, b.z - a.z]);
    if (length(across) < NO_LINE) across = square(UP);
    if (length(across) < NO_LINE) across = square(RIGHT);
    const half = scale(across, span / 2 / length(across));
    return {
      places: [{ point: points[0]!, position: sub(middle, half) }, { point: points[1]!, position: add(middle, half) }],
      seconds, follows: true,
    };
  };
  return {
    hands, posture: guardPosture(spec), hold, state,
    handPose: (hand) => segmentOf(spec, hand)?.handPoses ? "open" : null,
    resume() {},
    command(view, guard) {
      let goals: Record<string, EffectorGoal | null> | null = null;
      for (const hand of hands) {
        const cover = guard[hand], goal = cover ? goalOf(view, hand, cover) : null;
        if (goal) (goals ??= {})[hand] = goal;
        else if (state.wards[hand]) state.wards[hand] = null;
      }
      return goals ?? NO_HANDS;
    },
  };
}
