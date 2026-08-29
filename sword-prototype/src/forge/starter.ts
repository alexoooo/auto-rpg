import { validateBlueprint, type ConstructBlueprint } from "../construct/blueprint.ts";
import { validateControlGraph, type ConstructControlGraph } from "../construct/actions.ts";
import { saveConstruct, type SavedConstruct } from "../construct/codec.ts";
import { validateProgram, type ConstructProgram } from "../construct/program.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../construct/warden.ts";

/** A valid powered core with its dorsal tool, but no locomotor branches. */
export function starterCoreBlueprint(): ConstructBlueprint {
  const source = wardenBlueprint("crossbow");
  const keptParts = new Set(source.parts.filter(({ id }) => !id.startsWith("limb-")).map(({ id }) => id));
  const sockets = source.sockets.filter(({ part }) => keptParts.has(part));
  const socketIds = new Set(sockets.map(({ id }) => id));
  return validateBlueprint({ ...source, id: "player-starter-core",
    parts: source.parts.filter(({ id }) => keptParts.has(id)),
    joints: source.joints.filter(({ parentPart, childPart }) => keptParts.has(parentPart) && keptParts.has(childPart)), sockets,
    modules: source.modules.filter(({ socket }) => socketIds.has(socket)) });
}

export function starterCoreConstruct(): SavedConstruct {
  const blueprint = starterCoreBlueprint();
  const joints = new Set(blueprint.joints.map(({ id }) => id));
  const modules = new Set(blueprint.modules.map(({ id }) => id));
  const source = wardenControl("crossbow");
  const groups = source.groups.filter((group) => group.joints.every((id) => joints.has(id)) &&
    group.modules.every((id) => modules.has(id)));
  const groupIds = new Set(groups.map(({ id }) => id));
  const control: ConstructControlGraph = validateControlGraph({ ...source, groups,
    actions: source.actions.filter(({ group }) => groupIds.has(group)) });
  const actionIds = new Set(control.actions.map(({ id }) => id));
  const sourceProgram = wardenProgram("crossbow");
  const program: ConstructProgram = validateProgram({ ...sourceProgram,
    rules: sourceProgram.rules.filter(({ action }) => actionIds.has(action)) }, control, WARDEN_SENSORS).program;
  return saveConstruct("Starter core -- build four limbs", blueprint, control, program, WARDEN_SENSORS);
}
