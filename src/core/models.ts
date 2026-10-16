import { HUMANOID_MODELS, humanoidSpec, type HumanoidModel } from "./human/spec.ts";
import type { Physique } from "./human/physique.ts";
import type { BodySpec } from "./spec/body.ts";
import { OPTIONS, QUADRUPED, type MindConfig } from "./mind/config.ts";
import { treeFits } from "./mind/catalog.ts";
import { reptileSpec } from "./reptile/spec.ts";
import { deepFreeze } from "./state.ts";
import { canHold } from "./human/grip.ts";
import type { Held } from "./items/held.ts";

/** Models available to game builders, independent of a family's anatomical constructor. */
export type BodyModel = HumanoidModel | "reptile";
export const BODY_MODELS: readonly BodyModel[] = Object.freeze([...HUMANOID_MODELS, "reptile"]);
export { HUMANOID_MODELS, type HumanoidModel };

/** A model's defaults: the mind it fights under and what its right hand holds, unless a fight says otherwise. */
interface ModelInfo {
  readonly mind: MindConfig;
  readonly held: Held;
}

/** The model list owns defaults; what a body can do is read from its spec (`modelHolds`, `modelSupportsMind`). */
export function modelInfo(model: BodyModel): ModelInfo {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return HUMANOID;
    case "reptile": return REPTILE;
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

const HUMANOID: ModelInfo = deepFreeze({ mind: OPTIONS, held: "club" });
const REPTILE: ModelInfo = deepFreeze({ mind: QUADRUPED, held: "empty" });

/**
 * Anatomical construction dispatches by registered model, without another family's spec as a
 * template. A humanoid takes a physique (`Physique`) and `attributes` in place of its character's: a
 * haste, per cent (`AttributeSpec.haste`); the reptile takes neither.
 */
export function modelSpec(model: BodyModel, physique?: Physique, attributes: { readonly haste?: number } = {}): BodySpec {
  const { haste } = attributes;
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return humanoidSpec(model, physique, haste);
    case "reptile":
      if (physique) throw new Error("the reptile takes no physique");
      if (haste !== undefined) throw new Error("the reptile takes no haste");
      return reptileSpec();
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** Whether `model` takes a haste in place of its character's (`modelSpec`). */
export function modelHastes(model: BodyModel): boolean {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return true;
    case "reptile": return false;
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** Each model's spec, read once, for what its body can do. */
const specs = new Map<BodyModel, BodySpec>();
function specOf(model: BodyModel): BodySpec {
  let spec = specs.get(model);
  if (!spec) specs.set(model, spec = modelSpec(model));
  return spec;
}

/** Whether `model`'s right hand can close on a haft (`canHold`). */
export const modelHolds = (model: BodyModel): boolean => canHold(specOf(model), "right");

/** Whether `model`'s body can carry out what every part of `mind` commands (`treeFits`). */
export const modelSupportsMind = (model: BodyModel, mind: MindConfig): boolean => treeFits(specOf(model), mind);
