import { supportHeight } from "../../../control/support-reference.ts";
import { fistOn } from "../../../core/bodies/human/endpoints.ts";
import { Vector3 } from "../../../core/math/vector.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import { intoFrameToRef } from "../../../control/kinematics.ts";
import { cos, sin } from "../../../core/math/real.ts";
import type { MusclePush } from "../../../control/motor.ts";

import { footOn } from "../../../control/support.ts";
import { type Side, otherSide } from "../../../core/bodies/bilateral.ts";

/*
 * **A learned steer**: a blow's timed drive steered by a ReLU network, its inputs and outputs named
 * by its variation's layout (`SteerLayout`) and its weights in its body's record (`network`). Every
 * decision interval of its layout it reads the blow (`steerFeatures`), adds levels to the drive's
 * pushes (`steerPushes`) and asks the legs goal for a heading and a centre of mass (`stanceAsks`).
 * Trained by PPO (`research/run-train.py` against `research/run-learning-server.mjs`) and written
 * into its record by its research export.
 */

/**
 * **What a steered punch reads before its channels**, each a number the drive reads of itself
 * (`steerFeatures`), named as a layout's inputs name them, for the right hand's punch: the drive's
 * age, s; the target from the punching shoulder and the fist from the target, in the body frame,
 * m; the fist's velocity and the centre of mass's in the body frame, m/s; whether the hand
 * touches; the arm's straight length, shoulder to knuckles, and the height the body stands at
 * (`BodyView.standing`), m, which tell one body from another; the target's velocity in the body
 * frame, m/s (`aimed`, a foe coming on or going off); and the gait's phase (`StanceReading`): whether
 * the foot on the punching hand's side (`near`) and the other (`far`) bear, 1 or 0, and whether the
 * stance is shifting its weight or swinging a foot, 1 or 0 (neither, it stands). `across` is toward
 * the punching hand's side.
 */
const READINGS: readonly string[] = ["drive age", ...["target from shoulder", "fist from target", "fist velocity", "centre velocity"].flatMap(axes),
  "touching", "arm length", "standing height", ...axes("target velocity"), "near foot bearing", "far foot bearing", "stance shifting", "stance swinging"];

function axes(name: string): string[] {
  return [`${name} across`, `${name} up`, `${name} ahead`];
}

/**
 * One output of a learned steer (`SteerLayout`): a push on a named channel (the right hand's
 * blow's), the legs goal's heading turned the striking shoulder forward, rad, or its centre of
 * mass moved ahead along the way the blow faces or across it toward the striking hand's
 * side, m, each its output times its full scale, a distance's in proportion to the body's leg; or
 * the walk under way kept (above 0) or halted (`walk`, `keepsWalk`).
 */
type SteerOutput =
  | { readonly term: "pushes"; readonly channel: string }
  | { readonly term: "heading"; readonly full: number }
  | { readonly term: "centre"; readonly along: "ahead" | "across"; readonly full: number }
  | { readonly term: "walk" };

/**
 * **A learned steer's layout**, a variation's (`assets/skills/strikes/<skill>/<variation>.layout.json`):
 * its inputs by name, each a reading (`READINGS`) or
 * `angle <channel>` and `speed <channel>`, rad and rad/s, for the right hand's blow; the seconds between its
 * decisions at any rate; the leg its distances' full scales are for, m (`legOf`); and its outputs. A held blow reads its striking
 * point where the punch reads its fist (`steerFeatures`).
 */
export interface SteerLayout {
  readonly inputs: readonly string[];
  readonly interval: number;
  readonly leg: number;
  readonly outputs: readonly SteerOutput[];
}

/** `layout`, its names and interval checked: an input it cannot read, an output it cannot steer or no interval is refused. */
export function checkedLayout(layout: SteerLayout): SteerLayout {
  if (!(layout.interval > 0) || !Number.isFinite(layout.interval)) throw new Error("a learned steer decides at a finite positive interval");
  for (const name of layout.inputs) {
    if (!READINGS.includes(name) && !/^(angle|speed) \S/.test(name)) throw new Error(`a learned steer reads no ${name}`);
  }
  for (const output of layout.outputs) {
    const term: string = output.term;
    if (term !== "pushes" && term !== "heading" && term !== "centre" && term !== "walk") throw new Error(`a learned steer steers no ${term}`);
  }
  return layout;
}

