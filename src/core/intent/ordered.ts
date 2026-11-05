import { atan2, hypot } from "../math/real.ts";
import type { Intent } from "./intent.ts";
import type { Orders } from "./orders.ts";

/** A facing under 8 cm names no direction: its aim point is over the body itself. */
export const orderedFacing = (face: Orders["face"]): number | null => face && hypot(face.x, face.z) > .08 ? atan2(face.x, face.z) : null;

/**
 * **Orders made an intent**: their movement, a direct walk as much as a place or a range, for the
 * body's navigator to go at the speed rule's speed (`travelSpeed`) under the orders' pace and walk, facing as
 * ordered or, ordered no facing, the way it goes (`travelFacing`), walking or standing by the gait
 * ordered, as low as ordered; the hands keep their guard.
 */
export function orderedIntent({ report }: { readonly report: { readonly heading: number } }, { move: request, face, pace, walk, gait, lower }: Pick<Orders, "move" | "face" | "pace" | "walk" | "gait" | "lower">,
  guard: Intent["guard"]): Intent {
  const facing = orderedFacing(face), still: Intent = { move: null, face: facing ?? report.heading, guard, actions: [], ...(gait === undefined ? {} : { gait }), ...(lower === undefined ? {} : { lower }) };
  if (!request || request.kind === "direct" && hypot(request.direction.x, request.direction.z) === 0) return still;
  return { ...still, movement: request, ...(pace === undefined ? {} : { pace }), ...(walk ? { walk } : {}), ...(facing === null ? { travelFacing: true as const } : {}) };
}
