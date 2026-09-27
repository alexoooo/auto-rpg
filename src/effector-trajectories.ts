/** Task-space proposals shared by the offline expert and its opt-in browser demonstration. */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { declares, type BodyCommand } from "./body-command.ts";
import type { FighterView, HandName } from "./mind.ts";
import type { EffectorPreviewKind } from "./effector-preview-query.ts";

export interface EffectorTrajectory {
  hand: HandName;
  lift: number;
  lateral: number;
  duration: number;
  retract: number;
  extend: number;
  sweep: number;
  /** Absent on older recorded plans: they swept symmetrically with no hand tilt. */
  sweepTo?: number;
  tilt?: number;
  roll: number;
  speed: number;
  force: number;
}

export function effectorTrajectory(kind: EffectorPreviewKind, hand: HandName, horizon = 1): EffectorTrajectory {
  // The held-pose bench covers both sockets and blade/fist/mace. A straight hand at full
  // radial reach asks for an incompatible anatomical pose; inward sweeps also hit the carry
  // boundary. Start outboard, finish on the mark, and let the carried shaft rise from the hand.
  const base = { hand, lift: 0, lateral: 0, duration: Math.min(horizon, .6), retract: .65, extend: .75,
    sweep: .55, sweepTo: 0, tilt: -.6, roll: 0, speed: 1, force: 1 };
  switch (kind) {
    case "sweep": return base;
    case "point": return { ...base, sweep: 0 };
    case "soft": return { ...base, sweep: 0, sweepTo: .55, speed: .6, force: .5 };
    default: { const unknown: never = kind; throw new Error(`no effector trajectory ${String(unknown)}`); }
  }
}

/** Geometry uses the live socket and opponent mark; only the actuator clamps/solves the request. */
export function applyEffectorTrajectory(command: BodyCommand, view: FighterView, spec: EffectorTrajectory, seconds: number): void {
  const other: HandName = spec.hand === "primary" ? "secondary" : "primary";
  const hand = [spec.hand, other].find(name => !view.self.hands[name].lost
    && declares(view.self.capabilities?.channels, "effector", "target", name));
  if (!hand) return;
  const me = view.self.hands[hand];
  const mark = { x: view.opponent.ground.x, y: view.opponent.shoulder.y + spec.lift, z: view.opponent.ground.z };
  const gx = view.opponent.ground.x - view.self.ground.x, gz = view.opponent.ground.z - view.self.ground.z;
  const length = Math.hypot(gx, gz) || 1;
  mark.x += spec.lateral * (gz / length);
  mark.z += spec.lateral * (-gx / length);
  const dx = mark.x - me.shoulder.x, dy = mark.y - me.shoulder.y, dz = mark.z - me.shoulder.z;
  const progress = Math.max(0, Math.min(1, seconds / spec.duration));
  const yaw = Math.atan2(dx, dz) + me.outboard * (spec.sweep + ((spec.sweepTo ?? -spec.sweep) - spec.sweep) * progress);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const distance = me.reach * (spec.retract + (spec.extend - spec.retract) * progress);
  const horizontal = distance * Math.cos(pitch);
  let q = Quaternion.RotationYawPitchRoll(yaw, -pitch, spec.roll);
  if (spec.tilt) q = q.multiply(Quaternion.RotationAxis(Vector3.Right(), spec.tilt));
  command.effectors[hand].target = {
    position: { x: me.shoulder.x + horizontal * Math.sin(yaw), y: me.shoulder.y + distance * Math.sin(pitch),
      z: me.shoulder.z + horizontal * Math.cos(yaw) },
    orientation: { x: q.x, y: q.y, z: q.z, w: q.w }, speed: spec.speed, force: spec.force,
  };
  command.actingHand = hand;
}
