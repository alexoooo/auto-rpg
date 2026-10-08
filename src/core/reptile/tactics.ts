import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { Orders } from "../mind/orders.ts";
import { STAND_ORDERS } from "../mind/orders.ts";
import type { Tactics } from "../mind/tactics.ts";
import { aimedOrders, nearestSurface } from "../mind/targets.ts";
import { pointOfToRef } from "../control/support.ts";
import { pointAtToRef } from "../control/kinematics.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { QuadrupedView } from "./crawl.ts";
import type { StrikeCycleState } from "../skills/strike-cycle.ts";
import { REPTILE_BITE, REPTILE_TROT } from "./tuning.ts";
import { mouthOf } from "./bite.ts";
import { headingAligned } from "./trot.ts";

/** Bite preparation accompanies approach; the committed stroke waits for loaded paws. */
interface QuadrupedIntent extends Orders { readonly prepareBite: boolean; readonly creep: boolean; readonly travel: boolean }

/**
 * Shape-based low targets come from sensed colliders, without assuming an opponent's anatomy: a
 * foe it is ordered to attack (`Orders.foe`) is bitten at the nearest point of its surface.
 */
export function quadrupedTactics(own: OwnBody, orders: (view: QuadrupedView) => Orders | null, T = REPTILE_BITE): Tactics<{ readonly view: QuadrupedView; readonly bite: Pick<StrikeCycleState, "phase"> }, QuadrupedIntent> {
  const mouth = new Vector3(), { head, lower, hinge } = mouthOf(own.built);
  const carried = new Vector3(), inverse = new Quaternion();
  const state = { target: null as { foe: string; part: string; local: Vec3 } | null };
  const tip = lower.spec.points!.bite!.value, lip = head.spec.points!.mouth!.value;
  const contact = pointAtToRef([hinge], [[T.open * T.contactAt]], tip, new Vector3());
  const dx = contact.x - lip[0], dy = contact.y - lip[1], dz = contact.z - lip[2];
  const entry = Math.sqrt(dx * dx + dy * dy + dz * dz) + T.biteEntry;
  return { name: "reptile", state, decide(sight) {
    const view = sight.view;
    const ordered = orders(view);
    if (view.senses.out) return { ...STAND_ORDERS, prepareBite: false, creep: false, travel: false };
    pointOfToRef(head, head.spec.points!.mouth!.value, mouth);
    const from: Vec3 = [mouth.x, mouth.y, mouth.z];
    const accept = (at: Vec3) => Math.abs(at[1] - mouth.y) <= T.biteElevation;
    const near = nearestSurface(view.senses, from, accept), candidate = nearestSurface(view.senses, from, accept, ordered?.foe);
    if (sight.bite.phase === null || sight.bite.phase === "chamber" && ordered?.foe !== undefined && state.target?.foe !== ordered.foe) state.target = null;
    if (!state.target && candidate) {
      const segment = view.senses.others.find(foe => foe.id === candidate.foe)!.segments.get(candidate.part)!;
      carried.set(...candidate.at).subtractInPlace(segment.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(segment.rotation, inverse), carried);
      state.target = { foe: candidate.foe, part: candidate.part, local: [carried.x, carried.y, carried.z] };
    }
    const foe = state.target && view.senses.others.find(foe => foe.id === state.target!.foe && !foe.out);
    const segment = foe && foe.segments.get(state.target!.part);
    let target: Vec3 | null = null;
    if (segment) {
      carried.set(...state.target!.local).applyRotationQuaternionToRef(segment.rotation, carried).addInPlace(segment.position);
      target = [carried.x, carried.y, carried.z];
    }
    const given = aimedOrders(ordered, view.senses, () => target);
    const nearest = near?.squared ?? Infinity;
    const prepareBite = nearest <= T.bitePrepareNear * T.bitePrepareNear || !!given?.attack;
    const capture = entry;
    const creep = nearest <= capture * capture || sight.bite.phase !== null;
    const travel = nearest > T.creepNear * T.creepNear && sight.bite.phase === null;
    if (given) return { ...given, prepareBite, creep, travel };
    const approach = near?.at;
    if (!approach) return { ...STAND_ORDERS, prepareBite: false, creep: false, travel: true };
    const dx = approach[0] - view.centre.x, dz = approach[2] - view.centre.z, distance = Math.sqrt(dx * dx + dz * dz);
    const face = distance ? { x: dx / distance, z: dz / distance } : null;
    const gap = Math.sqrt(nearest) - entry;
    const speed = Math.min(1, Math.max(0, gap / T.approach), Math.sqrt(Math.max(0, 2 * T.braking * gap)) / REPTILE_TROT.speed);
    const aligned = headingAligned(view.yaw, face, REPTILE_TROT.turnMoveAngle);
    const attacking = nearest <= capture * capture && aligned || sight.bite.phase !== null;
    return { move: attacking || !face ? null : { x: face.x * speed, z: face.z * speed }, face, attack: attacking ? target : null, prepareBite, creep, travel };
  } };
}
