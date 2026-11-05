import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { fistTurns as authoredTurns, type RestBone, type FistPose } from "../../../core/bodies/human/fist.ts";

/** Authored body-art turns converted to the renderer's quaternion representation. */
export function fistTurns(bones: ReadonlyMap<string, RestBone>, side: "r" | "l", pose: FistPose): Map<string, Quaternion> {
  return new Map([...authoredTurns(bones, side, pose, Math)].map(([name, q]) => [name, new Quaternion(q.x, q.y, q.z, q.w)]));
}
