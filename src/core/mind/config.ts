import type { TechniqueName } from "./ground/techniques.ts";
import type { REPTILE_BITE } from "../reptile/tuning.ts";
import { KICK_PATH, type KickTuning } from "../skills/kick.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { CombatExecution, DrivenStrike } from "../skills/combat.ts";
import type { TurnStartup } from "../skills/locomotion.ts";
import { STRAIGHT_PUNCH, type StraightPunch } from "../skills/straight-punch.ts";
import type { Combination } from "../skills/combination.ts";
import type { StrideSettings } from "../skills/stride.ts";
import type { RunSettings } from "../skills/run.ts";
import type { SimbiconSettings, SimbiconWay } from "../skills/simbicon.ts";
import type { WalkRunSettings } from "../skills/walk-run.ts";
import type { RunCycleSettings } from "../skills/cycle-run.ts";
import type { GaitName } from "../skills/gaits.ts";
import type { Placed } from "../skills/strike.ts";
import type { Repertoire } from "../skills/strikes.ts";
import type { WholeBodyDrive } from "../skills/whole-body-strike.ts";
import type { OpeningTuning } from "./openings.ts";
import type { Covering } from "../skills/guard.ts";
import { deepFreeze } from "../state.ts";
import type { AimRule } from "./action-aim.ts";
import type { Region } from "../skills/action.ts";
import type { Weights } from "./options/value.ts";

/** Lie still while down: ask the muscles for nothing (`lying`, `lie.ts`). */
interface LieConfig { readonly kind: "lie" }

/** Rise by stages, then stand quiet on loaded feet before giving the body back (`supportRecovery`, `rise/support-recovery.ts`). */
interface SupportRecoveryConfig { readonly kind: "support-recovery" }

/** Experimental reference-motion feedback through ordinary muscles. */
interface ResearchRiseConfig { readonly kind: "research-rise" }

/** Preferred contracts for recovering the feet, in player order. */
export interface StandUpConfig { readonly kind: "stand-up"; readonly techniques: readonly TechniqueName[] }

/** Roll away from a nearby foe before handing over. */
export interface GetAwayConfig { readonly kind: "get-away"; readonly metres: number }
/** Cover and kick while lying within reach of a foe. */
export interface GroundFightConfig { readonly kind: "ground-fight"; readonly reach: number; readonly kicks: "either" | "left" | "right" | "none" }

/** **A sub-mind's config**, by kind: what a host's slot holds, whole, so a sub-mind is configured where it is chosen. */
export type SubMindConfig = LieConfig | SupportRecoveryConfig | ResearchRiseConfig | StandUpConfig | GetAwayConfig | GroundFightConfig;

/** Focus is selected once for all behaviours in a control step. */
export type FocusRuleConfig = { readonly kind: "ordered" | "current" } | { readonly kind: "nearest"; readonly prefer: "standing" | "standing-first" };

/** Shared conditions read detached tactical facts. */
export type ConditionConfig = { readonly kind: "always" | "when-standing" | "target-down" }
  | { readonly kind: "when-distance"; readonly of: "foe" | "destination"; readonly than: "under" | "over"; readonly metres: number }
  | { readonly kind: "follow-up"; readonly seconds: number };

/** A selector chooses configured action names and retains a choice within bounded patience. */
export type SelectorConfig = ({ readonly kind: "first-ready" | "rotate" | "scored" | "estimate" }
  | { readonly kind: "rules"; readonly rules: readonly { readonly when: ConditionConfig; readonly actions: readonly string[] }[]; readonly otherwise: readonly string[] })
  & { readonly rethink: number; readonly patience: number };

