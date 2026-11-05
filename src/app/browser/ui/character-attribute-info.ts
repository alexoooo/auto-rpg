import { deepFreeze } from "../../../core/world/state.ts";
import type { AttributeName } from "../../../core/bodies/character-attributes.ts";

/** An attribute as the editor shows it: its label, unit, increment and help. */
interface AttributeInfo { readonly label: string; readonly unit: string; readonly step: number; readonly help: string }

/** The shared editor's order, kinds, units and increments; increments guide editing without limiting precision. */
export const CHARACTER_ATTRIBUTES = deepFreeze({
  size: { label: "Size", unit: "×", step: .05, help: "Body dimensions; mass and muscle torque scale with size cubed." },
  weight: { label: "Weight", unit: "×", step: .05, help: "Mass and breadth, with the same muscle strength and limb lengths." },
  strength: { label: "Strength", unit: "×", step: .05, help: "Peak torque of every muscle." },
  speed: { label: "Speed", unit: "×", step: .05, help: "Unloaded contraction speed of every muscle." },
  hp: { label: "Hit points", unit: "HP", step: 1, help: "The life bar: a blow takes its damage from it, twice on the head, half on a limb." },
  balance: { label: "Balance", unit: "%", step: 5, help: "External stabilizing assistance as a percentage of body weight; 0 is unassisted." },
  haste: { label: "Haste", unit: "%", step: 10, help: "Increase in leg muscle speed; +50 makes them 1.5 times as fast." },
} satisfies { readonly [K in AttributeName]: AttributeInfo });
