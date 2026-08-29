import { actionFor, type ConstructCommand, type ConstructControlGraph } from "./actions.ts";
import type { SensorFrame, SensorSpec, SensorUnit } from "./sensors.ts";
import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "./integrity.ts";

export const CONSTRUCT_PROGRAM_VERSION = 1 as const;
export const CONSTRUCT_PROGRAM_LIMITS = Object.freeze({
  maxBytes: 1_048_576, maxRules: 512, maxExpressionNodes: 4_096, maxExpressionDepth: 64,
});

const PROGRAM_ID = /^[a-z][a-z0-9-]{0,47}$/;
const SENSOR_UNITS: readonly SensorUnit[] = ["boolean", "scalar", "metres", "metres-per-second",
  "radians", "radians-per-second", "seconds", "joules", "watts"];

type Plain = Record<string, unknown>;
const plain = (value: unknown, path: string): Plain => {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Plain;
};
const exactFields = (value: Plain, required: readonly string[], optional: readonly string[], path: string): void => {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${path} has unknown field "${unknown}"`);
  const missing = required.find((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing) throw new Error(`${path} is missing field "${missing}"`);
};

interface ParseBudget { nodes: number }

function parseExpression(value: unknown, path: string, depth: number, budget: ParseBudget): Expression {
  if (depth > CONSTRUCT_PROGRAM_LIMITS.maxExpressionDepth) {
    throw new Error(`${path} exceeds expression depth ${CONSTRUCT_PROGRAM_LIMITS.maxExpressionDepth}`);
  }
  budget.nodes += 1;
  if (budget.nodes > CONSTRUCT_PROGRAM_LIMITS.maxExpressionNodes) {
    throw new Error(`construct program exceeds ${CONSTRUCT_PROGRAM_LIMITS.maxExpressionNodes} expression nodes`);
  }
  const row = plain(value, path);
  if (typeof row.op !== "string") throw new Error(`${path} is missing string field "op"`);
  if (row.op === "sensor") {
    exactFields(row, ["op", "id"], [], path);
    if (typeof row.id !== "string" || !PROGRAM_ID.test(row.id)) throw new Error(`${path}.id is invalid`);
    return Object.freeze({ op: "sensor", id: row.id });
  }
  if (row.op === "constant") {
    exactFields(row, ["op", "value"], ["unit"], path);
    if (typeof row.value !== "number" && typeof row.value !== "boolean") throw new Error(`${path}.value must be finite number or boolean`);
    if (typeof row.value === "number" && !Number.isFinite(row.value)) throw new Error(`${path}.value must be finite`);
    if (row.unit !== undefined && !SENSOR_UNITS.includes(row.unit as SensorUnit)) throw new Error(`${path}.unit is unknown`);
    return Object.freeze({ op: "constant", value: row.value, ...(row.unit === undefined ? {} : { unit: row.unit as SensorUnit }) });
  }
  if (row.op === "not") {
    exactFields(row, ["op", "value"], [], path);
    return Object.freeze({ op: "not", value: parseExpression(row.value, `${path}.value`, depth + 1, budget) });
  }
  if (["and", "or", "add", "sub", "mul", "min", "max"].includes(row.op)) {
    exactFields(row, ["op", "values"], [], path);
    if (!Array.isArray(row.values)) throw new Error(`${path}.values must be an array`);
    const values = Object.freeze(row.values.map((entry, index) => parseExpression(entry, `${path}.values[${index}]`, depth + 1, budget)));
    return Object.freeze({ op: row.op, values }) as Expression;
  }
  if (["lt", "lte", "gt", "gte"].includes(row.op)) {
    exactFields(row, ["op", "left", "right"], [], path);
    return Object.freeze({ op: row.op,
      left: parseExpression(row.left, `${path}.left`, depth + 1, budget),
      right: parseExpression(row.right, `${path}.right`, depth + 1, budget) }) as Expression;
  }
  throw new Error(`${path}.op "${row.op}" is unknown`);
}

export type Expression =
  | Readonly<{ op: "sensor"; id: string }>
  | Readonly<{ op: "constant"; value: number | boolean; unit?: SensorUnit }>
  | Readonly<{ op: "not"; value: Expression }>
  | Readonly<{ op: "and" | "or"; values: readonly Expression[] }>
  | Readonly<{ op: "lt" | "lte" | "gt" | "gte"; left: Expression; right: Expression }>
  | Readonly<{ op: "add" | "sub" | "mul" | "min" | "max"; values: readonly Expression[] }>;

export interface ProgramRule {
  readonly id: string;
  readonly condition: Expression;
  readonly utility: Expression;
  readonly action: string;
  readonly parameters: Readonly<Record<string,
    Readonly<{ kind: "expression"; value: Expression }> |
    Readonly<{ kind: "enum"; value: string }>>>;
  readonly priority: number;
  /** Missing static hardware/action references may be skipped; live unavailability still refuses. */
  readonly optional: boolean;
  readonly dwellS: number;
}

export interface ConstructProgram {
  readonly version: 1;
  readonly id: string;
  readonly rules: readonly ProgramRule[];
}

/** Parse hostile saved data under bounded allocation, then run semantic validation against installed hardware. */
export function parseProgram(
  text: string,
  graph: ConstructControlGraph,
  installedSensors: readonly SensorSpec[],
): ConstructProgram {
  if (typeof text !== "string") throw new Error("construct program source must be JSON text");
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > CONSTRUCT_PROGRAM_LIMITS.maxBytes) {
    throw new Error(`construct program source exceeds ${CONSTRUCT_PROGRAM_LIMITS.maxBytes} bytes`);
  }
  let decoded: unknown;
  try { decoded = JSON.parse(text); }
  catch (error) { throw new Error(`construct program JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  const source = plain(decoded, "construct program");
  exactFields(source, ["version", "id", "rules"], [], "construct program");
  if (source.version !== CONSTRUCT_PROGRAM_VERSION) throw new Error(`construct program version ${JSON.stringify(source.version)} is unsupported`);
  if (typeof source.id !== "string" || !PROGRAM_ID.test(source.id)) throw new Error("construct program id is invalid");
  if (!Array.isArray(source.rules)) throw new Error("construct program rules must be an array");
  if (source.rules.length > CONSTRUCT_PROGRAM_LIMITS.maxRules) {
    throw new Error(`construct program exceeds ${CONSTRUCT_PROGRAM_LIMITS.maxRules} rules`);
  }
  const budget: ParseBudget = { nodes: 0 };
  const rules = Object.freeze(source.rules.map((entry, index): ProgramRule => {
    const path = `construct program rule[${index}]`;
    const row = plain(entry, path);
    exactFields(row, ["id", "condition", "utility", "action", "parameters", "priority", "optional", "dwellS"], [], path);
    if (typeof row.id !== "string" || !PROGRAM_ID.test(row.id)) throw new Error(`${path}.id is invalid`);
    if (typeof row.action !== "string" || !PROGRAM_ID.test(row.action)) throw new Error(`${path}.action is invalid`);
    if (!Number.isSafeInteger(row.priority) || (row.priority as number) < -32768 || (row.priority as number) > 32767) {
      throw new Error(`${path}.priority must be an integer from -32768 to 32767`);
    }
    if (typeof row.optional !== "boolean") throw new Error(`${path}.optional must be boolean`);
    if (typeof row.dwellS !== "number" || !Number.isFinite(row.dwellS) || row.dwellS < 0) {
      throw new Error(`${path}.dwellS must be finite and non-negative`);
    }
    const rawParameters = plain(row.parameters, `${path}.parameters`);
    const parameters = Object.freeze(Object.fromEntries(Object.entries(rawParameters).map(([name, entryParameter]) => {
      if (!PROGRAM_ID.test(name)) throw new Error(`${path}.parameters has invalid name "${name}"`);
      const parameter = plain(entryParameter, `${path}.parameters.${name}`);
      if (parameter.kind === "enum") {
        exactFields(parameter, ["kind", "value"], [], `${path}.parameters.${name}`);
        if (typeof parameter.value !== "string") throw new Error(`${path}.parameters.${name}.value must be string`);
        return [name, Object.freeze({ kind: "enum" as const, value: parameter.value })];
      }
      if (parameter.kind === "expression") {
        exactFields(parameter, ["kind", "value"], [], `${path}.parameters.${name}`);
        return [name, Object.freeze({ kind: "expression" as const,
          value: parseExpression(parameter.value, `${path}.parameters.${name}.value`, 1, budget) })];
      }
      throw new Error(`${path}.parameters.${name}.kind is unknown`);
    })));
    return Object.freeze({ id: row.id, action: row.action, parameters,
      priority: row.priority as number, optional: row.optional, dwellS: row.dwellS,
      condition: parseExpression(row.condition, `${path}.condition`, 1, budget),
      utility: parseExpression(row.utility, `${path}.utility`, 1, budget) });
  }));
  const program = Object.freeze({ version: 1 as const, id: source.id, rules });
  validateProgram(program, graph, installedSensors);
  return program;
}

