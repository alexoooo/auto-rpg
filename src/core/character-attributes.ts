import { deepFreeze } from "./state.ts";

/** A character's configurable capabilities, before its model turns them into sourced anatomy. */
export interface CharacterAttributes {
  readonly size: number;
  readonly weight: number;
  readonly strength: number;
  readonly speed: number;
  readonly hp: number;
  readonly balance: number;
  readonly haste: number;
}

export type AttributeOverrides = Readonly<Partial<CharacterAttributes>>;
export type AttributeName = keyof CharacterAttributes;
/** An attribute as the editor shows it: its label, unit, increment and help. */
interface AttributeInfo { readonly label: string; readonly unit: string; readonly step: number; readonly help: string }

/** The shared editor's order, kinds, units and increments; increments guide editing without limiting precision. */
export const CHARACTER_ATTRIBUTES = deepFreeze({
  size: { label: "Size", unit: "×", step: .05, help: "Body dimensions; mass and muscle torque scale with size cubed." },
  weight: { label: "Weight", unit: "×", step: .05, help: "Mass and breadth, with the same muscle strength and limb lengths." },
  strength: { label: "Strength", unit: "×", step: .05, help: "Peak torque of every muscle." },
  speed: { label: "Speed", unit: "×", step: .05, help: "Unloaded contraction speed of every muscle." },
  hp: { label: "Hit points", unit: "HP", step: 1, help: "Total hit points distributed among body parts." },
  balance: { label: "Balance", unit: "%", step: 5, help: "External stabilizing assistance as a percentage of body weight; 0 is unassisted." },
  haste: { label: "Haste", unit: "%", step: 10, help: "Increase in leg muscle speed; +50 makes them 1.5 times as fast." },
} satisfies { readonly [K in AttributeName]: AttributeInfo });

/** Why an attribute's value cannot build a character; null for a valid value. */
export function attributeError(name: AttributeName, value: unknown): string | null {
  const label = CHARACTER_ATTRIBUTES[name].label;
  if (typeof value !== "number" || !Number.isFinite(value)) return `${label} must be a finite number.`;
  switch (name) {
    case "balance": return value >= 0 ? null : "Balance must be zero or greater.";
    case "haste": return value > -100 ? null : "Haste must be greater than −100 %.";
    case "size": case "weight": case "strength": case "speed": case "hp":
      return value > 0 ? null : `${label} must be greater than zero.`;
    default: { const never: never = name; throw new Error(`unknown attribute ${String(never)}`); }
  }
}

/** Reject malformed programmatic configurations as well as invalid values. */
export function validateAttributes(attributes: AttributeOverrides): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (!Object.hasOwn(CHARACTER_ATTRIBUTES, name)) throw new Error(`Unknown attribute: ${name}`);
    if (value === undefined) continue;
    const error = attributeError(name as AttributeName, value);
    if (error) throw new Error(error);
  }
}
