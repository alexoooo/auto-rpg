import type { Rigid } from "../../core/bodies/build/rigid.ts";

/**
 * **The colliders of a held club's swell** on a hand's rigid body, by their index among its shapes:
 * each held item's capsule that spans its declared `swellFrom` to `swellTo`. Empty where the hand
 * holds nothing with a swell.
 */
export function swellShapes(rigid: Rigid): ReadonlySet<number> {
  return new Set(rigid.owners.flatMap((owner, index) => {
    if (owner.kind !== "held") return [];
    const own = rigid.owners.slice(0, index).filter(one => one.kind === "held" && one.held === owner.held).length;
    const shape = owner.held.item.shapes[own], from = owner.held.item.points.swellFrom?.value, to = owner.held.item.points.swellTo?.value;
    return shape?.kind === "capsule" && from && to && shape.from.value.every((v, k) => v === from[k]) && shape.to.value.every((v, k) => v === to[k]) ? [index] : [];
  }));
}