export interface ExpressionType {
  readonly kind: "number" | "boolean";
  readonly unit: SensorUnit;
}

const BOOLEAN: ExpressionType = Object.freeze({ kind: "boolean", unit: "boolean" });
const SCALAR: ExpressionType = Object.freeze({ kind: "number", unit: "scalar" });

function sameType(left: ExpressionType, right: ExpressionType, context: string): void {
  if (left.kind !== right.kind || left.unit !== right.unit) {
    throw new Error(`${context} compares ${left.unit} with ${right.unit}`);
  }
}

export function expressionType(expression: Expression, sensors: ReadonlyMap<string, SensorSpec>): ExpressionType {
  switch (expression.op) {
    case "sensor": {
      const sensor = sensors.get(expression.id);
      if (!sensor) throw new Error(`program references unknown sensor "${expression.id}"`);
      return sensor.unit === "boolean" ? BOOLEAN : { kind: "number", unit: sensor.unit };
    }
    case "constant":
      if (typeof expression.value === "boolean") {
        if (expression.unit !== undefined && expression.unit !== "boolean") {
          throw new Error(`boolean constant cannot carry unit "${expression.unit}"`);
        }
        return BOOLEAN;
      }
      if (!Number.isFinite(expression.value)) throw new Error("program constant must be finite");
      if (expression.unit === "boolean") throw new Error("numeric constant cannot carry boolean unit");
      return { kind: "number", unit: expression.unit ?? "scalar" };
    case "not": {
      const type = expressionType(expression.value, sensors);
      sameType(type, BOOLEAN, "not");
      return BOOLEAN;
    }
    case "and":
    case "or":
      if (expression.values.length === 0) throw new Error(`${expression.op} requires at least one value`);
      for (const value of expression.values) sameType(expressionType(value, sensors), BOOLEAN, expression.op);
      return BOOLEAN;
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const left = expressionType(expression.left, sensors);
      const right = expressionType(expression.right, sensors);
      sameType(left, right, expression.op);
      if (left.kind !== "number") throw new Error(`${expression.op} requires numbers`);
      return BOOLEAN;
    }
    case "add":
    case "sub":
    case "min":
    case "max": {
      if (expression.values.length === 0) throw new Error(`${expression.op} requires at least one value`);
      const first = expressionType(expression.values[0], sensors);
      if (first.kind !== "number") throw new Error(`${expression.op} requires numbers`);
      for (const value of expression.values.slice(1)) sameType(first, expressionType(value, sensors), expression.op);
      return first;
    }
    case "mul": {
      if (expression.values.length === 0) throw new Error("mul requires at least one value");
      const types = expression.values.map((value) => expressionType(value, sensors));
      if (types.some((type) => type.kind !== "number")) throw new Error("mul requires numbers");
      const dimensional = types.filter((type) => type.unit !== "scalar");
      if (dimensional.length > 1) throw new Error("mul accepts at most one dimensioned value");
      return dimensional[0] ?? SCALAR;
    }
  }
}

