import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import source from "../../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import type { HumanArmGeometry } from "./kinematics.ts";

export interface HumanAppearanceSetting {
  model: "workshop-fighter";
  boots: boolean;
  armour: boolean;
}
export const WORKSHOP_SOURCE = source;
export const workshopArm = (side: number): HumanArmGeometry => ({
  lengths: [0, 0, source.upperLength, source.foreLength, 0, 0, .09],
  palm: Vector3.FromArray(side > 0 ? source.palm.primary : source.palm.secondary),
});
