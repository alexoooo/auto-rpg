import { withSoles } from "../core/human/sole.ts";
import { resolveCharacter } from "../core/models.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import { withLoadout, HELD, heldItem, type Held } from "../core/items/held.ts";
import { FIST, heldIn } from "../core/skills/strikes/held-strike.ts";
import type { BodySpec, Side } from "../core/spec/body.ts";
import { LAB_HANDS, type LabLoadout } from "./scenarios.ts";

/**
 * **The body a loadout makes**: the model's body, holding in each hand what the loadout says.
 * A loadout that holds nothing is the model's body itself. Boots and armour are the skin's
 * (`skin.ts`), and make no difference here; a shod loadout's feet give as a shoe's sole (`withSoles`).
 */
export function loadoutAttributes(loadout: LabLoadout & { readonly balance?: number | null }): AttributeOverrides {
  return { ...(loadout.balance != null ? { balance: loadout.balance } : {}), ...(loadout.haste != null ? { haste: loadout.haste } : {}), ...loadout.attributes };
}

/** Construct the Lab's character through the shared resolver, then fit soles and equipment. */
export function loadoutSpec(loadout: LabLoadout): BodySpec {
  const own = resolveCharacter({ model: loadout.model, attributes: loadoutAttributes(loadout) }).spec;
  return withLoadout(loadout.sole ? withSoles(own) : own, { left: loadout.left, right: loadout.right });
}

/** The balance the body of `spec` has, per cent of its weight: `balance`, the address's, or its character's own. */
export function loadoutBalance(balance: number | null, spec: BodySpec): number {
  return balance ?? spec.attributes.balance.value;
}

/** What the core calls a hand holding `held` (`heldIn`). */
const heldName = (held: Held): string => heldItem(held)?.name ?? FIST;

/** The strikes the body of `spec` has: each thing a hand of it holds, by the core's name for it. A hand strikes with whatever it holds. */
export function strikesOf(spec: BodySpec): { readonly held: Held; readonly name: string }[] {
  const strikes = new Map<Held, string>();
  for (const hand of LAB_HANDS) {
    const name = heldIn(spec, hand), held = HELD.find((h) => heldName(h) === name);
    if (held) strikes.set(held, name);
  }
  return [...strikes].map(([held, name]) => ({ held, name }));
}

/** Whether a mind barred from the strikes of `barred` may strike with what a hand holds (`heldIn`). */
export function allowing(barred: readonly Held[]): (held: string) => boolean {
  const names = barred.map(heldName);
  return (held) => !names.includes(held);
}

/** A permitted hand, or an effector outside the Lab's hand-strike switches. */
export const strikeAllowed = (effector: string, strikes: Readonly<Record<Side, boolean>>): boolean =>
  effector === "hand.left" ? strikes.left : effector === "hand.right" ? strikes.right : true;
