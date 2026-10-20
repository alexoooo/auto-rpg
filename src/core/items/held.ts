import { armed, canHold } from "../human/grip.ts";
import type { BodySpec, ItemSpec, Side } from "../spec/body.ts";
import { woodenClub } from "./club.ts";
import { buckler } from "./buckler.ts";
import { shortSword } from "./sword.ts";

/** Every one-handed item the shared loadout catalog offers, and an empty hand. */
export const HELD = ["empty", "club", "buckler", "sword"] as const;
export type Held = (typeof HELD)[number];

/** What each hand carries; hand names are independent of a fighter's side in a bout. */
export type Loadout = Readonly<Record<Side, Held>>;
export const EMPTY_LOADOUT: Loadout = Object.freeze({ left: "empty", right: "empty" });

/** Every one-handed catalog assignment, with the left hand named first. */
export const LOADOUTS: readonly Loadout[] = Object.freeze(HELD.flatMap((left) => HELD.map((right) => Object.freeze({ left, right }))));

/**
 * **The loadouts minds are rated on**, by the owner's choice: bare hands, the club, the club and
 * buckler, the sword, the sword and buckler, each item in the hand it is made for. The rest of
 * `LOADOUTS` is unseen: no mind is rated on it, and how a mind carries to it is read apart.
 */
export const REPRESENTATIVE: readonly Loadout[] = Object.freeze(([["empty", "empty"], ["empty", "club"], ["buckler", "club"], ["empty", "sword"], ["buckler", "sword"]] as const)
  .map(([left, right]) => LOADOUTS.find((loadout) => loadout.left === left && loadout.right === right)!));

/** Stable identity for both hands in match conditions and notes. */
export const loadoutKey = (loadout: Loadout): string => `${loadout.left},${loadout.right}`;

/** Refuse unknown hands, missing hands and items the current catalog does not name. */
export function loadoutFaults(loadout: Loadout): readonly string[] {
  if (typeof loadout !== "object" || loadout === null) return ["a loadout names both hands"];
  return [
    ...Object.keys(loadout).filter((key) => key !== "left" && key !== "right").map((key) => `no hand called ${key}`),
    ...(["left", "right"] as const).filter((hand) => !HELD.includes(loadout[hand])).map((hand) => `${hand} hand holds no item called ${String(loadout[hand])}`),
  ];
}

/** The item `held` names; null for an empty hand. */
export function heldItem(held: Held): ItemSpec | null {
  switch (held) {
    case "empty": return null;
    case "club": return woodenClub();
    case "buckler": return buckler();
    case "sword": return shortSword();
    default: {
      const never: never = held;
      throw new Error(`a hand holds nothing called ${String(never)}`);
    }
  }
}

/** What `hand` of `spec` holds, by `HELD`'s name; null for an item none of them names. */
export function heldBy(spec: BodySpec, hand: Side): Held | null {
  const item = spec.held?.find((h) => h.segment === `hand.${hand}`)?.item;
  return item ? HELD.find((held) => heldItem(held)?.name === item.name) ?? null : "empty";
}

/** Whether the `hand` of `spec` can hold `held`: anything can hold nothing, and only a hand that closes on a haft (`canHold`) a club. */
const canHoldIn = (spec: BodySpec, hand: Side, held: Held): boolean => held === "empty" || canHold(spec, hand);

/** `spec` with `held` in its `hand`; a body whose hand cannot hold it is refused (`canHoldIn`). */
export function armedWith(spec: BodySpec, hand: Side, held: Held): BodySpec {
  if (!canHoldIn(spec, hand, held)) throw new Error(`${spec.model}'s ${hand} hand cannot hold ${held}`);
  const item = heldItem(held), kept = (spec.held ?? []).filter(({ segment }) => segment !== `hand.${hand}`);
  const bare = kept.length === (spec.held ?? []).length ? spec : { ...spec, held: kept };
  return item ? armed(bare, hand, item) : bare;
}

/** Build both rigid holdings from the same named loadout used by recipes and selectors. */
export function withLoadout(spec: BodySpec, loadout: Loadout): BodySpec {
  const faults = loadoutFaults(loadout);
  if (faults.length) throw new Error(faults.join("; "));
  return armedWith(armedWith(spec, "left", loadout.left), "right", loadout.right);
}
