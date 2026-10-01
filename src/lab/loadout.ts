import { armed } from "../core/human/grip.ts";
import { modelSpec } from "../core/human/spec.ts";
import { woodenClub } from "../core/items/club.ts";
import { FIST, heldIn, recipeFor, REPERTOIRE, type Repertoire } from "../core/skills/strikes.ts";
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

/** The points of balance the body of `spec` has: `balance`, the address's, or its character's own. */
export function loadoutBalance(balance: number | null, spec: BodySpec): number {
  return balance ?? spec.attributes.balance.value;
}

/** What the address holds for `points` on the body of `spec`: nothing where they are its character's own. */
export function balanceAddress(points: number, spec: BodySpec): number | null {
  return points === spec.attributes.balance.value ? null : points;
}

/** What the repertoire calls a hand holding `held` (`heldIn`). */
const heldName = (held: LabHeld): string => itemOf(held)?.name ?? FIST;

/** The strikes the body of `spec` has: each thing a hand of it holds that the hand has a recipe for, by the repertoire's name for it. */
export function strikesOf(spec: BodySpec): { readonly held: LabHeld; readonly name: string }[] {
  const strikes = new Map<LabHeld, string>();
  for (const hand of LAB_HANDS) {
    const held = LAB_HELD.find((h) => heldName(h) === heldIn(spec, hand)), chosen = recipeFor(REPERTOIRE, spec, hand);
    if (held && chosen) strikes.set(held, chosen.recipe.held);
  }
  return [...strikes].map(([held, name]) => ({ held, name }));
}

/** Whether a mind barred from the strikes of `barred` may throw a recipe. */
export function allowing(barred: readonly LabHeld[]): (recipe: Repertoire[number]) => boolean {
  const names = barred.map(heldName);
  return (recipe) => !names.includes(recipe.held);
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
