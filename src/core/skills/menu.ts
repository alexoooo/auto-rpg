import type { BodyView } from "../body.ts";
import { windowSpot, type Spot } from "../mind/action-window.ts";
import { deepFreeze } from "../state.ts";
import type { ActionAround, Readiness, Region, TargetRef } from "./action.ts";
import type { ActionBinding, ExecutorBinding } from "./action-instances.ts";

/**
 * **An action a body has**, as its skills bind it: its name, its executor's kind (what the skill
 * is, named alike across minds: `recipe-strike`, `straight-punch`, `front-kick`), the limbs it may
 * be asked with, and the regions it aims at (none: it acts on the body itself, as a rise does).
 */
export interface KitEntry {
  readonly action: string;
  readonly kind: string;
  readonly limbs: readonly string[];
  readonly regions: readonly Region[];
}

/**
 * **A choice a body has now**: an action of its kit with one of its limbs, at a foe's region (both
 * null for an action on the body itself), and whether it could start from where the body stands
 * (`Readiness`: ready; out of position, with the window; waiting; refused, with the reason); where
 * it names a window, where the body would stand in its middle (`spot`, `windowSpot`: beside a body
 * lying, with the way round it), which a leader can walk it to.
 */
export interface MenuEntry {
  readonly action: string;
  readonly limb: string;
  readonly foe: string | null;
  readonly region: Region | null;
  readonly readiness: Readiness;
  readonly spot?: Spot;
}

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
 * of another side) and each region it aims at, or once for an action on the body itself, its
 * readiness as `readiness` reads it from `around`. It reads and changes nothing.
 */
export function menuOf(kit: readonly KitEntry[], view: BodyView, around: ActionAround,
  readiness: (view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround) => Readiness): readonly MenuEntry[] {
  const foes = view.senses.others.filter((other) => !other.out && other.side !== view.senses.side), entries: MenuEntry[] = [];
  for (const { action, limbs, regions } of kit) for (const limb of limbs) {
    if (regions.length === 0) { entries.push({ action, limb, foe: null, region: null, readiness: readiness(view, action, limb, SELF, around) }); continue; }
    for (const foe of foes) for (const region of regions) {
      const ready = readiness(view, action, limb, { kind: "body", body: foe.id, region }, around);
      entries.push({ action, limb, foe: foe.id, region, readiness: ready, ...(ready.kind === "position" || ready.kind === "ready" && ready.window ? { spot: windowSpot(view, ready.window!, around.heading) } : {}) });
    }
  }
  return entries;
}
