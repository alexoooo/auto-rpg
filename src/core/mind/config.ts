import type { StandUpConfig } from "./ground/stand-up.ts";
import type { SUB_MINDS } from "./sub-minds.ts";
import type { EXECUTORS } from "./executors.ts";
import type { GUARDS } from "./guards.ts";
import type { SUPPORTS } from "./supports.ts";
import type { MOTORS } from "../control/motors.ts";
import type { REPTILE_BITE } from "../reptile/tuning.ts";
import { KICK_PATH, type KickTuning } from "../skills/kick.ts";
import type { LOCOMOTIONS } from "./locomotions.ts";
import type { BEHAVIOURS as BEHAVIOUR_LIST } from "./behaviours.ts";
import type { PLANNERS } from "./planners.ts";
import type { MoveConfig } from "../skills/move-part.ts";
import type { ConfigOf, PartConfig } from "../parts/parts.ts";
import type { OpeningTuning } from "./openings.ts";
import { deepFreeze } from "../state.ts";
import type { AIMS } from "./aims.ts";
import type { SUPPORT_MOTORS } from "../reptile/support-motors.ts";
import type { GAITS } from "../reptile/gaits.ts";
import type { BITES } from "../reptile/bites.ts";
import type { QUADRUPED_PLANNERS } from "../reptile/planners.ts";
import type { Region } from "../skills/action.ts";

/** **A stock sub-mind's config**, by kind (`SUB_MINDS`). */
export type SubMindConfig = ConfigOf<typeof SUB_MINDS>;

/** **A stock motor control's config**, by kind (`MOTORS`). */
export type MotorConfig = ConfigOf<typeof MOTORS>;

/** **The legs' skill's config**, by kind (`LOCOMOTIONS`). */
export type LocomotionConfig = ConfigOf<typeof LOCOMOTIONS>;

/** Focus is selected once for all behaviours in a control step. */
export type FocusRuleConfig = { readonly kind: "ordered" | "current" } | { readonly kind: "nearest"; readonly prefer: "standing" | "standing-first" };

/** Shared conditions read detached tactical facts. */
export type ConditionConfig = { readonly kind: "always" | "when-standing" | "target-down" }
  | { readonly kind: "when-distance"; readonly of: "foe" | "destination" | "ally"; readonly than: "under" | "over"; readonly metres: number }
  | { readonly kind: "follow-up"; readonly seconds: number };

/** A selector chooses configured action names and retains a choice within bounded patience. */
export type SelectorConfig = ({ readonly kind: "first-ready" | "rotate" | "scored" | "estimate" }
  | { readonly kind: "rules"; readonly rules: readonly { readonly when: ConditionConfig; readonly actions: readonly string[] }[]; readonly otherwise: readonly string[] })
  & { readonly rethink: number; readonly patience: number };

/** **A behaviour's config**, by kind (`BEHAVIOURS`): one part of the shared tactical intent. */
export type BehaviourConfig = ConfigOf<typeof BEHAVIOUR_LIST>;

/** Ranked behaviours share focus, selection and action instances. */
export interface BehavioursConfig {
  readonly kind: "behaviours";
  readonly target: readonly FocusRuleConfig[];
  readonly choose: SelectorConfig;
  readonly list: readonly BehaviourConfig[];
}

/** **The tactics' config**, by kind (`PLANNERS`). */
export type TacticsConfig = ConfigOf<typeof PLANNERS>;

/** **An executor's config**, by kind (`EXECUTORS`): its settings and the name its actions call it by. */
export type ExecutorConfig = ConfigOf<typeof EXECUTORS>;

/** **Any executor's config** (`ExecutorPart`): its kind, of any part of the role a mind may hold, and the name its actions call it by. */
export interface ExecutorEntry extends PartConfig { readonly name: string }

/** **A stock aim's config**, by kind (`AIMS`). */
export type AimConfig = ConfigOf<typeof AIMS>;

/**
 * **A configured action**: its name, the executor that carries it out and the effectors it may
 * strike with. Where its executor aims (`ExecutorPart.aims`), the regions it strikes, in order,
 * and its aim, any part of the role (`AimPart`). Its other settings are its executor's
 * (`ExecutorPart.actionKeys`): the path strike's path (`PathActionConfig`), and `lower`, the
 * support height a low blow is thrown from, which planners read to tell a low blow.
 */
