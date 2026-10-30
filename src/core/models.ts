import { HUMANOID_MODELS, humanoidSpec, type HumanoidModel } from "./human/spec.ts";
import type { Physique } from "./human/physique.ts";
import type { BodySpec } from "./spec/body.ts";
import { reptileSpec } from "./reptile/spec.ts";
import { deepFreeze } from "./state.ts";
import { canHold } from "./human/grip.ts";
import { LOADOUTS, loadoutFaults, withLoadout, type Held, type Loadout } from "./items/held.ts";
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

/** A model's defaults: what its right hand holds, unless a fight says otherwise. */
interface ModelInfo {
  readonly held: Held;
}

/**
 * **A body family's entry** (`FAMILIES`): its unmodified anatomy, that anatomy under a physique
 * and haste, its defaults, and whether it takes a haste in place of its character's.
 */
interface Family {
  spec(model: BodyModel): BodySpec;
  physique(model: BodyModel, original: BodySpec, physique: Physique, haste: number): BodySpec;
  readonly info: ModelInfo;
  readonly hastes: boolean;
}

const HUMANOID: Family = deepFreeze({ spec: (model: BodyModel) => humanoidSpec(model as HumanoidModel),
  physique: (model: BodyModel, _original: BodySpec, physique: Physique, haste: number) => humanoidSpec(model as HumanoidModel, physique, haste),
  info: { held: "sword" }, hastes: true });
const REPTILE: Family = deepFreeze({ spec: () => reptileSpec(),
  physique: (_model: BodyModel, original: BodySpec, physique: Physique, haste: number) => reptilePhysique(original, physique, haste),
  info: { held: "empty" }, hastes: true });

/** **Every model's family**: the one list a body family is added to in the core. */
const FAMILIES: Readonly<Record<BodyModel, Family>> = Object.freeze({ "workshop-fighter": HUMANOID, "workshop-rogue": HUMANOID, "crypt-skeleton": HUMANOID, reptile: REPTILE });

/** `model`'s family; a thrown error for a model there is none of, read from a save or a link. */
function familyOf(model: BodyModel): Family {
  const family = Object.hasOwn(FAMILIES, model) ? FAMILIES[model] : undefined;
  if (!family) throw new Error(`unknown model ${String(model)}`);
  return family;
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
  let spec = !changed ? specOf(model) : familyOf(model).physique(model, specOf(model), physique, attributes.haste);
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

/** The model list owns defaults; what a body can do is read from its spec (`modelHolds`). */
export function modelInfo(model: BodyModel): ModelInfo {
  return familyOf(model).info;
}

/** What a body of `model` carries unless a fight says otherwise: its model's item in its right hand (`ModelInfo.held`), its left empty. */
export const modelLoadout = (model: BodyModel): Loadout => LOADOUTS.find((loadout) => loadout.left === "empty" && loadout.right === modelInfo(model).held)!;

/**
 * Positional construction adapter for scripts and experiments; game setups use `resolveCharacter`.
 */
export function modelSpec(model: BodyModel, physique?: Physique, attributes: { readonly haste?: number } = {}): BodySpec {
  return resolveCharacter({ model, attributes: { ...physique, ...attributes } }).spec;
}

/** Whether `model` takes a haste in place of its character's (`modelSpec`). */
export function modelHastes(model: BodyModel): boolean {
  return familyOf(model).hastes;
}

/** Each model's spec, read once, for what its body can do. */
const specs = new Map<BodyModel, BodySpec>();
function specOf(model: BodyModel): BodySpec {
  let spec = specs.get(model);
  if (!spec) specs.set(model, spec = deepFreeze(familyOf(model).spec(model)));
  return spec;
}

/** Whether `model`'s right hand can close on a haft (`canHold`). */
export const modelHolds = (model: BodyModel): boolean => canHold(specOf(model), "right");

/** Each model's spec with each per-hand loadout, read once. */
const holding = new Map<string, BodySpec>();
/**
 * `model`'s spec carrying `loadout` (`withLoadout`), read once: the body a mind must fit.
 * A model that cannot hold an assigned item is refused.
 */
export function modelHolding(model: BodyModel, loadout: Loadout, attributes?: AttributeOverrides): BodySpec {
  const faults = loadoutFaults(loadout);
  if (faults.length) throw new Error(faults.join("; "));
  if (attributes && Object.keys(attributes).length) {
    const own = resolveCharacter({ model, attributes }).spec;
    return withLoadout(own, loadout);
  }
  if (loadout.left === "empty" && loadout.right === "empty") return specOf(model);
  const key = `${model}/${loadout.left},${loadout.right}`;
  let spec = holding.get(key);
  if (!spec) holding.set(key, spec = withLoadout(specOf(model), loadout));
  return spec;
}
