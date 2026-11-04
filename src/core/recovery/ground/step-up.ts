import stepUpMeta from "../../../../assets/core/step-up.meta.json" with { type: "json" };
import sitBackMeta from "../../../../assets/core/sit-back.meta.json" with { type: "json" };
import { dataOf } from "../../data/store.ts";
import type { SkillRecords } from "../../skills/framework/records.ts";
import { deepFreeze } from "../../state.ts";
import { bodyKey, type BodySpec, type Side } from "../../spec/body.ts";
import type { stagedRise } from "../rise/staged.ts";
import { RISE, rollOver, type BearStage, type Recipe, type RollPoses, type Stage } from "../rise/stages.ts";

/** How one of the recipe's stages is played: its time scaled, and a bearing stage's completion. */
interface StageTiming { readonly scale: number; readonly progress?: NonNullable<BearStage["progress"]> }
/** Stages' timings by name, a roll's stages as `roll <name>`. */
type StageTimings = Readonly<Record<string, StageTiming>>;
/**
 * **Step up's settings**, found by search: how still a body lies
 * before it reads its lie, the stance's climb from where the rise leaves the body to standing
 * height, s, and each of the recipe's stages by name (`StageTimings`); and, where
 * a body's bearing stages come to rest short of their aims, how long at rest and within how many
 * times their tolerances hands them on (`Recipe.progress`);
 * and the side a body's roll from its back goes over where it is not the recipe's, and its poses where
 * they are not the game's (`rollOver`).
 */
export interface StepUpTuning {
  readonly settle: { readonly speed: number; readonly seconds: number };
  readonly climb: number;
  readonly rest?: { readonly seconds: number; readonly widen: number };
  readonly over?: Side;
  readonly roll?: RollPoses;
  readonly stages: StageTimings;
}

/** **The sit-back's settings**: the timings of its own stages (`SIT_BACK`'s `plant`, `sit back` and `up`). */
export interface SitBackTuning { readonly stages: StageTimings }

declare module "../../data/store.ts" {
  interface DataOf {
    /** Every body's step-up record. */
    "step-up": SkillRecords<StepUpTuning>;
    /** Every body's sit-back record. */
    "sit-back": SkillRecords<SitBackTuning>;
  }
}

/** The bodies with a step-up record (`assets/core/step-up.json`), known before it loads. */
export const STEP_UP_BODIES: readonly string[] = deepFreeze(stepUpMeta.bodies);
/** The bodies with a sit-back record (`assets/core/sit-back.json`), known before it loads. */
export const SIT_BACK_BODIES: readonly string[] = deepFreeze(sitBackMeta.bodies);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const validTimings = (stages: unknown): boolean => isObject(stages) && Object.values(stages).every((timing) => isObject(timing) && finite(timing.scale) && timing.scale > 0
  && (timing.progress === undefined || isObject(timing.progress) && ["speed", "near", "turn"].every((key) => finite((timing.progress as Record<string, unknown>)[key]))));

/** Whether `settings` are step up's whole and valid: its settling, climb and stage timings, a side to roll over where named. */
export const validStepUp = (settings: unknown): boolean => isObject(settings) && isObject(settings.settle)
  && finite(settings.settle.speed) && settings.settle.speed > 0 && finite(settings.settle.seconds) && settings.settle.seconds >= 0
  && finite(settings.climb) && settings.climb > 0 && validTimings(settings.stages)
  && (settings.over === undefined || settings.over === "left" || settings.over === "right");

/** The sit-back's own stages, each timed by its record (`SitBackTuning`). */
const SIT_BACK_STAGES: readonly string[] = Object.freeze(["plant", "sit back", "up"]);

/** Whether `settings` are the sit-back's whole and valid: timings of its own stages and no others. */
export const validSitBack = (settings: unknown): boolean => isObject(settings) && Object.keys(settings).join() === "stages" && validTimings(settings.stages)
  && Object.keys(settings.stages as object).every((name) => SIT_BACK_STAGES.includes(name));

/** Each body's tuning by `bodyKey`, made once: a recipe is made once for each tuning (`stepUpRecipe`). */
const byBody = new Map<string, StepUpTuning>();

/**
 * **The step-up's tuning for a body of `spec`**: its record's (`dataOf("step-up")`), its sit-back
 * record's stages with them where it has one. A body with no step-up record has none, and is
 * refused the techniques that read it (`STEP_UP_BODIES`).
 */
export function stepUpTuning(spec: Pick<BodySpec, "model" | "segments">): StepUpTuning {
  const key = bodyKey(spec);
  let tuning = byBody.get(key);
  if (!tuning) {
    const own = dataOf("step-up")[key]?.settings;
    if (!own) throw new Error(`the step-up has no record for ${key}`);
    const sitBack = dataOf("sit-back")[key]?.settings;
    byBody.set(key, tuning = deepFreeze({ ...own, stages: { ...own.stages, ...sitBack?.stages } }));
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
    return stage.kind === "bear" ? { ...stage, seconds: stage.seconds * timing.scale, ...(timing.progress ? { progress: timing.progress } : {}) }
      : { ...stage, seconds: stage.seconds * timing.scale };
  };
  return deepFreeze({ ...base, progress: { settleSpeed: tuning.settle.speed, settleSeconds: tuning.settle.seconds,
    ...(tuning.rest ? { restSeconds: tuning.rest.seconds, restWiden: tuning.rest.widen } : {}) },
    roll: { back: (tuning.over || tuning.roll ? rollOver(tuning.over ?? "right", tuning.roll) : base.roll.back).map(timed("roll ")),
      left: (tuning.roll && base.roll.left.length ? rollOver("left", tuning.roll).slice(2) : base.roll.left).map(timed("roll ")),
      right: (tuning.roll && base.roll.right.length ? rollOver("right", tuning.roll).slice(2) : base.roll.right).map(timed("roll ")) },
    rise: base.rise.map(timed("")) });
}

/** The longest a whole attempt may take, s. */
export const LIMIT = 16;
/** Under this height, m, a body on its back is lying on it. */
export const LOW = .5;

/** A rise a part of the staged route plays (`stagedRise`). */
export type StepUpRise = ReturnType<typeof stagedRise>;