export interface ActionConfig {
  readonly name: string;
  readonly executor: string;
  readonly effectors: readonly string[];
  readonly regions?: readonly Region[];
  readonly aim?: AimConfig | PartConfig;
  readonly lower?: number;
}



/** **A stock guard's config**, by kind (`GUARDS`). */
export type GuardConfig = ConfigOf<typeof GUARDS>;

/** **A stock low support's config**, by kind (`SUPPORTS`). */
export type SupportConfig = ConfigOf<typeof SUPPORTS>;

/** A fighter shares named executors across its configured actions. */
export interface FighterConfig {
  readonly kind: "fighter";
  readonly tactics: TacticsConfig;
  readonly locomotion: LocomotionConfig;
  /** Its navigation, any part of the role (`navigatorOf`): the game's where it names none. */
  readonly navigation?: PartConfig;
  /** Its guard, any part of the role (`GuardPart`): the arms' rest and cover. */
  readonly guard: PartConfig;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  /** Its low support, any part of the role (`SupportPart`), or none. */
  readonly support: PartConfig | null;
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly PartConfig[];
  /** What turns its skills' goals into its muscles' command, any part of the role; the game's (`motorOf`) where it names none. */
  readonly motor?: PartConfig | null;
}

/** **What a body's skills are made from** (`fighterSkills`): its legs, its guard, its low support, its executors and the actions they carry out. */
export type SkillKit = Pick<FighterConfig, "locomotion" | "navigation" | "guard" | "support" | "executors" | "actions" | "motor">;

/**
 * **A mind's config**: plain data, so it rides in a recipe, a save and a link, its kind naming
 * its controller (`CONTROLLERS`). Each kind of mind declares its own type in its own module; a
 * fight passes one through and reads nothing in it.
 */
export interface MindConfig { readonly kind: string }

export type SupportMotorConfig = ConfigOf<typeof SUPPORT_MOTORS>;
export type GaitConfig = ConfigOf<typeof GAITS>;
export type BiteConfig = ConfigOf<typeof BITES>;
export type QuadrupedTacticsConfig = ConfigOf<typeof QUADRUPED_PLANNERS>;

/**
 * Four-paw crawling, physical jaw snaps and self-righting through the body's own muscles. Each part
 * it is built of is the stock one where it names none (`QUADRUPED_PARTS`, `src/core/reptile/kind.ts`).
 */
export interface QuadrupedConfig {
  readonly kind: "quadruped";
  /** Its motor over the paws: what holds the body up as the gaits ask. */
  readonly motor?: SupportMotorConfig | PartConfig;
  /** Its gait to travel: the gait it carries the body with at speed. */
  readonly travel?: GaitConfig | PartConfig;
  /** Its gait to crawl: the gait close in, and while it places its paws again. */
  readonly crawl?: GaitConfig | PartConfig;
  /** Its bite. */
  readonly bite?: BiteConfig | PartConfig;
  /** Its tactics: where it goes and when it bites. */
  readonly tactics?: QuadrupedTacticsConfig | PartConfig;
  /** Its navigation, any part of the role (`navigatorOf`): the game's where it names none. */
  readonly navigation?: PartConfig;
  /** Immutable bite cells for physical qualification; retained by recipes and replay. */
  readonly tuning?: { readonly bite?: Partial<typeof REPTILE_BITE> };
}

export const QUADRUPED: QuadrupedConfig = deepFreeze({ kind: "quadruped" });

/** Shared defaults keep ordered focus before the current and nearest standing foe. */
export const FIGHTING: BehavioursConfig = deepFreeze({ kind: "behaviours",
  target: [{ kind: "ordered" }, { kind: "current" }, { kind: "nearest", prefer: "standing-first" }],
  choose: { kind: "first-ready", rethink: .2, patience: 2 },
  list: [{ kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "pose" }] });

