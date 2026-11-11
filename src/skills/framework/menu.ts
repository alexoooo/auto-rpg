import type { BodyView } from "../../control/body.ts";
import type { MovementRequest, GroundPoint } from "./movement.ts";
import { deepFreeze } from "../../core/state.ts";
import type { ActionAround, Readiness, Region, TargetRef, Window } from "./action.ts";
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
 * it names a window, where the body would stand to act (`spot`, `SpotFinder`, chosen afresh at each
 * read on the side the walk under way goes to), which a leader can walk it to. Out of position where no place
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

/** The refusal of a choice out of position whose window is over a body lying, with no place beside that body clearing the feet (`SpotFinder`). */
const NO_PLACE: Readiness = deepFreeze({ kind: "blocked", reason: "no place beside the body lying clears the feet" });

/** The target of an action on the body itself: none; its executor reads the body. */
const SELF: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/** Whether `a` and `b` are one region: the same mark, or the same segment. */
export const sameRegion = (a: Region | null, b: Region | null): boolean => a !== null && b !== null
  && (a.kind === "mark" ? b.kind === "mark" && a.mark === b.mark : b.kind === "segment" && a.segment === b.segment);

/** **Whether `kit` offers `skill` with `limb` at `region`**: whether its menu holds that choice at a foe (`menuOf`), read from the kit alone. */
export const kitOffers = (kit: readonly KitEntry[], skill: string, limb: string, region: Region): boolean =>
  kit.some((entry) => entry.kind === skill && entry.limbs.includes(limb) && entry.regions.some((one) => sameRegion(one, region)));

/** The kit `actions` make with `executors`: each action with its executor's kind, its limbs and its regions. */
export function kitOf(executors: readonly Pick<ExecutorBinding, "name" | "kind">[], actions: readonly ActionBinding[]): readonly KitEntry[] {
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
 * `readiness` reads it from `around`, and its spot as `spot` finds it (none held) on the side `going`,
 * the walk under way, goes to: a reader that wants a place to stay its choice holds it, and its walk
 * there keeps the side.
 */
export function menuOf(kit: readonly KitEntry[], view: BodyView, around: ActionAround,
  readiness: (view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround) => Readiness, spot: SpotFinder,
  going: MovementRequest | null): readonly MenuEntry[] {
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
      const place = ready.kind === "position" || ready.kind === "ready" && ready.window ? spot(view, ready.window!, around.heading, going) : null;
      if (ready.kind === "position" && !place) { entries.push({ skill, limb, foe: foe.id, region, readiness: NO_PLACE }); continue; }
      entries.push({ skill, limb, foe: foe.id, region, readiness: ready, ...(place ? { spot: place } : {}) });
    }
  }
  return entries;
}

/**
 * **A spot**: where a walk ends on the ground (`x`, `z`) and the way the body faces there (`face`,
 * rad); where the walk goes round a body, the way there (`route`, its last point the spot) and that
 * body (`by`, `MovementRequest`'s). The body stands there within `near` m of it (`ARRIVED` unless
 * given), facing within `facing` rad of its way where that is given. Where the spot moves with a
 * body, its `velocity` on the ground, m/s.
 */
export interface Spot {
  readonly x: number;
  readonly z: number;
  readonly face: number;
  readonly route?: readonly GroundPoint[];
  readonly by?: string;
  readonly near?: number;
  readonly facing?: number;
  readonly velocity?: GroundPoint;
}

/**
 * **Where a body stands to act on `window`**, facing `heading` now: its middle, or beside a body
 * lying, with the way round it, on the side `going`, the walk under way, goes to; null where no
 * place beside that body clears the feet. The composition supplies it.
 */
export type SpotFinder = (view: BodyView, window: Window, heading: number, going: MovementRequest | null) => Spot | null;
