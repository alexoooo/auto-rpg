import "../harness/preload-data.mjs";
/** A character's skills: each variation it holds, several of one skill among them, each a skill of its own to its mind. */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCharacter, resolveCharacterChecked } from "../../src/core/bodies/models.ts";
import { MINDS, treeLookup } from "../../src/app/catalog.ts";
import { skillsOf } from "../../src/minds/option/skills.ts";
import { limbAction } from "../../src/minds/option/kinds.ts";
import { skillDigest } from "../../src/skills/framework/profile.ts";
import { readSkills, writeSkills } from "../../src/game/skill-link.ts";
import { allParts, partLookup, GAME } from "../../src/app/catalog.ts";
import { BODY_MODELS, modelHolds } from "../../src/core/bodies/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../../src/core/bodies/items/held.ts";
import { motorAndGuardOf } from "../../src/skills/assembly/filled.ts";
import { guardConfigs } from "../../src/skills/assembly/guards.ts";
import { GUARD_OPTION, WALK_OPTION } from "../../src/minds/option/kinds.ts";
import { coreStand } from "../harness/core-stand.mjs";
import { stockBody } from "../../src/app/stock-body.ts";
import { makeSkills } from "../../src/skills/assembly/assembly.ts";
import { standIntent } from "../../src/skills/framework/intent.ts";
import { skillName } from "../../src/skills/framework/variations.ts";
import { saveState, loadState } from "../../src/core/state.ts";
import { navigationRepertoire } from "../../src/skills/assembly/navigations.ts";
import { legsOf, motorOf } from "../../src/skills/assembly/filled.ts";
import { describeMind } from "../../src/minds/catalog/catalog.ts";

test("deselecting an optional skill leaves the remaining combat repertoire usable", async () => {
  const base = withLoadout(resolveCharacter({ model: "man" }).spec, { left: "empty", right: "empty" });
  for (const dropped of ["support-fold/support-fold", "staged-roll/staged-roll", "walk-run/walk-run", "stance-walk/stance-walk"]) {
    const spec = { ...base, skills: base.skills.filter(name => name !== dropped) };
    assert.equal(GAME.stageRefusal(spec, config, []), null, `${dropped}: remaining selected skills can start`);
    const made = skillsOf(parts, spec, config.options);
    assert.ok(made.executors.some(one => one.kind === "straight-punch"), "optional support is not a requirement for the punch");
    if (dropped.startsWith("support-fold/")) assert.deepEqual(made.supports, []);
    if (dropped.startsWith("staged-roll/")) assert.equal(made.techniques.some(one => one.kind === "staged-roll"), false);
  }
  for (const model of ["man", "rat", "reptile"]) {
    const base = resolveCharacter({ model }).spec, role = model === "man" ? "gait" : "paw-gait";
    const gaits = parts.selected(role, base);
    for (const kept of gaits) {
      const spec = { ...base, skills: base.skills.filter(name => parts.any({ kind: name.split("/")[0] }).role !== role || name === skillName(kept)) };
      const stand = await coreStand(spec), actor = stockBody(stand.built, stand.world, { servoSeconds: .1, motor: motorOf(parts, parts.fitting("motor", spec)) });
      try {
        const selected = parts.fitting("locomotion", spec);
        assert.equal(typeof selected, "object", `${model}: one selected gait is enough`);
        const legs = legsOf(parts, actor.commanded, selected);
        assert.equal(legs.gaits.length, 1, `${model}: disabled gaits are not built or offered`);
        assert.equal(legs.limitsOf(legs.gaits[0]) !== null, true);
      } finally { actor.dispose(); stand.dispose(); }
    }
    const withoutPolicy = { ...base, skills: base.skills.filter(name => parts.any({ kind: name.split("/")[0] }).role !== "locomotion") };
    const stand = await coreStand(withoutPolicy), actor = stockBody(stand.built, stand.world, { servoSeconds: .1, motor: motorOf(parts, parts.fitting("motor", withoutPolicy)) });
    try {
      const legs = legsOf(parts, actor.commanded, parts.fitting("locomotion", withoutPolicy));
      assert.deepEqual(legs.gaits, gaits.map(skillName), "turning off automatic movement leaves every selected native gait available");
      assert.equal(GAME.stageRefusal(withoutPolicy, config, []), null);
    } finally { actor.dispose(); stand.dispose(); }
  }
  const club = withLoadout(base, { left: "buckler", right: "club" });
  const made = describeMind(GAME, club, config);
  assert.ok(made.executors.some(one => one.kind === "club-blow"), "the selected experimental blow is an available executor");
  assert.equal(made.components.find(one => one.role === "option" && one.config.kind === "strike-club-blow").path, null,
    "a generated choice has no fabricated path into the configured option list");
  assert.deepEqual(parts.selected("guard", club).map(one => one.kind), ["cover-guard", "shield-guard", "lowered"], "one applicable guard does not exclude another");
});

