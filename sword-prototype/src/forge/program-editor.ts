import type { ActionSpec, ConstructControlGraph, ParameterSpec } from "../construct/actions.ts";
import {
  expressionType,
  parseProgram,
  type ConstructProgram,
  type Expression,
  type ProgramRule,
} from "../construct/program.ts";
import type { SensorSpec, SensorUnit } from "../construct/sensors.ts";

export interface ProgramEditorOptions {
  readonly program: ConstructProgram;
  readonly graph: ConstructControlGraph;
  readonly sensors: readonly SensorSpec[];
  readonly onChange?: (program: ConstructProgram) => void;
  readonly onSensorPick?: (sensor: SensorSpec) => void;
}

const SENSOR_UNITS: readonly SensorUnit[] = ["boolean", "scalar", "metres", "metres-per-second",
  "radians", "radians-per-second", "seconds", "joules", "watts"];
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] as string);
const sensorMap = (sensors: readonly SensorSpec[]): ReadonlyMap<string, SensorSpec> => new Map(sensors.map((sensor) => [sensor.id, sensor]));

export function programExpressionError(expression: Expression, sensors: readonly SensorSpec[]): string | null {
  try { expressionType(expression, sensorMap(sensors)); return null; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}
export function reorderProgramRule(program: ConstructProgram, from: number, to: number): ConstructProgram {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= program.rules.length || to < 0 || to >= program.rules.length) {
    throw new Error(`program rule move ${from} -> ${to} is outside ${program.rules.length} rules`);
  }
  const rules = [...program.rules]; const [moved] = rules.splice(from, 1); rules.splice(to, 0, moved);
  return Object.freeze({ ...program, rules: Object.freeze(rules) });
}

type ExpressionPath = readonly (string | number)[];
const expressionAt = (expression: Expression, path: ExpressionPath): Expression => {
  let current: unknown = expression;
  for (const segment of path) current = (current as Record<string | number, unknown>)[segment];
  return current as Expression;
};
const replaceNested = (value: unknown, path: ExpressionPath, next: Expression): unknown => {
  if (path.length === 0) return next;
  const [head, ...tail] = path;
  if (Array.isArray(value)) return value.map((row, index) => index === head ? replaceNested(row, tail, next) : row);
  return { ...(value as Record<string, unknown>), [head]: replaceNested((value as Record<string, unknown>)[head], tail, next) };
};

/** Pure tree reducer used by every DOM expression gesture. */
export function replaceProgramExpression(program: ConstructProgram, ruleIndex: number,
  field: "condition" | "utility" | "parameter", path: ExpressionPath, next: Expression, parameter = ""): ConstructProgram {
  const rules = program.rules.map((rule, index) => {
    if (index !== ruleIndex) return rule;
    if (field === "parameter") {
      const entry = rule.parameters[parameter];
      if (!entry || entry.kind !== "expression") throw new Error(`rule "${rule.id}" parameter "${parameter}" is not an expression`);
      return { ...rule, parameters: { ...rule.parameters, [parameter]: { kind: "expression" as const, value: replaceNested(entry.value, path, next) as Expression } } };
    }
    return { ...rule, [field]: replaceNested(rule[field], path, next) as Expression };
  });
  return Object.freeze({ ...program, rules: Object.freeze(rules) });
}

