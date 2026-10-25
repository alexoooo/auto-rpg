import meta from "../../../assets/core/learned-punch.meta.json" with { type: "json" };
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { MusclePush } from "../control/motor.ts";
import type { Side } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { StraightPunch } from "./straight-punch.ts";

/**
 * **A learned punch** (`dataOf("learned-punch")`): for each body it was trained on, the straight
 * punch's settings it was trained with (its schedule, `StraightPunch.timed`, and its drive), and
 * the network that steers it (`punchFeatures` in, `PUNCH_ACTIONS` steer out, as `recoveryNetwork`
 * evaluates it); `made` says how.
 */
export interface PunchPolicy {
  readonly made: string;
  readonly bodies: Readonly<Record<string, Partial<StraightPunch>>>;
  readonly actions: number;
  readonly layers: readonly { readonly weights: readonly (readonly number[])[]; readonly bias: readonly number[] }[];
}

/** **What is known of the learned punch before it loads**: the bodies it has settings for. */
export const PUNCH_POLICY: { readonly bodies: readonly string[] } = deepFreeze(meta);

/** How often a steered punch reads itself and sets its steer, s: 60 times a second at any rate. */
export const PUNCH_DECIDE = 1 / 60;

/**
 * The channels a steered punch's steer adds to, as the right hand's punch names them: the trunk's
 * turn and lean, both legs, and the punching arm. The left hand's are these mirrored
 * (`punchChannels`).
 */
const CHANNELS = ["thoracic rotation right", "lumbar rotation right", "thoracic flexion", "lumbar flexion",
  ...["left", "right"].flatMap((side) => [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`, `knee.${side} flexion`, `ankle.${side} dorsiflexion`]),
  "shoulder.right flexion", "shoulder.right abduction", "shoulder.right internal rotation", "elbow.right flexion"] as const;

/** How many outputs a punch's steer has: one a channel (`punchChannels`). */
export const PUNCH_ACTIONS = CHANNELS.length;

/** How many features a steered punch reads (`punchFeatures`). */
export const PUNCH_FEATURES = 16 + 2 * CHANNELS.length;

/**
 * `hand`'s punch's steered channels, in `CHANNELS`' order, and each one's sense: the left hand's
 * are the right's with the sides swapped, a turn of the trunk reversed, so one steer serves both.
 */
export function punchChannels(hand: Side): PunchChannels {
  const swap = (name: string) => name.replace(/\.(left|right) /, (_, side: string) => `.${side === "left" ? "right" : "left"} `);
  return { names: CHANNELS.map((name) => hand === "right" ? name : swap(name)),
    senses: CHANNELS.map((name) => hand === "left" && / rotation right$/.test(name) && !name.includes(".") ? -1 : 1) };
}

/** A hand's steered channels and their senses (`punchChannels`). */
export interface PunchChannels { readonly names: readonly string[]; readonly senses: readonly number[] }

const point = new Vector3(), moved = new Vector3(), at: [number, number, number] = [0, 0, 0];

/** `x, y, z` (world) into the body frame, into `out`. */
const framed = (view: BodyView, x: number, y: number, z: number, out: Vector3): Vector3 => {
  at[0] = x; at[1] = y; at[2] = z;
  return intoFrameToRef(view.root, at, out);
};

/**
 * **What a steered punch reads**, into `out`, the hand's side mirrored away (across negated for
 * the left hand): the drive's age, s; the target from the punching shoulder and the fist from the
 * target, in the body frame, m; the fist's velocity and the centre of mass's in the body frame,
 * m/s; whether the hand touches; the arm's straight length, shoulder to knuckles, and the height
 * the body stands at (`BodyView.standing`), m, which tell one body from another; then each steered
 * channel's angle and speed (`punchChannels`), rad and rad/s, each in its channel's sense.
 * `fromShoulder` is the target less the shoulder, body frame; `channels` are `hand`'s (`punchChannels`).
 */
export function punchFeatures(body: Body, view: BodyView, hand: Side, channels: PunchChannels, since: number, fromShoulder: Vector3, target: readonly number[],
  touching: boolean, arm: number, out: number[]): number[] {
  const side = hand === "right" ? 1 : -1, fist = view.fists[hand], { names, senses } = channels, muscles = body.muscles;
  let k = 0;
  out[k++] = since;
  out[k++] = fromShoulder.x * side; out[k++] = fromShoulder.y; out[k++] = fromShoulder.z;
  framed(view, fist.position.x, fist.position.y, fist.position.z, point);
  framed(view, target[0]!, target[1]!, target[2]!, moved);
  out[k++] = (point.x - moved.x) * side; out[k++] = point.y - moved.y; out[k++] = point.z - moved.z;
  framed(view, fist.position.x + fist.velocity.x, fist.position.y + fist.velocity.y, fist.position.z + fist.velocity.z, moved);
  out[k++] = (moved.x - point.x) * side; out[k++] = moved.y - point.y; out[k++] = moved.z - point.z;
  const c = view.stance.centre, v = view.stance.velocity;
  framed(view, c.x, c.y, c.z, point);
  framed(view, c.x + v.x, c.y + v.y, c.z + v.z, moved);
  out[k++] = (moved.x - point.x) * side; out[k++] = moved.y - point.y; out[k++] = moved.z - point.z;
  out[k++] = touching ? 1 : 0;
  out[k++] = arm; out[k++] = view.standing;
  for (let i = 0; i < names.length; i++) out[k++] = muscles.angle(muscles.channel(names[i]!)) * senses[i]!;
  for (let i = 0; i < names.length; i++) out[k++] = muscles.speed(muscles.channel(names[i]!)) * senses[i]!;
  out.length = k;
  return out;
}

/**
 * `steer` (`PUNCH_ACTIONS` levels, -1 to 1, in `channels`' order and senses) added to the pushes
 * the drive asks of those channels, in place: each pushed channel's net level, its sign the sense,
 * no more than flat out. A channel the drive does not push is left to what holds it (the posture,
 * the stance): a push of any level takes a channel from them.
 */
export function steerPushes(pushes: MusclePush[], channels: PunchChannels, steer: readonly number[]): void {
  if (steer.length === 0) return;
  const { names, senses } = channels;
  for (let i = 0; i < names.length; i++) {
    const add = (steer[i] ?? 0) * senses[i]!;
    if (add === 0) continue;
    const j = pushes.findIndex((push) => push.channel === names[i]);
    if (j < 0) continue;
    const net = Math.max(-1, Math.min(1, pushes[j]!.sense * pushes[j]!.level + add));
    pushes[j] = { channel: names[i]!, sense: net >= 0 ? 1 : -1, level: Math.abs(net) };
  }
}
