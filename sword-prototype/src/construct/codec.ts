import { controlDigest, validateControlGraph, type ConstructControlGraph } from "./actions.ts";
import { modulePrimitiveAtLocalPoint, validateBlueprint, validateLegacyBlueprint, validateV2Blueprint, validateV3Blueprint, validateV4Blueprint,
  type ConstructBlueprint, type LegacyConstructBlueprint, type V2ConstructBlueprint,
  type V3ConstructBlueprint, type V4ConstructBlueprint } from "./blueprint.ts";
import { blueprintDigest, legacyBlueprintDigest, v2BlueprintDigest, v3BlueprintDigest, v4BlueprintDigest } from "./canonical.ts";
import { parseProgram, programDigest, type ConstructProgram, type Expression } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { installedSensorsForBlueprint } from "./sensors.ts";
import { canonicalJson, type ArtifactValue } from "../learning/artifact.ts";

export const SAVED_CONSTRUCT_VERSION = 5 as const;
export const SAVED_CONSTRUCT_MAX_BYTES = 1_000_000;

export interface SavedConstruct {
  readonly version: 5;
  readonly name: string;
  readonly blueprint: ConstructBlueprint;
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly digests: Readonly<{ blueprint: string; control: string; program: string }>;
}

/** A control graph is saved with one body, so stale hardware references are an import error. */
function validateControlHardware(
  blueprint: ConstructBlueprint | LegacyConstructBlueprint | V2ConstructBlueprint | V3ConstructBlueprint | V4ConstructBlueprint,
  controlValue: ConstructControlGraph,
  installedSensors: readonly SensorSpec[],
): ConstructControlGraph {
  const control = validateControlGraph(controlValue);
  const joints = new Set(blueprint.joints.map(({ id }) => id));
  const modules = new Map(blueprint.modules.map((module) => [module.id, module]));
  const sensors = new Set(installedSensors.map(({ id }) => id));
  for (const group of control.groups) {
    const missingJoint = group.joints.find((id) => !joints.has(id));
    if (missingJoint) throw new Error(`control group "${group.id}" references blueprint-missing joint "${missingJoint}"`);
    const missingModule = group.modules.find((id) => !modules.has(id));
    if (missingModule) throw new Error(`control group "${group.id}" references blueprint-missing module "${missingModule}"`);
  }
  for (const action of control.actions) for (const claim of action.claims) {
    if (claim.startsWith("resource:sensor-")) {
      const id = claim.slice("resource:sensor-".length);
      if (!sensors.has(id)) throw new Error(`action "${action.id}" references blueprint-missing sensor "${id}"`);
    } else if (claim.startsWith("resource:ammo-")) {
      const id = claim.slice("resource:ammo-".length);
      if (modules.get(id)?.kind !== "magazine") {
        throw new Error(`action "${action.id}" references blueprint-missing ammunition module "${id}"`);
      }
    } else if (claim.startsWith("resource:power-") &&
        !blueprint.modules.some(({ kind }) => kind === "power-core")) {
      throw new Error(`action "${action.id}" requires power but the blueprint has no power-core module`);
    }
  }
  return control;
}

type SavedSource = Readonly<{ version: 1 | 2 | 3 | 4 | 5; name: string; blueprint: unknown;
  control: ConstructControlGraph; program: ConstructProgram;
  digests: Readonly<{ blueprint: string; control: string; program: string }> }>;

const exact = (row: object, keys: readonly string[], context: string): void => {
  const names = Object.keys(row);
  const unknown = names.find((name) => !keys.includes(name));
  if (unknown) throw new Error(`${context} has unknown field "${unknown}"`);
  const missing = keys.find((name) => !names.includes(name));
  if (missing) throw new Error(`${context} is missing field "${missing}"`);
};

const divideDurabilityAndArmourByTwenty = (blueprint: LegacyConstructBlueprint): V2ConstructBlueprint =>
  validateV2Blueprint({ ...structuredClone(blueprint), version: 2,
    parts: blueprint.parts.map((part) => ({ ...part, health: part.health / 20, armour: part.armour / 20 })),
    joints: blueprint.joints.map((joint) => ({ ...joint, health: joint.health / 20, armour: joint.armour / 20 })),
    modules: blueprint.modules.map((module) => ({ ...module, health: module.health / 20,
      armour: module.armour / 20 })),
  });