export interface ValidatedProgram {
  readonly program: ConstructProgram;
  readonly enabledRuleIndices: readonly number[];
}

export function validateProgram(
  program: ConstructProgram,
  graph: ConstructControlGraph,
  installedSensors: readonly SensorSpec[],
): ValidatedProgram {
  if (program.version !== CONSTRUCT_PROGRAM_VERSION) {
    throw new Error(`construct program field "version" ${JSON.stringify(program.version)} is unsupported`);
  }
  if (program.rules.length > CONSTRUCT_PROGRAM_LIMITS.maxRules) {
    throw new Error(`construct program exceeds ${CONSTRUCT_PROGRAM_LIMITS.maxRules} rules`);
  }
  const sensors = new Map(installedSensors.map((sensor) => [sensor.id, sensor]));
  const ids = new Set<string>();
  const enabled: number[] = [];
  let expressionNodes = 0;
  const measure = (expression: Expression, depth: number, path: string): void => {
    if (depth > CONSTRUCT_PROGRAM_LIMITS.maxExpressionDepth) {
      throw new Error(`${path} exceeds expression depth ${CONSTRUCT_PROGRAM_LIMITS.maxExpressionDepth}`);
    }
    expressionNodes += 1;
    if (expressionNodes > CONSTRUCT_PROGRAM_LIMITS.maxExpressionNodes) {
      throw new Error(`construct program exceeds ${CONSTRUCT_PROGRAM_LIMITS.maxExpressionNodes} expression nodes`);
    }
    if (expression.op === "not") measure(expression.value, depth + 1, `${path}.value`);
    else if ("values" in expression) expression.values.forEach((value, index) => measure(value, depth + 1, `${path}.values[${index}]`));
    else if ("left" in expression) {
      measure(expression.left, depth + 1, `${path}.left`);
      measure(expression.right, depth + 1, `${path}.right`);
    }
  };
  program.rules.forEach((rule, index) => {
    if (ids.has(rule.id)) throw new Error(`construct program has duplicate rule "${rule.id}"`);
    ids.add(rule.id);
    const action = graph.actions.find((candidate) => candidate.id === rule.action);
    if (!action) {
      if (rule.optional) return;
      throw new Error(`rule "${rule.id}" references unknown required action "${rule.action}"`);
    }
    measure(rule.condition, 1, `rule "${rule.id}" condition`);
    measure(rule.utility, 1, `rule "${rule.id}" utility`);
    sameType(expressionType(rule.condition, sensors), BOOLEAN, `rule "${rule.id}" condition`);
    sameType(expressionType(rule.utility, sensors), SCALAR, `rule "${rule.id}" utility`);
    if (!Number.isFinite(rule.dwellS) || rule.dwellS < 0) throw new Error(`rule "${rule.id}" dwellS must be finite and non-negative`);
    if (!Number.isInteger(rule.priority) || rule.priority < -32768 || rule.priority > 32767) {
      throw new Error(`rule "${rule.id}" priority must be an integer from -32768 to 32767`);
    }
    const missingParameter = Object.keys(action.parameters).find((name) =>
      !Object.prototype.hasOwnProperty.call(rule.parameters, name));
    if (missingParameter) {
      throw new Error(`rule "${rule.id}" is missing parameter "${missingParameter}" for action "${action.id}"`);
    }
    for (const [name, parameter] of Object.entries(rule.parameters)) {
      const spec = action.parameters[name];
      if (!spec) throw new Error(`rule "${rule.id}" has unknown parameter "${name}" for action "${action.id}"`);
      if (spec.kind === "enum") {
        if (parameter.kind !== "enum" || !spec.values.includes(parameter.value)) {
          throw new Error(`rule "${rule.id}" enum parameter "${name}" must name one installed value`);
        }
        continue;
      }
      if (parameter.kind !== "expression") {
        throw new Error(`rule "${rule.id}" parameter "${name}" must be an expression`);
      }
      measure(parameter.value, 1, `rule "${rule.id}" parameter "${name}"`);
      const type = expressionType(parameter.value, sensors);
      if (spec.kind === "boolean") sameType(type, BOOLEAN, `rule "${rule.id}" parameter "${name}"`);
      else if (spec.kind === "number") {
        if (type.kind !== "number" || type.unit !== spec.unit) {
          throw new Error(`rule "${rule.id}" parameter "${name}" expects ${spec.unit}, got ${type.unit}`);
        }
      }
    }
    enabled.push(index);
  });
  return Object.freeze({ program, enabledRuleIndices: Object.freeze(enabled) });
}

