import { resolveCharacter } from "../../core/bodies/models.ts";
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import { withLoadout } from "../../core/bodies/items/held.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { LabLoadout } from "./scenarios.ts";

/**
 * **The body a loadout makes**: the model's body, holding in each hand what the loadout says.
 * A loadout that holds nothing is the model's body itself. Boots and armour are the skin's
 * (`skin.ts`), and make no difference here.
 */
export function loadoutAttributes(loadout: LabLoadout & { readonly balance?: number | null }): AttributeOverrides {
  return { ...(loadout.balance != null ? { balance: loadout.balance } : {}), ...(loadout.haste != null ? { haste: loadout.haste } : {}), ...loadout.attributes };
}

/** Construct the Lab's character through the shared resolver, then fit its equipment. */
export function loadoutSpec(loadout: LabLoadout): BodySpec {
  const own = resolveCharacter({ model: loadout.model, attributes: loadoutAttributes(loadout) }).spec;
  return withLoadout(own, { left: loadout.left, right: loadout.right });
}

/** The balance the body of `spec` has, per cent of its weight: `balance`, the address's, or its character's own. */
export function loadoutBalance(balance: number | null, spec: BodySpec): number {
  return balance ?? spec.attributes.balance.value;
}
