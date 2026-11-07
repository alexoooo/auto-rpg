import stepUpMeta from "../../../../../assets/skills/recovery/staged/step-up.meta.json" with { type: "json" };
import sitBackMeta from "../../../../../assets/skills/recovery/staged/sit-back.meta.json" with { type: "json" };
import { dataOf } from "../../../../core/data/store.ts";
import type { SkillRecords } from "../../../framework/records.ts";
import { deepFreeze } from "../../../../core/state.ts";
import { bodyKey, type BodySpec } from "../../../../core/bodies/spec/body.ts";
import { heldBy, loadoutKey } from "../../../../core/bodies/items/held.ts";
import type { stagedRise } from "./staged.ts";
import { RISE, rollOver, type BearStage, type PoseStage, type Posture, type Recipe, type RollPoses, type Stage } from "./stages.ts";
import type { Side } from "../../../../core/bodies/bilateral.ts";

/** How one of the recipe's stages is played: its time scaled, pose and joint coordination, and a bearing stage's completion. */
interface StageTiming { readonly scale: number; readonly posture?: Posture; readonly progress?: NonNullable<BearStage["progress"]>;
  readonly follow?: PoseStage["follow"] }
/** Stages' settings by name, a roll's stages as `roll <name>`. */
type StageTimings = Readonly<Record<string, StageTiming>>;
/**
 * **Step up's settings**, found by search: how still a body lies
 * before it reads its lie, the stance's climb from where the rise leaves the body to standing
 * height, s, and each of the recipe's stages' timings and pose adjustments by name (`StageTimings`); and, where
 * a body's bearing stages come to rest short of their aims, how long at rest and within how many
 * times their tolerances hands them on (`Recipe.progress`);
 * and the side a body's roll from its back goes over where it is not the recipe's, and its poses where
 * they are not the game's (`rollOver`).
 */
interface StepUpSettings {
  readonly settle: { readonly speed: number; readonly seconds: number };
  readonly climb: number;
  readonly rest?: { readonly seconds: number; readonly widen: number };
  readonly over?: Side;
  readonly roll?: RollPoses;
  /** On a side, swing first when the body's momentum would take it back. */
  readonly sideSwing?: "momentum";
  readonly heldSupport?: Recipe["heldSupport"];
  readonly stages: StageTimings;
}

/** A body's recovery settings, with adjustments for loadouts that need their own motion. */
export interface StepUpTuning extends StepUpSettings {
  readonly loadouts?: Readonly<Record<string, StepUpSettings>>;
}

/** **The sit-back's settings**: the timings of its own stages (`SIT_BACK`'s `plant`, `sit back` and `up`). */
export interface SitBackTuning { readonly stages: StageTimings }

declare module "../../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's step-up record. */
    "step-up": SkillRecords<StepUpTuning>;
    /** Every body's sit-back record. */
    "sit-back": SkillRecords<SitBackTuning>;
  }
}

/** The bodies with a step-up record (`assets/skills/recovery/staged/step-up.json`), known before it loads. */
export const STEP_UP_BODIES: readonly string[] = deepFreeze(stepUpMeta.bodies);
/** The bodies with a sit-back record (`assets/skills/recovery/staged/sit-back.json`), known before it loads. */
export const SIT_BACK_BODIES: readonly string[] = deepFreeze(sitBackMeta.bodies);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const validRoll = (roll: unknown): boolean => isObject(roll) && ["wind", "swing", "over", "flat"].every(key => isObject(roll[key]) && Object.values(roll[key] as object).every(finite));
const validTimings = (stages: unknown): boolean => isObject(stages) && Object.values(stages).every((timing) => isObject(timing) && finite(timing.scale) && timing.scale > 0
  && (timing.posture === undefined || isObject(timing.posture) && Object.values(timing.posture).every(finite))
  && (timing.follow === undefined || isObject(timing.follow) && Array.isArray(timing.follow.channels) && timing.follow.channels.length > 0
    && timing.follow.channels.every(name => typeof name === "string") && isObject(timing.follow.past) && Object.keys(timing.follow.past).length > 0
    && Object.values(timing.follow.past).every(finite) && finite(timing.follow.span) && timing.follow.span > 0)
  && (timing.progress === undefined || isObject(timing.progress) && Object.entries(timing.progress).every(([key, value]) => ["speed", "near", "turn"].includes(key) && finite(value) && value > 0)));

/** Whether `settings` are step up's whole and valid: its settling, climb and stage timings, a side to roll over where named. */
export const validStepUp = (settings: unknown): boolean => isObject(settings) && isObject(settings.settle)
  && finite(settings.settle.speed) && settings.settle.speed > 0 && finite(settings.settle.seconds) && settings.settle.seconds >= 0
  && finite(settings.climb) && settings.climb > 0 && validTimings(settings.stages)
  && (settings.rest === undefined || isObject(settings.rest) && finite(settings.rest.seconds) && settings.rest.seconds > 0 && finite(settings.rest.widen) && settings.rest.widen > 0)
  && (settings.roll === undefined || validRoll(settings.roll))
  && (settings.over === undefined || settings.over === "left" || settings.over === "right")
  && (settings.sideSwing === undefined || settings.sideSwing === "momentum")
  && (settings.heldSupport === undefined || settings.heldSupport === "loaded")
  && (settings.loadouts === undefined || isObject(settings.loadouts) && Object.values(settings.loadouts).every(validStepUp));

