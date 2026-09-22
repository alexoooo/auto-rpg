import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
// Shared with the offline mesh compiler; JSON imports work in Vite and Node strip-only mode.
import spec from "../../../assets/humanoid/grips.json" with { type: "json" };
export const PALM_GRIP = Vector3.FromArray(spec.palmCentre);
export const HUMAN_MOUNT = { axis: Vector3.FromArray(spec.edgeAxis), perp: Vector3.FromArray(spec.handleAxis) };
