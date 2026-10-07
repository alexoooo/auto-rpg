import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { Orders } from "../mind/orders.ts";
import { STAND_ORDERS } from "../mind/orders.ts";
import type { Tactics } from "../mind/tactics.ts";
import { aimedOrders, nearestSurface, surfaceOn } from "../mind/targets.ts";
import { pointOfToRef } from "../control/support.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { QuadrupedView } from "./crawl.ts";
import type { StrikeCycleState } from "../skills/strike-cycle.ts";
import { REPTILE_BITE as T, REPTILE_TROT } from "./tuning.ts";
import { mouthOf } from "./bite.ts";

const ANY = () => true;

/** Bite preparation accompanies approach; the committed stroke waits for loaded paws. */
interface QuadrupedIntent extends Orders { readonly prepareBite: boolean; readonly creep: boolean; readonly travel: boolean }

/**
 * Shape-based low targets come from sensed colliders, without assuming an opponent's anatomy: a
 * foe it is ordered to attack (`Orders.foe`) is bitten at the nearest point of its surface.
 */
export function quadrupedTactics(own: OwnBody, orders: (view: QuadrupedView) => Orders | null): Tactics<{ readonly view: QuadrupedView; readonly bite: Pick<StrikeCycleState, "phase"> }, QuadrupedIntent> {
  const mouth = new Vector3(), { head, lower } = mouthOf(own.built);
  const tip = lower.spec.points!.bite!.value, lip = head.spec.points!.mouth!.value;
  const dx = tip[0] - lip[0], dy = tip[1] - lip[1], dz = tip[2] - lip[2];
  const entry = Math.sqrt(dx * dx + dy * dy + dz * dz) + T.biteEntry;
  return { name: "reptile", decide(sight) {
    const view = sight.view;
    const ordered = orders(view);
    if (view.senses.out) return { ...STAND_ORDERS, prepareBite: false, creep: false, travel: false };
    pointOfToRef(head, head.spec.points!.mouth!.value, mouth);
    const from: Vec3 = [mouth.x, mouth.y, mouth.z];
    const given = aimedOrders(ordered, view.senses, (foe) => surfaceOn(foe, from, ANY)?.at ?? null);
    const near = nearestSurface(view.senses, from, (at) => Math.abs(at[1] - mouth.y) <= T.biteElevation);
    const target = near?.at ?? null, nearest = near?.squared ?? Infinity;
    const prepareBite = nearest <= T.bitePrepareNear * T.bitePrepareNear || !!given?.attack;
    const creep = nearest <= entry * entry || sight.bite.phase !== null;
    const travel = nearest > T.creepNear * T.creepNear && sight.bite.phase === null;
    if (given) return { ...given, prepareBite, creep, travel };
    if (!target) return { ...STAND_ORDERS, prepareBite: false, creep: false, travel: true };
    const dx = target[0] - view.centre.x, dz = target[2] - view.centre.z, distance = Math.sqrt(dx * dx + dz * dz);
    const face = distance ? { x: dx / distance, z: dz / distance } : null;
    const gap = Math.sqrt(nearest) - entry;
    const speed = Math.min(1, Math.max(0, gap / T.approach), Math.sqrt(Math.max(0, 2 * T.braking * gap)) / REPTILE_TROT.speed);
    const attacking = nearest <= entry * entry || sight.bite.phase !== null;
    return { move: attacking || !face ? null : { x: face.x * speed, z: face.z * speed }, face, attack: attacking ? target : null, prepareBite, creep, travel };
  } };
}
