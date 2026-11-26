import "../harness/preload-data.mjs";
/** Skills a character leaves out or holds several of one role of: each choice the mind can still make, and each one it makes restored from memory. */
import test from "node:test";
import assert from "node:assert/strict";
import { HUMANOID_MODELS, resolveCharacter } from "../../src/core/bodies/models.ts";
import { MINDS, treeLookup, partLookup, GAME } from "../../src/app/catalog.ts";
import { skillsOf } from "../../src/minds/option/assembly/skills.ts";
import { optionsOf } from "../../src/minds/option/assembly/config.ts";
import { GUARD_OPTION, WALK_OPTION } from "../../src/minds/option/options/kinds.ts";
import { withLoadout } from "../../src/core/bodies/items/held.ts";
import { legsOf, motorAndGuardOf, motorOf } from "../../src/skills/assembly/filled.ts";
import { guardConfigs } from "../../src/skills/assembly/guards.ts";
import { coreStand } from "../harness/core-stand.mjs";
import { stockBody } from "../../src/app/stock-body.ts";
import { makeSkills } from "../../src/skills/assembly/assembly.ts";
import { standIntent } from "../../src/skills/framework/intent.ts";
import { skillName } from "../../src/skills/framework/variations.ts";
import { saveState, loadState } from "../../src/core/state.ts";
import { navigationRepertoire } from "../../src/skills/assembly/navigations.ts";
import { describeMind } from "../../src/minds/catalog/catalog.ts";

/**
 * Removing a gait, low support or recovery prevented startup, while club blow was absent from the
 * default repertoire. Check admission, the constructed gait list on humanoids and bodies on paws,
 * native gaits without an automatic policy, and the selected club blow; the complete
 * default repertoire hides these failures.
 */
test("deselecting an optional skill leaves the remaining combat repertoire usable", async () => {
  const base = withLoadout(resolveCharacter({ model: "man" }).spec, { left: "empty", right: "empty" });
  for (const dropped of ["support-fold/support-fold", "staged-roll/staged-roll", "walk-run/walk-run", "stance-walk/stance-walk"]) {
    const spec = { ...base, skills: base.skills.filter(name => name !== dropped) };
    assert.equal(GAME.stageRefusal(spec, config, []), null, `${dropped}: remaining selected skills can start`);
    const made = skillsOf(parts, spec, optionsOf(config, parts));
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
  assert.ok(made.executors.some(one => one.kind === "club-blow"), "the selected club blow is an available executor");
  assert.equal(made.components.find(one => one.role === "option" && one.config.kind === "strike-club-blow").path, null,
    "a generated choice has no fabricated path into the configured option list");
  assert.deepEqual(parts.selected("guard", club).map(one => one.kind), ["cover-guard", "lowered"],
    "one guard covers with what each hand holds, and guards that both apply do not exclude one another");
});

/**
 * Stage preference discarded lowered arms when cover was also selected. Construct the real Options
 * and skills, select each guard, check the actual commanded posture, and restore the chosen
 * controller through saved memory; a default fight can keep choosing cover and hide the exclusion.
 */
test("the mind can choose every enabled guard and restore the chosen posture", async () => {
  const spec = withLoadout(resolveCharacter({ model: "man" }).spec, { left: "empty", right: "empty" });
  const stand = await coreStand(spec), actor = stockBody(stand.built, stand.world, { servoSeconds: .1 });
  const guards = guardConfigs(parts, spec), given = { spec, parts, guards, walk: {}, legs: parts.fitting("locomotion", spec) };
  const options = GUARD_OPTION.make(GUARD_OPTION.defaults, given), now = { sight: { report: { legs: { heading: 0 } } }, ward: null };
  let skills;
  try {
    skills = makeSkills(actor.commanded, stand.world.clock, parts, { legs: given.legs, guards,
      navigations: parts.selected("navigation", spec), executors: [], actions: [], supports: [] });
    assert.deepEqual(options.map(option => option.step(now, 1 / 120).asked.skills?.guard), guards.map(skillName), "no stage removes a guard from the chooser");
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
    assert.throws(() => skills.command(actor.view, { ...standIntent(), skills: { guard: "rest/rest" } }, 1 / 120), /not selected/);
  } finally { skills?.release(actor.view, "replaced"); actor.dispose(); stand.dispose(); }
});

/**
 * A fixed default planner ignored the other enabled navigation. Check both planners are offered
 * with every enabled gait, each owns its route, and restoring memory restores the active planner's
 * report; a successful route with one planner cannot establish the other's availability.
 */
test("selected navigation choices keep separate routes and restore the active planner", () => {
  const spec = resolveCharacter({ model: "man" }).spec, configs = parts.selected("navigation", spec), navigation = navigationRepertoire(parts, spec, configs);
  const given = { spec, parts, legs: parts.fitting("locomotion", spec), sites: { all: [], names: [] }, walk: {} };
  const options = WALK_OPTION.make(WALK_OPTION.defaults, given);
  // The gaits its legs walk by that the man's character holds: Move lists every stock gait, a body walks by those it holds that carry it somewhere.
  const enabled = parts.of("locomotion", given.legs).gaits(given.legs, spec, parts).filter(gait => parts.any(gait.legs).travels && parts.any(gait.legs).fits(spec, gait.legs, parts) === null);
  assert.ok(enabled.length > 1, "the fixture holds more than one gait");
  assert.equal(options.length, configs.length * enabled.length, "each enabled planner is paired with each enabled gait");
  const sight = { view: { time: 0, stance: { centre: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
    senses: { side: "party", others: [], solids: [] } }, report: { legs: { heading: 0 } } };
  const gait = { envelope: null, stopping: 1, lag: 0 }, request = x => ({ kind: "place", points: [{ x, z: 6 }], near: .1 });
  let saved, expected;
  for (const [i, config] of configs.entries()) {
    navigation.select(skillName(config));
    assert.equal(navigation.report.request, null, "a newly chosen planner has its own route memory");
    navigation.step({ sight, request: request(i), gait, ceiling: 1, dt: 1 / 120, available: true });
    assert.deepEqual(navigation.report.request, request(i));
    if (i === 0) { saved = saveState(navigation.state); expected = structuredClone(navigation.report); }
    sight.view.time += 1 / 120;
  }
  loadState(navigation.state, saved);
  assert.deepEqual(navigation.report, expected, "saved memory includes the active planner and its route");
});

/**
 * Disabling cover left Fight without a fitted guard because the enabled lowered arms were
 * not counted. Check startup admission and construction's posture on each humanoid, retaining
 * every enabled guard and supplying no disabled replacement; ordinary fights retain cover and
 * cannot expose this selection failure.
 */
test("a character without cover can start with its enabled lowered arms", () => {
  for (const model of HUMANOID_MODELS) {
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
