import type { ConstructControlGraph } from "../actions.ts";
import type { ActionCapability } from "../capabilities.ts";

export interface ActionCandidate {
  readonly action: string;
  readonly group: string;
  readonly declarationIndex: number;
  readonly parameterBounds: Readonly<Record<string, readonly [number, number]>>;
  readonly parameterDescriptors: Readonly<Record<string,
    Readonly<{ kind: "number"; min: number; max: number }> |
    Readonly<{ kind: "boolean" }> |
    Readonly<{ kind: "enum"; values: readonly string[] }>>>;
  readonly claims: readonly string[];
}

export function actionCandidates(
  graph: ConstructControlGraph,
  capabilities: readonly ActionCapability[],
): readonly ActionCandidate[] {
  const live = new Map(capabilities.map((capability) => [`${capability.action}/${capability.group}`, capability]));
  const rows = graph.actions.flatMap((action) => {
    const capability = live.get(`${action.id}/${action.group}`);
    if (!capability?.available) return [];
    const group = graph.groups.find((candidate) => candidate.id === action.group);
    if (!group) throw new Error(`candidate action "${action.id}" references missing group "${action.group}"`);
    return [{ action: action.id, group: action.group,
      parameterBounds: capability.parameterBounds,
      parameterDescriptors: Object.freeze(Object.fromEntries(Object.entries(action.parameters).map(([name, spec]) =>
        [name, spec.kind === "number" ? Object.freeze({ kind: spec.kind, min: spec.min, max: spec.max })
          : spec.kind === "enum" ? Object.freeze({ kind: spec.kind, values: Object.freeze([...spec.values].sort()) })
            : Object.freeze({ kind: spec.kind })]))),
      claims: Object.freeze([...new Set([...group.joints.map((joint) => `joint:${joint}`),
        ...action.claims])].sort()) }];
  }).sort((left, right) => left.action < right.action ? -1 : left.action > right.action ? 1 :
    left.group < right.group ? -1 : left.group > right.group ? 1 : 0);
  return Object.freeze(rows.map((row, declarationIndex) => Object.freeze({ ...row, declarationIndex })));
}

export function decodeCandidateParameter(candidate: ActionCandidate, name: string, normalized: number): number {
  if (!Number.isFinite(normalized)) throw new Error(`candidate "${candidate.action}" parameter "${name}" is non-finite`);
  const bounds = candidate.parameterBounds[name];
  if (!bounds) throw new Error(`candidate "${candidate.action}" has no numeric parameter "${name}"`);
  const unit = Math.max(-1, Math.min(1, normalized));
  return bounds[0] + (unit + 1) * 0.5 * (bounds[1] - bounds[0]);
}
