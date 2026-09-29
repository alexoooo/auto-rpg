import type { WoundSpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";
import type { WorkshopModel } from "./rig.ts";

/**
 * **What a workshop human's wounds are**: its hit points, the owner's (Warrior 6, Rogue 4); its
 * head, whose emptying or loss kills it; and its trunk, which never comes off, as in the old game,
 * where a torso was not severed and a limb or the head was.
 */
export function humanWounds(model: WorkshopModel): WoundSpec {
  return { hp: hitPoints(model), vital: ["head"], whole: ["upperTrunk", "middleTrunk", "lowerTrunk"] };
}

function hitPoints(model: WorkshopModel): Quantity<number> {
  switch (model) {
    case "workshop-fighter": return sourced(6, "HP", "owner-hp-pool", "Warrior 6");
    case "workshop-rogue": return sourced(4, "HP", "owner-hp-pool", "Rogue 4");
    default: { const never: never = model; throw new Error(`no hit points for ${String(never)}`); }
  }
}
