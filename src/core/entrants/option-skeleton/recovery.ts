import type { BodyView } from "../../body.ts";
import type { OwnBody } from "../../mind/mind.ts";
import type { MindKit } from "../../mind/kit.ts";
import type { BodySpec } from "../../spec/body.ts";
import { carrying } from "../../control/motor.ts";
import { deepFreeze } from "../../state.ts";
import data from "../../../../assets/entrants/option-skeleton/recovery.json" with { type: "json" };
import { RISE, stageFaults, type Recipe, type Stage } from "../../mind/rise/stages.ts";
import { stagedRise } from "../../mind/rise/staged.ts";
import { stepUpRecipe, stepUpTuning, stanceSteady } from "../../mind/ground/step-up.ts";
import { standReady } from "../../mind/ground/reading.ts";
import { technique, TO_STANDING, type TechniqueEnd, type TechniqueRun } from "../../mind/ground/technique.ts";
import { skeletonRoll } from "./roll.ts";

/** Timings screened on the Arena's engine; the hand-back keeps its physical standing criteria. */
const RECOVERY = deepFreeze(data);

/** The half kneel hands over to the stance, which lifts the remaining knee and steadies. */
export function recoveryRecipe(spec: BodySpec): Recipe {
  const recipe = stepUpRecipe(stepUpTuning(spec.model));
  const end = recipe.rise.findIndex((stage) => stage.name === "half kneel") + 1, step = recipe.rise.findIndex((stage) => stage.name === "shift");
  return deepFreeze({ ...recipe, rise: recipe.rise.slice(0, end).map((stage, i): Stage => ({ ...stage,
    seconds: stage.name === "fold" ? RECOVERY.fold : stage.name === "tuck" ? RECOVERY.tuck : stage.name === "prop" ? RECOVERY.prop
      : stage.seconds * (i < step ? RECOVERY.kneelScale : RECOVERY.stepScale) })) });
}

/** The roll and rise run share the same bounded muscles and normal standing hand-back. */
export function skeletonRecovery(own: OwnBody, view: BodyView, kit: MindKit,
  recipe: Recipe = recoveryRecipe(own.spec), climb = RECOVERY.climb): TechniqueRun {
  const roll = skeletonRoll(own), rise = stagedRise(own, view, recipe);
  const motor = carrying(kit.motor(own.built, .1, kit.posture), ["stance"], "Skeleton recovery");
  const steady = stanceSteady(own, view, motor, climb);
  const state = { phase: "roll" as "roll" | "rise" | "steady", elapsed: 0, begun: false, rose: false, ended: null as TechniqueEnd | null,
    roll: roll.state, rise: rise.state, motor: motor.state, steady: steady.state };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  return {
    state, get phase() { return state.phase === "steady" ? "steady" : state.phase === "roll" ? roll.phase : rise.state.phase; },
    get yields() { return state.ended !== null || state.phase === "steady"; },
    admits: (g, side) => side === "left" && g.spin < 8 && g.velocity.lengthSquared() < 9 && g.position !== "standing" && g.position !== "crouch",
    reached: (g, to) => to === "standing" && standReady({ down: view.down, ground: g }),
    begin() { state.phase = "roll"; state.elapsed = 0; state.begun = false; state.rose = false; state.ended = null; motor.reset(); },
    end() { roll.end(); rise.end(); finish("interrupted"); },
    step(g, senses, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      if (state.elapsed > 16) { roll.end(); rise.end(); return finish("timed-out"); }
      if (!state.begun) {
        state.begun = true;
        if (g.lie === "front") { state.phase = "rise"; rise.begin(); }
        else roll.begin(g.lie === "right" ? "right" : "left");
      }
      if (state.phase === "roll") {
        const end = roll.step(g, senses, dt);
        if (end === null) return null;
        if (end !== "done") return finish(end);
        rise.begin(); state.phase = "rise";
      }
      if (state.phase === "rise") {
        if (rise.state.phase === "rise") state.rose = true;
        else if (state.rose && rise.state.phase === "settle") { rise.end(); return finish("failed"); }
        if (rise.state.phase !== "idle") { rise.step(senses, dt); return null; }
        steady.begin(g); state.phase = "steady";
      }
      const end = steady.step(g, dt);
      return end === null ? null : finish(end);
    },
  };
}

/** The Skeleton's recovery as a private technique. */
export const SKELETON_RECOVERY = {
  ...technique("skeleton-recovery", { label: "Skeleton recovery", stage: "experimental", sides: ["left"], edges: TO_STANDING,
    make: (own, view, _clock, kit) => skeletonRecovery(own, view, kit) }),
  fits: (spec: BodySpec) => spec.model !== "crypt-skeleton" ? "needs a Skeleton" : stageFaults(RISE, spec)[0] ?? null,
};
