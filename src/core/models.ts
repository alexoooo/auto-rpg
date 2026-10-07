import { HUMANOID_MODELS, humanoidSpec, type HumanoidModel } from "./human/spec.ts";
import { frameOf, type BodySpec } from "./spec/body.ts";
import { lowsOf } from "./control/ground.ts";
import { FIGHTER, QUADRUPED, type MindConfig } from "./mind/config.ts";
import { reptileSpec } from "./reptile/spec.ts";
import { deepFreeze } from "./state.ts";
import { ATTACK_METRES } from "./mind/fighter.ts";
import { canHold } from "./human/grip.ts";
import { commandable } from "./body.ts";
import { quadrupedFits } from "./reptile/mind.ts";

/** Models available to game builders, independent of a family's anatomical constructor. */
export type BodyModel = HumanoidModel | "reptile";
export const BODY_MODELS: readonly BodyModel[] = Object.freeze([...HUMANOID_MODELS, "reptile"]);
export { HUMANOID_MODELS, type HumanoidModel };

/** The model list owns defaults; what a body can do is read from its spec (`modelHolds`, `modelSupportsMind`). */
export function modelInfo(model: BodyModel) {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return HUMANOID;
    case "reptile": return reptile();
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** Every humanoid's defaults and its retained footprint and spacing: `docs/reference/reptile.md#encounters`. */
const HUMANOID = deepFreeze({ mind: FIGHTER, held: "club" as const, radius: .35, attackMetres: ATTACK_METRES, progressSeconds: 1, fallEndsFight: true });

let reptileInfo: ReturnType<typeof readReptile> | undefined;
const reptile = () => reptileInfo ??= readReptile();
/** Collider footprint, bite spacing and continued dungeon recovery: `docs/reference/reptile.md#encounters`. */
function readReptile() {
  const anatomy = reptileSpec();
  const radius = Math.max(...anatomy.segments.flatMap(s => lowsOf(s.shape, frameOf(s)).map(p => Math.sqrt(p.at[0] * p.at[0] + p.at[2] * p.at[2]) + p.radius)));
  return deepFreeze({ mind: QUADRUPED, held: "empty" as const, radius, attackMetres: .52, progressSeconds: 8, fallEndsFight: false });
}

/** Anatomical construction dispatches by registered model, without another family's spec as a template. */
export function modelSpec(model: BodyModel): BodySpec {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return humanoidSpec(model);
    case "reptile": return reptileSpec();
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** What each model's body can do, read from its spec once. */
const fits = new Map<BodyModel, { readonly holds: boolean; readonly commandable: boolean; readonly quadruped: boolean }>();
function fitOf(model: BodyModel) {
  let fit = fits.get(model);
  if (!fit) {
    const spec = modelSpec(model);
    fit = Object.freeze({ holds: canHold(spec, "right"), commandable: commandable(spec), quadruped: quadrupedFits(spec) });
    fits.set(model, fit);
  }
  return fit;
}

/** Whether `model`'s right hand can close on a haft (`canHold`). */
export const modelHolds = (model: BodyModel): boolean => fitOf(model).holds;

/** Joint-feedback control is body-neutral; the other minds need the body their commands name. */
export function modelSupportsMind(model: BodyModel, mind: MindConfig): boolean {
  switch (mind.kind) {
    case "direct": return true;
    case "quadruped": return fitOf(model).quadruped;
    case "fighter": case "arena-fighter": case "point-fighter": return fitOf(model).commandable;
    default: { const never: never = mind; throw new Error(`unknown mind ${never}`); }
  }
}