/** A behaviour requests one part of the shared tactical intent. */
export type BehaviourConfig = { [K in "attack" | "follow-orders" | "clear-of-walls" | "clear-of-fallen" | "evade" | "flee"]: { readonly kind: K } }["attack" | "follow-orders" | "clear-of-walls" | "clear-of-fallen" | "evade" | "flee"]
  | { readonly kind: "approach"; readonly spacing?: number; readonly spacingStep?: number }
  | { [K in "close-in" | "keep-distance" | "break-clinch"]: { readonly kind: K; readonly metres: number } }["close-in" | "keep-distance" | "break-clinch"]
  | { readonly kind: "edge"; readonly band: number; readonly patience: number }
  | { readonly kind: "ground" }
  | { readonly kind: "cover"; readonly guard: "pose" | "cover" | "predictive" };

/** Ranked behaviours share focus, selection and action instances. */
export interface BehavioursConfig {
  readonly kind: "behaviours";
  readonly target: readonly FocusRuleConfig[];
  readonly choose: SelectorConfig;
  readonly list: readonly BehaviourConfig[];
}

/** Tactics either compose behaviours, hold guard, or execute a supplied script. */
export type TacticsConfig = { readonly kind: "script" } | { readonly kind: "stand" } | BehavioursConfig;

/** **The walk** within the body's stance envelope (`locomotion`). */
export interface StanceWalkConfig {
  readonly kind: "stance-walk";
  readonly tuning?: {
    /** A heading-speed ceiling, rad/s: `docs/reference/combat-locomotion.md`. */
    readonly turnLimit?: number;
    /** A brief heading-speed ceiling while setting off: `docs/reference/combat-turn-startup.md`. */
    readonly turnStartup?: TurnStartup;
  };
}

/** **The walk and run** (`stride`, `skills/stride.ts`): steps it plans itself, its settings these. */
export interface StrideConfig extends StrideSettings {
  readonly kind: "stride";
}

/** **The run** (`run`, `skills/run.ts`): steps that fly, its settings these. */
export interface RunConfig extends RunSettings {
  readonly kind: "run";
}

/**
 * **The walk and the run** (`walkRun`, `skills/walk-run.ts`): the stance's walk, and the run that tracks a person's cycle past
 * `run`, its settings these and the run's over its own. It runs unless `runs` is false (`Locomotion.runs`).
 */
export interface WalkRunConfig extends WalkRunSettings {
  readonly kind: "walk-run";
  readonly runs?: boolean;
  readonly tuning?: { readonly run?: Partial<RunCycleSettings> };
}

/**
 * **The walk and the learned run** (`learnedRun`, `skills/learned-run.ts`): the walk and run whose run a policy steers, the one
 * `policy` names (`RUN_POLICIES`), or, null, steered from outside the mind (research's training). Its settings are the walk and run's.
 */
export interface LearnedRunConfig extends WalkRunSettings {
  readonly kind: "learned-run";
  readonly policy: string | null;
  readonly runs?: boolean;
  readonly tuning?: { readonly run?: Partial<RunCycleSettings> };
}

/**
 * **The SIMBICON walk** (`simbicon`, `skills/simbicon.ts`): the legs driven by a state machine with no stance, its settings
 * these, forward's; and the settings it takes walking to a side or back in place of forward's, over its own (`SimbiconWays`),
 * and running, over the run's. It runs unless `runs` is false (`Locomotion.runs`).
 */
export interface SimbiconConfig extends SimbiconSettings {
  readonly kind: "simbicon";
  readonly runs?: boolean;
  readonly tuning?: { readonly side?: Partial<SimbiconWay>; readonly back?: Partial<SimbiconWay>; readonly run?: Partial<RunCycleSettings> };
}

/** A rule of Move: while the body is asked to stand, `gait`. */
interface WhenStandingConfig { readonly kind: "when-standing"; readonly gait: GaitName }

/**
 * A rule of Move: while what `of` names is `than` `metres` away, `gait`: the nearest standing
 * foe, or where the body's walk is taking it (`Intent.destination`). Where there is none, it is
 * infinitely far.
 */
interface WhenDistanceConfig {
  readonly kind: "when-distance";
  readonly of: "foe" | "destination";
  readonly than: "under" | "over";
  readonly metres: number;
  readonly gait: GaitName;
}

/** **A rule of Move's config**, by kind: when it chooses its gait. */
export type MoveRuleConfig = WhenStandingConfig | WhenDistanceConfig;

