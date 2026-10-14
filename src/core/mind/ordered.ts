import { atan2, cos, hypot, sin } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import type { Intent } from "./intent.ts";
import type { Orders } from "./orders.ts";
import type { Sight } from "./tactics.ts";

/**
 * Walking one way while facing another (`orderedIntent`): the share of the fastest walk held
 * across the heading or backward, and how near its facing a body must have turned, rad, before
 * it walks any faster. Measured with the club in hand: `docs/reference/orders.md#the-rule`.
 */
export const STRAFE = { share: 0.5, turned: 0.3 } as const;

/**
 * **Orders to walk and to face, carried out**, the hands covering as `guard` says and attacking
 * nothing. Ordered to walk, a body walks that way at its fastest walk (`StanceEnvelope.walk`), turning to it, and sent
 * somewhere (`Orders.destination`), at its fastest walk forward (`StanceEnvelope.ways`): a walk ordered only a way, as
 * tactics closing on a foe order one, is one it stops from in a few steps. Ordered to face
 * another way as it walks, it walks at the pace that holds every way by `strafe` (`STRAFE` unless an
 * experiment passes another); either no faster than the pace ordered (`Orders.pace`); standing, it faces as ordered, or keeps its heading. The stance
 * turns only while it walks (`locomotion`), so a standing body ordered to face does not turn.
 * How far it is from where it is ordered to go (`Orders.destination`) goes on to its locomotion.
 */
export function orderedIntent({ report, envelope }: { readonly report: Pick<Sight["report"], "heading">; readonly envelope: Sight["envelope"] }, { move, face, pace = Infinity, destination }: Pick<Orders, "move" | "face" | "pace" | "destination">,
  guard: Intent["guard"], strafe: typeof STRAFE = STRAFE): Intent {
  const going = destination === undefined ? {} : { destination };
  // A facing under 8 cm long names no direction: the point to face is over the body itself.
  const facing = face && hypot(face.x, face.z) > 0.08 ? atan2(face.x, face.z) : null;
  if (!move || !envelope) return { move: null, face: facing ?? report.heading, guard, actions: [], ...going };
  const bearing = atan2(move.x, move.z), walk = Math.min(envelope.walk.value, pace);
  // Facing its walk: the walk the envelope measured, forward where it is sent somewhere, turning to it.
  if (facing === null) return { move: [destination === undefined ? walk : Math.min(envelope.ways.forward.value, pace), 0], face: bearing, guard, actions: [], ...going };
  // Facing elsewhere: the walk's direction in the heading's frame, at the pace that holds.
  const off = bearing - report.heading;
  const share = Math.abs(wrap(facing - report.heading)) < strafe.turned
    ? strafe.share + (1 - strafe.share) * Math.max(0, cos(off)) : strafe.share;
  return { move: [walk * share * cos(off), walk * share * sin(off)], face: facing, guard, actions: [], ...going };
}