const containsSensor = (expression: Expression, ids: ReadonlySet<string>): string | null => {
  if (expression.op === "sensor") return ids.has(expression.id) ? expression.id : null;
  if (expression.op === "active" || expression.op === "constant") return null;
  if (expression.op === "not") return containsSensor(expression.value, ids);
  if ("values" in expression) {
    for (const value of expression.values) { const found = containsSensor(value, ids); if (found) return found; }
    return null;
  }
  return containsSensor(expression.left, ids) ?? containsSensor(expression.right, ids);
};

function migrateExpression(expression: Expression, absolute: ReadonlySet<string>, rule: string): Expression {
  if (["lt", "lte", "gt", "gte"].includes(expression.op)) {
    const comparison = expression as Extract<Expression, { op: "lt" | "lte" | "gt" | "gte" }>;
    const direct = (sensorSide: Expression, constantSide: Expression): readonly [Expression, Expression] | null =>
      sensorSide.op === "sensor" && absolute.has(sensorSide.id) && constantSide.op === "constant" &&
        typeof constantSide.value === "number"
        ? [sensorSide, Object.freeze({ ...constantSide, value: constantSide.value / 20 })]
        : null;
    const left = direct(comparison.left, comparison.right);
    if (left) return Object.freeze({ ...comparison, left: left[0], right: left[1] });
    const right = direct(comparison.right, comparison.left);
    if (right) return Object.freeze({ ...comparison, left: right[1], right: right[0] });
    const sensor = containsSensor(expression, absolute);
    if (sensor) {
      throw new Error(`saved construct v1 program rule "${rule}" cannot migrate absolute health expression "${sensor}"`);
    }
    return expression;
  }
  if (expression.op === "not") {
    return Object.freeze({ ...expression, value: migrateExpression(expression.value, absolute, rule) });
  }
  if (expression.op === "and" || expression.op === "or") {
    return Object.freeze({ ...expression,
      values: Object.freeze(expression.values.map((value) => migrateExpression(value, absolute, rule))) });
  }
  const sensor = containsSensor(expression, absolute);
  if (sensor) throw new Error(`saved construct v1 program rule "${rule}" cannot migrate absolute health expression "${sensor}"`);
  return expression;
}

function migrateAbsoluteHealthComparisons(
  program: ConstructProgram,
  sensors: readonly SensorSpec[],
): ConstructProgram {
  const absolute = new Set(sensors.filter(({ combatValue }) => combatValue === "absolute").map(({ id }) => id));
  const rules = program.rules.map((rule) => Object.freeze({ ...rule,
    condition: migrateExpression(rule.condition, absolute, rule.id),
    utility: migrateExpression(rule.utility, absolute, rule.id),
    parameters: Object.freeze(Object.fromEntries(Object.entries(rule.parameters).map(([name, parameter]) =>
      [name, parameter.kind === "expression" ? Object.freeze({ ...parameter,
        value: migrateExpression(parameter.value, absolute, rule.id) }) : parameter]))),
  }));
  return Object.freeze({ ...program, rules: Object.freeze(rules) });
}

function validateSavedSource(value: unknown): SavedSource {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("saved construct must be an object");
  exact(value, ["version", "name", "blueprint", "control", "program", "digests"], "saved construct");
  const source = value as Partial<SavedSource>;
  if (![1, 2, 3, 4, 5].includes(source.version as number)) {
    throw new Error(`saved construct version ${JSON.stringify(source.version)} is unsupported`);
  }
  if (typeof source.name !== "string" || !source.blueprint || !source.control || !source.program || !source.digests) {
    throw new Error("saved construct is missing name, blueprint, control, program or digests");
  }
  if (typeof source.digests !== "object" || Array.isArray(source.digests)) {
    throw new Error("saved construct digests must be an object");
  }
  exact(source.digests, ["blueprint", "control", "program"], "saved construct digests");
  return source as SavedSource;
}

