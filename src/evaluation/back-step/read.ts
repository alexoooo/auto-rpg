/**
 * **How the back step's evaluation reads a trial**: each straight punch the attacker throws at the
 * subject, whether it took a landed blow's life, whether the subject was out of its reach after it
 * and in again in time, and whether the subject went down; the measures of the back step's drill
 * (`research/skills/locomotion/back-step-drill.mjs`).
 */
import type { Duel } from "../../game/arena/duel.ts";
import type { World } from "../../core/world/world.ts";
import type { Reader } from "../evaluation.ts";
import { hypot } from "../../core/math/real.ts";

/** A landed blow takes at least this much life, HP (`strike-bouts.mjs`). */
export const LANDED = .5;

/** The range, m centre to centre, beyond which a punch is out of reach: where the Warrior mirror's punches fire (0.79 to 0.97). */
const REACH = .95;

/** How long after a punch's fire the subject is read for being in reach again, s. */
const RETURN = 1.5;

/** What a trial came to. */
export type BackStepReading = {
  /** The attacker's straight punches fired at the subject, and of them those that took `LANDED` of its life or more. */
  readonly thrown: number;
  readonly taken: number;
  /** The life those punches took, HP. */
  readonly lost: number;
  /** The punches after which the subject was out of reach (`REACH`) within `RETURN` s of the fire, and of them those after which it was in reach again in that time. */
  readonly left: number;
  readonly back: number;
  readonly down: boolean;
  readonly seconds: number;
};

/** A punch as the reader follows it: its effector, when it fired, the life it took, whether the subject has been out of reach and in again since. */
type Punch = { readonly effector: string; readonly fired: number; damage: number; left: boolean; back: boolean };

/**
 * The reader of a trial in which the subject, the bout's left side, meets the right side's straight
 * punches for `seconds` s, or `after` s past the first punch's fire where it is given.
 */
export function readBackStep({ world, duel }: { readonly world: World; readonly duel: Duel }, { seconds, after }: { readonly seconds: number; readonly after?: number }): Reader<BackStepReading> {
  const subject = duel.duelists.left, attacker = duel.duelists.right, foe = attacker.minded.skills;
  if (!foe) throw new Error("the attacker runs no skills");
  const punches: Punch[] = [], seen = new Set<number>(), state = { down: false, heard: 0 };
  const apart = (): number => {
    const a = attacker.body.physical.centre, d = subject.body.physical.centre;
    return hypot(a.x - d.x, a.z - d.z);
  };
  return {
    afterStep() {
      const now = world.time;
      for (const action of foe.report.actions) {
        if (action.action !== "straight-punch" || action.phase !== "commit" || seen.has(action.id)) continue;
        seen.add(action.id);
        punches.push({ effector: action.effector, fired: now, damage: 0, left: false, back: false });
      }
      const gap = apart();
      for (const punch of punches) {
        if (now > punch.fired + RETURN) continue;
        if (gap > REACH) punch.left = true;
        else if (punch.left) punch.back = true;
      }
      // Each blow on the subject is the last punch's that fired with that hand.
      for (; state.heard < duel.blows.length; state.heard++) {
        const blow = duel.blows[state.heard]!, by = blow.sides.find((side) => side.fighter === "right"), on = blow.sides.find((side) => side.fighter === "left");
        if (!by || !on || !(on.damage > 0)) continue;
        for (let k = punches.length - 1; k >= 0; k--) if (punches[k]!.effector === by.segment) { punches[k]!.damage += on.damage; break; }
      }
      state.down ||= subject.body.down;
    },
    get ended() { return world.time >= seconds || after !== undefined && punches.length > 0 && world.time >= punches[0]!.fired + after; },
    reading() {
      return { thrown: punches.length, taken: punches.filter((one) => one.damage >= LANDED).length, lost: punches.reduce((sum, one) => sum + one.damage, 0),
        left: punches.filter((one) => one.left).length, back: punches.filter((one) => one.back).length, down: state.down, seconds: world.time };
    },
  };
}
