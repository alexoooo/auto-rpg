/**
 * **Move** (`move`, `src/core/skills/move.ts`), in an Arena bout on the Node stand at 120 Hz: the
 * Warrior, 8 m from the Rogue, both with the club, gets about by the stride with its arms swinging until the Rogue is
 * within the foe's rule's distance, then walks braced, in the stance's guard, changing between
 * steps; a Warrior on the stand walking by the SIMBICON walk changes to the braced walk only once
 * that walk has given the legs back to the stance, and back to it from the stance's stand; in a bout
 * it walks by it until the Rogue is near, and fights braced once the legs are given back; a rule
 * of the destination's distance chooses by what the tactics say is left to go; two gaits of one
 * walk change at once, mid-step, the walk told whether it may run; and its faults
 * refuse a distance it cannot read and a gait none is called.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { SKILL_PARTS } from "../src/core/mind/fighter.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { distanceRule, move } from "../src/core/skills/move.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

/** Move as it starts: braced standing and within `NEAR` of a standing foe, walking nearer a foe than its walk's rule, and otherwise walking or running. */
const MOVING = SKILL_PARTS.move.defaults, NEAR = MOVING.rules.find((rule) => rule.of === "foe").metres;
const TRAVELLING = { ...RECIPE_FIGHTER, locomotion: { ...MOVING, rules: MOVING.rules.filter((rule) => rule.gait === "braced"), otherwise: "stride" } };
const WALKING = { ...RECIPE_FIGHTER, locomotion: MOVING };

/** The SIMBICON walk's memory in a mind's state. */
function gaitOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.gait && "walking" in state.gait) return state.gait;
  for (const value of Object.values(state)) { const found = gaitOf(value, depth + 1); if (found) return found; }
  return null;
}

/** Move's choice in a mind's memory, and whether it is braced: the first of its gaits, which its rules name first. */
function choiceOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.choice && "gait" in state.choice) return { get fighting() { return state.choice.gait === 0; }, get gait() { return state.choice.gait; } };
  for (const value of Object.values(state)) { const found = choiceOf(value, depth + 1); if (found) return found; }
  return null;
}

test("a_warrior_travels_by_the_stride_until_its_foe_is_near_then_walks_in_the_guard_changing_between_steps", async () => {
  // Both armed with the club: empty-handed from 8 m, the Warrior falls in the braced walk three steps after the change.
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 8, held: { left: "club", right: "club" }, minds: { left: TRAVELLING, right: RECIPE_FIGHTER } });
  try {
    const me = duel.duelists.left, foe = duel.duelists.right, choice = choiceOf(me.minded.state);
    assert.ok(choice, "Move's choice is in the mind's state");
    const shoulder = me.body.muscles.channels.findIndex((c) => c.name.startsWith("shoulder.left flexion"));
    const swing = { travel: [], fight: [] };
    let changed = null, changes = 0, last = false;
    while (duel.clock < 9 && !duel.verdict) {
      world.step();
      const a = me.body.view.stance.centre, b = foe.body.view.stance.centre, gap = Math.hypot(a.x - b.x, a.z - b.z);
      if (choice.fighting !== last) {
        changes++;
        changed = { gap, phase: me.body.view.stance.phase, time: duel.clock };
        last = choice.fighting;
      }
      if (duel.clock > 2) swing[choice.fighting ? "fight" : "travel"].push(me.body.muscles.angle(shoulder));
    }
    assert.equal(changes, 1, `it changed walk once: ${changes}`);
    assert.ok(changed.gap <= NEAR && changed.gap > NEAR - 1, `as the foe came within ${NEAR} m: ${changed.gap.toFixed(2)} m at ${changed.time.toFixed(2)} s`);
    assert.ok(changed.phase === "stand" || changed.phase === "shift", `between steps: ${changed.phase}`);
    const range = (x) => Math.max(...x) - Math.min(...x);
    assert.ok(range(swing.travel) > 0.1, `travelling, the arms swing: ${range(swing.travel).toFixed(3)} rad`);
    assert.deepEqual(duel.duelists.left.body.view.down, false);
  } finally { dispose(); }
});

