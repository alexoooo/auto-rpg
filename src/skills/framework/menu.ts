import type { BodyView } from "../../control/body.ts";
import { windowSpot, type Spot } from "../intent/action-window.ts";
import type { MovementRequest } from "../intent/movement.ts";
import { deepFreeze } from "../../core/state.ts";
import type { ActionAround, Readiness, Region, TargetRef } from "./action.ts";
import type { ActionBinding, ExecutorBinding } from "./action-instances.ts";

/**
 * **An action a body has**, as its skills bind it: its name, its executor's kind (what the skill
 * is, named alike across minds: `straight-punch`, `club-blow`, `stomp`), the limbs it may
 * be asked with, and the regions it aims at (none: it acts on the body itself, as a rise does).
 */
export interface KitEntry {
  readonly action: string;
  readonly kind: string;
  readonly limbs: readonly string[];
  readonly regions: readonly Region[];
}

/** **The skill `action` of `kit` is by** (`KitEntry.kind`), null where the kit has no such action. */
export const skillOf = (kit: readonly KitEntry[], action: string): string | null => kit.find((entry) => entry.action === action)?.kind ?? null;

/**
 * **A choice a body has now**: a skill it has (`KitEntry.kind`, what an order names) with one of its
 * limbs, at a foe's region (both null for a skill on the body itself), and whether it could start from where the body stands
 * (`Readiness`: ready; out of position, with the window; waiting; refused, with the reason); where
 * it names a window, where the body would stand in its middle (`spot`, `windowSpot`: beside a body
 * lying, with the way round it, chosen afresh at each read on the side the walk under way goes to), which a leader can walk it to. Out of position where no place
 * beside the body lying clears the feet, it is refused (`NO_PLACE`).
 */
export interface MenuEntry {
  readonly skill: string;
  readonly limb: string;
  readonly foe: string | null;
  readonly region: Region | null;
  readonly readiness: Readiness;
  readonly spot?: Spot;
}

/** The refusal of a choice out of position whose window is over a body lying, with no place beside that body clearing the feet (`windowSpot`). */
const NO_PLACE: Readiness = deepFreeze({ kind: "blocked", reason: "no place beside the body lying clears the feet" });

/** The target of an action on the body itself: none; its executor reads the body. */
const SELF: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/** The kit `actions` make with `executors`: each action with its executor's kind, its limbs and its regions. */
export function kitOf(executors: readonly ExecutorBinding[], actions: readonly ActionBinding[]): readonly KitEntry[] {
  const kinds = new Map(executors.map((one) => [one.name, one.kind]));
  return deepFreeze(actions.map((action): KitEntry => {
    const kind = kinds.get(action.executor);
    if (kind === undefined) throw new Error(`action ${action.name} names no executor of the kit: ${action.executor}`);
    return { action: action.name, kind, limbs: [...action.effectors], regions: [...action.regions ?? []] };
  }));
}

/**
 * **The menu**: for each action of `kit`, each of its limbs, each foe `view` senses (in the fight,
 * of another side) and each region it aims at, or once for an action on the body itself, its skill
 * with that limb and target (once: of two actions by one skill, the first's), its readiness as
 * `readiness` reads it from `around`, and its spot, the place beside a body lying
 * chosen afresh (`windowSpot`, none held) on the side of it `going`, the walk under way, goes to: a
 * reader that wants a place to stay its choice holds it, and its walk there keeps the side.
 */
export function menuOf(kit: readonly KitEntry[], view: BodyView, around: ActionAround,
  readiness: (view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround) => Readiness, going: MovementRequest | null): readonly MenuEntry[] {
  const foes = view.senses.others.filter((other) => !other.out && other.side !== view.senses.side), entries: MenuEntry[] = [];
  const listed = (skill: string, limb: string, foe: string | null, region: Region | null): boolean =>
    entries.some((entry) => entry.skill === skill && entry.limb === limb && entry.foe === foe && JSON.stringify(entry.region) === JSON.stringify(region));
  for (const { action, kind: skill, limbs, regions } of kit) for (const limb of limbs) {
    if (regions.length === 0) {
      if (!listed(skill, limb, null, null)) entries.push({ skill, limb, foe: null, region: null, readiness: readiness(view, action, limb, SELF, around) });
      continue;
    }
    for (const foe of foes) for (const region of regions) {
      if (listed(skill, limb, foe.id, region)) continue;
      const ready = readiness(view, action, limb, { kind: "body", body: foe.id, region }, around);
      const spot = ready.kind === "position" || ready.kind === "ready" && ready.window ? windowSpot(view, ready.window!, around.heading, null, undefined, going) : null;
      if (ready.kind === "position" && !spot) { entries.push({ skill, limb, foe: foe.id, region, readiness: NO_PLACE }); continue; }
      entries.push({ skill, limb, foe: foe.id, region, readiness: ready, ...(spot ? { spot } : {}) });
    }
  }
  return entries;
}
