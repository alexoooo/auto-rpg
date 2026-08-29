/** The first saved control-graph and command vocabulary. */
export const CONSTRUCT_ACTION_VERSION = 1 as const;

export interface ControlGroupSpec {
  readonly id: string;
  readonly joints: readonly string[];
  readonly modules: readonly string[];
  /** Controller semantics live here, never in physical part or joint names. */
  readonly bindings: Readonly<Record<string, Readonly<{
    readonly joints: readonly string[];
    readonly modules: readonly string[];
  }>>>;
}

export type QuantityUnit = "scalar" | "metres" | "metres-per-second" | "radians" |
  "radians-per-second" | "seconds" | "joules" | "watts";

export type ParameterSpec =
  | Readonly<{ kind: "number"; min: number; max: number; unit: QuantityUnit }>
  | Readonly<{ kind: "enum"; values: readonly string[] }>
  | Readonly<{ kind: "boolean" }>;

export interface ActionSpec {
  readonly id: string;
  readonly controller: string;
  readonly group: string;
  readonly claims: readonly string[];
  readonly parameters: Readonly<Record<string, ParameterSpec>>;
}

export interface ConstructControlGraph {
  readonly version: 1;
  readonly groups: readonly ControlGroupSpec[];
  readonly actions: readonly ActionSpec[];
}

export interface ActionRequest {
  readonly action: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
}

export interface ScheduledActionRequest {
  readonly request: ActionRequest;
  readonly priority: number;
  /** Stable rule/button row, never inferred from transport arrival order. */
  readonly sourceIndex: number;
}

export interface ConstructCommand {
  readonly version: 1;
  readonly requests: readonly ScheduledActionRequest[];
}

const ID = /^[a-z][a-z0-9-]{0,47}$/;
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const CONTROL_MAX_BYTES = 1_000_000;
const UNITS = new Set<QuantityUnit>([
  "scalar", "metres", "metres-per-second", "radians", "radians-per-second", "seconds", "joules", "watts",
]);

