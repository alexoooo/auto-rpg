import { predictIntercept } from "../control/intercept.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { rigidPoints } from "../build/rigid.ts";
import type { Hand } from "../control/motor.ts";
import { hypot } from "../math/real.ts";
import { aimOf } from "../skills/strikes.ts";
import { frameOf, type BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { dot, sub } from "../spec/vec.ts";
import type { Cover } from "./intent.ts";

/**
 * **What counts as a threat**: a foe's striking point within `within` m of the head and closing
 * on it at over `closing` m/s. Set: `docs/reference/blows.md#threat`.
 */
export const THREAT: Threat = Object.freeze({ within: 1.5, closing: 2 });

/** What counts as a threat (`THREAT`). */
export interface Threat {
  readonly within: number;
  readonly closing: number;
}

const HANDS: readonly Hand[] = ["left", "right"];

/** The point each hand of `spec` strikes with (`aimOf`), in its hand's own frame; null for a hand the spec has not. */
function strikingPoints(spec: BodySpec): Readonly<Record<Hand, Vec3 | null>> {
  const point = (hand: Hand): Vec3 | null => {
    const segment = spec.segments.find((s) => s.name === `hand.${hand}`);
    const at = segment && rigidPoints(spec, segment).get(aimOf(spec, hand));
    if (!segment || !at) return null;
    const { origin, x, y, z } = frameOf(segment), from = sub(at.value, origin);
    return [dot(from, x), dot(from, y), dot(from, z)];
  };
  return { left: point("left"), right: point("right") };
}

/** Each spec's striking points, found once: a spec is immutable, and so is what is read from it. */
const STRIKING = new WeakMap<BodySpec, Readonly<Record<Hand, Vec3 | null>>>();

const point = new Vector3(), velocity = new Vector3(), lever = new Vector3();

/**
 * The cover a body's senses ask for: of every other side's body still in the fight, the point
 * each hand strikes with (`aimOf`, placed by the hand's sensed frame, moving with its sensed
 * velocity and spin) that closes fastest on this body's head, if it is a threat (`counts`:
 * `THREAT`, unless an experiment passes another); guarded, the head. Null with none. The closing
 * speed is the point's own toward the head as the head stands. What is sensed is as old as the
 * senses' delay, and nothing here corrects for it. With `prediction`, a constant-velocity
 * crossing of the plane ahead of the head replaces the current point; a threat already inside
 * the plane is covered immediately. No crossing in the horizon means no candidate.
 */
export function threatOf(view: BodyView, counts: Threat = THREAT, prediction?: { readonly out: number; readonly horizon: number }): Cover | null {
  const { senses, head } = view;
  let threat: Vec3 | null = null, fastest = counts.closing;
  for (const other of senses.others) {
    if (other.side === senses.side || other.out) continue;
    let striking = STRIKING.get(other.spec);
    if (!striking) STRIKING.set(other.spec, striking = strikingPoints(other.spec));
    for (const hand of HANDS) {
      const local = striking[hand], sensed = other.segments.get(`hand.${hand}`);
      if (!local || !sensed) continue;
      point.set(local[0], local[1], local[2]).applyRotationQuaternionToRef(sensed.rotation, point).addInPlace(sensed.position);
      // The point moves with the hand's centre of mass, and with its spin about that centre.
      point.subtractToRef(sensed.centre, lever);
      Vector3.CrossToRef(sensed.spin, lever, velocity).addInPlace(sensed.velocity);
      const dx = point.x - head.x, dy = point.y - head.y, dz = point.z - head.z, far = hypot(dx, dy, dz);
      if (far > counts.within || far === 0) continue;
      const closing = -(dx * velocity.x + dy * velocity.y + dz * velocity.z) / far;
      if (closing <= fastest) continue;
      let candidate: Vec3 = [point.x, point.y, point.z];
      if (prediction && far > prediction.out) {
        const normal: Vec3 = [dx / far, dy / far, dz / far];
        const crossing = predictIntercept({ time: senses.time, position: candidate, velocity: [velocity.x, velocity.y, velocity.z] },
          [0, 0, 0], { normal, point: [head.x + normal[0] * prediction.out, head.y + normal[1] * prediction.out,
            head.z + normal[2] * prediction.out] }, senses.time, prediction.horizon);
        if (!crossing) continue;
        candidate = crossing.position;
      }
      fastest = closing; threat = candidate;
    }
  }
  return threat && { threat, guarded: [head.x, head.y, head.z] };
}
