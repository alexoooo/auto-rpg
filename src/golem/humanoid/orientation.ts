import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { HandIntent } from "../../mind.ts";
import { validOrientation } from "./kinematics.ts";

export function turnHand(hand: HandIntent, roll: number, pitch: number, yaw: number, dt: number): void {
  const q = validOrientation(hand.orientation);
  if (!q) return;
  const next = q.multiply(Quaternion.RotationYawPitchRoll(roll * dt * 1.8, pitch * dt * 1.8, yaw * dt * 1.8)).normalize();
  hand.orientation = { x: next.x, y: next.y, z: next.z, w: next.w };
}

export function aimOrientation(direction: Vector3, roll: number): Quaternion {
  const q = Quaternion.FromUnitVectorsToRef(new Vector3(0, -1, 0), direction.normalizeToNew(), new Quaternion());
  return q.multiply(Quaternion.RotationAxis(Vector3.Up(), roll));
}
