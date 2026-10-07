import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { uprightness } from "./ground.ts";
import { turnOfToRef } from "./support.ts";

/** Scale-relative posture for a body whose reference height is below the humanoid fall allowance. */
export function lowBodyPosture(built: BuiltBody, root: string, minimumHeight: number, minimumUp: number) {
  const segment = built.segments.get(root);
  if (!segment) throw new Error(`unknown posture root ${root}`);
  const upright = uprightness(built), turn = new Quaternion(), up = new Vector3(), vertical = new Vector3(0, 1, 0);
  return { upright, down() {
    turnOfToRef(segment, turn);
    vertical.applyRotationQuaternionToRef(turn, up);
    return up.y < minimumUp || upright.height() < upright.standing * minimumHeight;
  } };
}
