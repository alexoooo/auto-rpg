import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allParts, MINDS, treeLookup } from "../src/entrants/game.ts";
import { presetFitsModel } from "../src/core/mind/controller.ts";
import { BODY_MODELS, modelHolds, resolveCharacter } from "../src/core/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../src/core/items/held.ts";
import { armedActions } from "../src/core/skills/action-config.ts";
import { profileReading, skillDigest, specDigest, techniqueDigest } from "../src/core/skills/framework/profile.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { modelSpec } from "../src/core/models.ts";

/**
 * Every measured profile (`assets/core/<kind>-profiles.json`) is of a skill the game has, on a body
 * it builds: a profile is read only where its body, spec digest and skill digest are the reader's
 * (`staleness`), so one keyed to a skill or body that has moved on is never read, and a strike or
 * edge that has none is priced by hand in silence. The bodies are each model at its defaults
 * holding each loadout it can; the skills, each preset's armed strikes on a body it fits
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
  const techniques = Object.entries(allParts()).filter(([, part]) => part.role === "technique").map(([kind]) => techniqueDigest({ kind }));
  for (const preset of Object.values(MINDS)) {
    const config = preset.config, parts = treeLookup(config);
    if (!Array.isArray(config.executors) || !Array.isArray(config.actions)) continue;
    for (const { model, spec } of bodies) {
      if (!presetFitsModel(preset, model)) continue;
      for (const action of armedActions(parts, spec, config.executors, config.actions)) {
        keys.strike.add(on(spec, skillDigest(parts, spec, config.executors, action)));
      }
    }
  }
  for (const { spec } of bodies) for (const technique of techniques) keys.edge.add(on(spec, technique));
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
 * **A profile is read by where its trials began**, the start's velocity with the range
 * (`profileReading`, `Start.velocity`): a strike begun stepping in reads its own trials where they
 * differ from those begun still, and the same where they do not. A rate of blows reads each trial's
 * cycle, its run and its limb's way back to its guard (`Trial.recovers`), and the run alone where
 * no trial records the way back; its fastest blow reads the run. Synthetic trials, at one range:
 * still, dealing 6 HP in 0.25 s and back in 0.35 s; stepping in at 0.8 m/s, dealing 9 HP in 0.2 s,
 * none recording its way back.
 */
test("a strike's profile reads its trials by the start's velocity, and its rate by the whole cycle", () => {
  const spec = modelSpec("workshop-fighter"), hp = spec.wounds.hp.value;
  const trial = (velocity, dealt, seconds, recovers) => ({ start: { range: .9, phase: "clear", velocity }, done: dealt > 0, dealt, taken: 0, seconds, recovers, down: false });
  const still = Array.from({ length: 10 }, () => trial([0, 0], 6, .25, .35)), stepping = Array.from({ length: 10 }, () => trial([.8, 0], 9, .2, null));
  const measured = { body: "", spec: "", skill: "synthetic", hz: 120, reaction: null };
  const reading = profileReading({ measured, target: null, trials: [...still, ...stepping] }, spec);
  const at = (velocity) => ({ range: .9, phase: "clear", velocity });
  const fromStill = reading.expect(at([0, 0]), spec), steppingIn = reading.expect(at([.8, 0]), spec);
  assert.ok(fromStill && steppingIn, "the reading reads both starts within its reach");
  const near = (x) => Number(x.toFixed(9));
  assert.deepEqual({ dealt: near(fromStill.dealt * hp), seconds: near(fromStill.seconds) }, { dealt: 6, seconds: .25 }, "begun still, its still trials");
  assert.deepEqual({ dealt: near(steppingIn.dealt * hp), seconds: near(steppingIn.seconds) }, { dealt: 9, seconds: .2 }, "begun stepping in, its stepping trials");
  assert.equal(near(reading.rate(at([0, 0]), spec) * hp), near(6 / .6), "begun still, a blow every run and way back, 0.6 s");
  assert.equal(near(reading.rate(at([.8, 0]), spec) * hp), near(9 / .2), "begun stepping in, none recording its way back, a blow every run");
  assert.equal(near(reading.fastest("clear")), .2, "its fastest blow is the shortest run");
  const alike = profileReading({ measured, target: null, trials: [...still, ...still.map((one) => ({ ...one, start: { ...one.start, velocity: [.8, 0] } }))] }, spec);
  assert.deepEqual(alike.expect(at([.8, 0]), spec), alike.expect(at([0, 0]), spec), "where the trials are alike, so are the readings");
});
