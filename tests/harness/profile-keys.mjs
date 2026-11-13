import { skillsOf } from "../../src/minds/option/skills.ts";
import { allParts, MINDS, partLookup, treeLookup } from "../../src/app/catalog.ts";
import { presetFitsModel } from "../../src/minds/catalog/controller.ts";
import { BODY_MODELS, modelHolds, resolveCharacter } from "../../src/core/bodies/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../../src/core/bodies/items/held.ts";
import { limbAction } from "../../src/minds/option/kinds.ts";
import { skillDigest, specDigest, techniqueDigest } from "../../src/skills/framework/profile.ts";

/**
 * **What a measured profile can be of now**, as `<body> <spec digest> <skill digest>`: the bodies
 * are each model at its defaults holding each loadout it can; a strike is one a preset's Options
 * name on a body it fits (`skillsOf`), with one limb (`limbAction`, `skillDigest`); an edge is a
 * technique by its kind (`techniqueDigest`). A profile on none of these is read by nothing.
 */
export function profileKeys() {
  const bodies = [];
  for (const model of BODY_MODELS) for (const loadout of LOADOUTS) {
    if (loadoutFaults(loadout).length || !modelHolds(model) && (loadout.left !== "empty" || loadout.right !== "empty")) continue;
    bodies.push({ model, spec: withLoadout(resolveCharacter({ model }).spec, loadout) });
  }
  const on = (spec, skill) => `${spec.model} ${specDigest(spec)} ${skill}`;
  const keys = { strike: new Set(), edge: new Set() };
  const techniques = Object.entries(allParts()).filter(([, part]) => part.role === "technique").map(([kind]) => ({ kind }));
  for (const preset of Object.values(MINDS)) {
    const config = preset.config, parts = treeLookup(config);
    if (config.frame || !Array.isArray(config.options)) continue;
    for (const { model, spec } of bodies) {
      if (!presetFitsModel(preset, model)) continue;
      const { executors, actions } = skillsOf(parts, spec, config.options);
      for (const action of actions) for (const limb of action.effectors) keys.strike.add(on(spec, skillDigest(parts, spec, executors, limbAction(action, limb))));
    }
  }
  for (const { spec } of bodies) for (const technique of techniques) keys.edge.add(on(spec, techniqueDigest(partLookup, spec, technique)));
  return keys;
}