/**
 * The legs a body gets about by (`move`): the fighting step (braced) while it stands or a standing
 * foe is within 5 m; otherwise the walk and run free to run, which runs once the speed the rule asks
 * (`travelSpeed`, `src/core/mind/travel.ts`) is past its run's. The run slows at its `brake`
 * (0.47 m/s²): from the pace it runs from (1.3 m/s) it stops in about 1.8 m, and closing on a foe
 * that closes too, in twice that, so it is walking by the time a fight's reach is near. At 2 m two
 * Arena fighters opened 4 m apart run into each other and one falls. Near a standing body of its own
 * side it walks in the fighting step within 8.5 m: the run states it stops at 0.2 m/s²
 * (`Locomotion.stopping`), so from the pace it runs from it stops in 4.2 m, and closing on one that
 * closes too, in twice that; at 5 m four crossing paths ran into each other and fell. The fighting
 * step keeps clear of it (`crowdWalk`, `src/core/mind/crowd.ts`). The last 5 m to its
 * destination is walked in the fighting step too, which stops where it is sent where the run carries
 * past it.
 */
export const MOVE: MoveConfig = deepFreeze({ kind: "move",
  rules: [{ kind: "when-standing", gait: "braced" }, { kind: "when-distance", of: "foe", than: "under", metres: 5, gait: "braced" },
    { kind: "when-distance", of: "ally", than: "under", metres: 8.5, gait: "braced" }, { kind: "when-distance", of: "destination", than: "under", metres: 5, gait: "braced" }],
  otherwise: "run" });

const BLADE_EXECUTORS: readonly ExecutorConfig[] = [{ kind: "blade-cut", name: "blade-cut" }, { kind: "blade-thrust", name: "blade-thrust" }];
const BLADE_ACTIONS: readonly ActionConfig[] = BLADE_EXECUTORS.map(executor => ({ name: executor.name, executor: executor.name,
  effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } }));

/** The blade fighter: seeking tactics over a blade's cut and thrust, walking in the stance and lying still once down; empty-handed or holding a blunt item, it strikes with nothing. */
export const BLADE_FIGHTER: FighterConfig = deepFreeze({ kind: "fighter", tactics: FIGHTING, locomotion: { kind: "stance-walk" }, guard: { kind: "shield-guard" },
  executors: BLADE_EXECUTORS, actions: BLADE_ACTIONS, support: null, subs: [{ kind: "lie" }] });

/**
 * **The game's Stand up**: the edges a body rises by on its toes
 * (`docs/reference/rising.md#the-sit-back`): the roll onto its front, then down onto hands and
 * knees and the sit-back, or the sit-back from the front, the route each body takes priced by its
 * edges' profiles.
 */
export const STAND_UP: StandUpConfig = deepFreeze({ kind: "stand-up", techniques: [{ kind: "staged-roll" }, { kind: "staged-down" }, { kind: "sit-back" }, { kind: "front-sit-back" }] });

/** Opening scores that favour the trunk over the head: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
const BODY_OPENINGS: OpeningTuning = deepFreeze({ head: .3, upperTrunk: 0, middleTrunk: 0 });

/** The Arena's low kick: `docs/reference/front-kicks.md#arena-selection`. */
export const ARENA_KICKS: KickTuning = deepFreeze({ ...KICK_PATH, swingSeconds: .3, contactSpeed: 3 });

/**
 * **The path strikes at the body**: the path strike's executor, its straight blow, cross, hook and
 * downward blow from either hand aimed at the body's openings
 * (`docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`), the downward
 * one thrown from low support (`docs/reference/ground-combat.md#arena-integration`), and the
 * support fold it is thrown from.
 */
export const PATH_STRIKES = deepFreeze({
  executors: [{ name: "paths", kind: "path-strike" as const, overlap: false }],
  actions: (["straight", "cross", "hook", "downward"] as const).map(family => ({ name: family, executor: "paths", family, ...(family === "downward" ? { lower: .5 } : {}),
    effectors: ["hand.right", "hand.left"] as const, regions: [{ kind: "mark" as const, mark: "middle" as const }], aim: { kind: "surface" as const, tuning: BODY_OPENINGS } })),
  support: { kind: "support-fold" as const } });
