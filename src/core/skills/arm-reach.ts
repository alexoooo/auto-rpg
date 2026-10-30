import { rigidPoints } from "../build/rigid.ts";
import type { Side, BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance, sub } from "../spec/vec.ts";
import { aimOf } from "./strikes.ts";
import { segmentOf } from "../spec/body.ts";

/**
 * What a hand's reach reads of its arm, from the spec in its reference pose: the shoulder to the
 * point the hand strikes with, by the elbow and the wrist, laid straight, m; and, from the head's
 * centre of mass in the body frame, the shoulder and how far ahead the toes reach, m.
 */
interface Arm {
  readonly length: number;
  readonly shoulder: Vec3;
  readonly toes: number;
}

function armOf(spec: BodySpec, hand: Side, aim: string): Arm {
  const segment = (name: string) => {
    const found = segmentOf(spec, name);
    if (!found) throw new Error(`${spec.model} has no ${name}`);
    return found;
  };
  const joint = (name: string): Vec3 => {
    const found = spec.joints.find((j) => j.name === `${name}.${hand}`);
    if (!found) throw new Error(`${spec.model} has no ${name}.${hand}`);
    return found.centre.value;
  };
  const point = rigidPoints(spec, segment(`hand.${hand}`)).get(aim);
  if (!point) throw new Error(`${spec.model}'s ${hand} hand has no point ${aim} to strike with`);
  const shoulder = joint("shoulder"), elbow = joint("elbow"), wrist = joint("wrist"), head = segment("head").centreOfMass.value;
  return {
    length: distance(shoulder, elbow) + distance(elbow, wrist) + distance(wrist, point.value),
    shoulder: sub(shoulder, head),
    toes: Math.max(segment("foot.left").distal.value[2], segment("foot.right").distal.value[2]) - head[2],
  };
}

/**
 * Each spec's arms by hand and by the point they strike with, read once: a spec does not change,
 * and a mind asks of it for every candidate blow, so a reading allocates nothing. The arm with
 * the hand's own point (`aimOf`) is under `undefined`.
 */
const AIMED = new WeakMap<BodySpec, Record<Side, Map<string | undefined, Arm>>>();

/** `hand`'s arm of `spec` with the point `aim`, or the point it strikes with (`armOf`, `aimOf`), read once a spec. */
function aimedArm(spec: BodySpec, hand: Side, aim: string | undefined): Arm {
  let arms = AIMED.get(spec);
  if (!arms) AIMED.set(spec, arms = { left: new Map(), right: new Map() });
  const known = arms[hand].get(aim);
  if (known) return known;
  const arm = armOf(spec, hand, aim ?? aimOf(spec, hand)); arms[hand].set(aim, arm); return arm;
}

/** `hand`'s shoulder from the head's centre of mass in the reference pose, body frame (x across, y up, z ahead), m. */
export function shoulderFromHead(spec: BodySpec, hand: Side): Vec3 {
  return aimedArm(spec, hand, undefined).shoulder;
}

/**
 * **How far ahead of its head a body of `spec` stands a target** `up` m over the head for `hand`
 * to meet it with the point `aim` (the point it strikes with where none is named), m: where the
 * target is the arm's straight length from the shoulder, straight ahead of the head. A target too
 * high or too low for any such place is stood for as near as the arm's length allows, under or
 * over the shoulder; and never nearer than the toes: a body does not stand on what it strikes.
 */
export function placedReach(spec: BodySpec, hand: Side, up: number, aim?: string): number {
  const { length, shoulder, toes } = aimedArm(spec, hand, aim), rise = up - shoulder[1];
  const flat = length * length - shoulder[0] * shoulder[0] - rise * rise;
  return Math.max(toes, shoulder[2] + (flat > 0 ? Math.sqrt(flat) : 0));
}

/** Whether a level approach can put the hand's point `aim` (its striking point where none is named) at this height above the head. */
export function placedHeightFits(spec: BodySpec, hand: Side, up: number, aim?: string): boolean {
  const arm = aimedArm(spec, hand, aim);
  return Math.abs(up - arm.shoulder[1]) <= arm.length;
}