/**
 * **Move** (`move`, `skills/move.ts`): the gait (`GAITS`) of the first of `rules` that holds, or
 * `otherwise`'s.
 */
export interface MoveConfig {
  readonly kind: "move";
  readonly rules: readonly MoveRuleConfig[];
  readonly otherwise: GaitName;
}

/** **The legs' skill**, by kind. */
export type LocomotionConfig = StanceWalkConfig | StrideConfig | RunConfig | SimbiconConfig | WalkRunConfig | LearnedRunConfig | MoveConfig;

/** **The guard**: the arms' posture, and a guarding hand's cover of what the tactics name (`guardSkill`). */
interface CoverGuardConfig {
  readonly kind: "cover-guard";
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
  };
}

/** **The recipe strike**: the searched recipe blows for what a hand holds (`recipeExecutor`, `skills/strike.ts`). */
interface RecipeStrikeConfig {
  readonly kind: "recipe-strike";
  readonly tuning?: {
    /** Strikes in place of the searched repertoire (`REPERTOIRE`): a search's candidate. */
    readonly repertoire?: Repertoire;
    /** The placed blow in place of `PLACED`: a sweep's cell. */
    readonly placed?: Placed;
    /** The most a blow turns the pelvis in place of `STEER`: a sweep's cell. */
    readonly steer?: number;
  };
}

/** **The path strike**: a hand path carried out on the strike cycle (`pathExecutor`, `skills/combat.ts`). */
interface PathStrikeConfig {
  readonly kind: "path-strike";
  /** Whether a hand may begin while the other is still returning. */
  readonly overlap: boolean;
  readonly tuning?: {
    /** The hands' paths over `ATTACK_PATH`. */
    readonly paths?: Partial<AttackTuning>;
    readonly execution?: CombatExecution;
  };
}

/** **The driven strike** (`DrivenStrike`, `skills/combat.ts`): the path strike with its trunk driven into the swing. */
interface DrivenStrikeConfig extends DrivenStrike {
  readonly kind: "driven-strike";
  readonly tuning?: PathStrikeConfig["tuning"];
}

/** **The whole-body strike** (`wholeBodyExecutor`, `skills/whole-body-strike.ts`): one torque solve over the whole body under a blow, its fist driven by `drive`. */
interface WholeBodyStrikeConfig {
  readonly kind: "whole-body-strike";
  readonly drive: WholeBodyDrive;
}

/** **The straight punch** (`straightPunchExecutor`, `skills/straight-punch.ts`): the arm driven flat out at a lined-up contact pose, its settings these. */
interface StraightPunchConfig extends StraightPunch {
  readonly kind: "straight-punch";
}

/** **The combination** (`combinationExecutor`, `skills/combination.ts`): two straight punches, one hand then the other, its settings these. */
interface CombinationConfig extends Combination {
  readonly kind: "combination";
}

/** **The front kick** with either foot (`kickExecutor`), its configured swing tuning. */
interface FrontKickConfig {
  readonly kind: "front-kick";
  readonly tuning?: Partial<KickTuning>;
}

/** Named execution state shared only by actions that explicitly refer to it. */
export type ExecutorConfig = (RecipeStrikeConfig | PathStrikeConfig | DrivenStrikeConfig | WholeBodyStrikeConfig | StraightPunchConfig | CombinationConfig | FrontKickConfig) & { readonly name: string };

/** A configured attack's identity, anatomical choices and its executor-specific motion settings. */
export interface ActionConfig {
  readonly name: string;
  readonly executor: string;
  readonly effectors: readonly string[];
  readonly regions: readonly Region[];
  readonly aim: AimRule;
  readonly family?: import("./intent.ts").BlowFamily;
  readonly armExtension?: number;
  readonly lower?: number;
}

/** **Fighting from low support** (`supportFold`): lowering, folding and rising again. */
interface SupportFoldConfig { readonly kind: "support-fold" }

