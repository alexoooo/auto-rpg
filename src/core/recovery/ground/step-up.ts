import { deepFreeze } from "../../state.ts";
import type { HumanoidModel } from "../../human/spec.ts";
import type { Side } from "../../spec/body.ts";
import type { stagedRise } from "../rise/staged.ts";
import { RISE, rollOver, type BearStage, type Recipe, type RollPoses, type Stage } from "../rise/stages.ts";

/** How one of the recipe's stages is played: its time scaled, and a bearing stage's completion. */
interface StageTiming { readonly scale: number; readonly progress?: NonNullable<BearStage["progress"]> }
/**
 * **Step up's settings**, found by search: how still a body lies
 * before it reads its lie, the stance's climb from where the rise leaves the body to standing
 * height, s, and each of the recipe's stages by name, a roll's stages as `roll <name>`; and, where
 * a body's bearing stages come to rest short of their aims, how long at rest and within how many
 * times their tolerances hands them on (`Recipe.progress`);
 * and the side a body's roll from its back goes over where it is not the recipe's, and its poses where
 * they are not the game's (`rollOver`).
 */
interface StepUpTuning {
  readonly settle: { readonly speed: number; readonly seconds: number };
  readonly climb: number;
  readonly rest?: { readonly seconds: number; readonly widen: number };
  readonly over?: Side;
  readonly roll?: RollPoses;
  readonly stages: Readonly<Record<string, StageTiming>>;
}

/**
 * Each humanoid's settings, searched on its own target falls (Node stand, Rapier, 120 Hz,
 * Balance 0): eight shove directions offset from the target's, empty
 * and with the club, a fall's score its verified standing and how soon.
 */
