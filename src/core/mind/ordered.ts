import { atan2, cos, hypot, sin } from "../math/real.ts";
import { wrap } from "../skills/locomotion.ts";
import type { RecipeFighterConfig } from "./config.ts";
import { GUARD_ACTION, type HandAction, type Intent } from "./intent.ts";
import type { Orders } from "./orders.ts";
import type { Sight } from "./tactics.ts";
import { THREAT, threatReader, type Threat } from "./threat.ts";

/**
 * Walking one way while facing another (`orderedIntent`): the share of the fastest walk held
 * across the heading or backward, and how near its facing a body must have turned, rad, before
 * it walks any faster. Measured with the club in hand: `docs/reference/orders.md#the-rule`.
 */
export const STRAFE = { share: 0.5, turned: 0.3 } as const;

/**
 * **What a hand that does not attack does**, as `guard` says: hold the pose, or cover what
 * threatens the head (`threatOf`, by `threat`) while anything does.
 */
export function guarding(guard: RecipeFighterConfig["guard"], threat: Threat = THREAT): (sight: Sight) => HandAction {
  const { threatOf } = threatReader();
  switch (guard) {
    case "pose": return () => GUARD_ACTION;
    case "cover": return ({ view }) => {
      const cover = threatOf(view, threat);
      return cover ? { kind: "guard", cover } : GUARD_ACTION;
    };
    default: {
      const never: never = guard;
      throw new Error(`a fighter guards in the pose or by a cover, not by ${JSON.stringify(never)}`);
    }
  }
}

/**
 * **Orders to walk and to face, carried out**, the hands doing as `hands` says. Ordered to walk,
 * a body walks that way at its fastest walk (`Body.envelope`), turning to it; ordered to face
 * another way as it walks, it walks at the pace that holds (`strafe`, `STRAFE` unless an
 * experiment passes another); standing, it faces as ordered, or keeps its heading. The stance
 * turns only while it walks (`locomotion`), so a standing body ordered to face does not turn.
 */
export function orderedIntent({ report, envelope }: Sight, { move, face }: Pick<Orders, "move" | "face">, hands: Intent["hands"],
  strafe: typeof STRAFE = STRAFE): Intent {
  // A facing under 8 cm long names no direction: the point to face is over the body itself.
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
}