/** **A skill's config**, by kind, across the fighter's skill slots. */
export type SkillConfig = StanceWalkConfig | StrideConfig | RunConfig | SimbiconConfig | WalkRunConfig | LearnedRunConfig | MoveConfig | CoverGuardConfig | SupportFoldConfig;

/** A fighter shares named executors across its configured actions. */
export interface FighterConfig {
  readonly kind: "fighter";
  readonly tactics: TacticsConfig;
  readonly locomotion: LocomotionConfig;
  readonly guard: CoverGuardConfig;
  readonly executors: readonly ExecutorConfig[];
  readonly actions: readonly ActionConfig[];
  readonly support: SupportFoldConfig | null;
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
}

/**
 * **A mind's config**, by kind: plain data, so it rides in a recipe, a save and a link. Each kind
 * of mind declares its own; a fight passes one through and reads nothing in it.
 */
export type MindConfig = FighterConfig | OptionsConfig | DirectMindConfig | QuadrupedConfig;

/** **The options fighter** (`createOptionsFighter`, `options/mind.ts`): a meta-controller over options; nothing in it is set yet but an experiment's tuning. */
export interface OptionsConfig {
  readonly kind: "options";
  /** How it chooses among its options: by what each is expected to bring, weighed (`valued`, unless absent), or by a fixed rank. */
  readonly meta?: "valued" | "ranked";
  /** What its valued choice weighs each term by, over the fighter's own (`WEIGHTS`). */
  readonly weights?: Readonly<Partial<Weights>>;
  /** Whether its cover reflex runs, and whether it throws its one-two: each does unless false; whether it also aims them at the body: only if true. */
  readonly tuning?: { readonly cover?: boolean; readonly combination?: boolean; readonly body?: boolean };
}

/** Four-paw crawling, physical jaw snaps and self-righting through the body's own muscles. */
interface QuadrupedConfig {
  readonly kind: "quadruped";
  /** Immutable bite cells for physical qualification; retained by recipes and replay. */
  readonly tuning?: { readonly bite?: Partial<typeof REPTILE_BITE> };
}

export const QUADRUPED: QuadrupedConfig = deepFreeze({ kind: "quadruped" });

/** Joint-feedback experiment: targets in radians and explicit time, speed and activation bounds. */
export interface DirectMindConfig {
  readonly kind: "direct";
  readonly targets: Readonly<Record<string, number>>;
  readonly seconds: number;
  readonly speed: number;
  readonly activation: number;
}

/** Shared defaults keep ordered focus before the current and nearest standing foe. */
export const FIGHTING: BehavioursConfig = deepFreeze({ kind: "behaviours",
  target: [{ kind: "ordered" }, { kind: "current" }, { kind: "nearest", prefer: "standing-first" }],
  choose: { kind: "first-ready", rethink: .2, patience: 2 },
  list: [{ kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "pose" }] });

/**
 * The legs a body gets about by (`move`): braced while it stands or a standing foe is within 5 m;
 * otherwise by the walk and run free to run, which runs where its tactics or orders ask a pace past
 * its run's. An Arena bout opens at 4 m, so it fights from its first step.
 */
export const MOVE: MoveConfig = deepFreeze({ kind: "move",
  rules: [{ kind: "when-standing", gait: "braced" }, { kind: "when-distance", of: "foe", than: "under", metres: 5, gait: "braced" }],
  otherwise: "run" });

/** The recipe fighter: seeking tactics over the recipe strike, walking in the stance, lying still once down. The Lab's minds are made from it. */
export const RECIPE_FIGHTER: FighterConfig = deepFreeze({ kind: "fighter", tactics: FIGHTING, locomotion: { kind: "stance-walk" }, guard: { kind: "cover-guard" },
  executors: [{ name: "recipe", kind: "recipe-strike" }],
  actions: [{ name: "strike", executor: "recipe", effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "high" }], aim: { kind: "centre", lead: 0 } }], support: null, subs: [{ kind: "lie" }] });

/** Standing up by stepping up (`stepUp`), the way the game's fighters rise once down. */
export const STAND_UP: StandUpConfig = deepFreeze({ kind: "stand-up", techniques: ["step-up"] });

