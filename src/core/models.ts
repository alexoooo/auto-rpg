import { HUMANOID_MODELS, humanoidSpec, type HumanoidModel } from "./human/spec.ts";
import { frameOf, type BodySpec } from "./spec/body.ts";
import { lowsOf } from "./control/ground.ts";
import { FIGHTER, QUADRUPED, type MindConfig } from "./mind/config.ts";
import { reptileSpec } from "./reptile/spec.ts";
import { deepFreeze } from "./state.ts";
import { ATTACK_METRES } from "./mind/fighter.ts";

/** Models available to game builders, independent of a family's anatomical constructor. */
export type BodyModel = HumanoidModel | "reptile";
export const BODY_MODELS: readonly BodyModel[] = Object.freeze([...HUMANOID_MODELS, "reptile"]);
export { HUMANOID_MODELS, type HumanoidModel };

/** The model list owns defaults and compatibility; screens do not infer them from anatomy names. */
export function modelInfo(model: BodyModel) {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return HUMANOIDS[model];
    case "reptile": return REPTILE;
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** Humanoid defaults and their retained footprint and spacing: `docs/reference/reptile.md#encounters`. */
const HUMANOIDS = deepFreeze({
  "workshop-fighter": { label: "Warrior", mind: FIGHTER, held: "club" as const, hands: true, clothing: true, radius: .35, attackMetres: ATTACK_METRES, progressSeconds: 1, fallEndsFight: true },
  "workshop-rogue": { label: "Rogue", mind: FIGHTER, held: "club" as const, hands: true, clothing: true, radius: .35, attackMetres: ATTACK_METRES, progressSeconds: 1, fallEndsFight: true },
  "crypt-skeleton": { label: "Skeleton", mind: FIGHTER, held: "club" as const, hands: true, clothing: false, radius: .35, attackMetres: ATTACK_METRES, progressSeconds: 1, fallEndsFight: true },
});
const anatomy = reptileSpec();
const radius = Math.max(...anatomy.segments.flatMap(s => lowsOf(s.shape, frameOf(s)).map(p => Math.sqrt(p.at[0] * p.at[0] + p.at[2] * p.at[2]) + p.radius)));
/** Collider footprint, bite spacing and continued dungeon recovery: `docs/reference/reptile.md#encounters`. */
const REPTILE = deepFreeze({ label: "Reptile", mind: QUADRUPED, held: "empty" as const, hands: false, clothing: false, radius, attackMetres: .52, progressSeconds: 8, fallEndsFight: false });

/** Anatomical construction dispatches by registered model, without another family's spec as a template. */
export function modelSpec(model: BodyModel): BodySpec {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return humanoidSpec(model);
    case "reptile": return reptileSpec();
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** Joint-feedback control is body-neutral; other controllers require their endpoint layout. */
export function modelSupportsMind(model: BodyModel, mind: MindConfig): boolean {
  switch (mind.kind) {
    case "direct": return true;
    case "quadruped": return model === "reptile";
    case "fighter": case "arena-fighter": case "point-fighter": return modelInfo(model).hands;
    default: { const never: never = mind; throw new Error(`unknown mind ${never}`); }
  }
}