const numericSensor = (sensors: readonly SensorSpec[]): SensorSpec | undefined => sensors.find(({ unit }) => unit !== "boolean");
const booleanSensor = (sensors: readonly SensorSpec[]): SensorSpec | undefined => sensors.find(({ unit }) => unit === "boolean");
const defaultExpression = (op: Expression["op"], sensors: readonly SensorSpec[], expected: SensorUnit): Expression => {
  const number = sensors.find(({ unit }) => unit === expected) ?? numericSensor(sensors);
  const boolean = booleanSensor(sensors);
  if (op === "sensor") return { op, id: (expected === "boolean" ? boolean : number)?.id ?? "missing-sensor" };
  if (op === "constant") return expected === "boolean" ? { op, value: true }
    : { op, value: 1, ...(expected === "scalar" ? {} : { unit: expected }) };
  if (op === "not") return { op, value: boolean ? { op: "sensor", id: boolean.id } : { op: "constant", value: true } };
  if (op === "and" || op === "or") return { op, values: [boolean ? { op: "sensor", id: boolean.id } : { op: "constant", value: true }] };
  if (op === "lt" || op === "lte" || op === "gt" || op === "gte") {
    return { op, left: number ? { op: "sensor", id: number.id } : { op: "constant", value: 0 },
      right: { op: "constant", value: 1, ...(number && number.unit !== "scalar" ? { unit: number.unit } : {}) } };
  }
  return { op, values: [{ op: "constant", value: 1, ...(expected === "scalar" || expected === "boolean" ? {} : { unit: expected }) },
    { op: "constant", value: 1 }] };
};
const defaultParameter = (spec: ParameterSpec): ProgramRule["parameters"][string] => {
  if (spec.kind === "enum") return { kind: "enum", value: spec.values[0] };
  if (spec.kind === "boolean") return { kind: "expression", value: { op: "constant", value: false } };
  return { kind: "expression", value: { op: "constant", value: Math.max(spec.min, Math.min(spec.max, 0)), ...(spec.unit === "scalar" ? {} : { unit: spec.unit }) } };
};
export const defaultRuleParameters = (action: ActionSpec): ProgramRule["parameters"] => Object.freeze(
  Object.fromEntries(Object.entries(action.parameters).map(([name, spec]) => [name, defaultParameter(spec)])));

const pathToken = (ruleIndex: number, field: "condition" | "utility" | "parameter", parameter: string, path: ExpressionPath): string =>
  [ruleIndex, field, parameter || "-", ...path].join("/");
const pathParts = (token: string): { rule: number; field: "condition" | "utility" | "parameter"; parameter: string; path: ExpressionPath } => {
  const [rule, field, parameter, ...path] = token.split("/");
  return { rule: Number(rule), field: field as "condition" | "utility" | "parameter", parameter: parameter === "-" ? "" : parameter,
    path: path.map((part) => /^\d+$/.test(part) ? Number(part) : part) };
};
const typeLabel = (expression: Expression, sensors: readonly SensorSpec[]): string => {
  try { const type = expressionType(expression, sensorMap(sensors)); return `${type.kind} -- ${type.unit}`; }
  catch (error) { return `invalid -- ${error instanceof Error ? error.message : String(error)}`; }
};
const opOptions = (selected: string): string => ["sensor", "constant", "not", "and", "or", "lt", "lte", "gt", "gte", "add", "sub", "mul", "min", "max"]
  .map((op) => `<option ${op === selected ? "selected" : ""}>${op}</option>`).join("");

const expressionMarkup = (expression: Expression, rule: number, field: "condition" | "utility" | "parameter",
  parameter: string, path: ExpressionPath, sensors: readonly SensorSpec[]): string => {
  const token = pathToken(rule, field, parameter, path);
  const controls = expression.op === "sensor"
    ? `<label>Fact<select data-expression-sensor data-expression-path="${token}">${sensors.map((sensor) =>
      `<option value="${escapeHtml(sensor.id)}" ${sensor.id === expression.id ? "selected" : ""}>${escapeHtml(sensor.id)} -- ${escapeHtml(sensor.unit)}</option>`).join("")}</select></label>`
    : expression.op === "constant"
      ? `<label>Value type<select data-expression-constant-kind data-expression-path="${token}"><option ${typeof expression.value === "number" ? "selected" : ""}>number</option><option ${typeof expression.value === "boolean" ? "selected" : ""}>boolean</option></select></label>` +
        (typeof expression.value === "boolean" ? `<label>Value<select data-expression-constant-boolean data-expression-path="${token}"><option value="true" ${expression.value ? "selected" : ""}>true</option><option value="false" ${!expression.value ? "selected" : ""}>false</option></select></label>`
          : `<label>Value<input type="number" step="any" data-expression-constant-number data-expression-path="${token}" value="${expression.value}"></label>` +
            `<label>Unit<select data-expression-constant-unit data-expression-path="${token}">${SENSOR_UNITS.filter((unit) => unit !== "boolean").map((unit) =>
              `<option ${unit === (expression.unit ?? "scalar") ? "selected" : ""}>${unit}</option>`).join("")}</select></label>`)
      : expression.op === "not"
        ? expressionMarkup(expression.value, rule, field, parameter, [...path, "value"], sensors)
      : "left" in expression
        ? `<div class="expression-children"><label>Left${expressionMarkup(expression.left, rule, field, parameter, [...path, "left"], sensors)}</label>` +
          `<label>Right${expressionMarkup(expression.right, rule, field, parameter, [...path, "right"], sensors)}</label></div>`
        : `<div class="expression-children">${expression.values.map((value, index) => `<div>${expressionMarkup(value, rule, field, parameter, [...path, "values", index], sensors)}` +
          `<button type="button" data-program-action="remove-expression-child" data-expression-path="${token}" data-child="${index}" ${expression.values.length <= 1 ? "disabled" : ""}>Remove term</button></div>`).join("")}` +
          `<button type="button" data-program-action="add-expression-child" data-expression-path="${token}">Add term</button></div>`;
  return `<fieldset class="expression-node" data-expression-node="${token}"><legend>${escapeHtml(typeLabel(expression, sensors))}</legend>` +
    `<label>Operation<select data-expression-op data-expression-path="${token}">${opOptions(expression.op)}</select></label>${controls}</fieldset>`;
};

