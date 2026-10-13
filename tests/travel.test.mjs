/**
 * **Travel and fight** (`travelOrFight`, `src/core/skills/travel.ts`), in an Arena bout on the Node
 * stand at 120 Hz: the Warrior, 8 m from the Rogue, travels by the stride with its arms swinging
 * until the Rogue is within the travel's `near`, then walks in the stance's guard, changing between steps; a
 * Warrior on the stand travelling by the SIMBICON walk changes to the stance's walk only once that
 * walk has given the legs back to the stance, and back to it from the stance's stand; in a bout it
 * travels by it until the Rogue is near, and fights by the stance's walk once the legs are given
 * back; and its faults refuse a distance it cannot read.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { SKILL_PARTS } from "../src/core/mind/fighter.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { SIMBICON } from "../src/core/skills/simbicon.ts";
import { STRIDE } from "../src/core/skills/stride.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const TRAVELLING = { ...RECIPE_FIGHTER, locomotion: { ...SKILL_PARTS.travel.defaults, travel: { kind: "stride", ...STRIDE } } }, NEAR = TRAVELLING.locomotion.near;

/** The SIMBICON walk's memory in a mind's state. */
function gaitOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.gait && "walking" in state.gait) return state.gait;
  for (const value of Object.values(state)) { const found = gaitOf(value, depth + 1); if (found) return found; }
  return null;
}

/** The travel skill's choice in `duelist`'s memory. */
function choiceOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.choice && "fighting" in state.choice) return state.choice;
  for (const value of Object.values(state)) { const found = choiceOf(value, depth + 1); if (found) return found; }
  return null;
}

test("a_warrior_travels_by_the_stride_until_its_foe_is_near_then_walks_in_the_guard_changing_between_steps", async () => {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 8, minds: { left: TRAVELLING, right: RECIPE_FIGHTER } });
  try {
    const me = duel.duelists.left, foe = duel.duelists.right, choice = choiceOf(me.minded.state);
    assert.ok(choice, "the travel skill's choice is in the mind's state");
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
  const mind = { ...LAB_PRESETS.script.config, locomotion: { kind: "travel", near: NEAR, travel: { kind: "simbicon", ...SIMBICON }, fight: { kind: "stance-walk" } } };
  const actor = labActor(stand.built, stand.world, { mind });
  // With no foe, a walk asked is the travel's and a stand the fight's: walk, stand, walk again.
  actor.drive({ name: "walk-stand-walk", decide: ({ view }) => ({ move: view.time < 5 || view.time >= 10 ? [0.8, 0] : null, face: 0, guard: NO_COVER, attack: null }) });
  const choice = choiceOf(actor.skills.state), gait = actor.skills.state.legs.travel.gait;
  try {
    assert.ok(choice, "the travel skill's choice is in the skills' state");
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

test("a_warrior_travels_by_the_simbicon_walk_until_its_foe_is_near_then_fights_by_the_stances_walk_once_the_legs_are_given_back", async () => {
  const mind = { ...RECIPE_FIGHTER, locomotion: { kind: "travel", near: NEAR, travel: { kind: "simbicon", ...SIMBICON }, fight: { kind: "stance-walk" } } };
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 8, minds: { left: mind, right: RECIPE_FIGHTER } });
  try {
    const me = duel.duelists.left, foe = duel.duelists.right, choice = choiceOf(me.minded.state);
    const gait = gaitOf(me.minded.state);
    assert.ok(choice && gait, "the travel skill's choice and the SIMBICON walk's memory are in the mind's state");
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

test("travel_and_fight_is_a_fighters_locomotion_and_refuses_a_distance_it_cannot_read", () => {
  assert.deepEqual(treeFaults(TRAVELLING, []), []);
  for (const near of [0, -1, Number.NaN]) {
    const faults = treeFaults({ ...TRAVELLING, locomotion: { ...TRAVELLING.locomotion, near } }, []);
    assert.ok(faults.some((f) => f.includes("travel")), `${near}: ${JSON.stringify(faults)}`);
  }
});
