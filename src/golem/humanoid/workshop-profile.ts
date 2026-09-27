import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import source from "../../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import sizeGrips from "../../../assets/humanoid/workshop-size-grips.json" with { type: "json" };
import type { HumanArmGeometry } from "./kinematics.ts";

export interface HumanAppearanceSetting {
  model: "workshop-fighter";
  boots: boolean;
  armour: boolean;
}
export const WORKSHOP_SOURCE = source;
export function workshopGrips(kit: keyof typeof source.grips, size: number): Record<string, number[]> {
  const original = source.grips[kit];
  if (size === 1 || kit === "empty") return original;
  const upper = sizeGrips.samples.findIndex(sample => sample.size >= size);
  const b = sizeGrips.samples[upper < 0 ? sizeGrips.samples.length - 1 : upper];
  const a = sizeGrips.samples[upper < 0 ? sizeGrips.samples.length - 1 : Math.max(0, upper - 1)];
  const blend = b.size === a.size ? 0 : (size - a.size) / (b.size - a.size);
  const quaternion = (q: number[]) => new Quaternion(q[1], q[2], q[3], q[0]);
  return Object.fromEntries(Object.entries(original).map(([name, pose]) => {
    const held = name.endsWith("_r") ? kit.includes("sword") : kit.includes("shield");
    if (!held) return [name, pose];
    const key = name as keyof typeof a.closed;
    const q = Quaternion.Slerp(quaternion(a.closed[key]), quaternion(b.closed[key]), blend);
    return [name, [q.w, q.x, q.y, q.z]];
  }));
}
export const workshopArm = (side: number, size = 1): HumanArmGeometry => ({
  lengths: [0, 0, source.upperLength, source.foreLength, 0, 0, .09].map(length => length * size),
  palm: Vector3.FromArray(side > 0 ? source.palm.primary : source.palm.secondary).scale(size),
  scale: size,
});
