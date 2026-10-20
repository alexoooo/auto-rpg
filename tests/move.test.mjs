/**
 * **Move** (`move`, `src/core/skills/move.ts`), in an Arena bout on the Node stand at 120 Hz: the
 * Warrior, 8 m from the Rogue, both with the club, gets nearer by the stride, and walks braced once,
 * and only once, the Rogue is within the foe's rule's distance, changing between steps; a Warrior on
 * the stand walked and stood by Move changes between braced and the run at once, walking on the
 * stance's legs throughout; in a bout it runs, is braced as the Rogue comes near, and has its legs
 * given back by the run, on its feet. How fast it closes, how its arms swing and how soon the run
 * gives the legs back is measured in `move-capability.test.mjs`. A rule
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

/** The walk and run's memory in a mind's state (`walkRun`). */
function walkRunOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.walkRun && "running" in state.walkRun) return state.walkRun;
  for (const value of Object.values(state)) { const found = walkRunOf(value, depth + 1); if (found) return found; }
  return null;
}

/** Move's choice in a mind's memory, and whether it is braced: the first of its gaits, which its rules name first. */
function choiceOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.choice && "gait" in state.choice) return { get fighting() { return state.choice.gait === 0; }, get gait() { return state.choice.gait; } };
  for (const value of Object.values(state)) { const found = choiceOf(value, depth + 1); if (found) return found; }
  return null;
}

test("a_warrior_travels_by_the_stride_and_walks_in_the_guard_once_its_foe_is_near_changing_between_steps", async () => {
  // Both armed with the club: empty-handed from 8 m, the Warrior falls in the braced walk three steps after the change.
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 8, loadouts: { left: { left: "empty", right: "club" }, right: { left: "empty", right: "club" } }, minds: { left: TRAVELLING, right: RECIPE_FIGHTER } });
  try {
    const me = duel.duelists.left, foe = duel.duelists.right, choice = choiceOf(me.minded.state);
    assert.ok(choice, "Move's choice is in the mind's state");
    const gapOf = () => { const a = me.body.view.stance.centre, b = foe.body.view.stance.centre; return Math.hypot(a.x - b.x, a.z - b.z); };
    const changes = [], start = gapOf();
    let last = false, nearest = start;
    while (duel.clock < 9 && !duel.verdict) {
      world.step();
      const gap = gapOf();
      nearest = Math.min(nearest, gap);
      if (choice.fighting !== last) { changes.push({ fighting: choice.fighting, gap, phase: me.body.view.stance.phase, time: duel.clock }); last = choice.fighting; }
    }
    assert.ok(nearest < start - 1, `it got nearer: ${start.toFixed(2)} m to ${nearest.toFixed(2)}`);
    // Braced as the foe came within the rule's distance, and let go of, if ever, only beyond it.
    assert.equal(changes.length > 0, nearest <= NEAR, `within ${NEAR} m (nearest ${nearest.toFixed(2)}): ${JSON.stringify(changes)}`);
    for (const changed of changes) {
      const at = `${changed.gap.toFixed(2)} m at ${changed.time.toFixed(2)} s`;
      assert.ok(changed.fighting ? changed.gap <= NEAR && changed.gap > NEAR - 1 : changed.gap > NEAR, `braced ${changed.fighting} at ${at}`);
      assert.ok(changed.phase === "stand" || changed.phase === "shift", `between steps: ${changed.phase}`);
    }
    assert.equal(me.body.view.down, false);
  } finally { dispose(); }
});

test("walked_and_stood_by_move_a_warrior_changes_between_braced_and_the_run_at_once_on_the_stances_legs_throughout", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const mind = { ...LAB_PRESETS.script.config, locomotion: MOVING };
  const actor = labActor(stand.built, stand.world, { mind });
  // With no foe, a walk asked is the run's gait and a stand braced: walk, stand, walk again, under the run's pace.
  actor.drive({ name: "walk-stand-walk", decide: ({ view }) => ({ move: view.time < 3 || view.time >= 6 ? [0.8, 0] : null, face: 0, guard: NO_COVER, actions: [] }) });
  const choice = choiceOf(actor.skills.state), legs = walkRunOf(actor.skills.state);
  try {
    assert.ok(choice && legs, "Move's choice and the walk and run's memory are in the skills' state");
    const changes = [], driven = [];
    let last = null;
    for (let k = 0; k < 8 * 120 && !actor.body.view.down; k++) {
      stand.step(1);
      const t = actor.body.view.time;
      if (choice.fighting !== last) { changes.push({ fighting: choice.fighting, time: t }); last = choice.fighting; }
      if (t > 0 && (legs.running || actor.skills.state.command.stance === null)) driven.push(+t.toFixed(3));
    }
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.deepEqual(changes.map((c) => c.fighting), [false, true, false], JSON.stringify(changes));
    // At once: the stand asked at 3 s and the walk at 6 s each change the gait within the step it is asked.
    assert.ok(Math.abs(changes[1].time - 3) < 0.02 && Math.abs(changes[2].time - 6) < 0.02, JSON.stringify(changes));
    assert.deepEqual(driven.slice(0, 5), [], "the stance carries the body throughout");
  } finally { actor.dispose(); stand.dispose(); }
});

test("a_warrior_runs_and_is_braced_as_its_foe_comes_near_the_run_giving_the_legs_back", async () => {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 8, minds: { left: WALKING, right: RECIPE_FIGHTER } });
  try {
    const me = duel.duelists.left, foe = duel.duelists.right, choice = choiceOf(me.minded.state), legs = walkRunOf(me.minded.state);
    assert.ok(choice && legs, "Move's choice and the walk and run's memory are in the mind's state");
    const changes = [];
    let last = null, ran = 0, near = null, back = null;
    while (duel.clock < 9 && !duel.verdict) {
      world.step();
      const a = me.body.view.stance.centre, b = foe.body.view.stance.centre, gap = Math.hypot(a.x - b.x, a.z - b.z);
      if (near === null && gap <= NEAR) near = duel.clock;
      if (legs.running) ran++;
      else if (near !== null && back === null) back = duel.clock;
      if (choice.fighting !== last) { changes.push({ fighting: choice.fighting, gap, time: duel.clock }); last = choice.fighting; }
    }
    assert.deepEqual(changes.map((c) => c.fighting), [false, true], JSON.stringify(changes));
    assert.ok(near !== null && Math.abs(changes[1].time - near) < 0.02, `within ${NEAR} m at ${near?.toFixed(2)} s, braced at ${changes[1].time.toFixed(2)} s`);
    assert.ok(ran > 0, "it ran");
    assert.ok(back !== null, `the legs given back by the run, ${near?.toFixed(2)} s near`);
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