type Evaluation = { readonly value: number | boolean; readonly unit: SensorUnit };

export function evaluateExpression(expression: Expression, frame: SensorFrame): Evaluation {
  switch (expression.op) {
    case "sensor": {
      const value = frame.read(expression.id);
      return { value: value.value, unit: value.unit };
    }
    case "constant": return { value: expression.value, unit: expression.unit ?? (typeof expression.value === "boolean" ? "boolean" : "scalar") };
    case "not": return { value: !evaluateExpression(expression.value, frame).value, unit: "boolean" };
    case "and": return { value: expression.values.every((value) => Boolean(evaluateExpression(value, frame).value)), unit: "boolean" };
    case "or": return { value: expression.values.some((value) => Boolean(evaluateExpression(value, frame).value)), unit: "boolean" };
    case "lt": return { value: Number(evaluateExpression(expression.left, frame).value) < Number(evaluateExpression(expression.right, frame).value), unit: "boolean" };
    case "lte": return { value: Number(evaluateExpression(expression.left, frame).value) <= Number(evaluateExpression(expression.right, frame).value), unit: "boolean" };
    case "gt": return { value: Number(evaluateExpression(expression.left, frame).value) > Number(evaluateExpression(expression.right, frame).value), unit: "boolean" };
    case "gte": return { value: Number(evaluateExpression(expression.left, frame).value) >= Number(evaluateExpression(expression.right, frame).value), unit: "boolean" };
    case "add": return numericFold(expression.values, frame, (a, b) => a + b);
    case "sub": return numericFold(expression.values, frame, (a, b) => a - b);
    case "mul": return numericFold(expression.values, frame, (a, b) => a * b);
    case "min": return numericFold(expression.values, frame, Math.min);
    case "max": return numericFold(expression.values, frame, Math.max);
  }
}