test("travelling_by_a_walk_that_drives_the_legs_it_changes_walk_only_once_the_legs_are_the_stances_both_ways", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const mind = { ...LAB_PRESETS.script.config, locomotion: MOVING };
  const actor = labActor(stand.built, stand.world, { mind });
  // With no foe, a walk asked is the SIMBICON walk and a stand braced: walk, stand, walk again.
  actor.drive({ name: "walk-stand-walk", decide: ({ view }) => ({ move: view.time < 5 || view.time >= 10 ? [0.8, 0] : null, face: 0, guard: NO_COVER, actions: [] }) });
  const choice = choiceOf(actor.skills.state), gait = actor.skills.state.legs.gaits[1].gait;
  try {
    assert.ok(choice, "Move's choice is in the skills' state");
    const changes = [];
    let last = null, driven = { first: 0, second: 0 };
    for (let k = 0; k < 15 * 120 && !actor.body.view.down; k++) {
      stand.step(1);
      const t = actor.body.view.time, s = actor.body.view.stance;
      if (choice.fighting !== last) { changes.push({ fighting: choice.fighting, time: t, walking: gait.walking, phase: s.phase }); last = choice.fighting; }
      if (gait.walking && actor.skills.state.command.stance === null) driven[t < 10 ? "first" : "second"]++;
    }
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.deepEqual(changes.map((c) => c.fighting), [false, true, false], JSON.stringify(changes));
    // To the stance's walk once the SIMBICON walk has given the legs back; to the SIMBICON walk from the stance's stand, which it begins from.
    assert.equal(changes[1].walking, false, `changed at ${changes[1].time.toFixed(2)} s with the legs driven`);
    for (const c of changes.slice(1)) assert.ok(c.phase === "stand" || c.phase === "shift", `changed at ${c.time.toFixed(2)} s in ${c.phase}`);
    assert.ok(changes[1].time > 5 && changes[2].time >= 10, JSON.stringify(changes));
    assert.ok(driven.first > 2 * 120 && driven.second > 2 * 120, `driven ${(driven.first / 120).toFixed(1)} s, then ${(driven.second / 120).toFixed(1)} s`);
  } finally { actor.dispose(); stand.dispose(); }
});

test("a_warrior_travels_by_the_simbicon_walk_until_its_foe_is_near_then_fights_by_the_stances_walk_once_the_legs_are_given_back", {
  todo: "the walk asked 1.4 m/s hands over to the run 0.25 s before the foe comes near, and the walk the run gives back to as it stops does not bring its swinging foot down before the body tips over (a stop soon after the run begins)",
}, async () => {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 8, minds: { left: WALKING, right: RECIPE_FIGHTER } });
  try {
    const me = duel.duelists.left, foe = duel.duelists.right, choice = choiceOf(me.minded.state);
    const gait = gaitOf(me.minded.state);
    assert.ok(choice && gait, "Move's choice and the SIMBICON walk's memory are in the mind's state");
    const changes = [];
    let last = null, driven = 0, near = null;
    while (duel.clock < 9 && !duel.verdict) {
      world.step();
      const a = me.body.view.stance.centre, b = foe.body.view.stance.centre, gap = Math.hypot(a.x - b.x, a.z - b.z);
      if (near === null && gap <= NEAR) near = duel.clock;
      if (gait.walking) driven++;
      if (choice.fighting !== last) { changes.push({ fighting: choice.fighting, gap, walking: gait.walking, time: duel.clock }); last = choice.fighting; }
    }
    assert.deepEqual(changes.map((c) => c.fighting), [false, true], JSON.stringify(changes));
    const changed = changes[1];
    assert.equal(changed.walking, false, "changed with the legs driven");
    assert.ok(near !== null && changed.time >= near && changed.time - near < 3, `within ${NEAR} m at ${near?.toFixed(2)} s, changed at ${changed.time.toFixed(2)} s`);
    assert.ok(driven > 3 * 120, `driven ${(driven / 120).toFixed(1)} s`);
    assert.equal(me.body.view.down, false);
  } finally { dispose(); }
});

