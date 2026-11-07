import { HUMANOID_MODELS, humanoidSpec, humanoidSpecChecked, type HumanoidModel } from "./human/spec.ts";
import type { Physique } from "./human/physique.ts";
import type { BodySpec } from "./spec/body.ts";
import { reptileSpec } from "./quadruped/spec.ts";
import reptileBody from "../../../assets/reptile/body.json" with { type: "json" };
import ratBody from "../../../assets/rat/body.json" with { type: "json" };
import { deepFreeze } from "../state.ts";
import { isRefused, type Refused } from "../refusal.ts";
import { canHold } from "./human/grip.ts";
import { loadoutFaults, withLoadout, withLoadoutChecked, type Loadout } from "./items/held.ts";
import { attributesError, type AttributeOverrides, type CharacterAttributes } from "./character-attributes.ts";
import { sourced } from "../quantity.ts";
import { quantityAdmission } from "./spec/admission.ts";
import { bodyIntersections } from "./spec/clearance.ts";
import { reptilePhysique } from "./quadruped/physique.ts";

/** Models available to game builders, independent of a family's anatomical constructor. */
export type BodyModel = HumanoidModel | "reptile" | "rat";
export const BODY_MODELS: readonly BodyModel[] = Object.freeze([...HUMANOID_MODELS, "reptile", "rat"]);
export { HUMANOID_MODELS, type HumanoidModel };

/** A model with explicit attribute overrides; omitted fields inherit that model's defaults. */
export interface CharacterConfig { readonly model: BodyModel; readonly attributes?: AttributeOverrides }

/** A resolved recipe and its sourced anatomy, shared by previews, fights and saved setups. */
export interface ResolvedCharacter {
  readonly config: { readonly model: BodyModel; readonly attributes: CharacterAttributes };
  readonly spec: BodySpec;
}

/**
 * **A body family's entry** (`FAMILIES`): its unmodified anatomy, that anatomy under a physique
 * and haste, and whether it takes a haste in place of its character's.
 */
interface Family {
  spec(model: BodyModel): BodySpec;
  physique(model: BodyModel, original: BodySpec, physique: Physique, haste: number): BodySpec | Refused;
  readonly hastes: boolean;
}

const HUMANOID: Family = deepFreeze({ spec: (model: BodyModel) => humanoidSpec(model as HumanoidModel),
  physique: (model: BodyModel, _original: BodySpec, physique: Physique, haste: number) => humanoidSpecChecked(model as HumanoidModel, physique, haste),
  hastes: true });
/** A quadruped's family over its body file: the reptile's sprawl, or the rat's legs under its trunk. */
const quadruped = (data: Parameters<typeof reptileSpec>[0], source: Parameters<typeof reptileSpec>[2]): Family => deepFreeze({
  spec: (model: BodyModel) => reptileSpec(data, model, source),
  physique: (_model: BodyModel, original: BodySpec, physique: Physique, haste: number) => reptilePhysique(original, physique, haste),
  hastes: true });
const REPTILE = quadruped(reptileBody, "reptile-anatomy"), RAT = quadruped(ratBody, "rat-anatomy");

/** **Every model's family**: the one list a body family is added to in the core. */
const FAMILIES: Readonly<Record<BodyModel, Family>> = Object.freeze({ "workshop-fighter": HUMANOID, "workshop-rogue": HUMANOID, "crypt-skeleton": HUMANOID, reptile: REPTILE, rat: RAT });

/** The family of a trusted model from `BODY_MODELS`. */
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

/** Safe authored rule graphs retain exactly the modifier branches a supplied recipe uses. */
const arithmeticTemplates = new Map<BodyModel, Map<string, BodySpec>>();