function migrateSavedV1(source: SavedSource, sensors: readonly SensorSpec[]): SavedConstruct {
  const blueprint = validateLegacyBlueprint(source.blueprint);
  const installed = installedSensorsForBlueprint(blueprint, sensors);
  const control = validateControlHardware(blueprint, source.control, installed);
  const program = parseProgram(JSON.stringify(source.program), control, installed);
  const actual = { blueprint: legacyBlueprintDigest(blueprint), control: controlDigest(control),
    program: programDigest(program) };
  for (const key of ["blueprint", "control", "program"] as const) if (source.digests[key] !== actual[key]) {
    throw new Error(`saved construct ${key} digest ${JSON.stringify(source.digests[key])} does not match ${actual[key]}`);
  }
  const migratedBlueprint = divideDurabilityAndArmourByTwenty(blueprint);
  const migratedSensors = installedSensorsForBlueprint(migratedBlueprint, sensors);
  const migratedProgram = migrateAbsoluteHealthComparisons(program, migratedSensors);
  return saveConstruct(source.name, migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migratedBlueprint))), control,
    migratedProgram, sensors);
}

const migrateV2ToV3 = (blueprint: V2ConstructBlueprint): V3ConstructBlueprint => validateV3Blueprint({
  ...structuredClone(blueprint), version: 3,
  modules: blueprint.modules.map((module) => {
    if (!module.projectile) return module;
    const { damageScale, ...projectile } = module.projectile;
    return { ...module, projectile: { ...projectile, penetrationEfficiency: Math.min(1, damageScale) } };
  }),
});

const migrateV3ToV4 = (blueprint: V3ConstructBlueprint): V4ConstructBlueprint =>
  validateV4Blueprint({ ...structuredClone(blueprint), version: 4 });

/**
 * Version four had one broad contact point per mounted shield.  Version five names
 * an authored collision primitive so a later decorative primitive cannot silently
 * become a weapon.  The only v4 producer was the Warden's bash, so preserving its
 * action name keeps authentic imports playable while making its zero-damage shove
 * explicit in the new grammar.
 */
const migrateV4ToV5 = (blueprint: V4ConstructBlueprint): ConstructBlueprint => validateBlueprint({
  ...structuredClone(blueprint), version: 5,
  modules: blueprint.modules.map((module) => {
    const legacy = module.mountedContactStriker;
    if (!legacy) return module;
    const primitive = modulePrimitiveAtLocalPoint(module, legacy.localContactPoint);
    if (!primitive) {
      throw new Error(`saved construct v4 module "${module.id}" contact point no longer lies on a primitive`);
    }
    return { ...module, mountedContactStriker: { kind: "authored-surface", action: "bash", surfaces: [{
      id: "legacy-contact", primitiveId: primitive.id, kind: "mass", damageScale: 0,
      localContactPoint: legacy.localContactPoint, shoveSpecificImpulseMps: legacy.shoveSpecificImpulseMps,
    }] } };
  }),
});

function verifySavedDigests(source: SavedSource,
  blueprint: ConstructBlueprint | LegacyConstructBlueprint | V2ConstructBlueprint | V3ConstructBlueprint | V4ConstructBlueprint,
  control: ConstructControlGraph, program: ConstructProgram, digest: (value: unknown) => string): void {
  const actual = { blueprint: digest(blueprint), control: controlDigest(control), program: programDigest(program) };
  for (const key of ["blueprint", "control", "program"] as const) if (source.digests[key] !== actual[key]) {
    throw new Error(`saved construct ${key} digest ${JSON.stringify(source.digests[key])} does not match ${actual[key]}`);
  }
}

function migrateSavedV2(source: SavedSource, sensors: readonly SensorSpec[]): SavedConstruct {
  const blueprint = validateV2Blueprint(source.blueprint);
  const installed = installedSensorsForBlueprint(blueprint, sensors);
  const control = validateControlHardware(blueprint, source.control, installed);
  const program = parseProgram(JSON.stringify(source.program), control, installed);
  verifySavedDigests(source, blueprint, control, program, v2BlueprintDigest);
  return saveConstruct(source.name, migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(blueprint))), control, program, sensors);
}

