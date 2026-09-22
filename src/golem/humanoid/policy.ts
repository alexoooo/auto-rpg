import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mind, HandName } from "../../mind.ts";
import { golemTactics } from "../tactics.ts";
import { carryOrientation, aimOrientation } from "./orientation.ts";

/** Tactical decisions stay in the existing executor; the pose adapter uses declared capabilities. */
export function humanoidDuelist(seed = (Math.random() * 0x100000000) >>> 0): Mind {
  const tactics = golemTactics(seed);
  return { name: "humanoid-duelist", decide(view, dt) {
    const source = tactics.decide(view, dt);
    const result = { ...source, primary: { ...source.primary }, secondary: { ...source.secondary },
      posture: { ...source.posture }, natural: { ...source.natural } };
    result.strafe *= .25;
    result.posture.trunkTwist *= .35;
    for (const slot of ["primary", "secondary"] as HandName[]) {
      const cap = view.self.capabilities?.effectors[slot], hand = view.self.hands[slot];
      if (!cap?.fullOrientation || !cap.reachable || hand.lost) continue;
      const command = result[slot], r = cap.reachable;
      // The supported shield maps a cursor to a forearm pose; reserve explicit orientation for manual rotation.
      if (hand.weapon === "shield") { delete command.orientation; continue; }
      if (!command.guard) command.pointerY = Math.min(1, command.pointerY + .35);
      const az = (r.swingMin + (command.pointerX * hand.outboard + 1) * 0.5 * (r.swingMax - r.swingMin)) * hand.outboard;
      const el = r.liftMin + (command.pointerY + 1) * 0.5 * (r.liftMax - r.liftMin);
      const q = (command.guard ? carryOrientation : aimOrientation)(new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)), command.roll * hand.outboard);
      command.orientation = { x: q.x, y: q.y, z: q.z, w: q.w };
    }
    return result;
  } };
}