function scalingRefusal(model: BodyModel, physique: Physique, haste: number, defaultHaste: number): Refused | null {
  const keys = Object.keys(physique), key = keys.join(",") + (haste === defaultHaste ? "" : ",haste");
  let templates = arithmeticTemplates.get(model);
  if (!templates) arithmeticTemplates.set(model, templates = new Map());
  let template = templates.get(key);
  if (!template) {
    // An adjacent representable factor keeps a modifier active without changing the body's geometry materially.
    const active = 1 + Number.EPSILON;
    const neutral = Object.fromEntries(keys.map((name) => [name, active]));
    const made = familyOf(model).physique(model, specOf(model), neutral,
      haste === defaultHaste ? defaultHaste : Number.EPSILON);
    if (isRefused(made)) throw new Error(`a model's neutral scaling rules do not build: ${made.refused}`);
    templates.set(key, template = deepFreeze(made));
  }
  return quantityAdmission(template, (quantity) => {
    const from = quantity.provenance;
    if (from.kind !== "source") return undefined;
    if (from.source === "owner-physique") {
      const name = from.where.startsWith("reptile ") ? from.where.slice("reptile ".length) : from.where;
      return Object.hasOwn(physique, name) ? physique[name as keyof Physique] : undefined;
    }
    return from.source === "owner-haste" && (from.where === "a bout's haste" || from.where === "the reptile's four legs") ? haste : undefined;
  }, (quantity, value) => {
    // These positive physical capacities cannot disappear when every supplied factor is positive.
    if (!["kg", "kg m2", "m3", "N m", "rad/s"].includes(quantity.unit)) return null;
    const before = quantity.value, vanished = typeof before === "number" && typeof value === "number"
      ? before > 0 && value === 0
      : Array.isArray(before) && Array.isArray(value) && before.some((number, k) => number > 0 && value[k] === 0);
    return vanished ? `${quantity.provenance.kind === "derived" ? quantity.provenance.rule : quantity.provenance.where} underflows a positive physical quantity` : null;
  });
}

/** Resolve supplied character settings, returning unsupported attributes or geometry before construction. */
export function resolveCharacterChecked(character: CharacterConfig): ResolvedCharacter | Refused {
  const { model } = character, overrides = character.attributes ?? {};
  if (!Object.hasOwn(FAMILIES, model)) return { refused: `unknown model ${String(model)}` };
  const invalid = attributesError(overrides);
  if (invalid) return { refused: invalid };
  const defaults = characterDefaults(model), attributes = Object.freeze({ ...defaults,
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) }) as CharacterAttributes;
  const physique = Object.fromEntries((["size", "weight", "strength", "speed"] as const)
    .filter(key => attributes[key] !== 1).map(key => [key, attributes[key]]));
  const changed = Object.keys(physique).length > 0 || attributes.haste !== defaults.haste;
  if (changed) {
    const invalid = scalingRefusal(model, physique, attributes.haste, defaults.haste);
    if (invalid) return invalid;
  }
  let spec = !changed ? specOf(model) : familyOf(model).physique(model, specOf(model), physique, attributes.haste);
  if (isRefused(spec)) return spec;
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
      if (faults.length) return { refused: `Invalid ${model} geometry: ${faults.join("; ")}` };
      checked.add(key);
      if (checked.size > 64) checked.delete(checked.values().next().value!);
    }
  }
  return Object.freeze({ config: Object.freeze({ model, attributes }), spec: deepFreeze(spec) });
}

/** Resolve a trusted recipe whose model, attributes and geometry already satisfy the body contract. */
export function resolveCharacter(character: CharacterConfig): ResolvedCharacter {
  const resolved = resolveCharacterChecked(character);
  if (isRefused(resolved)) throw new Error(resolved.refused);
  return resolved;
}

/**
 * Positional construction adapter for trusted scripts and experiments; external settings use `resolveCharacterChecked`.
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

/** Resolve external character settings and equipment before any world or body is made. */
export function modelHoldingChecked(model: BodyModel, loadout: Loadout, attributes?: AttributeOverrides): BodySpec | Refused {
  const character = resolveCharacterChecked({ model, ...(attributes === undefined ? {} : { attributes }) });
  return isRefused(character) ? character : withLoadoutChecked(character.spec, loadout);
}
