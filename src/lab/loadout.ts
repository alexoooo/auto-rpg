import { armed } from "../core/human/grip.ts";
import { modelSpec } from "../core/models.ts";
import { woodenClub } from "../core/items/club.ts";
import { FIST, heldIn } from "../core/skills/strikes.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { LAB_HANDS, LAB_HELD, type LabHeld, type LabLoadout } from "./scenarios.ts";

/**
 * **The body a loadout makes**: the model's body, holding in each hand what the loadout says.
 * A loadout that holds nothing is the model's body itself. Boots and armour are the skin's
 * (`skin.ts`), and make no difference here.
 */
export function loadoutSpec(loadout: LabLoadout): BodySpec {
  let spec = modelSpec(loadout.model);
  for (const side of LAB_HANDS) {
    const item = itemOf(loadout[side]);
    if (item) spec = armed(spec, side, item);
  }
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
const heldName = (held: LabHeld): string => itemOf(held)?.name ?? FIST;

/** The strikes the body of `spec` has: each thing a hand of it holds, by the core's name for it. A hand strikes with whatever it holds. */
export function strikesOf(spec: BodySpec): { readonly held: LabHeld; readonly name: string }[] {
  const strikes = new Map<LabHeld, string>();
  for (const hand of LAB_HANDS) {
    const name = heldIn(spec, hand), held = LAB_HELD.find((h) => heldName(h) === name);
    if (held) strikes.set(held, name);
  }
  return [...strikes].map(([held, name]) => ({ held, name }));
}

/** Whether a mind barred from the strikes of `barred` may strike with what a hand holds (`heldIn`). */
export function allowing(barred: readonly LabHeld[]): (held: string) => boolean {
  const names = barred.map(heldName);
  return (held) => !names.includes(held);
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
