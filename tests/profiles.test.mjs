import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allParts, MINDS, treeLookup } from "../src/entrants/game.ts";
import { presetFitsModel } from "../src/core/mind/controller.ts";
import { BODY_MODELS, modelHolds, resolveCharacter } from "../src/core/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../src/core/items/held.ts";
import { armedActions } from "../src/core/tactics/action-config.ts";
import { gaitDigest, skillDigest, specDigest, techniqueDigest } from "../src/core/skills/framework/profile.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { gaitsOf } from "../src/core/option/places.ts";

/**
 * Every measured profile (`assets/core/<kind>-profiles.json`) is of a skill the game has, on a body
 * it builds: a profile is read only where its body, spec digest and skill digest are the reader's
 * (`staleness`), so one keyed to a skill or body that has moved on is never read, and a strike, gait
 * or edge that has none is priced by hand in silence. The bodies are each model at its defaults
 * holding each loadout it can; the skills, each preset's armed strikes on a body it fits
 * (`skillDigest`), each of its gaits stopping to throw one (`gaitDigest`), and each technique by
 * its kind and as a preset's ground holds it (`techniqueDigest`).
 */
test("every measured profile is of a current skill on a current body", () => {
  const bodies = [];
  for (const model of BODY_MODELS) for (const loadout of LOADOUTS) {
    if (loadoutFaults(loadout).length || !modelHolds(model) && (loadout.left !== "empty" || loadout.right !== "empty")) continue;
    bodies.push({ model, spec: withLoadout(resolveCharacter({ model }).spec, loadout) });
  }
  const on = (spec, skill) => `${bodyKey(spec)} ${specDigest(spec)} ${skill}`;
  const keys = { strike: new Set(), gait: new Set(), edge: new Set() };
  const techniques = Object.entries(allParts()).filter(([, part]) => part.role === "technique").map(([kind]) => techniqueDigest({ kind }));
  for (const preset of Object.values(MINDS)) {
    const config = preset.config, parts = treeLookup(config);
    techniques.push(...(config.ground ?? []).map((technique) => techniqueDigest(technique)));
    if (!Array.isArray(config.executors) || !Array.isArray(config.actions)) continue;
    for (const { model, spec } of bodies) {
      if (!presetFitsModel(preset, model)) continue;
      for (const action of armedActions(parts, spec, config.executors, config.actions)) {
        const skill = skillDigest(parts, spec, config.executors, action);
        keys.strike.add(on(spec, skill));
        for (const gait of config.locomotion ? gaitsOf(config.locomotion) : []) keys.gait.add(on(spec, gaitDigest(gait.legs, skill)));
      }
    }
  }
  for (const { spec } of bodies) for (const technique of techniques) keys.edge.add(on(spec, technique));
  assert.ok(keys.strike.size > 0 && keys.gait.size > 0 && keys.edge.size > 0, "the presets reached strikes, gaits and techniques to key profiles by");
  const stale = [];
  for (const kind of Object.keys(keys)) {
    const { profiles } = JSON.parse(readFileSync(new URL(`../assets/core/${kind}-profiles.json`, import.meta.url), "utf8"));
    assert.ok(profiles.length > 0, `assets/core/${kind}-profiles.json holds profiles`);
    for (const { measured } of profiles) if (!keys[kind].has(`${measured.body} ${measured.spec} ${measured.skill}`))
      stale.push(`${kind}: ${measured.body} (spec ${measured.spec}), skill ${measured.skill}`);
  }
  assert.deepEqual(stale, [], "profiles keyed to no current skill on a current body: measure them again (research/<kind>-profiles.mjs)");
});
