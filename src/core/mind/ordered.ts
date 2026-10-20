import { atan2, cos, hypot, sin } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import { paceToward } from "../control/stance-envelope.ts";
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
 * Ordered to run, the least share of its trials forward a pace must have held to
 * be the one it goes at (`paceToward`): past its fastest walk forward the body risks falling, and
 * an order to run accepts a fall in this many of its tries.
 */
export const RUN = { share: 0.6 } as const;

/**
 * Orders supply a direct walk or a navigation objective while the hands retain their guard.
 * Facing remains independent of travel; an explicit running preference selects the available
 * forward pace without discarding an explicit facing. Place and range objectives are resolved
 * by the body's navigator before locomotion reads the intent's velocity.
 */
export function orderedIntent({ report, envelope }: { readonly report: Pick<Sight["report"], "heading">; readonly envelope: Sight["envelope"] }, { move: request, face, pace = Infinity, run }: Pick<Orders, "move" | "face" | "pace" | "run">,
  guard: Intent["guard"], strafe: typeof STRAFE = STRAFE): Intent {
  // A facing under 8 cm long names no direction: the point to face is over the body itself.
  const facing = face && hypot(face.x, face.z) > 0.08 ? atan2(face.x, face.z) : null;
  if (!request || !envelope) return { move: null, face: facing ?? report.heading, guard, actions: [] };
  if (request.kind !== "direct") return { move: null, face: facing ?? report.heading, guard, actions: [], movement: request,
    pace: Math.min(run ? paceToward(envelope, 1, 0, RUN.share) : envelope.walk.value, pace), ...(facing === null ? { travelFacing: true as const } : {}) };
  const move = request.direction;
  if (hypot(move.x, move.z) === 0) return { move: null, face: facing ?? report.heading, guard, actions: [] };
  const bearing = atan2(move.x, move.z), walk = Math.min(envelope.walk.value, pace);
  // Facing its walk: the walk the envelope measured, forward where it is sent somewhere or runs, turning to it.
  if (facing === null) return { move: [!run ? walk : Math.min(paceToward(envelope, 1, 0, RUN.share), pace), 0], face: bearing, guard, actions: [] };
  // Facing elsewhere: the walk's direction in the heading's frame, at the pace that holds.
  const off = bearing - report.heading;
  const turned = Math.abs(wrap(facing - report.heading)) < strafe.turned;
  const share = turned
    ? strafe.share + (1 - strafe.share) * Math.max(0, cos(off)) : strafe.share;
  const speed = run && turned && Math.abs(wrap(off)) < strafe.turned ? Math.min(paceToward(envelope, 1, 0, RUN.share), pace) : walk;
  return { move: [speed * share * cos(off), speed * share * sin(off)], face: facing, guard, actions: [] };
}