/** The Classic fighter: the recipe fighter, getting about by `MOVE` and standing up once down. */
export const CLASSIC: FighterConfig = deepFreeze({ ...RECIPE_FIGHTER, locomotion: MOVE, subs: [STAND_UP] });

/** The options fighter's config (`createOptionsFighter`), the mind every humanoid has unless its fight says otherwise: its kind, and nothing to set yet. */
export const OPTIONS: OptionsConfig = deepFreeze({ kind: "options" });

/** Classic throwing the straight punch, its fist lined up behind the arm (searched in Arena bouts, `research/punch-in-bout.mjs`), held at the edge of its foe's reach. */
export const PUNCHER: FighterConfig = deepFreeze({ ...CLASSIC, tactics: { ...FIGHTING, list: [
  { kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "break-clinch", metres: .65 }, { kind: "attack" }, { kind: "edge", band: .25, patience: 4 }, { kind: "approach" }, { kind: "cover", guard: "pose" }] }, executors: [{ name: "punch", kind: "straight-punch", ...STRAIGHT_PUNCH }],
  actions: RECIPE_FIGHTER.actions.map(action => ({ ...action, executor: "punch" })) });

/**
 * The Puncher waiting for its foe to come to it: it holds the edge of its foe's reach for as long
 * as an Arena bout lasts, and drives from up to 0.4 m past its stand-off, so a foe walking in
 * meets the punch of a body already settled before it can settle for its own.
 */
export const COUNTER_PUNCHER: FighterConfig = deepFreeze({ ...PUNCHER, tactics: { ...PUNCHER.tactics, list: [
  { kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "break-clinch", metres: .65 }, { kind: "attack" }, { kind: "edge", band: .25, patience: 120 }, { kind: "approach" }, { kind: "cover", guard: "pose" }] },
  executors: [{ name: "punch", kind: "straight-punch", ...STRAIGHT_PUNCH, band: .4 }] });

/** Opening scores that favour the trunk over the head: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
const BODY_OPENINGS: OpeningTuning = deepFreeze({ head: .3, upperTrunk: 0, middleTrunk: 0 });

/** The Arena's low kick: `docs/reference/front-kicks.md#arena-selection`. */
export const ARENA_KICKS: KickTuning = deepFreeze({ ...KICK_PATH, swingSeconds: .3, contactSpeed: 3 });

/**
 * The Arena's second-tier fighter: opening tactics over the path strike, straight blows and hooks
 * aimed at the body (`docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`),
 * fighting from low support against a foe that is down or rising
 * (`docs/reference/ground-combat.md#arena-integration`), and rising, then steadying, once down. It
 * travels by the stride.
 */
export const SCRAPPER: FighterConfig = deepFreeze({ ...CLASSIC,
  locomotion: { ...MOVE, rules: MOVE.rules.filter(rule => rule.gait === "braced"), otherwise: "stride" },
  tactics: { ...FIGHTING, choose: { kind: "estimate", rethink: .2, patience: 2 }, list: [
    { kind: "follow-orders" }, { kind: "clear-of-walls" }, { kind: "ground" }, { kind: "attack" },
    { kind: "approach", spacing: 0, spacingStep: 0 }, { kind: "cover", guard: "predictive" }] },
  executors: [{ name: "paths", kind: "path-strike", overlap: false }],
  actions: (["straight", "cross", "hook", "downward"] as const).map(family => ({ name: family, executor: "paths", family, ...(family === "downward" ? { lower: .5 } : {}),
    effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark" as const, mark: "middle" as const }], aim: { kind: "surface" as const, tuning: BODY_OPENINGS } })),
  support: { kind: "support-fold" } });

/** The configurable behaviour fighter starts from the shared recipe actions. */
export const BEHAVIOURS: FighterConfig = deepFreeze({ ...CLASSIC, tactics: { ...FIGHTING, choose: { kind: "rotate", rethink: .2, patience: 2 }, list: [
  { kind: "follow-orders" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "cover" }] } });
