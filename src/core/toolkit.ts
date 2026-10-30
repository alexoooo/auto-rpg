import { BALANCES } from "./control/balances.ts";
import { MOTORS } from "./control/motors.ts";
import { AIMS } from "./skills/framework/aims.ts";
import { BEHAVIOURS } from "./tactics/behaviours.ts";
import type { AimConfig, BehaviourConfig, BiteConfig, ExecutorConfig, GaitConfig, GuardConfig, LocomotionConfig, MotorConfig, QuadrupedTacticsConfig, SubMindConfig, SupportConfig, SupportMotorConfig, TacticsConfig } from "./mind/config.ts";
import { EXECUTORS } from "./skills/framework/executors.ts";
import type { TechniqueConfig } from "./recovery/ground/technique.ts";
import { TECHNIQUES } from "./recovery/ground/techniques.ts";
import { GUARDS } from "./skills/guard/guards.ts";
import { MIND_KINDS } from "./mind/kinds.ts";
import { LOCOMOTIONS } from "./skills/framework/locomotions.ts";
import { NAVIGATIONS } from "./navigation/navigations.ts";
import { CHOOSERS } from "./option/choosers.ts";
import { OPTION_KINDS } from "./option/option-kinds.ts";
import { OBJECTIVES } from "./option/objectives.ts";
import { PREDICTIONS } from "./option/predictions.ts";
import type { NavigationConfig } from "./navigation/navigator.ts";
import { PLANNERS } from "./tactics/planners.ts";
import { SUB_MINDS } from "./recovery/sub-minds.ts";
import { SUPPORTS } from "./skills/locomotion/supports.ts";
import { catalogOf, type Catalog, type CatalogLists } from "./parts/catalog.ts";
import type { Part } from "./parts/parts.ts";
import { BITES } from "./reptile/bites.ts";
import { GAITS } from "./reptile/gaits.ts";
import { QUADRUPED_PLANNERS } from "./reptile/planners.ts";
import { SUPPORT_MOTORS } from "./reptile/support-motors.ts";
import type { MoveRuleConfig } from "./skills/locomotion/move-part.ts";
import { MOVE_RULES } from "./skills/locomotion/move-rules.ts";

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
    SUPPORT_MOTORS, GAITS, BITES, QUADRUPED_PLANNERS, CHOOSERS, OPTION_KINDS, OBJECTIVES, PREDICTIONS);
  return { minds: MIND_KINDS, parts: [below], entrants: [] };
}

/** **The toolkit's catalog**: what the core's own tasks make a mind from; the game's is composed above the core (`src/entrants/game.ts`). */
export const TOOLKIT_CATALOG: Catalog = catalogOf(toolkitLists);
