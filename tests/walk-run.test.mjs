/**
 * **The walk and run** (`walkRun`, `src/core/skills/walk-run.ts`), on the Node stand at 120 Hz:
 * what any walk passes (`tests/fixtures/walk-floor.mjs`). A Warrior with it asked to hold stands;
 * asked forward or to its right under the pace it runs past, it goes that way more than across by
 * the stance's own walk, never running, and stops on its feet when told; asked past its walk by
 * Move's Run it runs, and walks again when Move's braced walk takes the legs. Its settings and its
 * run's, set for the Warrior's leg, come through to the Warrior as set and to a shorter leg scaled
 * by dynamic similarity; and its faults refuse settings it cannot carry out. How far and how fast
 * it goes is measured in `walk-run-capability.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { legOf, scaledGait } from "../src/core/skills/gait-scale.ts";
import { WALK_RUN, WALK_RUN_CYCLE } from "../src/core/skills/walk-run.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { held, ranThenWalked, walked } from "./fixtures/walk-floor.mjs";

const WALKING = { ...LAB_PRESETS.script.config, locomotion: { kind: "walk-run", ...WALK_RUN } };

/** The walk and run's memory in a mind's state. */
function memoryOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.walkRun && "running" in state.walkRun) return state.walkRun;
  for (const value of Object.values(state)) { const found = memoryOf(value, depth + 1); if (found) return found; }
  return null;
}

test("asked_to_hold_a_warrior_with_the_walk_and_run_stands", async () => {
  const r = await held(WALKING);
  assert.ok(!r.down && r.stanced && r.speed < 0.05, JSON.stringify(r));
});

for (const [way, move, groundSize] of [["forward", [0.8, 0], 20], ["right", [0, 0.4], 200]]) {
  test(`a_warrior_with_the_walk_and_run_walks_${way}_by_the_stance_never_running_and_stops_on_its_feet`, async () => {
    let ran = 0, unled = 0;
    const r = await walked(WALKING, move, { during: (actor) => {
      if (memoryOf(actor.skills.state).running) ran++;
      if (actor.body.view.time > 0 && actor.skills.state.command.stance === null) unled++;
    }, groundSize });
    assert.ok(!r.down && r.along > 1 && Math.abs(r.across) < r.along, `${way}: ${JSON.stringify(r)}`);
    assert.deepEqual({ ran, unled }, { ran: 0, unled: 0 }, `${way}: it walks, and the stance walks the body`);
    assert.ok(r.speed < 0.1 && r.phase === "stand", `${way} stopped: ${JSON.stringify(r)}`);
  });
}

test("asked_past_its_walk_by_move_a_warrior_with_the_walk_and_run_runs_and_walks_again_when_sent_near", async () => {
  const r = await ranThenWalked(WALKING, { run: "run", walk: "braced", running: (actor) => memoryOf(actor.skills.state).running });
  assert.ok(r.ran && r.along > 3 && Math.abs(r.across) < r.along, JSON.stringify(r));
  assert.ok(!r.down && r.walkedAt !== null, JSON.stringify(r));
});

test("a_walk_and_runs_settings_and_its_runs_come_through_to_the_warrior_as_set_and_to_a_shorter_leg_scaled_by_dynamic_similarity", () => {
  assert.equal(WALK_RUN.leg, legOf(humanSpec("workshop-fighter")));
  assert.equal(scaledGait(WALK_RUN, legOf(humanSpec("workshop-fighter")) / WALK_RUN.leg), WALK_RUN);
  const k = legOf(humanSpec("workshop-rogue")) / WALK_RUN.leg, root = Math.sqrt(k), rogue = scaledGait(WALK_RUN, k), run = scaledGait(WALK_RUN_CYCLE, k);
  assert.ok(k > 0.85 && k < 0.9, `the Rogue's leg is ${k.toFixed(3)} of the Warrior's`);
  // A speed, a rate, a length, an acceleration across the way; a time, a gain on speed, an angle and a share of strength.
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  assert.ok(near(rogue.run, WALK_RUN.run * root) && near(rogue.turn, WALK_RUN.turn / root) && near(rogue.leg, legOf(humanSpec("workshop-rogue"))));
  assert.equal(rogue.swerve, WALK_RUN.swerve);
  assert.ok(near(run.pelvis, WALK_RUN_CYCLE.pelvis * root) && near(run.width, WALK_RUN_CYCLE.width * k) && near(run.cv, WALK_RUN_CYCLE.cv / root));
  assert.equal(run.lean, WALK_RUN_CYCLE.lean);
  assert.equal(run.stance, WALK_RUN_CYCLE.stance);
  assert.deepEqual(Object.keys(rogue), Object.keys(WALK_RUN));
});

test("the_walk_and_run_is_a_fighters_locomotion_and_refuses_what_it_cannot_carry_out", () => {
  assert.deepEqual(treeFaults(WALKING, ["script"]), []);
  assert.deepEqual(treeFaults({ ...WALKING, locomotion: { ...WALKING.locomotion, tuning: { run: { swingGain: 0.2 } } } }, ["script"]), []);
  for (const bad of [{ run: 0 }, { turn: 0 }, { swerve: Number.NaN }, { turnRate: -1 }, { leg: 0 }, { hasted: 2 },
    { tuning: { run: { pelvis: 0 } } }, { tuning: { run: { stance: 1.5 } } }, { tuning: { run: { cv: Number.NaN } } }]) {
    const faults = treeFaults({ ...WALKING, locomotion: { ...WALKING.locomotion, ...bad } }, ["script"]);
    assert.ok(faults.some((f) => f.includes("walk and run")), `${JSON.stringify(bad)}: ${JSON.stringify(faults)}`);
  }
});
