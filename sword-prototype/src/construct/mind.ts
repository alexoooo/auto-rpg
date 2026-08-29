import type { ConstructCommand, ConstructControlGraph } from "./actions.ts";
import { commandForRules, evaluateExpression, validateProgram,
  type ConstructProgram, type Expression, type ProgramRuntimeState, type ValidatedProgram } from "./program.ts";
import type { SensorFrame, SensorSpec } from "./sensors.ts";

export interface ConstructRuleDiagnostic {
  readonly rule: string;
  readonly utility: number;
  readonly selected: boolean;
  readonly decisiveFacts: Readonly<Record<string, number | boolean | string>>;
}

export interface ConstructDecisionDiagnostic {
  readonly program: string;
  readonly selectedRules: readonly string[];
  readonly requests: readonly string[];
  readonly rules: readonly ConstructRuleDiagnostic[];
}

const expressionSensors = (expression: Expression, into: Set<string>): void => {
  switch (expression.op) {
    case "sensor": into.add(expression.id); return;
    case "active": return;
    case "constant": return;
    case "not": expressionSensors(expression.value, into); return;
    case "lt": case "lte": case "gt": case "gte":
      expressionSensors(expression.left, into);
      expressionSensors(expression.right, into);
      return;
    case "and": case "or": case "add": case "sub": case "mul": case "min": case "max":
      for (const value of expression.values) expressionSensors(value, into);
      return;
  }
};

export class ConstructMind {
  readonly name: string;
  private readonly graph: ConstructControlGraph;
  private readonly validated: ValidatedProgram;
  private last: ConstructDecisionDiagnostic;
  private readonly trueFor = new Map<number, number>();

  constructor(program: ConstructProgram, graph: ConstructControlGraph, sensors: readonly SensorSpec[]) {
    this.name = program.id;
    this.graph = graph;
    this.validated = validateProgram(program, graph, sensors);
    this.last = Object.freeze({ program: program.id, selectedRules: Object.freeze([]),
      requests: Object.freeze([]), rules: Object.freeze([]) });
  }

  decide(frame: SensorFrame, dt = Number.POSITIVE_INFINITY,
    runtime?: ProgramRuntimeState): ConstructCommand {
    const sensorsByRule = new Map<number, readonly string[]>();
    const availableRuleIndices = this.validated.enabledRuleIndices.filter((index) => {
      const rule = this.validated.program.rules[index];
      const ids = new Set<string>();
      expressionSensors(rule.condition, ids);
      expressionSensors(rule.utility, ids);
      for (const parameter of Object.values(rule.parameters)) {
        if (parameter.kind === "expression") expressionSensors(parameter.value, ids);
      }
      const ordered = Object.freeze([...ids].sort());
      sensorsByRule.set(index, ordered);
      return ordered.every((id) => frame.has(id));
    });
    const proposed = commandForRules(Object.freeze({ ...this.validated,
      enabledRuleIndices: Object.freeze(availableRuleIndices) }), this.graph, frame, runtime);
    const proposedByIndex = new Map(proposed.requests.map((request) => [request.sourceIndex, request]));
    const requests = this.validated.enabledRuleIndices.flatMap((index) => {
      const request = proposedByIndex.get(index);
      if (!request) { this.trueFor.delete(index); return []; }
      const elapsed = (this.trueFor.get(index) ?? 0) + dt;
      this.trueFor.set(index, elapsed);
      return elapsed >= this.validated.program.rules[index].dwellS ? [request] : [];
    });
    const command = Object.freeze({ version: 1 as const, requests: Object.freeze(requests) });
    const selectedRules = command.requests.map((request) => this.validated.program.rules[request.sourceIndex].id);
    const selectedIndices = new Set(command.requests.map((request) => request.sourceIndex));
    const rules = this.validated.enabledRuleIndices.map((index) => {
      const rule = this.validated.program.rules[index];
      const ids = sensorsByRule.get(index) ?? Object.freeze([]);
      const available = ids.every((id) => frame.has(id));
      const decisiveFacts = Object.fromEntries(ids.map((id) => [id, frame.has(id) ? frame.read(id).value : "unavailable"]));
      return Object.freeze({ rule: rule.id, utility: available ? Number(evaluateExpression(rule.utility, frame, runtime).value) : 0,
        selected: selectedIndices.has(index), decisiveFacts: Object.freeze(decisiveFacts) });
    });
    this.last = Object.freeze({ program: this.name, selectedRules: Object.freeze(selectedRules),
      requests: Object.freeze(command.requests.map((request) => request.request.action)), rules: Object.freeze(rules) });
    return command;
  }

  diagnostic(): ConstructDecisionDiagnostic { return this.last; }
}
