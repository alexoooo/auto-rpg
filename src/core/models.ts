import { HUMANOID_MODELS, humanoidSpec, type HumanoidModel } from "./human/spec.ts";
import type { Physique } from "./human/physique.ts";
import type { BodySpec } from "./spec/body.ts";
import { OPTIONS, QUADRUPED, type MindConfig } from "./mind/config.ts";
import { treeFits } from "./mind/catalog.ts";
import { reptileSpec } from "./reptile/spec.ts";
import { deepFreeze } from "./state.ts";
import { canHold } from "./human/grip.ts";
import { armedWith, type Held } from "./items/held.ts";
import { validateAttributes, type AttributeOverrides, type CharacterAttributes } from "./character-attributes.ts";
import { sourced } from "./spec/quantity.ts";
import { bodyIntersections } from "./spec/clearance.ts";
import { reptilePhysique } from "./reptile/physique.ts";

/** Models available to game builders, independent of a family's anatomical constructor. */
export type BodyModel = HumanoidModel | "reptile";
export const BODY_MODELS: readonly BodyModel[] = Object.freeze([...HUMANOID_MODELS, "reptile"]);
export { HUMANOID_MODELS, type HumanoidModel };

/** A model with explicit attribute overrides; omitted fields inherit that model's defaults. */
export interface CharacterConfig { readonly model: BodyModel; readonly attributes?: AttributeOverrides }

/** A resolved recipe and its sourced anatomy, shared by previews, fights and saved setups. */
export interface ResolvedCharacter {
  readonly config: { readonly model: BodyModel; readonly attributes: CharacterAttributes };
  readonly spec: BodySpec;
}

/** The family's unmodified anatomy. */
function originalSpec(model: BodyModel): BodySpec {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return humanoidSpec(model);
    case "reptile": return reptileSpec();
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** Model defaults, including its own hit points and assistance capabilities. */
export function characterDefaults(model: BodyModel): CharacterAttributes {
  const spec = specOf(model);
  return Object.freeze({ size: 1, weight: 1, strength: 1, speed: 1, hp: spec.wounds.hp.value,
    balance: spec.attributes.balance.value, haste: spec.attributes.haste.value });
}

/** Geometry validation depends only on geometric modifiers; each model retains its most recent valid configurations. */
const checkedGeometry = new Map<BodyModel, Set<string>>();

/** Resolve and validate a character before a page replaces its running world. */
export function resolveCharacter(character: CharacterConfig): ResolvedCharacter {
  const { model } = character, overrides = character.attributes ?? {};
  validateAttributes(overrides);
  const defaults = characterDefaults(model), attributes = Object.freeze({ ...defaults,
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) }) as CharacterAttributes;
  const physique = Object.fromEntries((["size", "weight", "strength", "speed"] as const)
    .filter(key => attributes[key] !== 1).map(key => [key, attributes[key]]));
  const changed = Object.keys(physique).length > 0 || attributes.haste !== defaults.haste;
  let spec = !changed ? specOf(model) : model === "reptile"
    ? reptilePhysique(specOf(model), physique, attributes.haste)
    : humanoidSpec(model, physique, attributes.haste);
  if (attributes.hp !== defaults.hp || attributes.balance !== defaults.balance) spec = { ...spec,
    wounds: attributes.hp === defaults.hp ? spec.wounds : { ...spec.wounds, hp: sourced(attributes.hp, "HP", "owner-hp-pool", "a character's configured hit points") },
    attributes: attributes.balance === defaults.balance ? spec.attributes : { ...spec.attributes, balance: sourced(attributes.balance, "%", "owner-balance", "a character's configured balance") },
  };
  if (attributes.size !== 1 || attributes.weight !== 1) {
    let checked = checkedGeometry.get(model);
    if (!checked) checkedGeometry.set(model, checked = new Set());
    const key = `${attributes.size},${attributes.weight}`;
    if (!checked.has(key)) {
      const faults = bodyIntersections(spec);
      if (faults.length) throw new Error(`Invalid ${model} geometry: ${faults.join("; ")}`);
      checked.add(key);
      if (checked.size > 64) checked.delete(checked.values().next().value!);
    }
  }
  return Object.freeze({ config: Object.freeze({ model, attributes }), spec: deepFreeze(spec) });
}

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
 * Positional construction adapter for scripts and experiments; game setups use `resolveCharacter`.
 */
export function modelSpec(model: BodyModel, physique?: Physique, attributes: { readonly haste?: number } = {}): BodySpec {
  return resolveCharacter({ model, attributes: { ...physique, ...attributes } }).spec;
}

/** Whether `model` takes a haste in place of its character's (`modelSpec`). */
export function modelHastes(model: BodyModel): boolean {
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": case "reptile": return true;
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}

/** Each model's spec, read once, for what its body can do. */
const specs = new Map<BodyModel, BodySpec>();
function specOf(model: BodyModel): BodySpec {
  let spec = specs.get(model);
  if (!spec) specs.set(model, spec = deepFreeze(originalSpec(model)));
  return spec;
}

/** Whether `model`'s right hand can close on a haft (`canHold`). */
export const modelHolds = (model: BodyModel): boolean => canHold(specOf(model), "right");

/** Each model's spec with each item in its right hand, read once. */
const holding = new Map<string, BodySpec>();
/**
 * `model`'s spec with `held` in its right hand (`armedWith`), read once: the body a mind of a
 * fight that hands it `held` must fit. A model that cannot hold `held` is refused.
 */
export function modelHolding(model: BodyModel, held: Held, attributes?: AttributeOverrides): BodySpec {
  if (attributes && Object.keys(attributes).length) {
    const own = resolveCharacter({ model, attributes }).spec;
    return held === "empty" ? own : armedWith(own, "right", held);
  }
  if (held === "empty") return specOf(model);
  const key = `${model}/${held}`;
  let spec = holding.get(key);
  if (!spec) holding.set(key, spec = armedWith(specOf(model), "right", held));
  return spec;
}

/**
 * Whether `model`'s body, holding `held` in its right hand, can carry out what every part of
 * `mind` commands (`treeFits`): a mind that works only with one loadout says so in a part's `fits`,
 * and is offered with no other. A body that cannot hold `held` supports no mind with it.
 */
export const modelSupportsMind = (model: BodyModel, mind: MindConfig, held: Held = "empty", attributes?: AttributeOverrides): boolean =>
  (held === "empty" || modelHolds(model)) && treeFits(modelHolding(model, held, attributes), mind);
