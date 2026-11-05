import { Vector3 } from "../../../../core/math/vector.ts";
import type { Patch } from "../../../../control/contact-wrench.ts";

/** One bearing patch's corners in a reusable buffer, ordered as the physical patch's corners. */
export function patchSupport() {
  const points = Array.from({ length: 4 }, () => new Vector3()), corners: Vector3[] = [];
  return { corners, read(patch: Patch): void {
    switch (patch.kind) {
      case "point": corners[0] = patch.at; corners.length = 1; return;
      case "sole": {
        const { middle, along, length, width } = patch;
        for (let i = 0; i < 4; i++) {
          const a = i < 2 ? 1 : -1, b = i === 0 || i === 3 ? 1 : -1;
          corners[i] = points[i]!.set(middle.x + a * length * along.x + b * width * along.z, middle.y, middle.z + a * length * along.z - b * width * along.x);
        }
        corners.length = 4; return;
      }
      default: { const never: never = patch; throw new Error(`unknown bearing patch ${never}`); }
    }
  } };
}