function exactRecord(value: unknown, allowed: readonly string[], context: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${context} must be an object`);
  const row = value as Record<string, unknown>;
  const extra = Object.keys(row).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`${context} has unknown field "${extra}"`);
  const missing = allowed.find((key) => !own(row, key));
  if (missing) throw new Error(`${context} is missing field "${missing}"`);
  return row;
}

function assertId(value: string, context: string): void {
  if (!ID.test(value)) throw new Error(`${context} must match [a-z][a-z0-9-]{0,47}`);
}

function unique(values: readonly string[], context: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertId(value, `${context} id "${value}"`);
    if (seen.has(value)) throw new Error(`${context} has duplicate id "${value}"`);
    seen.add(value);
  }
}

function validateClaims(values: readonly string[], group: ControlGroupSpec, context: string): void {
  const seen = new Set<string>();
  let resources = 0;
  for (const value of values) {
    const match = /^(module|resource):([a-z][a-z0-9-]{0,47})$/.exec(value);
    if (!match) throw new Error(`${context} claim "${value}" must use module: or resource: namespace`);
    if (seen.has(value)) throw new Error(`${context} has duplicate claim "${value}"`);
    seen.add(value);
    if (match[1] === "module" && !group.modules.includes(match[2])) {
      throw new Error(`${context} claim "${value}" names a module outside group "${group.id}"`);
    }
    if (match[1] === "resource") resources += 1;
  }
  if (resources > 16) throw new Error(`${context} has more than 16 resource claims`);
}

export function validateControlGraph(value: ConstructControlGraph): ConstructControlGraph {
  exactRecord(value, ["version", "groups", "actions"], "construct control");
  if (value.version !== CONSTRUCT_ACTION_VERSION) {
    throw new Error(`construct control field "version" ${JSON.stringify(value.version)} is unsupported`);
  }
  if (!Array.isArray(value.groups)) throw new Error(`construct control field "groups" must be an array`);
  if (!Array.isArray(value.actions)) throw new Error(`construct control field "actions" must be an array`);
  if (value.groups.length > 128) throw new Error(`construct control field "groups" exceeds 128`);
  if (value.actions.length > 256) throw new Error(`construct control field "actions" exceeds 256`);
  unique(value.groups.map((group) => group.id), "construct control groups");
  unique(value.actions.map((action) => action.id), "construct control actions");
  const groups = new Map(value.groups.map((group) => [group.id, group]));
  for (const group of value.groups) {
    exactRecord(group, ["id", "joints", "modules", "bindings"], `group "${String(group.id)}"`);
    if (!Array.isArray(group.joints) || !Array.isArray(group.modules)) {
      throw new Error(`group "${group.id}" joint and module members must be arrays`);
    }
    if (group.joints.length > 64 || group.modules.length > 64) {
      throw new Error(`group "${group.id}" exceeds 64 joint/module members`);
    }
    if (group.bindings === null || typeof group.bindings !== "object" || Array.isArray(group.bindings)) {
      throw new Error(`group "${group.id}" bindings must be an object`);
    }
    unique(group.joints, `group "${group.id}" joints`);
    unique(group.modules, `group "${group.id}" modules`);
    for (const [role, binding] of Object.entries(group.bindings) as
      [string, ControlGroupSpec["bindings"][string]][]) {
      exactRecord(binding, ["joints", "modules"], `group "${group.id}" binding "${role}"`);
      if (!Array.isArray(binding.joints) || !Array.isArray(binding.modules)) {
        throw new Error(`group "${group.id}" binding "${role}" members must be arrays`);
      }
      assertId(role, `group "${group.id}" binding "${role}"`);
      unique(binding.joints, `group "${group.id}" binding "${role}" joints`);
      unique(binding.modules, `group "${group.id}" binding "${role}" modules`);
      const foreignJoint = binding.joints.find((joint) => !group.joints.includes(joint));
      const foreignModule = binding.modules.find((module) => !group.modules.includes(module));
      if (foreignJoint) throw new Error(`group "${group.id}" binding "${role}" names foreign joint "${foreignJoint}"`);
      if (foreignModule) throw new Error(`group "${group.id}" binding "${role}" names foreign module "${foreignModule}"`);
    }
  }
  for (const action of value.actions) {
    exactRecord(action, ["id", "controller", "group", "claims", "parameters"], `action "${String(action.id)}"`);
    assertId(action.controller, `action "${action.id}" field "controller"`);
    if (!groups.has(action.group)) {
      throw new Error(`action "${action.id}" field "group" references missing group "${action.group}"`);
    }
    if (!Array.isArray(action.claims)) throw new Error(`action "${action.id}" claims must be an array`);
    if (action.parameters === null || typeof action.parameters !== "object" || Array.isArray(action.parameters)) {
      throw new Error(`action "${action.id}" parameters must be an object`);
    }
    validateClaims(action.claims, groups.get(action.group) as ControlGroupSpec, `action "${action.id}"`);
    if (Object.keys(action.parameters).length > 32) throw new Error(`action "${action.id}" exceeds 32 parameters`);
    for (const [name, parameter] of Object.entries(action.parameters) as [string, ParameterSpec][]) {
      assertId(name, `action "${action.id}" parameter "${name}"`);
      if (parameter.kind === "number") {
        exactRecord(parameter, ["kind", "min", "max", "unit"], `action "${action.id}" parameter "${name}"`);
        if (!Number.isFinite(parameter.min) || !Number.isFinite(parameter.max) || parameter.min >= parameter.max) {
          throw new Error(`action "${action.id}" parameter "${name}" has invalid numeric bounds`);
        }
        if (!UNITS.has(parameter.unit)) throw new Error(`action "${action.id}" parameter "${name}" has unknown unit "${parameter.unit}"`);
      } else if (parameter.kind === "enum") {
        exactRecord(parameter, ["kind", "values"], `action "${action.id}" parameter "${name}"`);
        if (parameter.values.length === 0 || new Set(parameter.values).size !== parameter.values.length) {
          throw new Error(`action "${action.id}" parameter "${name}" has invalid choices`);
        }
        unique(parameter.values, `action "${action.id}" parameter "${name}" values`);
      } else if (parameter.kind === "boolean") {
        exactRecord(parameter, ["kind"], `action "${action.id}" parameter "${name}"`);
      } else throw new Error(`action "${action.id}" parameter "${name}" has unknown kind`);
    }
  }
  return value;
}

export function parseControlGraph(text: string): ConstructControlGraph {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > CONTROL_MAX_BYTES) throw new Error(`construct control input exceeds ${CONTROL_MAX_BYTES} bytes`);
  let decoded: unknown;
  try { decoded = JSON.parse(text); } catch (error) {
    throw new Error(`construct control JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateControlGraph(decoded as ConstructControlGraph);
}