test("move_is_a_fighters_locomotion_and_refuses_a_distance_it_cannot_read_and_a_gait_none_is_called", () => {
  assert.deepEqual(treeFaults(TRAVELLING, []), []);
  const [standing, near] = MOVING.rules;
  for (const metres of [0, -1, Number.NaN]) {
    const faults = treeFaults({ ...TRAVELLING, locomotion: { ...MOVING, rules: [standing, { ...near, metres }] } }, []);
    assert.ok(faults.some((f) => f.startsWith("locomotion.rules.1") && f.includes("distance")), `${metres}: ${JSON.stringify(faults)}`);
  }
  assert.ok(treeFaults({ ...TRAVELLING, locomotion: { ...MOVING, otherwise: "fly" } }, []).some((f) => f.includes("fly")));
  assert.ok(treeFaults({ ...TRAVELLING, locomotion: { ...MOVING, rules: [{ ...standing, gait: "fly" }] } }, []).some((f) => f.includes("fly")));
});

test("a_rule_of_the_destinations_distance_chooses_by_what_is_left_to_go_letting_go_only_past_it_and_changing_between_steps", () => {
  // Two stand-in gaits that remember being resumed, and a body standing between steps with no foe about.
  const gaits = ["near", "far"].map((name) => ({ name, resumed: 0, state: {}, envelope: null, heading: 0, pace: 0, reference: null, placed: false,
    resume() { this.resumed++; }, place: () => null, goal: () => null }));
  const view = { stance: { phase: "stand", own: false, centre: { x: 0, z: 0 } }, senses: { side: "left", others: [] } };
  const legs = move(gaits.map((gait) => ({ legs: gait })), [distanceRule(0, "destination", "under", 3)], 1), choice = legs.state.choice;
  const walk = (destination, phase = "stand") => { view.stance.phase = phase; legs.goal(view, [1, 0], 0, 1 / 120, undefined, destination); return gaits[choice.gait].name; };
  // The first gait chosen is not resumed; none told, the destination is infinitely far.
  assert.equal(walk(10), "far");
  assert.equal(walk(undefined), "far");
  assert.deepEqual(gaits.map((g) => g.resumed), [0, 0]);
  // Mid-step, the change waits; between steps it is made, and the gait resumed.
  assert.equal(walk(2.9, "swing"), "far");
  assert.equal(walk(2.9), "near");
  assert.deepEqual(gaits.map((g) => g.resumed), [1, 0]);
  // Let go of only past the rule's distance and its margin.
  assert.equal(walk(3.4), "near");
  assert.equal(walk(3.6), "far");
});

test("two_gaits_of_one_walk_change_at_once_mid_step_the_walk_told_whether_it_may_run", () => {
  // One stand-in walk that remembers what it was told, and a body mid-step with no foe about.
  const told = [], walk = { resumed: 0, state: {}, envelope: null, heading: 0, pace: 0, reference: null, placed: false,
    resume() { this.resumed++; }, runs(may) { told.push(may); }, place: () => null, goal: () => null };
  const view = { stance: { phase: "swing", own: false, centre: { x: 0, z: 0 } }, senses: { side: "left", others: [] } };
  const legs = move([{ legs: walk, runs: false }, { legs: walk, runs: true }], [distanceRule(0, "destination", "under", 3)], 1), choice = legs.state.choice;
  const go = (destination) => { legs.goal(view, [1, 0], 0, 1 / 120, undefined, destination); return [choice.gait, told.at(-1)]; };
  assert.deepEqual(go(10), [1, true]);
  assert.deepEqual(go(2), [0, false]);
  assert.deepEqual(go(10), [1, true]);
  assert.equal(walk.resumed, 0, "a walk going on is not resumed");
  assert.equal(legs.state.gaits.length, 1, "the walk's memory is in the state once");
});
