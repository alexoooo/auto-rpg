import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import source from "../../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import fighterGrips from "../../../assets/humanoid/workshop-size-grips.json" with { type: "json" };
import rogue from "../../../assets/humanoid/workshop-rogue.json" with { type: "json" };
import rogueGrips from "../../../assets/humanoid/workshop-rogue-size-grips.json" with { type: "json" };
import type { HumanArmGeometry } from "./kinematics.ts";

export interface HumanAppearanceSetting {
  model: WorkshopModel;
  boots: boolean;
  armour: boolean;
}
export type WorkshopModel = "workshop-fighter" | "workshop-rogue";
export const isWorkshopModel = (model: unknown): model is WorkshopModel => model === "workshop-fighter" || model === "workshop-rogue";
export const workshopSource = (model: WorkshopModel = "workshop-fighter") => model === "workshop-rogue" ? rogue : source;
export const WORKSHOP_SOURCE = source;
export const WORKSHOP_STRING_HOOK = rogue.stringHook;
export const WORKSHOP_BOW = rogue.equipment.bow;
export function workshopGrips(kit: keyof typeof source.grips | "bow", size: number, model: WorkshopModel = "workshop-fighter"): Record<string, number[]> {
  const source = workshopSource(model);
  const sizeGrips = model === "workshop-rogue" ? rogueGrips : fighterGrips;
  const original = kit === "bow" ? rogue.grips.bow : source.grips[kit];
  if (size === 1 || kit === "empty") return original;
  const upper = sizeGrips.samples.findIndex(sample => sample.size >= size);
  const b = sizeGrips.samples[upper < 0 ? sizeGrips.samples.length - 1 : upper];
  const a = sizeGrips.samples[upper < 0 ? sizeGrips.samples.length - 1 : Math.max(0, upper - 1)];
  const blend = b.size === a.size ? 0 : (size - a.size) / (b.size - a.size);
  const quaternion = (q: number[]) => new Quaternion(q[1], q[2], q[3], q[0]);
  return Object.fromEntries(Object.entries(original).map(([name, pose]) => {
    const held = name.endsWith("_r") ? kit.includes("sword") : (kit.includes("shield") || kit === "bow");
    if (!held) return [name, pose];
    const key = name as keyof typeof a.closed;
    const q = Quaternion.Slerp(quaternion(a.closed[key]), quaternion(b.closed[key]), blend);
    return [name, [q.w, q.x, q.y, q.z]];
  }));
}
export const workshopArm = (side: number, size = 1, model: WorkshopModel = "workshop-fighter"): HumanArmGeometry => {
  const source = workshopSource(model);
  return ({
  lengths: [0, 0, source.upperLength, source.foreLength, 0, 0, .09].map(length => length * size),
  palm: Vector3.FromArray(side > 0 ? source.palm.primary : source.palm.secondary).scale(size),
  scale: size,
});
};
