import type { AttributeSpec, BodySpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";
import type { HumanFigure } from "./figure.ts";
import type { WorkshopModel } from "./rig.ts";

/** A human figure's attributes: the figure's. */
export function humanAttributes(figure: HumanFigure): AttributeSpec {
  return { balance: figure.balance, haste: figure.haste };
}

/** A human's haste: its legs' muscles at a person's speed. Every character's, the owner's. */
export const HUMAN_HASTE = sourced(100, "%", "owner-haste", "every character 100");

/** `figure` with its haste `haste` per cent, a bout's or an experiment's in place of its character's; `figure` itself where none is given. */
export function hastedFigure(figure: HumanFigure, haste?: number): HumanFigure {
  if (haste === undefined) return figure;
  if (!validHaste(haste)) throw new Error(`a haste is a positive per cent: ${haste}`);
  return { ...figure, haste: sourced(haste, "%", "owner-haste", "a bout's haste") };
}

/** A haste is a finite per cent over none. */
export function validHaste(haste: number): boolean {
  return Number.isFinite(haste) && haste > 0;
}

/** How many times a human's speed the legs of `spec` turn at by its haste: 1 at a human's. */
export function hasteOver(spec: BodySpec): number {
  return spec.attributes.haste.value / HUMAN_HASTE.value;
}

/** A workshop model's balance, per cent of its weight, the owner's. */
export function workshopBalance(model: WorkshopModel): Quantity<number> {
  switch (model) {
    case "workshop-fighter": return sourced(0, "%", "owner-balance", "Warrior 0");
    case "workshop-rogue": return sourced(0, "%", "owner-balance", "Rogue 0");
    default: { const never: never = model; throw new Error(`no balance for ${String(never)}`); }
  }
}