/**
 * `hand`'s punch as `layout` lays it out for a body whose leg is `leg` m (`legOf`): the left
 * hand's is the right's with the sides swapped and a turn or a side bend of the trunk reversed, so one steer
 * serves both.
 */
export function steerChannels(hand: Side, leg: number, layout: SteerLayout): SteerChannels {
  const swap = (name: string) => hand === "right" ? name : name.replace(/\.(left|right) /, (_, side: string) => `.${side === "left" ? "right" : "left"} `);
  const sense = (name: string) => hand === "left" && / (rotation|lateral flexion) right$/.test(name) && !name.includes(".") ? -1 : 1;
  const channelOf = (name: string) => /^(angle|speed) /.test(name) ? name.slice(6) : null;
  const inputs = layout.inputs, outputs = layout.outputs, scale = leg / layout.leg;
  return {
    readings: inputs.map((name) => READINGS.indexOf(name)),
    inputs: inputs.map((name) => { const c = channelOf(name); return c === null ? null : swap(c); }),
    inputSenses: inputs.map((name) => { const c = channelOf(name); return c === null ? 1 : sense(c); }),
    speeds: inputs.map((name) => name.startsWith("speed ")),
    pushes: outputs.map((o) => o.term === "pushes" ? swap(o.channel) : null),
    senses: outputs.map((o) => o.term === "pushes" ? sense(o.channel) : 1),
    full: outputs.map((o) => o.term === "heading" ? o.full : o.term === "centre" ? o.full * scale : 1),
    heading: outputs.findIndex((o) => o.term === "heading"),
    ahead: outputs.findIndex((o) => o.term === "centre" && o.along === "ahead"),
    across: outputs.findIndex((o) => o.term === "centre" && o.along === "across"),
    walk: outputs.findIndex((o) => o.term === "walk"),
    side: hand === "right" ? 1 : -1,
  };
}

/**
 * A hand's punch as its layout lays it out (`steerChannels`). Each input: its reading's place in
 * `READINGS` (-1 for a channel's), its channel, the hand's (null for a reading), its sense, and
 * whether it reads the channel's speed. Each output: the channel it pushes (null for an ask of the
 * legs), its sense, and its full scale on this body. Where among the outputs the legs goal's
 * heading, centre ahead and centre across are, and the walk's keep (-1 with none), and the hand's
 * side, 1 right and -1 left.
 */
interface SteerChannels {
  readonly readings: readonly number[];
  readonly inputs: readonly (string | null)[];
  readonly inputSenses: readonly number[];
  readonly speeds: readonly boolean[];
  readonly pushes: readonly (string | null)[];
  readonly senses: readonly number[];
  readonly full: readonly number[];
  readonly heading: number;
  readonly ahead: number;
  readonly across: number;
  readonly walk: number;
  readonly side: number;
}

const point = new Vector3(), moved = new Vector3(), at: [number, number, number] = [0, 0, 0], read: number[] = [];

/** `x, y, z` (world) into the body frame, into `out`. */
const framed = (view: BodyView, x: number, y: number, z: number, out: Vector3): Vector3 => {
  at[0] = x; at[1] = y; at[2] = z;
  return intoFrameToRef(view.root, at, out);
};

/**
 * **What a steered punch reads**, into `out`, as `channels` lay its inputs out: the readings
 * (`READINGS`), the hand's side mirrored away (across negated for the left hand), and each named
 * channel's angle or speed, rad or rad/s, in its sense. `fromShoulder` is the target less the
 * shoulder, body frame; `channels` are `hand`'s (`steerChannels`). `strike`, world, is where the
 * blow's striking point is, the fist's where null: a held blow's is its face's (`StrikingFace`);
 * the velocity read is the fist's either way.
 */
