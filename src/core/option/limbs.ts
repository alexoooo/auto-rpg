import type { PartLookup } from "../parts/lookup.ts";
import type { PartConfig } from "../parts/parts.ts";
import { strikersOf, type BodySpec, type Side } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";

/**
 * **The limbs an Option strikes with, by role**: either hand, a hand that holds nothing, the hand
 * that holds an item, either foot, or the jaw (a striker that is neither hand nor foot). A config
 * names a role, never a body's limb: each body makes one Option of each of its limbs that fits.
 */
export type LimbRole = "either-hand" | "free-hand" | "holding-hand" | "either-foot" | "jaw";

/** Every limb role, with what a person calls it: the field an Option's editor offers. */
export const LIMB_ROLES: readonly (readonly [LimbRole, string])[] = deepFreeze([["either-hand", "Either hand"], ["free-hand", "A free hand"],
  ["holding-hand", "The hand that holds the item"], ["either-foot", "Either foot"], ["jaw", "The jaw"]]);

/** The sides, the right first: the order a body's limbs of a role are offered in. */
const SIDES: readonly Side[] = Object.freeze(["right", "left"]);

/** Whether `segment` of `spec` holds an item. */
const holds = (spec: BodySpec, segment: string): boolean => spec.held?.some((held) => held.segment === segment) ?? false;

/** The limbs of `spec` of `role`, by its strikers (`strikersOf`), the right first. */
function ofRole(spec: BodySpec, role: LimbRole): readonly string[] {
  const strikers = strikersOf(spec), sided = (limb: string) => SIDES.map((side) => `${limb}.${side}`).filter((name) => strikers.includes(name));
  switch (role) {
    case "either-hand": return sided("hand");
    case "free-hand": return sided("hand").filter((hand) => !holds(spec, hand));
    case "holding-hand": return sided("hand").filter((hand) => holds(spec, hand));
    case "either-foot": return sided("foot");
    case "jaw": return strikers.filter((name) => !name.startsWith("hand.") && !name.startsWith("foot."));
    default: { const never: never = role; throw new Error(`no limb role ${String(never)}`); }
  }
}

/**
 * **The limbs of `spec` an Option of `role` strikes with by the executor `skill`**: those of the
 * role (`ofRole`) the executor strikes with as the body holds what it holds (`ExecutorPart.effectors`,
 * `ExecutorPart.strikesWith`), the right first; none where the body has none.
 */
export function limbsOf(parts: PartLookup, spec: BodySpec, role: LimbRole, skill: PartConfig): readonly string[] {
  const part = parts.of("executor", skill);
  return ofRole(spec, role).filter((limb) => part.effectors.includes(limb) && (part.strikesWith?.(spec, skill, limb) ?? true));
}

/** Whether `value` is a limb role. */
export const isLimbRole = (value: unknown): value is LimbRole => LIMB_ROLES.some(([role]) => role === value);