/** The sit-back's own stages, each timed by its record (`SitBackTuning`). */
const SIT_BACK_STAGES: readonly string[] = Object.freeze(["plant", "sit back", "up"]);

/** Whether `settings` are the sit-back's whole and valid: timings of its own stages and no others. */
export const validSitBack = (settings: unknown): boolean => isObject(settings) && Object.keys(settings).join() === "stages" && validTimings(settings.stages)
  && Object.keys(settings.stages as object).every((name) => SIT_BACK_STAGES.includes(name));

/** Each spec's tuning, made once: equipped bodies may read different settings from the same body's record. */
const byBody = new WeakMap<BodySpec, StepUpTuning>();

/**
 * **The step-up's tuning for a body of `spec`**: its record's (`dataOf("step-up")`), its sit-back
 * record's stages with them where it has one. A body with no step-up record has none, and is
 * refused the techniques that read it (`STEP_UP_BODIES`).
 */
export function stepUpTuning(spec: BodySpec): StepUpTuning {
  const key = bodyKey(spec);
  let tuning = byBody.get(spec);
  if (!tuning) {
    const record = dataOf("step-up")[key]?.settings;
    if (!record) throw new Error(`the step-up has no record for ${key}`);
    const { loadouts, ...own } = record;
    const sitBack = dataOf("sit-back")[key]?.settings;
    const left = heldBy(spec, "left"), right = heldBy(spec, "right");
    const loaded = left === null || right === null ? undefined : loadouts?.[loadoutKey({ left, right })];
    byBody.set(spec, tuning = deepFreeze({ ...own, ...loaded, stages: { ...own.stages, ...sitBack?.stages, ...loaded?.stages } }));
  }
  return tuning;
}

/** Each tuning's recipe of each base (`stepUpRecipe`): tunings and recipes are data, never changed once made. */
const tuned = new WeakMap<StepUpTuning, WeakMap<Recipe, Recipe>>();

/** `base`, its stages played as `tuning` says: made once for each tuning and base. */
export function stepUpRecipe(tuning: StepUpTuning, base: Recipe = RISE): Recipe {
  let byBase = tuned.get(tuning);
  if (!byBase) tuned.set(tuning, byBase = new WeakMap());
  let recipe = byBase.get(base);
  if (!recipe) byBase.set(base, recipe = tunedRecipe(tuning, base));
  return recipe;
}

function tunedRecipe(tuning: StepUpTuning, base: Recipe): Recipe {
  const timed = (prefix: string) => <S extends Stage>(stage: S): S => {
    const timing = tuning.stages[`${prefix}${stage.name}`];
    if (!timing) return stage;
    const posture = timing.posture ? { ...(stage.posture === "reference" ? {} : stage.posture), ...timing.posture } : stage.posture;
    return stage.kind === "bear" ? { ...stage, posture, seconds: stage.seconds * timing.scale, ...(timing.progress ? { progress: timing.progress } : {}) }
      : { ...stage, posture: posture as Posture, seconds: stage.seconds * timing.scale, ...(timing.follow ? { follow: timing.follow } : {}) };
  };
  const sideRoll = (side: Side) => {
    const stages = base.roll[side].length && (tuning.roll || tuning.sideSwing)
      ? rollOver(side, tuning.roll).slice(tuning.sideSwing ? 1 : 2) : base.roll[side];
    const time = timed("roll ");
    return stages.map(stage => time(tuning.sideSwing && stage.name === "swing" ? { ...stage, coast: true as const } : stage));
  };
  return deepFreeze({ ...base, ...(tuning.heldSupport ? { heldSupport: tuning.heldSupport } : {}), progress: { settleSpeed: tuning.settle.speed, settleSeconds: tuning.settle.seconds,
    ...(tuning.rest ? { restSeconds: tuning.rest.seconds, restWiden: tuning.rest.widen } : {}) },
    roll: { back: (tuning.over || tuning.roll ? rollOver(tuning.over ?? "right", tuning.roll) : base.roll.back).map(timed("roll ")),
      left: sideRoll("left"), right: sideRoll("right") },
    rise: base.rise.map(timed("")) });
}

/** The longest a whole attempt may take, s. */
export const LIMIT = 16;
/** Under this height, m, a body on its back is lying on it. */
export const LOW = .5;

/** A rise a part of the staged route plays (`stagedRise`). */
export type StepUpRise = ReturnType<typeof stagedRise>;