export function actionFor(graph: ConstructControlGraph, request: ActionRequest): ActionSpec {
  const action = graph.actions.find((candidate) => candidate.id === request.action);
  if (!action) throw new Error(`unknown construct action "${request.action}"`);
  for (const key of Object.keys(request.parameters)) {
    if (!own(action.parameters, key)) throw new Error(`action "${request.action}" has unknown parameter "${key}"`);
  }
  for (const [key, spec] of Object.entries(action.parameters)) {
    if (!own(request.parameters, key)) throw new Error(`action "${request.action}" is missing parameter "${key}"`);
    const parameter = request.parameters[key];
    if (spec.kind === "number") {
      if (typeof parameter !== "number" || !Number.isFinite(parameter)) {
        throw new Error(`action "${request.action}" parameter "${key}" must be finite`);
      }
      if (parameter < spec.min || parameter > spec.max) {
        throw new Error(`action "${request.action}" parameter "${key}" is outside [${spec.min}, ${spec.max}]`);
      }
    } else if (spec.kind === "boolean") {
      if (typeof parameter !== "boolean") throw new Error(`action "${request.action}" parameter "${key}" must be boolean`);
    } else if (typeof parameter !== "string" || !spec.values.includes(parameter)) {
      throw new Error(`action "${request.action}" parameter "${key}" must be one of ${spec.values.join(", ")}`);
    }
  }
  return action;
}

export function validateConstructCommand(
  graph: ConstructControlGraph,
  command: ConstructCommand,
): ConstructCommand {
  validateControlGraph(graph);
  if (command.version !== CONSTRUCT_ACTION_VERSION) {
    throw new Error(`construct command field "version" ${JSON.stringify(command.version)} is unsupported`);
  }
  const sourceIndices = new Set<number>();
  for (const scheduled of command.requests) {
    if (!Number.isInteger(scheduled.priority) || scheduled.priority < -32768 || scheduled.priority > 32767) {
      throw new Error(`scheduled action priority must be an integer from -32768 to 32767`);
    }
    if (!Number.isSafeInteger(scheduled.sourceIndex) || scheduled.sourceIndex < 0) {
      throw new Error(`scheduled action sourceIndex must be a non-negative safe integer`);
    }
    if (sourceIndices.has(scheduled.sourceIndex)) {
      throw new Error(`scheduled action sourceIndex ${scheduled.sourceIndex} is duplicated`);
    }
    sourceIndices.add(scheduled.sourceIndex);
    actionFor(graph, scheduled.request);
  }
  return command;
}

export const emptyConstructCommand = (): ConstructCommand => Object.freeze({
  version: CONSTRUCT_ACTION_VERSION,
  requests: Object.freeze([]),
});

export function canonicalControlJson(graph: ConstructControlGraph): string {
  validateControlGraph(graph);
  const value: IntegrityValue = {
    actions: [...graph.actions].sort((a, b) => a.id.localeCompare(b.id)).map((action) => ({
      claims: [...action.claims].sort(), controller: action.controller, group: action.group, id: action.id,
      parameters: Object.fromEntries(Object.entries(action.parameters).sort(([a], [b]) => a.localeCompare(b)).map(([name, spec]) =>
        [name, spec.kind === "number" ? { kind: spec.kind, max: spec.max, min: spec.min, unit: spec.unit }
          : spec.kind === "enum" ? { kind: spec.kind, values: [...spec.values].sort() } : { kind: spec.kind }])) as unknown as IntegrityValue,
    })),
    groups: [...graph.groups].sort((a, b) => a.id.localeCompare(b.id)).map((group) => ({
      bindings: Object.fromEntries(Object.entries(group.bindings).sort(([a], [b]) => a.localeCompare(b)).map(([role, binding]) =>
        [role, { joints: [...binding.joints], modules: [...binding.modules] }])) as IntegrityValue,
      id: group.id, joints: [...group.joints].sort(), modules: [...group.modules].sort(),
    })),
    version: graph.version,
  };
  return canonicalIntegrityJson(value);
}

export const controlDigest = (graph: ConstructControlGraph): string => integrityDigest(canonicalControlJson(graph));
import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "./integrity.ts";
