import type { AttributeSpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";
import type { HumanFigure } from "./figure.ts";
import type { WorkshopModel } from "./rig.ts";

/** A human figure's attributes: the figure's. */
export function humanAttributes(figure: HumanFigure): AttributeSpec {
  return { balance: figure.balance };
}

/** A workshop model's balance, points, the owner's. */
export function workshopBalance(model: WorkshopModel): Quantity<number> {
  switch (model) {
    case "workshop-fighter": return sourced(0, "1", "owner-balance", "Warrior 0");
    case "workshop-rogue": return sourced(0, "1", "owner-balance", "Rogue 0");
    default: { const never: never = model; throw new Error(`no balance for ${String(never)}`); }
  }
}
