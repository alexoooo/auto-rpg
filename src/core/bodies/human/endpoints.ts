import { segmentOf, type BodySpec } from "../spec/body.ts";
import type { Side } from "../bilateral.ts";


/** The effector on a bilateral body's side that has knuckles, or none. */
export function fistOn(spec: BodySpec, side: Side): string | undefined {
  for (const effector of spec.effectors ?? []) {
    const segment = segmentOf(spec, effector.segment);
    if (segment?.points?.knuckles && (segment.centreOfMass.value[0] < 0 ? "left" : "right") === side) return effector.segment;
  }
  return undefined;
}
