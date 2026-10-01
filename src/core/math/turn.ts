import type { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { acos, cos, sin } from "./real.ts";

/**
 * The turns whose arithmetic takes a sine or a cosine, on the core's own (`real.ts`): Babylon's
 * `Quaternion.RotationAxis` and `Slerp` call the JavaScript engine's, which no two engines agree
 * on to the last bit. `tests/core-boundary.test.mjs` refuses those in the core.
 */

/** The turn of `angle`, rad, about `axis`, whatever its length, into `result`. */
export function turnAboutToRef(axis: Vector3, angle: number, result: Quaternion): Quaternion {
  const sinByLength = sin(angle / 2) / axis.length();
  return result.set(axis.x * sinByLength, axis.y * sinByLength, axis.z * sinByLength, cos(angle / 2));
}

/** The cosine between two turns above which the arc between them is taken as a line, a numeric setting. */
const NEARLY_ONE = 0.999999;

/** The turn `amount` of the way from `from` to `to` along the shorter arc of the two, into `result`. */
export function turnBetweenToRef(from: Quaternion, to: Quaternion, amount: number, result: Quaternion): Quaternion {
  const along = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w, cosine = Math.abs(along);
  let near = 1 - amount, far = amount;
  if (!(cosine > NEARLY_ONE)) {
    const arc = acos(cosine), bySine = 1 / sin(arc);
    near = sin((1 - amount) * arc) * bySine;
    far = sin(amount * arc) * bySine;
  }
  if (along < 0) far = -far;
  return result.set(near * from.x + far * to.x, near * from.y + far * to.y, near * from.z + far * to.z, near * from.w + far * to.w);
}
