import { controlDigest, validateControlGraph, type ConstructControlGraph } from "./actions.ts";
import { validateBlueprint, type ConstructBlueprint } from "./blueprint.ts";
import { blueprintDigest } from "./canonical.ts";
import { parseProgram, programDigest, type ConstructProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { installedSensorsForBlueprint } from "./sensors.ts";
import { canonicalJson, type ArtifactValue } from "../learning/artifact.ts";

export const SAVED_CONSTRUCT_VERSION = 1 as const;
export const SAVED_CONSTRUCT_MAX_BYTES = 1_000_000;

export interface SavedConstruct {
  readonly version: 1;
  readonly name: string;
  readonly blueprint: ConstructBlueprint;
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly digests: Readonly<{ blueprint: string; control: string; program: string }>;
}

/** A control graph is saved with one body, so stale hardware references are an import error. */
function validateControlHardware(
  blueprint: ConstructBlueprint,
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("saved construct must be an object");
  const exact = (row: object, keys: readonly string[], context: string): void => {
    const names = Object.keys(row);
    const unknown = names.find((name) => !keys.includes(name));
    if (unknown) throw new Error(`${context} has unknown field "${unknown}"`);
    const missing = keys.find((name) => !names.includes(name));
    if (missing) throw new Error(`${context} is missing field "${missing}"`);
  };
  exact(value, ["version", "name", "blueprint", "control", "program", "digests"], "saved construct");
  const source = value as Partial<SavedConstruct>;
  if (source.version !== SAVED_CONSTRUCT_VERSION) throw new Error(`saved construct version ${JSON.stringify(source.version)} is unsupported`);
  if (typeof source.name !== "string" || !source.blueprint || !source.control || !source.program || !source.digests) {
    throw new Error("saved construct is missing name, blueprint, control, program or digests");
  }
  if (typeof source.digests !== "object" || Array.isArray(source.digests)) {
    throw new Error("saved construct digests must be an object");
  }
  exact(source.digests, ["blueprint", "control", "program"], "saved construct digests");
  const saved = saveConstruct(source.name, source.blueprint, source.control, source.program, sensors);
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
