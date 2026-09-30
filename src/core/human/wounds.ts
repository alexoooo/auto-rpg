import type { WoundSpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";
import type { HumanFigure } from "./figure.ts";
import type { WorkshopModel } from "./rig.ts";

/**
 * **What a human figure's wounds are**: its hit points (the figure's); its head, whose emptying or
 * loss kills it; and its trunk, which is never severed, though a limb or the head may be.
 */
export function humanWounds(figure: HumanFigure): WoundSpec {
  return { hp: figure.hp, vital: ["head"], whole: ["upperTrunk", "middleTrunk", "lowerTrunk"] };
}

/** A workshop model's hit points, the owner's: Warrior 6, Rogue 4. */
export function workshopHitPoints(model: WorkshopModel): Quantity<number> {
  switch (model) {
    case "workshop-fighter": return sourced(6, "HP", "owner-hp-pool", "Warrior 6");
    case "workshop-rogue": return sourced(4, "HP", "owner-hp-pool", "Rogue 4");
    default: { const never: never = model; throw new Error(`no hit points for ${String(never)}`); }
  }
}
