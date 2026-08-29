import { validateControlGraph, type ConstructControlGraph, type ControlGroupSpec } from "../construct/actions.ts";
import type { ConstructBlueprint } from "../construct/blueprint.ts";
import { saveConstruct } from "../construct/codec.ts";
import type { ConstructProgram } from "../construct/program.ts";
import type { SensorSpec } from "../construct/sensors.ts";
import { controllerChoicesForSelection } from "./control-editor.ts";

export interface ReconciledForgeArtifact {
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly removedActions: readonly string[];
}

/** Remove hardware-stale references as one Body/Actions/Mind transaction. */
export function reconcileForgeArtifact(blueprint: ConstructBlueprint, control: ConstructControlGraph,
  program: ConstructProgram, sensors: readonly SensorSpec[]): ReconciledForgeArtifact {
  const joints = new Set(blueprint.joints.map(({ id }) => id));
  const modules = new Set(blueprint.modules.map(({ id }) => id));
  const groups: ControlGroupSpec[] = control.groups.map((group) => ({ ...group,
    joints: group.joints.filter((id) => joints.has(id)), modules: group.modules.filter((id) => modules.has(id)),
    bindings: Object.fromEntries(Object.entries(group.bindings).map(([role, binding]) => [role, {
      joints: binding.joints.filter((id) => joints.has(id)), modules: binding.modules.filter((id) => modules.has(id)),
    }] as const).filter((row) => row[1].joints.length > 0 || row[1].modules.length > 0)),
  }));
  const base = validateControlGraph({ ...control, groups, actions: [] });
  const actions = control.actions.filter((action) => {
    const group = groups.find(({ id }) => id === action.group);
    if (!group || !controllerChoicesForSelection(group, blueprint).some(({ controller }) => controller === action.controller)) return false;
    try {
      saveConstruct("hardware reconciliation", blueprint, { ...base, actions: [action] },
        { ...program, rules: [] }, sensors);
      return true;
    } catch { return false; }
  });
  const graph = validateControlGraph({ ...base, actions });
  const actionIds = new Set(actions.map(({ id }) => id));
  const rules = program.rules.filter((rule) => {
    if (!actionIds.has(rule.action)) return false;
    try {
      saveConstruct("hardware reconciliation", blueprint, graph, { ...program, rules: [rule] }, sensors);
      return true;
    } catch { return false; }
  });
  const checked = saveConstruct("hardware reconciliation", blueprint, graph, { ...program, rules }, sensors);
  return Object.freeze({ control: checked.control, program: checked.program,
    removedActions: Object.freeze(control.actions.filter(({ id }) => !actionIds.has(id)).map(({ id }) => id)) });
}
