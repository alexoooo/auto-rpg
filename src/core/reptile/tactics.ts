import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { Orders } from "../mind/orders.ts";
import { STAND_ORDERS } from "../mind/orders.ts";
import type { Tactics } from "../mind/tactics.ts";
import { nearestSurface } from "../mind/targets.ts";
import { pointOfToRef } from "../control/support.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { QuadrupedView } from "./crawl.ts";
import type { StrikeCycleState } from "../skills/strike-cycle.ts";
import { REPTILE_BITE as T } from "./tuning.ts";
import { mouthOf } from "./bite.ts";

/** Bite preparation accompanies approach; the committed stroke waits for loaded paws. */
interface QuadrupedIntent extends Orders { readonly prepareBite: boolean }

/** Shape-based low targets come from sensed colliders, without assuming an opponent's anatomy. */
export function quadrupedTactics(own: OwnBody, orders: (view: QuadrupedView) => Orders | null): Tactics<{ readonly view: QuadrupedView; readonly bite: Pick<StrikeCycleState, "phase"> }, QuadrupedIntent> {
  const mouth = new Vector3(), { head, lower } = mouthOf(own.built);
  const tip = lower.spec.points!.bite!.value, lip = head.spec.points!.mouth!.value;
  const dx = tip[0] - lip[0], dy = tip[1] - lip[1], dz = tip[2] - lip[2];
  const entry = Math.sqrt(dx * dx + dy * dy + dz * dz) + T.biteEntry;
  return { name: "reptile", decide(sight) {
    const view = sight.view;
    const given = orders(view);
    if (view.senses.out) return { ...STAND_ORDERS, prepareBite: false };
    pointOfToRef(head, head.spec.points!.mouth!.value, mouth);
    const from: Vec3 = [mouth.x, mouth.y, mouth.z];
    const near = nearestSurface(view.senses, from, (at) => Math.abs(at[1] - mouth.y) <= T.biteElevation);
    const target = near?.at ?? null, nearest = near?.squared ?? Infinity;
    const prepareBite = nearest <= T.bitePrepareNear * T.bitePrepareNear || !!given?.attack;
    if (given) return { ...given, prepareBite };
    if (!target) return { ...STAND_ORDERS, prepareBite: false };
    const dx = target[0] - view.centre.x, dz = target[2] - view.centre.z, distance = Math.sqrt(dx * dx + dz * dz);
    const face = distance ? { x: dx / distance, z: dz / distance } : null;
    const attacking = nearest <= entry * entry || sight.bite.phase !== null;
    return { move: attacking ? null : face, face, attack: attacking ? target : null, prepareBite };
  } };
}
