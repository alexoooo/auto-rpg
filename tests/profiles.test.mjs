import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allParts, MINDS, treeLookup } from "../src/entrants/game.ts";
import { presetFitsModel } from "../src/core/mind/controller.ts";
import { BODY_MODELS, modelHolds, resolveCharacter } from "../src/core/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../src/core/items/held.ts";
import { limbAction, skillsOf } from "../src/core/option/kinds.ts";
import { profileReading, skillDigest, specDigest, techniqueDigest } from "../src/core/skills/framework/profile.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { record } from "../src/core/option/value.ts";
import { modelSpec } from "../src/core/models.ts";

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
  const techniques = Object.entries(allParts()).filter(([, part]) => part.role === "technique").map(([kind]) => techniqueDigest({ kind }));
  for (const preset of Object.values(MINDS)) {
    const config = preset.config, parts = treeLookup(config);
    if (config.frame || !Array.isArray(config.options)) continue;
    for (const { model, spec } of bodies) {
      if (!presetFitsModel(preset, model)) continue;
      const { executors, actions } = skillsOf(parts, spec, config.options);
      for (const action of actions) for (const limb of action.effectors) keys.strike.add(on(spec, skillDigest(parts, spec, executors, limbAction(action, limb))));
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

/**
 * **A profile is read by where in its window a trial began** (`Start.window`): a strike begun at its
 * window's edge reads its trials begun there where they differ from those begun at its middle, a
 * reading that names no place is read at the middle, and a profile whose trials record no place
 * reads alike wherever it is asked. Synthetic trials, still, at one range: at the middle, dealing
 * 6 HP in 0.25 s; 0.15 m ahead of it, dealing none in 0.6 s.
 */
test("a strike's profile reads its trials by where in its window they began", () => {
  const spec = modelSpec("workshop-fighter"), hp = spec.wounds.hp.value;
  const trial = (window, dealt, seconds) => ({ start: { range: .9, phase: "clear", velocity: [0, 0], ...(window ? { window } : {}) }, done: dealt > 0, dealt, taken: 0, seconds, recovers: null, down: false });
  const middle = Array.from({ length: 10 }, () => trial([0, 0], 6, .25)), edge = Array.from({ length: 10 }, () => trial([.15, 0], 0, .6));
  const measured = { body: "", spec: "", skill: "synthetic", hz: 120, reaction: null };
  const reading = profileReading({ measured, target: null, trials: [...middle, ...edge] }, spec);
  const at = (window) => ({ range: .9, phase: "clear", velocity: [0, 0], ...(window ? { window } : {}) });
  const near = (x) => Number(x.toFixed(9));
  const read = (window) => { const e = reading.expect(at(window), spec); return e && { dealt: near(e.dealt * hp), seconds: near(e.seconds) }; };
  assert.deepEqual(read([0, 0]), { dealt: 6, seconds: .25 }, "begun at its window's middle, its middle trials");
  assert.deepEqual(read([.15, 0]), { dealt: 0, seconds: .6 }, "begun at its window's edge, its edge trials");
  assert.deepEqual(read(undefined), read([0, 0]), "a start that names no place is read at the middle");
  const placeless = profileReading({ measured, target: null, trials: middle.map((one) => trial(undefined, one.dealt, one.seconds)) }, spec);
  assert.deepEqual(placeless.expect(at([.15, 0]), spec), placeless.expect(at([0, 0]), spec), "trials that record no place read alike wherever asked");
});

test("profile neighbours include pruned ties and isolate scratch across starts, phases and progress", () => {
  const spec = modelSpec("workshop-fighter"), hp = spec.wounds.hp.value;
  const trial = (range, dealt, extra = {}) => ({ start: { range, phase: "clear" }, done: true, dealt, taken: 0,
    seconds: .25, recovers: .5, down: dealt === 3, end: "standing", exit: { range: 1 }, ...extra });
  // Nine coincident trials, the tenth neighbour, a pruned trial inside the tie tolerance,
  // and a trial outside it. The inside tie must contribute even on the first query.
  const run = [...Array.from({ length: 9 }, () => trial(1, 1)), trial(1.1, 3), trial(1.1 + 5e-11, 5), trial(1.1 + 2e-10, 100)];
  const letGo = [.1, .3].map(progress => trial(1, 0, { letGo: { progress, seconds: .5, taken: 2 } }));
  const profile = { measured: { body: "", spec: "", skill: "synthetic", hz: 120, reaction: null }, target: null, trials: [...run, ...letGo] };
  const reading = profileReading(profile, spec), at = { range: 1, phase: "clear", progress: .1 };
  const expected = { done: 1, dealt: 17 / 11 / hp, seconds: .25, recovers: .5, down: 1 / 11,
    ends: [{ at: "standing", share: 1 }], exit: { range: 1 }, letGo: { seconds: .5, taken: 2 / hp } };
  assert.deepEqual(reading.expect(at, spec), expected);
  assert.equal(reading.rate(at, spec), (17 / 11 / hp) / .75);
  const other = profileReading({ ...profile, trials: run.slice(0, 3) }, spec);
  for (const query of [{ range: 1.1, phase: "clear", velocity: [9, -9], window: [1, -1], progress: .3 },
    at, { range: 1.05, phase: "unknown", progress: .2 }, { range: 2, phase: "clear" }, at]) {
    other.expect(query, spec);
    const fresh = profileReading(profile, spec);
    assert.deepEqual(reading.expect(query, spec), fresh.expect(query, spec));
    assert.equal(reading.rate(query, spec), fresh.rate(query, spec));
    assert.equal(reading.peak(query.phase, spec), fresh.peak(query.phase, spec));
    assert.equal(reading.fastest(query.phase), fresh.fastest(query.phase));
  }
  const empty = profileReading({ ...profile, trials: [] }, spec);
  assert.deepEqual([empty.expect(at, spec), empty.rate(at, spec), empty.peak("clear", spec), empty.fastest("clear")], [null, null, 0, Infinity]);
  assert.deepEqual(other.expect(at, spec), { done: 1, dealt: 1 / hp, seconds: .25, recovers: .5, down: 0,
    ends: [{ at: "standing", share: 1 }], exit: { range: 1 } });
});

test("nested profile reads keep clamped coordinates for pruned ties", () => {
  const spec = modelSpec("workshop-fighter"), hp = spec.wounds.hp.value;
  const trial = (range, dealt) => ({ start: { range, phase: "clear" }, done: true, dealt, taken: 0,
    seconds: .25, recovers: .5, down: false, end: "standing" });
  const measured = { body: "", spec: "", skill: "synthetic", hz: 120, reaction: null };
  const inner = profileReading({ measured, target: null, trials: Array.from({ length: 10 }, () => ({
    ...trial(0, 2), start: { range: 0, phase: "clear", velocity: [9, -9], window: [1, -1] },
  })) }, spec);
  let nested = 0;
  const first = { ...trial(1, 1), get dealt() {
    nested++;
    assert.equal(inner.rate({ range: 0, phase: "clear", velocity: [9, -9], window: [1, -1] }, spec), (2 / hp) / .75);
    return 1;
  } };
  const outer = profileReading({ measured, target: null, trials: [first,
    ...Array.from({ length: 8 }, () => trial(1, 1)), trial(1.1, 3), trial(1.1 + 5e-11, 5), trial(1.1 + 2e-10, 100),
  ] }, spec);
  const actual = outer.expect({ range: 1, phase: "clear" }, spec);
  assert.ok(nested > 0, "the outer aggregation queries the other sample before its pruned tie");
  assert.deepEqual(actual, { done: 1, dealt: 17 / 11 / hp, seconds: .25, recovers: .5, down: 0,
    ends: [{ at: "standing", share: 1 }] });
});

test("nested profile reads keep the outer neighbours and returned readings", () => {
  const spec = modelSpec("workshop-fighter"), hp = spec.wounds.hp.value;
  const trial = (range, dealt) => ({ start: { range, phase: "clear" }, done: true, dealt, taken: 0,
    seconds: .25, recovers: .5, down: false, end: "standing", exit: { range } });
  const measured = { body: "", spec: "", skill: "synthetic", hz: 120, reaction: null };
  const inner = profileReading({ measured, target: null, trials: [
    ...Array.from({ length: 10 }, () => trial(0, 1)), ...Array.from({ length: 10 }, () => trial(3, 50)),
  ] }, spec);
  const expected = (dealt, range) => ({ done: 1, dealt: dealt / hp, seconds: .25, recovers: .5, down: 0,
    ends: [{ at: "standing", share: 1 }], exit: { range } });
  let nested = 0;
  const first = { ...trial(1, 2), get dealt() {
    nested++;
    assert.deepEqual(inner.expect({ range: 3, phase: "clear" }, spec), expected(50, 3));
    return 2;
  } };
  const outer = profileReading({ measured, target: null, trials: [first,
    ...Array.from({ length: 9 }, () => trial(1, 2)), ...Array.from({ length: 10 }, () => trial(2, 20)),
  ] }, spec);
  const at = { range: 1, phase: "clear" }, held = outer.expect(at, spec);
  assert.ok(nested > 0, "the outer aggregation reaches the nested profile read");
  assert.deepEqual(held, expected(2, 1));
  assert.equal(outer.rate(at, spec), (2 / hp) / .75);
  assert.deepEqual(outer.expect({ range: 2, phase: "clear" }, spec), expected(20, 2));
  assert.deepEqual(inner.expect({ range: 0, phase: "clear" }, spec), expected(1, 0));
  assert.deepEqual(held, expected(2, 1));
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
