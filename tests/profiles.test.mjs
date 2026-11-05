import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allParts, MINDS, partLookup, treeLookup } from "../src/entrants/game.ts";
import { presetFitsModel } from "../src/core/mind/controller.ts";
import { BODY_MODELS, modelHolds, resolveCharacter } from "../src/core/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../src/core/items/held.ts";
import { limbAction, skillsOf } from "../src/core/option/kinds.ts";
import { skillDigest, specDigest, techniqueDigest } from "../src/core/skills/framework/profile.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { record } from "../src/core/option/value.ts";

/**
 * Every measured profile (`assets/core/<kind>-profiles.json`) is of a skill the game has, on a body
 * it builds: a profile is read only where its body, spec digest and skill digest are the reader's
 * (`staleness`), so one keyed to a skill or body that has moved on is never read, and a strike or
 * edge that has none is priced by hand in silence. The bodies are each model at its defaults
 * holding each loadout it can; the skills, the strikes each preset's Options name on a body it fits (`skillsOf`), each with one limb (`limbAction`)
 * (`skillDigest`), and each technique by its kind (`techniqueDigest`).
 */
test("every measured profile is of a current skill on a current body", () => {
  const bodies = [];
  for (const model of BODY_MODELS) for (const loadout of LOADOUTS) {
    if (loadoutFaults(loadout).length || !modelHolds(model) && (loadout.left !== "empty" || loadout.right !== "empty")) continue;
    bodies.push({ model, spec: withLoadout(resolveCharacter({ model }).spec, loadout) });
  }
  const on = (spec, skill) => `${bodyKey(spec)} ${specDigest(spec)} ${skill}`;
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
  assert.ok(keys.strike.size > 0 && keys.edge.size > 0, "the presets reached strikes and techniques to key profiles by");
  const stale = [];
  for (const kind of Object.keys(keys)) {
    const { profiles } = JSON.parse(readFileSync(new URL(`../assets/core/${kind}-profiles.json`, import.meta.url), "utf8"));
    assert.ok(profiles.length > 0, `assets/core/${kind}-profiles.json holds profiles`);
    for (const { measured } of profiles) if (!keys[kind].has(`${measured.body} ${measured.spec} ${measured.skill}`))
      stale.push(`${kind}: ${measured.body} (spec ${measured.spec}), skill ${measured.skill}`);
  }
  assert.deepEqual(stale, [], "profiles keyed to no current skill on a current body: measure them again (research/<kind>-profiles.mjs)");
});

/**
 * **A strike priced by hand reads its tries of its own limb** (`record`): a stomp its executor gave
 * up on before committing (`stalled`) is a try that landed nothing, so a foot that keeps failing
 * from where it stands is priced down, not retried from there forever; the other foot's record is
 * its own, and a try the mind let go (`cancelled`) is no try.
 */
test("a strike's record counts its own limb's tries its executor gave up on", () => {
  const none = { target: 0, block: 0, incidental: 0, world: 0 };
  const ended = (id, effector, kind, committed) => ({ id, action: "stomp", effector, target: { kind: "body", id: "foe", region: { kind: "mark", mark: "middle" } },
    sequence: id, began: id, ended: id + .5, ending: { kind }, committed, observations: [], observed: 0,
    contacts: { counts: { prepare: none, commit: none, release: none }, loadedInCommit: false, blockedSegments: [], lastTarget: null } });
  const right = { name: "stomp", effectors: ["foot.right"] }, left = { name: "stomp", effectors: ["foot.left"] };
  const stalled = [1, 2, 3].map((id) => ended(id, "foot.right", "stalled", false));
  const fresh = record([], right);
  assert.ok(record(stalled, right).lands < fresh.lands, `three stalled tries lower the foot's record: ${record(stalled, right).lands} against ${fresh.lands}`);
  assert.deepEqual(record(stalled, left), record([], left), "the other foot's record is its own");
  assert.deepEqual(record([...stalled, ended(4, "foot.right", "cancelled", false)], right), record(stalled, right), "a try let go is no try");
});