test("the mind can choose every enabled guard and restore the chosen posture", async () => {
  const spec = withLoadout(resolveCharacter({ model: "man" }).spec, { left: "empty", right: "empty" });
  const stand = await coreStand(spec), actor = stockBody(stand.built, stand.world, { servoSeconds: .1 });
  const guards = guardConfigs(parts, spec), given = { spec, parts, guards, walk: {}, legs: parts.fitting("locomotion", spec) };
  const options = GUARD_OPTION.make(GUARD_OPTION.defaults, given), now = { sight: { report: { legs: { heading: 0 } } }, ward: null };
  let skills;
  try {
    skills = makeSkills(actor.commanded, stand.world.clock, parts, { legs: given.legs, guards,
      navigations: parts.selected("navigation", spec), executors: [], actions: [], supports: [] });
    assert.deepEqual(options.map(option => option.step(now, 1 / 120).asked.guardSkill), guards.map(skillName), "no stage removes a guard from the chooser");
    let saved, expected;
    for (const [i, option] of options.entries()) {
      const command = skills.command(actor.view, { ...standIntent(), ...option.step(now, 1 / 120).asked }, 1 / 120);
      const config = guards[i], posture = parts.of("guard", config).posture(spec, config);
      for (const [channel, angle] of Object.entries(posture)) assert.equal(command.posture[channel], angle, `${skillName(config)} drives ${channel}`);
      if (i === 0) { saved = saveState(skills.state); expected = posture; }
    }
    loadState(skills.state, saved);
    const restored = skills.command(actor.view, standIntent(), 1 / 120);
    for (const [channel, angle] of Object.entries(expected)) assert.equal(restored.posture[channel], angle, "restoring memory restores the actual guard");
    assert.throws(() => skills.command(actor.view, { ...standIntent(), guardSkill: "rest/rest" }, 1 / 120), /not selected/);
  } finally { skills?.release(actor.view, "replaced"); actor.dispose(); stand.dispose(); }
});

