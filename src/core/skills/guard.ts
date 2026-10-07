import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { EffectorGoal, Pose } from "../control/motor.ts";
import type { Cover, HandAction } from "../mind/intent.ts";
import type { Side, BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, distance, dot, length, scale, sub } from "../spec/vec.ts";
import type { Skill } from "./skill.ts";

/**
 * **The guard**: fists up before the chin, elbows in; the arms' posture when no skill owns them,
 * rad. Every recipe of `REPERTOIRE` was searched from it, so a change to it voids them
 * (`docs/reference/human-and-strikes.md#guard`).
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
}

function coversOf(spec: BodySpec, hand: Side): Covers {
  const segment = spec.segments.find((s) => s.name === `hand.${hand}`);
  if (!segment) throw new Error(`${spec.model} has no ${hand} hand`);
  const points = spec.held?.find((h) => h.segment === segment.name)?.item.cover ?? ["knuckles"];
  const known = rigidPoints(spec, segment);
  const at = points.map((name) => {
    const point = known.get(name);
    if (!point) throw new Error(`${spec.model}'s ${hand} hand has no point ${name} to cover with`);
    return point.value;
  });
  return { points, span: at.length === 2 ? distance(at[0]!, at[1]!) : 0 };
}

/** No hand given a goal. */
const NO_HANDS: Readonly<Record<Side, EffectorGoal | null>> = Object.freeze({ left: null, right: null });

const HANDS: readonly Side[] = ["left", "right"];

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
 *
 * A hand whose guard names no cover has no goal: its arm is the posture's (`GUARD`). So has the
 * hand a strike has. The skill remembers nothing.
 */
interface GuardSkill extends Skill {
  /** Each hand's goal this step: a cover's places for a hand that guards with one and that `taken` is not; null otherwise. */
  command(view: BodyView, hands: Readonly<Record<Side, HandAction>>, taken: Side | null): Readonly<Record<Side, EffectorGoal | null>>;
}

export function guardSkill(spec: BodySpec, covering: Covering = GUARD_COVER): GuardSkill {
  const covers = { left: coversOf(spec, "left"), right: coversOf(spec, "right") };
  const guarded = new Vector3(), threat = new Vector3();
  /** `hand`'s goal for `cover`, in the body frame (`BodyView.root`); null where the threat is at the place guarded, and names no line. */
  const goalOf = (view: BodyView, hand: Side, cover: Cover): EffectorGoal | null => {
    intoFrameToRef(view.root, cover.guarded, guarded);
    intoFrameToRef(view.root, cover.threat, threat);
    const from: Vec3 = [guarded.x, guarded.y, guarded.z], way = sub([threat.x, threat.y, threat.z], from), far = length(way);
    if (far < NO_LINE) return null;
    const toward = scale(way, 1 / far), middle = add(from, scale(toward, Math.min(covering.out, far)));
    const seconds = cover.seconds === undefined ? covering.seconds : Math.min(covering.seconds, cover.seconds);
    const { points, span } = covers[hand];
    if (points.length === 1) return { places: [{ point: points[0]!, position: middle }], seconds, follows: true };
    // The item's line as it lies, less what of it runs along the threat's line.
    const now = view.points[hand], a = now[points[0]!]!, b = now[points[1]!]!;
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
    resume() {},
    command(view, hands, taken) {
      let goals: { left: EffectorGoal | null; right: EffectorGoal | null } | null = null;
      for (const hand of HANDS) {
        const action = hands[hand];
        if (hand === taken || action.kind !== "guard" || !action.cover) continue;
        const goal = goalOf(view, hand, action.cover);
        if (goal) (goals ??= { left: null, right: null })[hand] = goal;
      }
      return goals ?? NO_HANDS;
    },
  };
}
