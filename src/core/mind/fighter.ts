import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { wrap } from "../skills/locomotion.ts";
import { APPROACH } from "../skills/strike.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { GUARD_ACTION, type Intent } from "./intent.ts";
import { STAND_ORDERS, type Orders } from "./orders.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";
import { sin, cos, atan2, hypot } from "../math/real.ts";

/**
 * How near a target a fighter attacks it rather than walking to it, m, between the two centres of
 * mass across the ground: the club's reach ahead of the head (1.05 m, `REPERTOIRE`) and a step,
 * which the strike skill closes itself.
 */
export const ATTACK_METRES = 1.8;

/**
 * Walking one way while facing another (`fighterTactics`): the share of the fastest walk held
 * across the heading or backward, and how near its facing a body must have turned, rad, before
 * it walks any faster. Measured with the club in hand: `docs/reference/orders.md#the-rule`.
 */
export const STRAFE = { share: 0.5, turned: 0.3 } as const;

/**
 * **A fighter's tactics** carry out `Orders`, asked for every control step with what the body
 * sees. Ordered to walk, it walks that way at its body's fastest walk (`Body.envelope`), turning
 * to it; ordered to face another way as it walks, it walks at the pace that holds (`strafe`,
 * `STRAFE` unless an experiment passes another). Given a point to attack it attacks it with what
 * the right hand holds: the strike skill brings the body the rest of the way (`APPROACH` in
 * `src/core/skills/strike.ts`). It holds the point it aims at while the ordered one stays within
 * `APPROACH.reach` of it, and aims again after each blow, since the skill sets the feet for the
 * point it is given and a point that followed a swaying head would move under every placing.
 *
 * The stance turns only while it walks (`locomotion`), so a standing body ordered to face
 * does not turn.
 */
export function fighterTactics(name: string, orders: (sight: Sight) => Orders, strafe: typeof STRAFE = STRAFE): Tactics {
  /** Its memory: the point aimed at, and the blows thrown when it was chosen. */
  const state: { aim: { point: Vec3; thrown: number } | null } = { aim: null };
  return {
    name, state,
    decide: (sight): Intent => {
      const { report, envelope } = sight, { move, face, attack } = orders(sight);
      if (attack) {
        const thrown = report.strike.thrown.right;
        let aim = state.aim;
        if (!aim || aim.thrown !== thrown
          || hypot(attack[0] - aim.point[0], attack[1] - aim.point[1], attack[2] - aim.point[2]) > APPROACH.reach) {
          aim = state.aim = { point: [attack[0], attack[1], attack[2]], thrown };
        }
        return { move: null, face: report.heading, hands: { left: GUARD_ACTION, right: { kind: "attack", target: aim.point } } };
      }
      state.aim = null;
      const hands = { left: GUARD_ACTION, right: GUARD_ACTION };
      const facing = face && hypot(face.x, face.z) > 0.08 ? atan2(face.x, face.z) : null;
      if (!move || !envelope) return { move: null, face: facing ?? report.heading, hands };
      const bearing = atan2(move.x, move.z), walk = envelope.walk.value;
      // Facing its walk: the walk the envelope measured, forward, turning to it.
      if (facing === null) return { move: [walk, 0], face: bearing, hands };
      // Facing elsewhere: the walk's direction in the heading's frame, at the pace that holds.
      const off = bearing - report.heading;
      const share = Math.abs(wrap(facing - report.heading)) < strafe.turned
        ? strafe.share + (1 - strafe.share) * Math.max(0, cos(off)) : strafe.share;
      return { move: [walk * share * cos(off), walk * share * sin(off)], face: facing, hands };
    },
  };
}

/**
 * **The orders of a fighter that picks its own fight**, from what it sees: the nearest body of
 * another side, one still in the fight before one that is out. It walks at it, facing its walk,
 * until their centres of mass are within `ATTACK_METRES` across the ground, then attacks its
 * head; once either is out it stands, facing it; and with nobody to fight it stands as it is.
 */
export function seekFoe({ view }: Sight): Orders {
  const { senses, stance } = view, from = stance.centre;
  let foe: BodySense | null = null, near = Infinity;
  for (const other of senses.others) {
    if (other.side === senses.side) continue;
    const d = hypot(other.centre.x - from.x, other.centre.z - from.z);
    if (foe === null || (foe.out && !other.out) || (foe.out === other.out && d < near)) { foe = other; near = d; }
  }
  if (!foe) return STAND_ORDERS;
  const d = Math.max(0.001, near);
  const toward = { x: (foe.centre.x - from.x) / d, z: (foe.centre.z - from.z) / d };
  if (senses.out || foe.out) return { move: null, face: toward, attack: null };
  if (d > ATTACK_METRES) return { move: toward, face: null, attack: null };
  const head: Vector3 = foe.segments.get("head")?.centre ?? foe.centre;
  return { move: null, face: toward, attack: [head.x, head.y, head.z] };
}
