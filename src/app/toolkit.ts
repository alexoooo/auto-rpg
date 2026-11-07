import { stanceCalibration } from "./stance-calibration.ts";
import { BALANCES } from "./registration/balances.ts";
import { MOTORS } from "./registration/motors.ts";
import { AIMS } from "./registration/aims.ts";
import type { AimConfig, ExecutorConfig, GaitConfig, GuardConfig, LocomotionConfig, SupportConfig } from "../skills/config.ts";
import { EXECUTORS } from "./registration/executors.ts";
import type { TechniqueConfig } from "../skills/recovery/technique.ts";
import { TECHNIQUES } from "./registration/techniques.ts";
import { GUARDS } from "./registration/guards.ts";
import { MIND_KINDS } from "./mind-kinds.ts";
import { LOCOMOTIONS } from "./registration/locomotions.ts";
import { GAIT_PARTS } from "./registration/gait-parts.ts";
import { NAVIGATIONS } from "./registration/navigations.ts";
import { CHOOSERS } from "./registration/option-choosers.ts";
import { OPTION_KINDS } from "./registration/option-kinds.ts";
import { OBJECTIVES } from "./registration/option-objectives.ts";
import { PREDICTIONS } from "./registration/option-predictions.ts";
import type { NavigationConfig } from "../skills/framework/navigation.ts";
import { SUPPORTS } from "./registration/supports.ts";
import { catalogOf, type Catalog, type CatalogLists } from "../minds/catalog.ts";
import type { ConfigOf, Part } from "../parts/parts.ts";
import { REPTILE_PARTS } from "./registration/quadruped-parts.ts";
import type { MoveRuleConfig } from "../skills/locomotion/move-part.ts";
import { MOVE_RULES } from "./registration/move-rules.ts";
import { STRIKE_DATA } from "./data/registration.ts";
import { WALK_RUN_DATA } from "../skills/locomotion/walk-run/data/registration.ts";
import { STAGED_DATA } from "../skills/recovery/implementations/staged/data/registration.ts";
import { RECOVERY_DATA } from "../skills/recovery/data/registration.ts";
import { RIGHTING_DATA } from "../skills/recovery/righting/data/registration.ts";
import { BITE_DATA } from "../skills/strikes/bite/data/registration.ts";
import { LEG_ADAPTERS } from "./registration/leg-adapters.ts";

/** Staged profiles depend on the stock motor calibration as well as their skill record. */
const calibratedStagedData = Object.fromEntries(Object.entries(STAGED_DATA).map(([key, load]) => [key, Object.assign(() => load(), {
  identity(data: unknown, body: string) {
    const record = load.identity ? load.identity(data, body) : data;
    const calibration = stanceCalibration(body);
    return calibration === undefined ? record : { record, calibration };
  },
})]));

/** Every part's config below a mind, by kind. */
type AnyPart = AimConfig | ConfigOf<typeof LEG_ADAPTERS> | ConfigOf<typeof REPTILE_PARTS> | TechniqueConfig | ConfigOf<typeof MOTORS> | MoveRuleConfig | LocomotionConfig | GaitConfig | GuardConfig | SupportConfig | ExecutorConfig | NavigationConfig;

/** A part for each kind a config below a mind names: a kind no list holds fails to compile. */
type LibraryPart = Exclude<AnyPart, { readonly kind: `${string}:${string}` }>;
type Covered = { readonly [K in LibraryPart["kind"]]: Part<Extract<LibraryPart, { kind: K }>> };

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
  const below: Covered = merged(TECHNIQUES, LEG_ADAPTERS, MOVE_RULES, LOCOMOTIONS, GAIT_PARTS, GUARDS, SUPPORTS, EXECUTORS, MOTORS, BALANCES, NAVIGATIONS, AIMS,
    REPTILE_PARTS, CHOOSERS, OPTION_KINDS, OBJECTIVES, PREDICTIONS);
  return { minds: MIND_KINDS, parts: [below], entrants: [], data: [STRIKE_DATA, WALK_RUN_DATA, calibratedStagedData, RECOVERY_DATA, RIGHTING_DATA, BITE_DATA] };
}

/** **The toolkit's catalog**: what the core's own tasks make a mind from; the game's is composed above the core (`src/app/catalog.ts`). */
export const TOOLKIT_CATALOG: Catalog = catalogOf(toolkitLists);
