import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { Orders } from "../mind/orders.ts";
import { STAND_ORDERS } from "../mind/orders.ts";
import type { Tactics } from "../mind/tactics.ts";
import { aimedOrders, nearestSurface } from "../mind/targets.ts";
import { surfaceEntry, surfaceContains } from "../mind/openings.ts";
import { pointOfToRef } from "../control/support.ts";
import { pointAtToRef, rootFrameToRef } from "../control/kinematics.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { QuadrupedView } from "./crawl.ts";
import type { StrikeCycleState } from "../skills/strike-cycle.ts";
import { REPTILE_BITE, REPTILE_TROT } from "./tuning.ts";
import { mouthOf } from "./bite.ts";
import { turnAboutToRef } from "../math/turn.ts";
import { headingAligned } from "./trot.ts";

/** Bite preparation accompanies approach; the committed stroke waits for loaded paws. */
interface QuadrupedIntent extends Orders { readonly prepareBite: boolean; readonly creep: boolean; readonly travel: boolean }

/**
 * Each tooth seeks the first exposed sensed surface along its closing arc, with its piercing
 * direction facing the surface. Preparation retains that point in the opponent segment frame.
 */
export function quadrupedTactics(own: OwnBody, orders: (view: QuadrupedView) => Orders | null, T = REPTILE_BITE): Tactics<{ readonly view: QuadrupedView; readonly bite: Pick<StrikeCycleState, "phase"> }, QuadrupedIntent> & { readonly state: { pending: number; phase: StrikeCycleState["phase"]; target: { foe: string; part: string; local: Vec3; tooth: string } | null } } {
  const mouth = new Vector3(), { head, lower, hinge, teeth } = mouthOf(own.built);
  const carried = new Vector3(), inverse = new Quaternion();
  const frame = { position: new Vector3(), rotation: new Quaternion() }, closing = new Vector3(), shiftDirection = new Vector3();
  const jawTurn = new Quaternion(), jawAxis = new Vector3(...hinge.dofs[0]!.spec.axis.value);
  const ownBodies = new Set([...own.built.segments.values()].map(part => part.body));
  const loaded = () => [head, lower].some(part => own.built.physics.contactsOf(part.body)
    .some(contact => contact.impulse > 0 && (!contact.other || !ownBodies.has(contact.other))));
  const state = { pending: 0, phase: null as StrikeCycleState["phase"], target: null as { foe: string; part: string; local: Vec3; tooth: string } | null };
  const tip = lower.spec.points!.bite!.value, lip = head.spec.points!.mouth!.value;
  const contact = pointAtToRef([hinge], [[T.open * T.contactAt]], tip, new Vector3());
  const arcs = teeth.map(tooth => ({ tooth: tooth.name,
    arc: Array.from({ length: T.biteSamples + 1 }, (_, i) => pointAtToRef([hinge], [[T.open * (1 - i / T.biteSamples)]], tooth.tip, new Vector3())) }));
  const path = Array.from({ length: T.biteSamples + 1 }, () => new Vector3());
  const shifts = [0, -T.biteShift, T.biteShift];
  const tooth = lower.spec.contacts!.find(c => c.surface.point)!.surface.point!;
  const dx = contact.x - lip[0], dz = contact.z - lip[2];
  const entry = Math.sqrt(dx * dx + dz * dz) + T.biteEntry;
  return { name: "reptile", state, decide(sight, dt = 0) {
    const view = sight.view;
    const returned = state.phase === "return" && sight.bite.phase === null;
    state.phase = sight.bite.phase;
    if (sight.bite.phase === null && state.target) state.pending += dt;
    else state.pending = 0;
    if (returned || state.pending >= T.biteTimeout) { state.target = null; state.pending = 0; }
    const ordered = orders(view);
    if (view.senses.out) return { ...STAND_ORDERS, prepareBite: false, creep: false, travel: false };
    pointOfToRef(head, head.spec.points!.mouth!.value, mouth);
    const from: Vec3 = [mouth.x, mouth.y, mouth.z];
    const inside = (at: Vec3) => view.senses.others.some(foe => !foe.out && foe.side !== view.senses.side
      && foe.spec.segments.some(part => surfaceContains(foe, part.name, at)));
    const buried = inside(from);
    const accept = (at: Vec3) => Math.abs(at[1] - mouth.y) <= T.biteElevation;
    const near = nearestSurface(view.senses, from, accept, ordered?.foe);
    rootFrameToRef(head, frame);
    shiftDirection.set(0, 0, 1).applyRotationQuaternionToRef(frame.rotation, shiftDirection);
    const horizontal = Math.sqrt(shiftDirection.x * shiftDirection.x + shiftDirection.z * shiftDirection.z);
    shiftDirection.set(horizontal ? shiftDirection.x / horizontal : 0, 0, horizontal ? shiftDirection.z / horizontal : 0);
    let candidate: { foe: string; part: string; at: Vec3; normal: Vec3; shift: number; progress: number; tooth: string; alignment: number } | null = null;
    const retained = state.target && !((sight.bite.phase === null || sight.bite.phase === "chamber") && ordered?.foe !== undefined && state.target.foe !== ordered.foe);
    for (const shift of !buried && !retained && near && near.squared <= T.bitePrepareNear * T.bitePrepareNear ? shifts : []) {
      for (const { arc, tooth: toothName } of arcs) {
        arc.forEach((p, i) => p.applyRotationQuaternionToRef(frame.rotation, path[i]!).addInPlace(frame.position)
          .addInPlaceFromFloats(shiftDirection.x * shift, 0, shiftDirection.z * shift));
        if (inside([path[0]!.x, path[0]!.y, path[0]!.z])) continue;
        for (let i = 0; i < path.length - 1; i++) {
          const start = path[i]!, finish = path[i + 1]!, from: Vec3 = [start.x, start.y, start.z], to: Vec3 = [finish.x, finish.y, finish.z];
          const dx = finish.x - start.x, dy = finish.y - start.y, dz = finish.z - start.z, squared = dx * dx + dy * dy + dz * dz;
          let exposed: { foe: string; part: string; at: Vec3; normal: Vec3; fraction: number } | null = null;
          for (const foe of view.senses.others) {
            if (foe.out || foe.side === view.senses.side) continue;
            for (const part of foe.spec.segments) {
              const hit = surfaceEntry(foe, part.name, from, to);
              if (!hit) continue;
              const fraction = squared ? ((hit.at[0] - start.x) * dx + (hit.at[1] - start.y) * dy + (hit.at[2] - start.z) * dz) / squared : 0;
              if (!exposed || fraction < exposed.fraction) exposed = { foe: foe.id, part: part.name, ...hit, fraction };
            }
          }
          if (!exposed) continue;
          const progress = i + exposed.fraction;
          turnAboutToRef(jawAxis, T.open * (1 - progress / T.biteSamples), jawTurn);
          closing.set(...tooth.direction.value).applyRotationQuaternionToRef(jawTurn, closing).applyRotationQuaternionToRef(frame.rotation, closing);
          const alignment = -(closing.x * exposed.normal[0] + closing.y * exposed.normal[1] + closing.z * exposed.normal[2]);
          if (alignment >= tooth.alignment.value && accept(exposed.at) && (ordered?.foe === undefined || exposed.foe === ordered.foe)
            && (!candidate || Math.abs(shift) < candidate.shift || Math.abs(shift) === candidate.shift && (progress < candidate.progress
              || progress === candidate.progress && alignment > candidate.alignment)))
            candidate = { foe: exposed.foe, part: exposed.part, at: exposed.at, normal: exposed.normal, shift: Math.abs(shift), progress, tooth: toothName, alignment };
          break;
        }
      }
    }
    if ((sight.bite.phase === null || sight.bite.phase === "chamber") && ordered?.foe !== undefined && state.target?.foe !== ordered.foe) state.target = null;
    if (!state.target && candidate) {
      const segment = view.senses.others.find(foe => foe.id === candidate.foe)!.segments.get(candidate.part)!;
      carried.set(...candidate.at).subtractInPlace(segment.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(segment.rotation, inverse), carried);
      const local: Vec3 = [carried.x, carried.y, carried.z];
      state.target = { foe: candidate.foe, part: candidate.part, local, tooth: candidate.tooth };
    }
    const foe = state.target && view.senses.others.find(foe => foe.id === state.target!.foe && !foe.out);
    const segment = foe && foe.segments.get(state.target!.part);
    let target: Vec3 | null = null;
    if (segment) {
      carried.set(...state.target!.local).applyRotationQuaternionToRef(segment.rotation, carried).addInPlace(segment.position);
      const x = carried.x - segment.centre.x, y = carried.y - segment.centre.y, z = carried.z - segment.centre.z;
      target = [carried.x + T.biteLead * (segment.velocity.x + segment.spin.y * z - segment.spin.z * y),
        carried.y + T.biteLead * (segment.velocity.y + segment.spin.z * x - segment.spin.x * z),
        carried.z + T.biteLead * (segment.velocity.z + segment.spin.x * y - segment.spin.y * x)];
    }
    if ((sight.bite.phase === null || sight.bite.phase === "chamber") && target && !accept(target)) { state.target = null; target = null; }
    if (buried && (sight.bite.phase === null || sight.bite.phase === "chamber")) { state.target = null; target = null; }
    const given = aimedOrders(ordered, view.senses, () => target);
    const approach = target ?? near?.at;
    const ax = approach ? approach[0] - mouth.x : Infinity, az = approach ? approach[2] - mouth.z : Infinity;
    const nearest = ax * ax + az * az;
    const prepareBite = nearest <= T.bitePrepareNear * T.bitePrepareNear || !!given?.attack;
    const capture = entry + T.biteShift;
    const creep = nearest <= capture * capture || sight.bite.phase !== null;
    const travel = nearest > T.creepNear * T.creepNear && sight.bite.phase === null;
    if (given) return { ...given, prepareBite, creep, travel };
    if (!approach) return { ...STAND_ORDERS, prepareBite: false, creep: false, travel: true };
    const dx = approach[0] - view.centre.x, dz = approach[2] - view.centre.z, distance = Math.sqrt(dx * dx + dz * dz);
    const face = distance ? { x: dx / distance, z: dz / distance } : null;
    const gap = Math.sqrt(nearest) - (target ? capture : entry);
    const speed = Math.min(1, Math.max(0, gap / T.approach), Math.sqrt(Math.max(0, 2 * T.braking * gap)) / REPTILE_TROT.speed);
    const aligned = headingAligned(view.yaw, face, REPTILE_TROT.turnMoveAngle);
    const attacking = !!target || sight.bite.phase !== null;
    const blocked = !target && (buried || loaded());
    if (blocked) {
      const x = shiftDirection.x, z = shiftDirection.z;
      return { move: { x: -x, z: -z }, face: { x, z }, attack: null, prepareBite, creep: true, travel: false };
    }
    const retreat = !target && nearest <= entry * entry && aligned;
    return { move: !face || attacking ? null : retreat ? { x: -face.x, z: -face.z } : { x: face.x * speed, z: face.z * speed },
      face, attack: attacking ? target : null, prepareBite, creep: creep || retreat, travel };
  } };
}