test("selected navigation choices keep separate routes and restore the active planner", () => {
  const spec = resolveCharacter({ model: "man" }).spec, configs = parts.selected("navigation", spec), navigation = navigationRepertoire(parts, spec, configs);
  const given = { spec, parts, legs: parts.fitting("locomotion", spec), sites: { all: [], names: [] }, walk: {} };
  const options = WALK_OPTION.make(WALK_OPTION.defaults, given);
  assert.equal(options.length, configs.length * parts.of("locomotion", given.legs).gaits(given.legs).length, "each enabled planner is paired with each enabled gait");
  const sight = { view: { time: 0, stance: { centre: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
    senses: { side: "party", others: [], solids: [] } }, report: { legs: { heading: 0 } } };
  const gait = { envelope: null, stopping: 1, lag: 0 }, request = x => ({ kind: "place", points: [{ x, z: 6 }], near: .1 });
  let saved, expected;
  for (const [i, config] of configs.entries()) {
    navigation.select(skillName(config));
    assert.equal(navigation.report.request, null, "a newly chosen planner has its own route memory");
    navigation.step(sight, request(i), gait, 1, 1 / 120);
    assert.deepEqual(navigation.report.request, request(i));
    if (i === 0) { saved = saveState(navigation.state); expected = structuredClone(navigation.report); }
    sight.view.time += 1 / 120;
  }
  loadState(navigation.state, saved);
  assert.deepEqual(navigation.report, expected, "saved memory includes the active planner and its route");
});

test("a character without cover can start with its enabled lowered arms", () => {
  for (const model of ["man", "woman", "skeleton"]) {
    const base = withLoadout(resolveCharacter({ model }).spec, { left: "empty", right: "empty" });
    const spec = { ...base, skills: base.skills.filter(name => !name.startsWith("cover-guard/")) };
    assert.deepEqual(guardConfigs(parts, spec), [{ kind: "lowered", variation: "lowered" }], `${model}: the enabled open guard is available`);
    assert.equal(GAME.stageRefusal(spec, config, ["attacks", "uses-held"]), null, `${model}: Fight admits the selected skills`);
    const guard = partLookup.of("guard", { kind: "lowered" });
    assert.deepEqual(motorAndGuardOf(parts, spec).posture, guard.posture(spec, guard.defaults), "the mind's restricted lookup constructs the admitted guard");
    assert.deepEqual(guardConfigs(parts, base).map(one => one.kind), ["cover-guard", "lowered"], "every enabled guard is available without a stage preference");
    const without = { ...spec, skills: spec.skills.filter(name => !name.startsWith("lowered/")) };
    assert.deepEqual(guardConfigs(parts, without), [], "disabled skills are not supplied instead");
  }
});

const config = MINDS.option.config, parts = treeLookup(config);
const punches = (skills) => {
  const spec = resolveCharacter({ model: "man", skills }).spec, made = skillsOf(parts, spec, config.options);
  return { spec, made, executors: made.executors.filter((one) => one.kind === "straight-punch"), actions: made.actions.filter((one) => one.name.startsWith("straight-punch")) };
};

test("a character holding two variations of a skill strikes by each, and each reads as it does alone", () => {
  const both = punches(["straight-punch/drive", "straight-punch/from-guard"]);
  assert.deepEqual(both.executors.map((one) => [one.name, one.variation]), [["straight-punch/drive", "drive"], ["straight-punch/from-guard", "from-guard"]]);
  assert.deepEqual(both.actions.map((one) => [one.name, one.executor]), [["straight-punch/drive", "straight-punch/drive"], ["straight-punch/from-guard", "straight-punch/from-guard"]]);
  const digest = ({ spec, made }, action, limb) => skillDigest(parts, spec, made.executors, limbAction(action, limb));
  for (const variation of ["drive", "from-guard"]) {
    const alone = punches([`straight-punch/${variation}`]);
    assert.deepEqual(alone.executors.map((one) => one.name), ["straight-punch"], "one variation of a skill is named by the skill");
    const held = both.actions.find((one) => one.executor.endsWith(variation));
    assert.equal(digest(both, held, "hand.right"), digest(alone, alone.actions[0], "hand.right"), `${variation} measures alike whether held alone or beside another`);
  }
  assert.notEqual(digest(both, both.actions[0], "hand.right"), digest(both, both.actions[1], "hand.right"), "two variations are two skills to a profile");
  assert.deepEqual(punches([]).executors, [], "a character holding no punch has none");
});

test("a character's skills are a list of skill/variation, none twice, carried whole by a link", () => {
  assert.match(resolveCharacterChecked({ model: "man", skills: ["straight-punch"] }).refused, /not skill\/variation/);
  assert.match(resolveCharacterChecked({ model: "man", skills: ["stomp/stomp", "stomp/stomp"] }).refused, /twice/);
  assert.match(resolveCharacterChecked({ model: "man", skills: { "straight-punch": "drive" } }).refused, /a list/);
  const query = new URLSearchParams();
  writeSkills(query, "left", ["straight-punch/drive", "straight-punch/from-guard"]);
  assert.equal(query.get("left.skills"), "straight-punch/drive,straight-punch/from-guard");
  assert.deepEqual(readSkills(query, "left"), ["straight-punch/drive", "straight-punch/from-guard"]);
  writeSkills(query, "left", []);
  assert.deepEqual(readSkills(query, "left"), [], "an empty value holds no skill");
  writeSkills(query, "left", undefined);
  assert.equal(readSkills(query, "left"), undefined, "no value is the character's own");
});

test("every skill part, whatever its role, runs only on a body whose character holds it", () => {
  const roles = new Set();
  for (const [kind, part] of Object.entries(allParts())) {
    if (!part.variations) continue;
    let fitted = null;
    for (const model of BODY_MODELS) for (const loadout of LOADOUTS) {
      if (fitted || loadoutFaults(loadout).length || !modelHolds(model) && (loadout.left !== "empty" || loadout.right !== "empty")) continue;
      const spec = withLoadout(resolveCharacter({ model }).spec, loadout);
      if (part.fits(spec, part.defaults, partLookup) === null) fitted = spec;
    }
    assert.ok(fitted, `${kind}: some character holds it and runs it`);
    const without = { ...fitted, skills: fitted.skills.filter((name) => !name.startsWith(`${kind}/`)) };
    assert.match(part.fits(without, part.defaults, partLookup) ?? "", /the character has no/, `${kind}: a character that does not hold it does not run it`);
    roles.add(part.role);
  }
  for (const role of ["executor", "guard", "locomotion", "gait", "paw-gait", "support", "technique", "navigation"]) assert.ok(roles.has(role), `a ${role} is a skill a character holds`);
});
