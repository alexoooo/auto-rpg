import { modelSpec } from "../core/models.ts";
import { armedWith, HELD, heldItem, type Held } from "../core/items/held.ts";
import { FIST, heldIn } from "../core/skills/strikes.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { LAB_HANDS, type LabLoadout } from "./scenarios.ts";

/**
 * **The body a loadout makes**: the model's body, holding in each hand what the loadout says.
 * A loadout that holds nothing is the model's body itself. Boots and armour are the skin's
 * (`skin.ts`), and make no difference here.
 */
export function loadoutSpec(loadout: LabLoadout): BodySpec {
  let spec = modelSpec(loadout.model);
  for (const side of LAB_HANDS) spec = armedWith(spec, side, loadout[side]);
  return spec;
}

/** The balance the body of `spec` has, per cent of its weight: `balance`, the address's, or its character's own. */
export function loadoutBalance(balance: number | null, spec: BodySpec): number {
  return balance ?? spec.attributes.balance.value;
}

/** What the address holds for a `balance` on the body of `spec`: nothing where it is its character's own. */
export function balanceAddress(balance: number, spec: BodySpec): number | null {
  return balance === spec.attributes.balance.value ? null : balance;
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
