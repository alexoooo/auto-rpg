import type { AttributeSpec, BodySpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";
import type { HumanFigure } from "./figure.ts";
import type { WorkshopModel } from "./rig.ts";
import { attributeError } from "../character-attributes.ts";

/** A human figure's attributes: the figure's. */
export function humanAttributes(figure: HumanFigure): AttributeSpec {
  return { balance: figure.balance, haste: figure.haste };
}

/** A human's haste: its legs' muscles at a person's speed, nothing over it. Every character's, the owner's. */
export const HUMAN_HASTE = sourced(0, "%", "owner-haste", "every character 0");

/** `figure` with its haste `haste` per cent over a person's, a bout's or an experiment's in place of its character's; `figure` itself where none is given. */
export function hastedFigure(figure: HumanFigure, haste?: number): HumanFigure {
  if (haste === undefined) return figure;
  if (attributeError("haste", haste)) throw new Error(`a haste is a finite per cent over a person's, above -100: ${haste}`);
  return { ...figure, haste: sourced(haste, "%", "owner-haste", "a bout's haste") };
}

/** The haste `text` writes, a per cent over a person's with an optional sign; null for anything else. */
export function hasteFrom(text: string): number | null {
  const haste = /^[+-]?\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN;
  return attributeError("haste", haste) === null ? haste : null;
}

/** A haste written for a reader, signed: `+50`, `-20`, `0`. */
export function hasteText(haste: number): string {
  return haste > 0 ? `+${haste}` : String(haste);
}

/** How many times a human's speed the legs of `spec` turn at by its haste: 1 at a human's, 1.5 at +50 %. */
export function hasteOver(spec: BodySpec): number {
  return 1 + spec.attributes.haste.value / 100;
}

/** A workshop model's balance, per cent of its weight, the owner's. */
export function workshopBalance(model: WorkshopModel): Quantity<number> {
  switch (model) {
    case "workshop-fighter": return sourced(0, "%", "owner-balance", "Warrior 0");
    case "workshop-rogue": return sourced(0, "%", "owner-balance", "Rogue 0");
    default: { const never: never = model; throw new Error(`no balance for ${String(never)}`); }
  }
}