function numericFold(values: readonly Expression[], frame: SensorFrame, operation: (a: number, b: number) => number): Evaluation {
  const rows = values.map((value) => evaluateExpression(value, frame));
  const result = rows.slice(1).reduce((total, row) => operation(total, Number(row.value)), Number(rows[0].value));
  if (!Number.isFinite(result)) throw new Error("construct program expression evaluated non-finitely");
  const unit = rows.find((row) => row.unit !== "scalar")?.unit ?? "scalar";
  return { value: result, unit };
}

export function commandForRules(
  validated: ValidatedProgram,
  graph: ConstructControlGraph,
  frame: SensorFrame,
): ConstructCommand {
  const selected = validated.enabledRuleIndices.flatMap((index) => {
    const rule = validated.program.rules[index];
    if (!Boolean(evaluateExpression(rule.condition, frame).value)) return [];
    const utility = Number(evaluateExpression(rule.utility, frame).value);
    if (!(utility > 0)) return [];
    const action = graph.actions.find((candidate) => candidate.id === rule.action);
    if (!action) return [];
    const parameters = Object.fromEntries(Object.entries(rule.parameters).map(([name, parameter]) => {
      const spec = action.parameters[name];
      if (spec.kind === "enum") {
        if (parameter.kind !== "enum") throw new Error(`rule "${rule.id}" enum parameter "${name}" is malformed`);
        return [name, parameter.value];
      }
      if (parameter.kind !== "expression") throw new Error(`rule "${rule.id}" parameter "${name}" is malformed`);
      return [name, evaluateExpression(parameter.value, frame).value];
    }));
    return [{ request: { action: action.id, parameters }, priority: rule.priority, sourceIndex: index }];
  });
  for (const scheduled of selected) actionFor(graph, scheduled.request);
  return Object.freeze({ version: 1, requests: Object.freeze(selected) });
}

export function canonicalProgramJson(program: ConstructProgram): string {
  const value = program as unknown as IntegrityValue;
  return canonicalIntegrityJson(value);
}

export const programDigest = (program: ConstructProgram): string => integrityDigest(canonicalProgramJson(program));
