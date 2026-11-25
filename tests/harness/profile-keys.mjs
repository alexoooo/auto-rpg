import { skillsOf } from "../../src/minds/option/assembly/skills.ts";
import { optionsOf } from "../../src/minds/option/assembly/config.ts";
import { allParts, MINDS, treeLookup } from "../../src/app/catalog.ts";
import { presetFitsModel } from "../../src/minds/catalog/controller.ts";
import { BODY_MODELS, modelHolds, resolveCharacter } from "../../src/core/bodies/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../../src/core/bodies/items/held.ts";
import { limbAction } from "../../src/minds/option/options/strike-kinds.ts";
import { measuredOn, strikeSkill, techniqueSkill } from "../../src/skills/framework/profile/lookup.ts";

/** **What a profile is found by** (`Measured`), a key: its body's model, its skill as the body holds it, and its limb. */
export const profileKey = ({ body, skill, limb }) => `${body} ${skill} [${limb ?? ""}]`;

/**
 * **What a measured profile can be of now** (`profileKey`): the bodies are each model at its
 * defaults holding each loadout it can; a strike is one a preset's Options name on a body it fits
 * (`skillsOf`), with one limb (`limbAction`), in each variation of its skill a character may hold
 * (`Part.variations`: a person may give any of them to any character, and a character runs one of
 * a skill); an edge is a technique by its kind, in each of its variations; a step is the back step,
 * a gait by its kind, on each body. A profile on none of these is read by nothing.
 */
export function profileKeys() {
  const bodies = [], skills = Object.entries(allParts()).flatMap(([skill, part]) => Array.isArray(part.variations) ? part.variations.map((variation) => `${skill}/${variation}`) : []);
  for (const model of BODY_MODELS) for (const loadout of LOADOUTS) {
    if (loadoutFaults(loadout).length || !modelHolds(model) && (loadout.left !== "empty" || loadout.right !== "empty")) continue;
    bodies.push({ model, spec: withLoadout(resolveCharacter({ model, skills }).spec, loadout) });
  }
  const on = (spec, skill, limb) => profileKey(measuredOn(spec, { skill, limb }, { hz: 0, reaction: null, rate: 0, delay: 0 }));
  const keys = { strike: new Set(), edge: new Set(), step: new Set() };
  const techniques = Object.entries(allParts()).filter(([, part]) => part.role === "technique").map(([kind]) => ({ kind }));
  for (const preset of Object.values(MINDS)) {
    const config = preset.config, parts = treeLookup(config);
    if (config.kind !== "option") continue;
    for (const { model, spec } of bodies) {
      if (!presetFitsModel(preset, model)) continue;
      const { executors, actions } = skillsOf(parts, spec, optionsOf(config, parts));
      for (const action of actions) for (const limb of action.effectors) keys.strike.add(on(spec, strikeSkill(spec, executors, limbAction(action, limb)), limb));
    }
  }
  for (const { spec } of bodies) for (const technique of techniques) keys.edge.add(on(spec, techniqueSkill(spec, technique), null));
  for (const { spec } of bodies) keys.step.add(on(spec, "back-step", null));
  return keys;
}
