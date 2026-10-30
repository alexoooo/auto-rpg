import { BALANCES } from "./control/balances.ts";
import { MOTORS } from "./control/motors.ts";
import { AIMS } from "./mind/aims.ts";
import { BEHAVIOURS } from "./mind/behaviours.ts";
import type { AimConfig, BehaviourConfig, BiteConfig, ExecutorConfig, GaitConfig, GuardConfig, LocomotionConfig, MotorConfig, QuadrupedTacticsConfig, SubMindConfig, SupportConfig, SupportMotorConfig, TacticsConfig } from "./mind/config.ts";
import { EXECUTORS } from "./mind/executors.ts";
import type { TechniqueConfig } from "./mind/ground/technique.ts";
import { TECHNIQUES } from "./mind/ground/techniques.ts";
import { GUARDS } from "./mind/guards.ts";
import { MIND_KINDS } from "./mind/kinds.ts";
import { LOCOMOTIONS } from "./mind/locomotions.ts";
import { NAVIGATIONS } from "./mind/navigations.ts";
import { CHOOSERS } from "./option/choosers.ts";
import { OPTION_KINDS } from "./option/option-kinds.ts";
import { POSITIONS } from "./option/positions.ts";
import { PREDICTIONS } from "./option/predictions.ts";
import type { NavigationConfig } from "./mind/navigator.ts";
import { PLANNERS } from "./mind/planners.ts";
import { SUB_MINDS } from "./mind/sub-minds.ts";
import { SUPPORTS } from "./mind/supports.ts";
import { catalogOf, type Catalog, type CatalogLists } from "./parts/catalog.ts";
import type { Part } from "./parts/parts.ts";
import { BITES } from "./reptile/bites.ts";
import { GAITS } from "./reptile/gaits.ts";
import { QUADRUPED_PLANNERS } from "./reptile/planners.ts";
import { SUPPORT_MOTORS } from "./reptile/support-motors.ts";
import type { MoveRuleConfig } from "./skills/move-part.ts";
import { MOVE_RULES } from "./skills/move-rules.ts";

/** Every part's config below a mind, by kind. */
type AnyPart = AimConfig | SupportMotorConfig | GaitConfig | BiteConfig | QuadrupedTacticsConfig | TechniqueConfig | MotorConfig | SubMindConfig | TacticsConfig | BehaviourConfig | MoveRuleConfig | LocomotionConfig | GuardConfig | SupportConfig | ExecutorConfig | NavigationConfig;

/** A part for each kind a config below a mind names: a kind no list holds fails to compile. */
type Covered = { readonly [K in AnyPart["kind"]]: Part<Extract<AnyPart, { kind: K }>> };

/** What `lists` hold together, each list's own entries. */
type Merged<L> = L extends readonly [infer H, ...infer R] ? H & Merged<R> : unknown;

/** `lists` as one list by kind; a thrown error for a kind two of them name. */
function merged<L extends readonly Readonly<Record<string, Part>>[]>(...lists: L): Merged<L> {
  const out: Record<string, Part> = {};
  for (const list of lists) for (const [kind, part] of Object.entries(list)) {
    if (Object.hasOwn(out, kind)) throw new Error(`two role lists name ${JSON.stringify(kind)}`);
    out[kind] = part;
  }
  return out as Merged<L>;
}

/**
 * **What the toolkit offers** (`CatalogLists`): its kinds of mind (`MIND_KINDS`) and each role's
 * list of parts below a mind, read when asked so a part's module may be read in any order.
 */
export function toolkitLists(): CatalogLists {
  const below: Covered = merged(SUB_MINDS, TECHNIQUES, PLANNERS, BEHAVIOURS, MOVE_RULES, LOCOMOTIONS, GUARDS, SUPPORTS, EXECUTORS, MOTORS, BALANCES, NAVIGATIONS, AIMS,
    SUPPORT_MOTORS, GAITS, BITES, QUADRUPED_PLANNERS, CHOOSERS, OPTION_KINDS, POSITIONS, PREDICTIONS);
  return { minds: MIND_KINDS, parts: [below] };
}

/** **The toolkit's catalog**: what the core's own tasks make a mind from; the game's is composed above the core (`src/entrants/game.ts`). */
export const TOOLKIT_CATALOG: Catalog = catalogOf(toolkitLists);