export const STEP_UP: Readonly<Record<HumanoidModel, StepUpTuning>> = deepFreeze({
  "workshop-fighter": {
    settle: { speed: .372, seconds: .05337 }, climb: .614,
    stages: {
      "roll wind": { scale: .1809 },
      "roll swing": { scale: .8712 },
      "roll over": { scale: 1.107 },
      "roll flat": { scale: .8898 },
      "fold": { scale: .2467 },
      "tuck": { scale: .2144 },
      "prop": { scale: .1271 },
      "fours": { scale: .5909, progress: { speed: .17, near: .05486, turn: .531 } },
      "sit": { scale: 1.492 },
      "kneel 0": { scale: .7367 },
      "kneel 1": { scale: 1.392 },
      "kneel 2": { scale: .16 },
      "arms": { scale: .2216 },
      "hold": { scale: .1655 },
      "tall 0": { scale: .22 },
      "tall 1": { scale: .983 },
      "tall 2": { scale: .1726 },
      "tall": { scale: .2026 },
      "shift": { scale: .5538 },
      "lift": { scale: .408 },
      "swing": { scale: .8013 },
      "reach": { scale: .3797 },
      "half kneel": { scale: 1.191, progress: { speed: .2234, near: .161, turn: .2199 } },
      "onto the toes": { scale: .9522, progress: { speed: .3333, near: .05398, turn: .1675 } },
      "lunge 0": { scale: .867, progress: { speed: .5266, near: .1677, turn: .1118 } },
      "lunge 1": { scale: .8092, progress: { speed: .2455, near: .08638, turn: .1486 } },
      "lunge 2": { scale: .8463, progress: { speed: .4328, near: .2012, turn: .1099 } },
      "lunge 3": { scale: .4512, progress: { speed: .1212, near: .2286, turn: .13 } },
      "even": { scale: .497, progress: { speed: .612, near: .08728, turn: .1333 } },
    },
  },
  "workshop-rogue": {
    // Rolls over its left side, so its right hand, which holds the club, comes over rather than under.
    settle: { speed: .06004, seconds: .05 }, climb: 1.159, rest: { seconds: .3, widen: 2 }, over: "left",
    stages: {
      "roll wind": { scale: .923 },
      "roll swing": { scale: 1.605 },
      "roll over": { scale: .9005 },
      "roll flat": { scale: 1.514 },
      "fold": { scale: .1159 },
      "tuck": { scale: .3375 },
      "prop": { scale: 1 },
      "fours": { scale: .4367, progress: { speed: .07216, near: .05769, turn: .4826 } },
      "sit": { scale: .3438 },
      "kneel 0": { scale: 1.384 },
      "kneel 1": { scale: 1.973 },
      "kneel 2": { scale: .1985 },
      "arms": { scale: .8101 },
      "hold": { scale: .2351 },
      "tall 0": { scale: .245 },
      "tall 1": { scale: .2293 },
      "tall 2": { scale: .1909 },
      "tall": { scale: .2909 },
      "shift": { scale: .458 },
      "lift": { scale: .3509 },
      "swing": { scale: .8147 },
      "reach": { scale: .1908 },
      "half kneel": { scale: 1.072, progress: { speed: .417, near: .1917, turn: .09824 } },
      "onto the toes": { scale: .7601, progress: { speed: .1586, near: .03883, turn: .1178 } },
      "lunge 0": { scale: .6562, progress: { speed: .6775, near: .1093, turn: .2658 } },
      "lunge 1": { scale: .7861, progress: { speed: .3806, near: .06896, turn: .1322 } },
      "lunge 2": { scale: .479, progress: { speed: .2848, near: .1259, turn: .08817 } },
      "lunge 3": { scale: .8628, progress: { speed: .177, near: .2051, turn: .1741 } },
      "even": { scale: .7697, progress: { speed: .1495, near: .08575, turn: .1282 } },
    },
  },
  "crypt-skeleton": {
    settle: { speed: .1881, seconds: .05626 }, climb: 1.6377,
    // Its own roll and sit-back, found by CMA-ES on its body (`research/cma.mjs`).
    over: "right",
    roll: {
      wind: { "hip.far flexion": 1.481, "hip.far abduction": .216, "hip.near flexion": -.284, "shoulder.near flexion": 1.632, "shoulder.far flexion": 2.832 },
      swing: { "hip.far flexion": 1.59, "hip.far internal rotation": -.261, "hip.near abduction": .019, "lumbar flexion": .716, "shoulder.far flexion": 2.022, "shoulder.near flexion": .931, "shoulder.near abduction": .796, "knee.far flexion": .388, "lumbar rotation near": .001, "thoracic rotation near": -.338, "shoulder.far abduction": .293 },
      over: { "hip.far flexion": 1.577, "hip.far abduction": .142, "shoulder.near flexion": 2.978, "knee.far flexion": .113, "shoulder.far flexion": 1.935 },
      flat: { "shoulder.near flexion": 2.689, "shoulder.far internal rotation": -.844, "elbow.far flexion": 1.579, "shoulder.far flexion": -.368, "elbow.near flexion": .28, "shoulder.near abduction": .002 },
    },
    stages: {
      "up": { scale: 1.0063 },
      "sit back": { scale: 1.1391 },
      "plant": { scale: .7391 },
      "roll wind": { scale: .7776 },
      "roll swing": { scale: .5243 },
      "roll over": { scale: 2.165 },
      "roll flat": { scale: .7084 },
      "fold": { scale: .2391 },
      "tuck": { scale: .4884 },
      "prop": { scale: .7831 },
      "fours": { scale: .737, progress: { speed: .7269, near: .2155, turn: .3278 } },
      "sit": { scale: 1.447 },
      "kneel 0": { scale: .8964 },
      "kneel 1": { scale: .3324 },
      "kneel 2": { scale: .2436 },
      "arms": { scale: .1 },
      "hold": { scale: .2277 },
      "tall 0": { scale: .1728 },
      "tall 1": { scale: 1.138 },
      "tall 2": { scale: .1523 },
      "tall": { scale: .1462 },
      "shift": { scale: .4499 },
      "lift": { scale: .1713 },
      "swing": { scale: .5783 },
      "reach": { scale: .166 },
      "half kneel": { scale: .4378, progress: { speed: .7257, near: .1478, turn: .1643 } },
      "onto the toes": { scale: .6301, progress: { speed: .5705, near: .09171, turn: .135 } },
      "lunge 0": { scale: .648, progress: { speed: .4866, near: .06807, turn: .1505 } },
      "lunge 1": { scale: 1.672, progress: { speed: .1627, near: .03906, turn: .1152 } },
      "lunge 2": { scale: .4692, progress: { speed: .3038, near: .1747, turn: .09124 } },
      "lunge 3": { scale: .4, progress: { speed: .1609, near: .25, turn: .1354 } },
      "even": { scale: .6327, progress: { speed: .05685, near: .0998, turn: .1247 } },
    },
  },
});

/**
 * The step-up's tuning for `model`; a model it has none for cannot play it. It is the model's
 * whatever its feet: a toed body plays the flat foot's stages, which stand none of its falls (a
 * swung foot hangs its toes at a right angle and lands on end on them).
 */
export function stepUpTuning(model: string): StepUpTuning {
  if (!Object.hasOwn(STEP_UP, model)) throw new Error(`the step-up has no tuning for ${model}`);
  return STEP_UP[model as HumanoidModel];
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