const ruleMarkup = (rule: ProgramRule, index: number, ruleCount: number, graph: ConstructControlGraph, sensors: readonly SensorSpec[]): string => {
  const action = graph.actions.find((candidate) => candidate.id === rule.action); const group = action?.group ?? "missing action";
  const parameters = action ? Object.entries(action.parameters).map(([name, spec]) => {
    const value = rule.parameters[name];
    if (spec.kind === "enum") return `<fieldset><legend>${escapeHtml(name)}</legend><select data-program-enum data-index="${index}" data-parameter="${escapeHtml(name)}">${spec.values.map((choice) =>
      `<option ${value?.kind === "enum" && value.value === choice ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}</select></fieldset>`;
    return `<fieldset><legend>${escapeHtml(name)} -- ${spec.kind === "number" ? spec.unit : "boolean"}</legend>${value?.kind === "expression"
      ? expressionMarkup(value.value, index, "parameter", name, [], sensors) : "<p>Missing expression</p>"}</fieldset>`;
  }).join("") : "";
  return `<article class="program-rule" data-rule="${index}"><header><span class="program-order">${index + 1}</span><label>Rule ID<input data-program-rule-id data-index="${index}" value="${escapeHtml(rule.id)}"></label>` +
    `<div><button type="button" data-program-action="move-up" data-index="${index}" ${index === 0 ? "disabled" : ""}>Up</button>` +
    `<button type="button" data-program-action="move-down" data-index="${index}" ${index === ruleCount - 1 ? "disabled" : ""}>Down</button>` +
    `<button type="button" data-program-action="remove-rule" data-index="${index}">Remove</button></div></header><dl>` +
    `<dt>Condition</dt><dd>${expressionMarkup(rule.condition, index, "condition", "", [], sensors)}</dd>` +
    `<dt>Utility</dt><dd>${expressionMarkup(rule.utility, index, "utility", "", [], sensors)}</dd>` +
    `<dt>Action</dt><dd><select data-program-action-picker data-index="${index}">${graph.actions.map((candidate) => `<option value="${escapeHtml(candidate.id)}" ${candidate.id === rule.action ? "selected" : ""}>${escapeHtml(candidate.id)}</option>`).join("")}</select></dd>` +
    `<dt>Resolved group</dt><dd><output>${escapeHtml(group)}</output></dd><dt>Parameters</dt><dd>${parameters || "No parameters."}</dd>` +
    `<dt>Priority</dt><dd><input type="number" min="-32768" max="32767" step="1" data-program-priority data-index="${index}" value="${rule.priority}"></dd>` +
    `<dt>Requirement</dt><dd><label><input type="checkbox" data-program-optional data-index="${index}" ${rule.optional ? "checked" : ""}> optional hardware/action</label></dd>` +
    `<dt>Dwell</dt><dd><label>Seconds<input type="number" min="0" step="0.05" data-program-dwell data-index="${index}" value="${rule.dwellS}"></label></dd></dl></article>`;
};

export function programEditorMarkup(program: ConstructProgram, graph: ConstructControlGraph, sensors: readonly SensorSpec[], refusal: string | null = null): string {
  return `<section class="program-editor" aria-label="Mind program editor"><header><p class="forge-kicker">Mind Workshop</p><h2>Ordered rules over installed facts</h2>` +
    `<button type="button" data-program-action="add-rule">Add rule</button></header><p class="forge-refusal" role="alert" ${refusal ? "" : "hidden"}>${escapeHtml(refusal ?? "")}</p>` +
    `<aside><h3>Installed sensors</h3><ul>${sensors.map((sensor) => `<li><button type="button" data-program-sensor="${escapeHtml(sensor.id)}">${escapeHtml(sensor.id)}</button>` +
      `<small>${escapeHtml(sensor.unit)} -- ${escapeHtml(sensor.source)}</small></li>`).join("") || "<li>No installed facts.</li>"}</ul>` +
    `<p>Every tree gesture is checked by the battle runtime parser. Incompatible units are refused, not converted.</p></aside>` +
    `<main>${program.rules.map((rule, index) => ruleMarkup(rule, index, program.rules.length, graph, sensors)).join("") || "<p>No rules yet. Add one without writing code.</p>"}</main></section>`;
}

export class ProgramEditor {
  private readonly host: HTMLElement; private readonly options: ProgramEditorOptions; private value: ConstructProgram; private refusal: string | null = null;
  constructor(host: HTMLElement, options: ProgramEditorOptions) { this.host = host; this.options = options;
    this.value = parseProgram(JSON.stringify(options.program), options.graph, options.sensors); host.addEventListener("click", this.onClick); host.addEventListener("change", this.onChange); this.render(); }
  get program(): ConstructProgram { return this.value; }
  dispose(): void { this.host.removeEventListener("click", this.onClick); this.host.removeEventListener("change", this.onChange); this.host.innerHTML = ""; }
  replace(program: ConstructProgram): boolean { try { this.value = parseProgram(JSON.stringify(program), this.options.graph, this.options.sensors); this.refusal = null; this.options.onChange?.(this.value); this.render(); return true; }
    catch (error) { this.refusal = error instanceof Error ? error.message : String(error); this.render(); return false; } }
  move(from: number, to: number): boolean { return this.replace(reorderProgramRule(this.value, from, to)); }
  private render(): void { this.host.innerHTML = programEditorMarkup(this.value, this.options.graph, this.options.sensors, this.refusal); }
  private rule(index: number, update: (rule: ProgramRule) => ProgramRule): void { this.replace({ ...this.value, rules: this.value.rules.map((row, rowIndex) => rowIndex === index ? update(row) : row) }); }
  private expression(token: string, next: Expression): void { const path = pathParts(token); this.replace(replaceProgramExpression(this.value, path.rule, path.field, path.path, next, path.parameter)); }
  private expectedUnit(path: ReturnType<typeof pathParts>): SensorUnit {
    if (path.field === "condition") return "boolean";
    if (path.field === "utility") return "scalar";
    const rule = this.value.rules[path.rule];
    const action = this.options.graph.actions.find(({ id }) => id === rule.action);
    const spec = action?.parameters[path.parameter];
    return spec?.kind === "boolean" ? "boolean" : spec?.kind === "number" ? spec.unit : "scalar";
  }
  private readonly onClick = (event: Event): void => { const target = event.target as HTMLElement | null;
    const sensorButton = target?.closest<HTMLButtonElement>("button[data-program-sensor]"); if (sensorButton) { const sensor = this.options.sensors.find(({ id }) => id === sensorButton.dataset.programSensor);
      if (!sensor) { this.refusal = `Mind sensor picker cannot find sensor "${sensorButton.dataset.programSensor ?? ""}"`; this.render(); }
      else if (!this.options.onSensorPick) { this.refusal = "Mind sensor picker is unavailable: choose a fact field inside a rule"; this.render(); } else this.options.onSensorPick(sensor); return; }
    const button = target?.closest<HTMLButtonElement>("button[data-program-action]"); if (!button) return; const index = Number(button.dataset.index); const action = button.dataset.programAction;
    if (action === "move-up") this.move(index, index - 1); else if (action === "move-down") this.move(index, index + 1);
    else if (action === "remove-rule") this.replace({ ...this.value, rules: this.value.rules.filter((_row, rowIndex) => rowIndex !== index) });
    else if (action === "add-rule") { const installed = this.options.graph.actions[0]; if (!installed) { this.refusal = "Mind cannot add a rule until an action exists"; this.render(); return; }
      const id = `rule-${this.value.rules.length + 1}`; this.replace({ ...this.value, rules: [...this.value.rules, { id, action: installed.id, optional: false, priority: 0, dwellS: 0,
        condition: booleanSensor(this.options.sensors) ? { op: "sensor", id: (booleanSensor(this.options.sensors) as SensorSpec).id } : { op: "constant", value: true },
        utility: { op: "constant", value: 1 }, parameters: defaultRuleParameters(installed) }] }); }
    else if (action === "add-expression-child" || action === "remove-expression-child") { const token = button.dataset.expressionPath ?? ""; const path = pathParts(token);
      const rule = this.value.rules[path.rule]; const root = path.field === "parameter" ? (rule.parameters[path.parameter] as { kind: "expression"; value: Expression }).value : rule[path.field];
      const node = expressionAt(root, path.path); if (!("values" in node)) return;
      const added: Expression = node.op === "and" || node.op === "or"
        ? (booleanSensor(this.options.sensors) ? { op: "sensor", id: (booleanSensor(this.options.sensors) as SensorSpec).id } : { op: "constant", value: true })
        : { op: "constant", value: 1 };
      const values = action === "add-expression-child" ? [...node.values, added]
        : node.values.filter((_row, child) => child !== Number(button.dataset.child)); this.expression(token, { ...node, values } as Expression); }
  };
  private readonly onChange = (event: Event): void => { const target = event.target as HTMLInputElement | HTMLSelectElement | null; if (!target) return; const index = Number(target.dataset.index);
    if (target.matches("[data-program-action-picker]")) { const action = this.options.graph.actions.find(({ id }) => id === target.value); if (action) this.rule(index, (row) => ({ ...row, action: action.id, parameters: defaultRuleParameters(action) })); return; }
    if (target.matches("[data-program-optional]")) { this.rule(index, (row) => ({ ...row, optional: (target as HTMLInputElement).checked })); return; }
    if (target.matches("[data-program-priority]")) { this.rule(index, (row) => ({ ...row, priority: Number(target.value) })); return; }
    if (target.matches("[data-program-dwell]")) { this.rule(index, (row) => ({ ...row, dwellS: Number(target.value) })); return; }
    if (target.matches("[data-program-rule-id]")) { this.rule(index, (row) => ({ ...row, id: target.value })); return; }
    if (target.matches("[data-program-enum]")) { const name = target.dataset.parameter ?? ""; this.rule(index, (row) => ({ ...row, parameters: { ...row.parameters, [name]: { kind: "enum", value: target.value } } })); return; }
    const token = target.dataset.expressionPath; if (!token) return; const path = pathParts(token); const rule = this.value.rules[path.rule];
    const root = path.field === "parameter" ? (rule.parameters[path.parameter] as { kind: "expression"; value: Expression }).value : rule[path.field]; const current = expressionAt(root, path.path);
    if (target.matches("[data-expression-op]")) this.expression(token,
      defaultExpression(target.value as Expression["op"], this.options.sensors, this.expectedUnit(path)));
    else if (target.matches("[data-expression-sensor]")) this.expression(token, { op: "sensor", id: target.value });
    else if (target.matches("[data-expression-constant-kind]")) this.expression(token, { op: "constant", value: target.value === "boolean" });
    else if (target.matches("[data-expression-constant-boolean]")) this.expression(token, { op: "constant", value: target.value === "true" });
    else if (target.matches("[data-expression-constant-number]")) this.expression(token, { op: "constant", value: Number(target.value), ...(current.op === "constant" && current.unit && current.unit !== "boolean" ? { unit: current.unit } : {}) });
    else if (target.matches("[data-expression-constant-unit]")) this.expression(token, { op: "constant", value: current.op === "constant" && typeof current.value === "number" ? current.value : 0,
      ...(target.value === "scalar" ? {} : { unit: target.value as SensorUnit }) });
  };
}
