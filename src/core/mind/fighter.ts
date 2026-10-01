import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { APPROACH } from "../skills/strike.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { GUARD_ACTION, type Intent } from "./intent.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";

/**
 * How near a target a fighter attacks it rather than walking to it, m, between the two centres of
 * mass across the ground: the club's reach ahead of the head (1.05 m, `REPERTOIRE`) and a step,
 * which the strike skill closes itself.
 */
export const ATTACK_METRES = 1.8;

/** A direction on the ground, world. */
interface Heading { readonly x: number; readonly z: number }

/**
 * What a fighter carries out this step: a direction to walk (unit, world) or null to stand, a
 * way to face when standing, and the point to attack (world), or null.
 */
interface FighterPlan {
  readonly move: Heading | null;
  readonly look: Heading | null;
  readonly attack: Vec3 | null;
}

/**
 * **A fighter's tactics**: it walks its plan's direction at its body's fastest walk
 * (`Body.envelope`), facing it, and given a point to attack attacks it with what the right hand
 * holds: the strike skill brings the body the rest of the way (`APPROACH` in
 * `src/core/skills/strike.ts`). It holds the point it aims at while the plan's stays within
 * `APPROACH.reach` of it, and aims again after each blow, since the skill sets the feet for the
 * point it is given and a point that followed a swaying head would move under every placing.
 * `plan` is asked every control step, with what the body sees.
 */
export function fighterTactics(name: string, plan: (sight: Sight) => FighterPlan): Tactics {
  /** The point aimed at, and the blows thrown when it was chosen. */
  let aim: { point: Vec3; thrown: number } | null = null;
  return {
    name,
    decide: (sight): Intent => {
      const { report, envelope } = sight, { move, look, attack } = plan(sight);
      if (attack) {
        const thrown = report.strike.thrown.right;
        if (!aim || aim.thrown !== thrown
          || Math.hypot(attack[0] - aim.point[0], attack[1] - aim.point[1], attack[2] - aim.point[2]) > APPROACH.reach) {
          aim = { point: [attack[0], attack[1], attack[2]], thrown };
        }
        return { move: null, face: report.heading, hands: { left: GUARD_ACTION, right: { kind: "attack", target: aim.point } } };
      }
      aim = null;
      const hands = { left: GUARD_ACTION, right: GUARD_ACTION };
      if (!move || !envelope) {
        const face = look && Math.hypot(look.x, look.z) > 0.08 ? Math.atan2(look.x, look.z) : report.heading;
        return { move: null, face, hands };
      }
      return { move: [envelope.walk.value, 0], face: Math.atan2(move.x, move.z), hands };
    },
  };
}

/**
 * **The plan of a fighter that picks its own fight**, from what it sees: the nearest body of
 * another side, one still in the fight before one that is out. It walks at it until their centres
 * of mass are within `ATTACK_METRES` across the ground, then attacks its head; once either is
 * out it stands, looking at it; and with nobody to fight it stands as it is.
 */
export function seekFoe({ view }: Sight): FighterPlan {
  const { senses, stance } = view, from = stance.centre;
  let foe: BodySense | null = null, near = Infinity;
  for (const other of senses.others) {
    if (other.side === senses.side) continue;
    const d = Math.hypot(other.centre.x - from.x, other.centre.z - from.z);
    if (foe === null || (foe.out && !other.out) || (foe.out === other.out && d < near)) { foe = other; near = d; }
  }
  if (!foe) return { move: null, look: null, attack: null };
  const d = Math.max(0.001, near);
  const toward = { x: (foe.centre.x - from.x) / d, z: (foe.centre.z - from.z) / d };
  if (senses.out || foe.out) return { move: null, look: toward, attack: null };
  if (d > ATTACK_METRES) return { move: toward, look: toward, attack: null };
  const head: Vector3 = foe.segments.get("head")?.centre ?? foe.centre;
  return { move: null, look: toward, attack: [head.x, head.y, head.z] };
}
