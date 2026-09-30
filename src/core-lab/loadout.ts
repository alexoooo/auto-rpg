import { armed } from "../core/human/grip.ts";
import { modelSpec } from "../core/human/spec.ts";
import { woodenClub } from "../core/items/club.ts";
import type { BodySpec } from "../core/spec/body.ts";
import type { LabHeld, LabLoadout } from "./scenarios.ts";

/**
 * **The body a loadout makes**: the model's body, holding in each hand what the loadout says.
 * A loadout that holds nothing is the model's body itself. Boots and armour are the skin's
 * (`skin.ts`), and make no difference here.
 */
export function loadoutSpec(loadout: LabLoadout): BodySpec {
  let spec = modelSpec(loadout.model);
  for (const side of ["right", "left"] as const) {
    const item = itemOf(loadout[side]);
    if (item) spec = armed(spec, side, item);
  }
  return spec;
}

function itemOf(held: LabHeld) {
  switch (held) {
    case "empty": return null;
    case "club": return woodenClub();
    default: {
      const never: never = held;
      throw new Error(`no item ${String(never)}`);
    }
  }
}
