/**
 * **The SIMBICON walk** (`simbicon`, `src/core/skills/simbicon.ts`), on the Node stand at 120 Hz:
 * what any walk passes (`tests/fixtures/walk-floor.mjs`). A Warrior with it asked to hold stands on
 * the stance; asked forward or to its right it goes that way more than across on legs it drives
 * itself, asking the stance nothing, and stops on the stance when told; asked past its walk by
 * Move's Run it runs, and walks again when Move's Walk takes the legs. Its settings, set for the
 * Warrior's leg, come through to the Warrior as set and to a shorter leg scaled by dynamic
 * similarity; and its faults refuse settings it cannot carry out. How far and how fast it goes is
 * measured in `simbicon-capability.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { CONTROLLERS } from "../src/core/mind/controllers.ts";
import { slotsOf } from "../src/core/mind/parts.ts";
import { scaledGait, SIMBICON } from "../src/core/skills/simbicon.ts";
import { legOf } from "../src/core/skills/gait-scale.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { held, ranThenWalked, walked } from "./fixtures/walk-floor.mjs";

const WALKING = { ...LAB_PRESETS.script.config, locomotion: { kind: "simbicon", ...SIMBICON } };

test("asked_to_hold_a_warrior_with_the_simbicon_walk_stands_on_the_stance", async () => {
  const r = await held(WALKING);
  assert.ok(!r.down && r.stanced && r.speed < 0.05, JSON.stringify(r));
});

for (const [way, move, groundSize] of [["forward", [1, 0], 20], ["right", [0, 0.5], 200]]) {
  test(`a_warrior_with_the_simbicon_walk_goes_${way}_on_legs_it_drives_and_stops_on_the_stance`, async () => {
    let driven = 0, asked = 0;
    const r = await walked(WALKING, move, { during: (actor) => {
      const gait = actor.skills.state.legs.gait;
      if (gait.walking && !gait.shifting) { driven++; if (actor.skills.state.command.stance !== null) asked++; }
    }, groundSize });
    assert.ok(!r.down && r.along > 1 && Math.abs(r.across) < r.along, `${way}: ${JSON.stringify(r)}`);
    assert.ok(driven > 0 && asked === 0, `${way}: driven ${driven} steps, the stance asked in ${asked}`);
    assert.ok(r.speed < 0.1 && r.phase === "stand", `${way} stopped: ${JSON.stringify(r)}`);
  });
}

test("asked_past_its_walk_by_move_a_warrior_with_the_simbicon_walk_runs_and_walks_again_when_sent_near", async () => {
  const r = await ranThenWalked(WALKING, { run: "simbicon-run", walk: "simbicon-walk", running: (actor) => actor.skills.state.legs.gaits[0].gait.running });
  assert.ok(r.ran && r.along > 3 && Math.abs(r.across) < r.along, JSON.stringify(r));
  assert.ok(!r.down && r.walkedAt !== null, JSON.stringify(r));
});

test("a_simbicon_gait_comes_through_to_the_warrior_as_set_and_to_a_shorter_leg_scaled_by_dynamic_similarity", () => {
  assert.equal(SIMBICON.leg, legOf(humanSpec("workshop-fighter")));
  assert.equal(scaledGait(SIMBICON, legOf(humanSpec("workshop-fighter")) / SIMBICON.leg), SIMBICON);
  const k = legOf(humanSpec("workshop-rogue")) / SIMBICON.leg, root = Math.sqrt(k), rogue = scaledGait(SIMBICON, k);
  assert.ok(k > 0.85 && k < 0.9, `the Rogue's leg is ${k.toFixed(3)} of the Warrior's`);
  // A time, a length, a speed, a rate, a gain on speed, an angle and a share of strength.
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  assert.ok(near(rogue.seconds, SIMBICON.seconds * root) && near(rogue.lead, SIMBICON.lead * root));
  assert.ok(near(rogue.width, SIMBICON.width * k) && near(rogue.leg, legOf(humanSpec("workshop-rogue"))));
  assert.ok(near(rogue.run, SIMBICON.run * root) && near(rogue.turn, SIMBICON.turn / root) && near(rogue.cv, SIMBICON.cv / root));
  assert.equal(rogue.swingHip, SIMBICON.swingHip);
  assert.equal(rogue.stance, SIMBICON.stance);
  assert.deepEqual(Object.keys(rogue), Object.keys(SIMBICON));
});

test("the_simbicon_walk_is_a_fighters_locomotion_and_refuses_what_it_cannot_carry_out", () => {
  assert.deepEqual(treeFaults(WALKING, ["script"]), []);
  assert.deepEqual(treeFaults({ ...WALKING, locomotion: { ...WALKING.locomotion, tuning: { back: { lead: 0.2 }, side: { width: 0.1 }, run: { swingGain: 0.2 } } } }, ["script"]), []);
  for (const bad of [{ seconds: 0 }, { longest: 0.1 }, { settle: 0 }, { swing: 1.5 }, { hold: 0 }, { ankle: -0.1 }, { turn: 0 }, { speedup: 0 }, { cd: Number.NaN }, { arms: -1 }, { run: 0 }, { leg: 0 },
    { tuning: { back: { cv: Number.NaN } } }, { tuning: { side: { settle: 0.2 } } }, { tuning: { run: { contact: 0 } } }, { tuning: { run: { stance: 1.5 } } }, { tuning: { run: { short: 1.5 } } }, { tuning: { run: { gain: 0.1 } } }]) {
    const faults = treeFaults({ ...WALKING, locomotion: { ...WALKING.locomotion, ...bad } }, ["script"]);
    assert.ok(faults.some((f) => f.toLowerCase().includes("simbicon")), `${JSON.stringify(bad)}: ${JSON.stringify(faults)}`);
  }
  // A kick and low support each wait for a walk that drives the legs to give them back to the stance.
  const kicking = treeFaults({ ...WALKING, executors: [{ name: "kick", kind: "front-kick" }], actions: [{ name: "kick", executor: "kick", effectors: ["foot.left", "foot.right"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "leg-height", height: .4 } }], support: { kind: "support-fold" } }, ["script"]);
  assert.deepEqual(kicking, []);
  assert.deepEqual(slotsOf(CONTROLLERS.fighter, WALKING).map((slot) => slot.key).filter((key) => key === "executors" || key === "support"), ["executors", "support"]);
});
