import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { bodyEffectors } from "../control/effectors.ts";
import type { PointTask } from "../control/motor.ts";
import { turnOfToRef } from "../control/support.ts";
import { atan2 } from "../math/real.ts";
import type { Side } from "../spec/body.ts";
import type { ReadBody } from "../read-body.ts";

/** The time constant a held item's line is turned up at, s: about the guard's posture's own. */
const HOLD_SECONDS = 0.1;

/**
 * **Holding up**: a hand that holds an item, and that nothing else drives, turned through the
 * whole-body solve so that the item's line (`ItemHold.along`) points up, world: the hand's spin
 * asked to close the line's angle from up, critically damped over `HOLD_SECONDS`, and its spin
 * about the line damped. Its place is the posture's (the guard's). The guard's posture holds the
 * line up as the body stands in its reference pose (`guardPosture`); a hold keeps it up however
 * the trunk leans and whatever the item's weight does to the wrist. An empty hand holds nothing.
 */
export function holdUp(built: ReadBody): (side: Side) => PointTask | null {
  const n = 1 / HOLD_SECONDS;
  const hands = Object.fromEntries((["left", "right"] as const).map((side) => {
    const segment = built.segments.get(`hand.${side}`), held = built.spec.held?.find((h) => h.segment === `hand.${side}`);
    const effector = bodyEffectors(built).find((e) => e.model.segment === `hand.${side}`);
    if (!segment || !held || !effector) return [side, null];
    const [x, y, z] = held.along.value, size = Math.sqrt(x * x + y * y + z * z);
    return [side, { segment, point: effector.model.point, along: new Vector3(x / size, y / size, z / size) }];
  })) as Record<Side, { segment: NonNullable<ReturnType<ReadBody["segments"]["get"]>>; point: string; along: Vector3 } | null>;
  const turn = new Quaternion(), line = new Vector3(), spin = new Vector3();
  return (side) => {
    const hand = hands[side];
    if (!hand) return null;
    hand.along.applyRotationQuaternionToRef(turnOfToRef(hand.segment, turn), line);
    hand.segment.body.angularVelocityToRef(spin);
    // The turn that brings the line up: about line x up, by the angle between them.
    const ax = -line.z, az = line.x, across = Math.sqrt(ax * ax + az * az), angle = atan2(across, line.y), k = across > 0 ? n * n * angle / across : 0;
    return { segment: `hand.${side}`, point: hand.point, accel: null,
      spin: [k * ax - 2 * n * spin.x, -2 * n * spin.y, k * az - 2 * n * spin.z] };
  };
}
