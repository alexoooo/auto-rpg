/**
 * **Travel and fight** (`travelOrFight`, `src/core/skills/travel.ts`), in an Arena bout on the Node
 * stand at 120 Hz: the Warrior, 8 m from the Rogue, travels by the stride with its arms swinging
 * until the Rogue is within the travel's `near`, then walks in the stance's guard, changing between steps; and its
 * faults refuse a distance it cannot read.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { SKILL_PARTS } from "../src/core/mind/fighter.ts";

const TRAVELLING = { ...RECIPE_FIGHTER, locomotion: SKILL_PARTS.travel.defaults }, NEAR = TRAVELLING.locomotion.near;

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

test("travel_and_fight_is_a_fighters_locomotion_and_refuses_a_distance_it_cannot_read", () => {
  assert.deepEqual(treeFaults(TRAVELLING, []), []);
  for (const near of [0, -1, Number.NaN]) {
    const faults = treeFaults({ ...TRAVELLING, locomotion: { ...TRAVELLING.locomotion, near } }, []);
    assert.ok(faults.some((f) => f.includes("travel")), `${near}: ${JSON.stringify(faults)}`);
  }
});
