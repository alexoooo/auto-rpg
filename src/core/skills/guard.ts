import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { heldFrame, rigidPoints } from "../build/rigid.ts";
import { effectorFreedoms } from "../control/effectors.ts";
import { intoFrameToRef, pointAtToRef, solveReach, specChainTo } from "../control/kinematics.ts";
import type { EffectorGoal, PointTask, Pose } from "../control/motor.ts";
import type { Cover, Intent } from "../mind/intent.ts";
import type { BodySpec, HandPose } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, cross, distance, dot, length, scale, sub } from "../spec/vec.ts";
import type { Skill } from "./skill.ts";

/**
 * **The guard**: fists up before the chin, elbows in; the arms' posture when no skill owns them,
 * rad. Every recipe of `REPERTOIRE` was searched from it, as a body holds it (`guardPosture`), so
 * a change to either voids them (`docs/reference/human-and-strikes.md#guard`).
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
    solveReach(chain, angles, wrist.map((f) => ({ ...f, preferred: GUARD[f.name] ?? 0 })),
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
  const segment = spec.segments.find((s) => s.name === hand);
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
    !!spec.segments.find((s) => s.name === name)?.points?.knuckles || spec.held?.some((h) => h.segment === name && h.item.cover !== undefined));
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
 * - A face has one centre point and an independent orientation target, turning its declared
 *   outward normal toward the threat while preserving its current roll as closely as possible.
 *
 * A hand whose guard names no cover has no goal: its arm is the posture's (`GUARD`). So has the
 * hand a strike has. A free hand that can change its pose is opened. The skill remembers nothing.
 */
export interface GuardSkill extends Skill {
  /** The hands it guards with, by segment (`handsOf` for the stock guards): what the arbiter asks it of, each free hand. */
  readonly hands: readonly string[];
  /** What it remembers, plain data saved and loaded with the mind (`src/core/state.ts`); none, it remembers nothing. */
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

export function guardSkill(spec: BodySpec, covering: Covering = GUARD_COVER, faces = false, hold: GuardSkill["hold"] = null): GuardSkill {
  const hands = handsOf(spec), covers = Object.fromEntries(hands.map((hand) => [hand, coversOf(spec, hand)]));
  const guarded = new Vector3(), threat = new Vector3();
  const normalNow = new Vector3(), align = new Quaternion(), oriented = new Quaternion();
  /** `hand`'s goal for `cover`, in the body frame (`BodyView.root`); null where the threat is at the place guarded, and names no line. */
  const goalOf = (view: BodyView, hand: string, cover: Cover): EffectorGoal | null => {
    intoFrameToRef(view.root, cover.guarded, guarded);
    intoFrameToRef(view.root, cover.threat, threat);
    const from: Vec3 = [guarded.x, guarded.y, guarded.z], way = sub([threat.x, threat.y, threat.z], from), far = length(way);
    if (far < NO_LINE) return null;
    const toward = scale(way, 1 / far), middle = add(from, scale(toward, Math.min(covering.out, far)));
    const seconds = cover.seconds === undefined ? covering.seconds : Math.min(covering.seconds, cover.seconds);
    const { points, span, normal } = covers[hand]!;
    if (points.length === 1) {
      const goal = { places: [{ point: points[0]!, position: middle }], seconds, follows: true };
      if (!faces || !normal) return goal;
      const rotation = view.effectors[hand]!.rotation;
      normalNow.set(...normal).applyRotationQuaternionToRef(rotation, normalNow).normalize();
      const current: Vec3 = [normalNow.x, normalNow.y, normalNow.z], axis = cross(current, toward), cosine = dot(current, toward);
      if (cosine < -1 + NO_LINE) {
        let across = cross(current, UP);
        if (length(across) < NO_LINE) across = cross(current, RIGHT);
        const size = length(across); align.set(across[0] / size, across[1] / size, across[2] / size, 0);
      } else align.set(axis[0], axis[1], axis[2], 1 + cosine).normalize();
      align.multiplyToRef(rotation, oriented).normalize();
      return { ...goal, orientation: { target: [oriented.x, oriented.y, oriented.z, oriented.w], seconds } };
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
    hands, posture: guardPosture(spec), hold,
    handPose: (hand) => spec.segments.find((s) => s.name === hand)?.handPoses ? "open" : null,
    resume() {},
    command(view, guard) {
      let goals: Record<string, EffectorGoal | null> | null = null;
      for (const hand of hands) {
        const cover = guard[hand];
        if (!cover) continue;
        const goal = goalOf(view, hand, cover);
        if (goal) (goals ??= {})[hand] = goal;
      }
      return goals ?? NO_HANDS;
    },
  };
}
