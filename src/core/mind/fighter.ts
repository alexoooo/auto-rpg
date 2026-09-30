import type { CoreBody } from "../body.ts";
import { APPROACH } from "../skills/strike.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { GUARD_ACTION, type Intent } from "./intent.ts";
import type { Mind } from "./mind.ts";

/**
 * How near a target a fighter attacks it rather than walking to it, m, feet to feet: the club's reach
 * ahead of the head (1.05 m, `REPERTOIRE`) and a step, which the strike skill closes itself.
 */
export const ATTACK_METRES = 1.8;

/** A direction on the ground, world. */
export interface Heading { readonly x: number; readonly z: number }

/**
 * What a fighter carries out this step, as whoever plans for it (the crypt's run, the arena's bout)
 * decides it: a direction to walk (unit, world) or null to stand, a way to face when standing, and
 * the body to attack, or null.
 */
export interface FighterPlan {
  readonly move: Heading | null;
  readonly look: Heading | null;
  readonly attack: CoreBody | null;
}

/**
 * **A fighter's mind**: it walks its plan's direction at its body's fastest walk
 * (`CoreBody.envelope`), facing it, and given a body to attack attacks its head with what the right
 * hand holds: the strike skill brings the body the rest of the way (`APPROACH` in
 * `src/core/skills/strike.ts`). It holds the point it aims at while the head stays within
 * `APPROACH.reach` of it, and aims again after each blow, since the skill sets the feet for the
 * point it is given and a point that followed a swaying head would move under every placing.
 * `plan` is read every control step.
 */
export function fighterMind(name: string, plan: () => FighterPlan): Mind {
  /** The point aimed at, whose head it was, and the blows thrown when it was chosen. */
  let aim: { target: CoreBody; point: Vec3; thrown: number } | null = null;
  return {
    name,
    decide: ({ report, envelope }): Intent => {
      const { move, look, attack } = plan();
      if (attack) {
        const head = attack.view.head, thrown = report.strike.thrown.right;
        if (!aim || aim.target !== attack || aim.thrown !== thrown
          || Math.hypot(head.x - aim.point[0], head.y - aim.point[1], head.z - aim.point[2]) > APPROACH.reach) {
          aim = { target: attack, point: [head.x, head.y, head.z], thrown };
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
