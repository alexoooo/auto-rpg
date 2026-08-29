import type { ConstructCommand, ConstructControlGraph, ActionSpec, ParameterSpec } from "../actions.ts";
import type { ConstructBlueprint } from "../blueprint.ts";
import type { ActionCapability } from "../capabilities.ts";
import type { ActionCandidate } from "./candidates.ts";

export const mirrorConstructId = (id: string): string => id.split("-").map((token) =>
  token === "left" ? "right" : token === "right" ? "left" : token
).join("-");

const sourceAction = (control: ConstructControlGraph, id: string): ActionSpec | undefined =>
  control.actions.find((action) => action.id === id) ?? control.actions.find((action) => mirrorConstructId(action.id) === id);

const jointParity = (blueprint: ConstructBlueprint, id: string): number => {
  const source = blueprint.joints.find((joint) => joint.id === id) ??
    blueprint.joints.find((joint) => mirrorConstructId(joint.id) === id);
  if (!source) throw new Error(`construct mirror cannot resolve joint "${id}"`);
  return source.angularAxes[0].id === "x" ? 1 : -1;
};

const parameterParity = (action: ActionSpec | undefined, name: string, parameters?: Readonly<Record<string, unknown>>,
  blueprint?: ConstructBlueprint): number => {
  if (!action) return 1;
  if (action.controller === "quadruped-move" && name === "right") return -1;
  if ((action.controller === "quadruped-turn" || action.controller === "aim-direction") && name === "yaw") return -1;
  if (action.controller === "sweep-arc" && name === "direction") return -1;
  if (action.controller === "turn-joint-to-angle" && name === "angle-rad" && blueprint) {
    const selected = parameters?.joint;
    if (typeof selected === "string") return jointParity(blueprint, selected);
  }
  return 1;
};

const mirrorParameterSpec = (spec: ParameterSpec, parity: number): ParameterSpec => {
  if (spec.kind === "number") return Object.freeze({ ...spec,
    min: parity < 0 ? -spec.max : spec.min, max: parity < 0 ? -spec.min : spec.max });
  if (spec.kind === "enum") return Object.freeze({ ...spec,
    values: Object.freeze(spec.values.map(mirrorConstructId)) });
  return spec;
};

export function mirrorConstructControlGraph(control: ConstructControlGraph, blueprint?: ConstructBlueprint): ConstructControlGraph {
  return Object.freeze({ version: control.version,
    groups: Object.freeze(control.groups.map((group) => Object.freeze({
      id: mirrorConstructId(group.id),
      joints: Object.freeze(group.joints.map(mirrorConstructId)),
      modules: Object.freeze(group.modules.map(mirrorConstructId)),
      bindings: Object.freeze(Object.fromEntries(Object.entries(group.bindings).map(([role, binding]) => [
        mirrorConstructId(role), Object.freeze({ joints: Object.freeze(binding.joints.map(mirrorConstructId)),
          modules: Object.freeze(binding.modules.map(mirrorConstructId)) }),
      ]))),
    }))),
    actions: Object.freeze(control.actions.map((action) => Object.freeze({
      ...action, id: mirrorConstructId(action.id), group: mirrorConstructId(action.group),
      claims: Object.freeze(action.claims.map(mirrorConstructId)),
      parameters: Object.freeze(Object.fromEntries(Object.entries(action.parameters).map(([name, spec]) => [name,
        mirrorParameterSpec(spec, parameterParity(action, name, undefined, blueprint))]))),
    }))),
  });
}

export function mirrorConstructCapabilities(rows: readonly ActionCapability[], control?: ConstructControlGraph,
  blueprint?: ConstructBlueprint): readonly ActionCapability[] {
  return Object.freeze(rows.map((row) => {
    const action = control ? sourceAction(control, row.action) : undefined;
    return Object.freeze({ ...row, action: mirrorConstructId(row.action),
    group: mirrorConstructId(row.group), parameterBounds: Object.freeze(Object.fromEntries(
      Object.entries(row.parameterBounds).map(([name, bounds]) => {
        const parity = parameterParity(action, name, undefined, blueprint);
        return [name, Object.freeze((parity < 0 ? [-bounds[1], -bounds[0]] : [bounds[0], bounds[1]]) as [number, number])];
      }))),
  }); }));
}

export function mirrorConstructCandidates(candidates: readonly ActionCandidate[], control: ConstructControlGraph,
  blueprint?: ConstructBlueprint): readonly ActionCandidate[] {
  const mirrored = candidates.map((candidate) => {
    const action = sourceAction(control, candidate.action);
    const descriptors = Object.freeze(Object.fromEntries(Object.entries(candidate.parameterDescriptors).map(([name, descriptor]) => {
      const parity = parameterParity(action, name, undefined, blueprint);
      return [name, descriptor.kind === "number" ? Object.freeze({ ...descriptor,
        min: parity < 0 ? -descriptor.max : descriptor.min, max: parity < 0 ? -descriptor.min : descriptor.max }) :
        descriptor.kind === "enum" ? Object.freeze({ ...descriptor,
          values: Object.freeze(descriptor.values.map(mirrorConstructId)) }) : descriptor];
    })));
    return { ...candidate, action: mirrorConstructId(candidate.action), group: mirrorConstructId(candidate.group),
      claims: Object.freeze(candidate.claims.map(mirrorConstructId).sort()),
      parameterBounds: Object.freeze(Object.fromEntries(Object.entries(candidate.parameterBounds).map(([name, bounds]) => {
        const parity = parameterParity(action, name, undefined, blueprint);
        return [name, Object.freeze((parity < 0 ? [-bounds[1], -bounds[0]] : [bounds[0], bounds[1]]) as [number, number])];
      }))), parameterDescriptors: descriptors };
  }).sort((left, right) => left.action < right.action ? -1 : left.action > right.action ? 1 :
    left.group < right.group ? -1 : left.group > right.group ? 1 : 0);
  return Object.freeze(mirrored.map((row, declarationIndex) => Object.freeze({ ...row, declarationIndex })));
}

export function mirrorConstructCommand(command: ConstructCommand, control: ConstructControlGraph,
  blueprint?: ConstructBlueprint): ConstructCommand {
  return Object.freeze({ version: command.version, requests: Object.freeze(command.requests.map((scheduled) => {
    const action = sourceAction(control, scheduled.request.action);
    const source = scheduled.request.parameters;
    const parameters = Object.freeze(Object.fromEntries(Object.entries(source).map(([name, value]) => {
      if (typeof value === "number") return [name, value * parameterParity(action, name, source, blueprint)];
      if (typeof value === "string") return [name, mirrorConstructId(value)];
      return [name, value];
    })));
    return Object.freeze({ ...scheduled, request: Object.freeze({ action: mirrorConstructId(scheduled.request.action), parameters }) });
  })) });
}