function migrateSavedV3(source: SavedSource, sensors: readonly SensorSpec[]): SavedConstruct {
  const blueprint = validateV3Blueprint(source.blueprint);
  const installed = installedSensorsForBlueprint(blueprint, sensors);
  const control = validateControlHardware(blueprint, source.control, installed);
  const program = parseProgram(JSON.stringify(source.program), control, installed);
  verifySavedDigests(source, blueprint, control, program, v3BlueprintDigest);
  return saveConstruct(source.name, migrateV4ToV5(migrateV3ToV4(blueprint)), control, program, sensors);
}

function migrateSavedV4(source: SavedSource, sensors: readonly SensorSpec[]): SavedConstruct {
  const blueprint = validateV4Blueprint(source.blueprint);
  const installed = installedSensorsForBlueprint(blueprint, sensors);
  const control = validateControlHardware(blueprint, source.control, installed);
  const program = parseProgram(JSON.stringify(source.program), control, installed);
  verifySavedDigests(source, blueprint, control, program, v4BlueprintDigest);
  return saveConstruct(source.name, migrateV4ToV5(blueprint), control, program, sensors);
}

export function saveConstruct(
  name: string,
  blueprintValue: ConstructBlueprint,
  controlValue: ConstructControlGraph,
  program: ConstructProgram,
  sensors: readonly SensorSpec[],
): SavedConstruct {
  if (name.trim() === "") throw new Error("saved construct name cannot be empty");
  const blueprint = validateBlueprint(blueprintValue);
  const installed = installedSensorsForBlueprint(blueprint, sensors);
  const control = validateControlHardware(blueprint, controlValue, installed);
  // Typed callers are not the trust boundary: imported JSON reaches here through a cast.
  // Reparse the nested language so every expression/parameter key is exact before digesting.
  const checkedProgram = parseProgram(JSON.stringify(program), control, installed);
  return Object.freeze({
    version: SAVED_CONSTRUCT_VERSION,
    name,
    blueprint,
    control,
    program: checkedProgram,
    digests: Object.freeze({ blueprint: blueprintDigest(blueprint), control: controlDigest(control),
      program: programDigest(checkedProgram) }),
  });
}

/** Imported digest claims are checked, never trusted or silently re-recorded. */
export function parseSavedConstruct(text: string, sensors: readonly SensorSpec[]): SavedConstruct {
  if (typeof text !== "string") throw new Error("saved construct source must be JSON text");
  if (new TextEncoder().encode(text).length > SAVED_CONSTRUCT_MAX_BYTES) {
    throw new Error(`saved construct source exceeds maximum ${SAVED_CONSTRUCT_MAX_BYTES} bytes`);
  }
  let depth = 0; let quoted = false; let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === "{" || character === "[") {
      depth += 1;
      if (depth > 64) throw new Error("saved construct source exceeds maximum nesting depth 64");
    } else if (character === "}" || character === "]") depth -= 1;
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error(`saved construct JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  const source = validateSavedSource(value);
  if (source.version === 1) return migrateSavedV1(source, sensors);
  if (source.version === 2) return migrateSavedV2(source, sensors);
  if (source.version === 3) return migrateSavedV3(source, sensors);
  if (source.version === 4) return migrateSavedV4(source, sensors);
  const saved = saveConstruct(source.name, source.blueprint as ConstructBlueprint, source.control, source.program, sensors);
  for (const key of ["blueprint", "control", "program"] as const) {
    if (source.digests[key] !== saved.digests[key]) {
      throw new Error(`saved construct ${key} digest ${JSON.stringify(source.digests[key])} does not match ${saved.digests[key]}`);
    }
  }
  if (new TextEncoder().encode(canonicalJson(saved as unknown as ArtifactValue)).length >
      SAVED_CONSTRUCT_MAX_BYTES) {
    throw new Error(`saved construct canonical form exceeds maximum ${SAVED_CONSTRUCT_MAX_BYTES} bytes`);
  }
  return saved;
}