export function steerFeatures(body: Body, view: BodyView, hand: Side, channels: SteerChannels, since: number, fromShoulder: Vector3, target: readonly number[],
  aimed: readonly number[], touching: boolean, arm: number, out: number[], strike: Vector3 | null = null): number[] {
  const side = hand === "right" ? 1 : -1, fist = view.pointMotion[fistOn(body.built.spec, hand)!]!.knuckles!, muscles = body.muscles, at = strike ?? fist.position;
  let k = 0;
  read[k++] = since;
  read[k++] = fromShoulder.x * side; read[k++] = fromShoulder.y; read[k++] = fromShoulder.z;
  framed(view, at.x, at.y, at.z, point);
  framed(view, target[0]!, target[1]!, target[2]!, moved);
  read[k++] = (point.x - moved.x) * side; read[k++] = point.y - moved.y; read[k++] = point.z - moved.z;
  framed(view, at.x + fist.velocity.x, at.y + fist.velocity.y, at.z + fist.velocity.z, moved);
  read[k++] = (moved.x - point.x) * side; read[k++] = moved.y - point.y; read[k++] = moved.z - point.z;
  const c = view.stance.centre, v = view.stance.velocity;
  framed(view, c.x, c.y, c.z, point);
  framed(view, c.x + v.x, c.y + v.y, c.z + v.z, moved);
  read[k++] = (moved.x - point.x) * side; read[k++] = moved.y - point.y; read[k++] = moved.z - point.z;
  read[k++] = touching ? 1 : 0;
  read[k++] = arm; read[k++] = supportHeight(view);
  framed(view, target[0]!, target[1]!, target[2]!, point);
  framed(view, target[0]! + aimed[0]!, target[1]! + aimed[1]!, target[2]! + aimed[2]!, moved);
  read[k++] = (moved.x - point.x) * side; read[k++] = moved.y - point.y; read[k++] = moved.z - point.z;
  const ends = view.stance.ends, phase = view.stance.phase, spec = body.built.spec;
  read[k++] = ends[footOn(spec, hand)]!.touching ? 1 : 0; read[k++] = ends[footOn(spec, otherSide(hand))]!.touching ? 1 : 0;
  read[k++] = phase === "shift" ? 1 : 0; read[k++] = phase === "swing" ? 1 : 0;
  const { readings, inputs, inputSenses, speeds } = channels;
  for (let i = 0; i < readings.length; i++) {
    const name = inputs[i];
    if (name === null || name === undefined) { out[i] = read[readings[i]!]!; continue; }
    const channel = muscles.channel(name);
    out[i] = (speeds[i] ? muscles.speed(channel) : muscles.angle(channel)) * inputSenses[i]!;
  }
  out.length = readings.length;
  return out;
}

/**
 * `steer` (`punchActions` levels, -1 to 1, in `channels`' outputs and senses) added to the pushes
 * the drive asks of the channels its outputs push, in place: each pushed channel's net level, its
 * sign the sense, no more than flat out. A channel the drive does not push is left to what holds it
 * (the posture, the stance): a push of any level takes a channel from them.
 */
export function steerPushes(pushes: MusclePush[], channels: SteerChannels, steer: readonly number[]): void {
  if (steer.length === 0) return;
  const { pushes: names, senses } = channels;
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (name === null || name === undefined) continue;
    const add = (steer[i] ?? 0) * senses[i]!;
    if (add === 0) continue;
    const j = pushes.findIndex((push) => push.channel === name);
    if (j < 0) continue;
    const net = Math.max(-1, Math.min(1, pushes[j]!.sense * pushes[j]!.level + add));
    pushes[j] = { channel: name, sense: net >= 0 ? 1 : -1, level: Math.abs(net) };
  }
}

/**
 * What `steer` asks of the legs goal (`channels`' heading and centre outputs, at their full
 * scales), for a punch facing `face` rad whose hips turn its shoulder forward in `sense`: the
 * heading's turn, rad, returned, and the centre of mass's shift, world (x, z), m, into `shift`;
 * nothing asked that `channels` have no output for, or before the steer is set.
 */
export function stanceAsks(channels: SteerChannels, steer: readonly number[], face: number, sense: number, shift: [number, number]): number {
  shift[0] = 0; shift[1] = 0;
  const { heading, ahead: a, across: x, full } = channels;
  if (steer.length < full.length) return 0;
  if (a >= 0 || x >= 0) {
    const ahead = a < 0 ? 0 : steer[a]! * full[a]!, across = x < 0 ? 0 : steer[x]! * full[x]! * channels.side, s = sin(face), c = cos(face);
    shift[0] = ahead * s + across * c; shift[1] = ahead * c - across * s;
  }
  return heading < 0 ? 0 : steer[heading]! * full[heading]! * sense;
}

/**
 * Whether `steer` keeps the walk under way (its `walk` output above 0) or halts it: null where
 * `channels` have no such output, or before the steer is set.
 */
export function keepsWalk(channels: SteerChannels, steer: readonly number[]): boolean | null {
  return channels.walk < 0 || steer.length <= channels.walk ? null : steer[channels.walk]! > 0;
}
