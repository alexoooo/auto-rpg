/**
 * **The SIMBICON walk** (`simbicon`, `src/core/skills/simbicon.ts`), on the Node stand at 120 Hz: a
 * Warrior with it walks forward 5 m on legs it drives itself, the stance knee held near its angle
 * under the body's weight, and stops on its feet, its legs given back to the stance; asked to hold,
 * it stands on the stance; it sets off sideways and walks the way asked; asked to go faster than it walks, it runs 10 m and
 * stops on its feet; and its faults refuse settings it cannot carry out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { CONTROLLERS } from "../src/core/mind/controllers.ts";
import { slotsOf } from "../src/core/mind/parts.ts";
import { SIMBICON } from "../src/core/skills/simbicon.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const WALKING = { ...LAB_PRESETS.script.config, locomotion: { kind: "simbicon", ...SIMBICON } };

test("a_warrior_with_the_simbicon_walk_drives_its_legs_five_metres_forward_and_stops_on_the_stance", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: WALKING });
  const start = actor.body.view.stance.centre.z, m = actor.body.muscles;
  const knee = { left: m.channel("knee.left flexion"), right: m.channel("knee.right flexion") };
  // Forward at 1 m/s, facing +z, until the centre of mass is 5 m on; then stand.
  actor.drive({ name: "five-metres", decide: ({ view }) => ({ move: view.stance.centre.z - start < 5 ? [1, 0] : null, face: 0, guard: NO_COVER, attack: null }) });
  const gait = actor.skills.state.legs.gait;
  let stopped = null, handed = null, driven = 0, steps = 0, last = null;
  const errors = [];
  try {
    for (let k = 0; k < 20 * 120 && !actor.body.view.down; k++) {
      stand.step(1);
      const s = actor.body.view.stance, t = actor.body.view.time;
      if (gait.walking && !gait.shifting) {
        driven++;
        assert.equal(actor.skills.state.command.stance, null, "a driven walk asks the stance nothing");
        if (gait.stance !== last) { steps++; last = gait.stance; }
        // The stance knee in its late state, the landing's bend taken up and the body's weight on it.
        if (gait.late && t > 4) errors.push(Math.abs(m.angle(knee[gait.stance]) - SIMBICON.stanceKneeLate));
      }
      if (stopped === null && s.centre.z - start >= 5) stopped = t;
      if (stopped !== null && handed === null && !gait.walking) handed = t;
      if (handed !== null && t > handed + 3) break;
    }
    const s = actor.body.view.stance, mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(stopped !== null && stopped < 12, `5 m on by ${stopped?.toFixed(2)} s`);
    assert.ok(steps >= 8, `its own steps: ${steps}`);
    assert.ok(mean < 0.02 && Math.max(...errors) < 0.06, `the stance knee within ${mean.toFixed(3)} rad of its angle, at most ${Math.max(...errors).toFixed(3)}`);
    assert.ok(handed !== null && handed - stopped < 4, `given back to the stance ${(handed - stopped).toFixed(2)} s after the mark`);
    assert.ok(s.centre.z - start < 7, `stopped within 2 m of the mark: ${(s.centre.z - start).toFixed(2)} m`);
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.05, `standing still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
    assert.equal(s.phase, "stand", "no step under way");
    assert.ok(driven > 4 * 120, `driven for ${(driven / 120).toFixed(1)} s`);
  } finally { actor.dispose(); stand.dispose(); }
});

test("asked_to_hold_a_warrior_with_the_simbicon_walk_stands_on_the_stance", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: WALKING });
  actor.drive({ name: "hold", decide: () => ({ move: null, face: 0, guard: NO_COVER, attack: null }) });
  try {
    stand.step(stand.seconds(10));
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false);
    assert.equal(actor.skills.state.legs.gait.walking, false);
    assert.notEqual(actor.skills.state.command.stance, null, "the stance stands it");
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.02, `still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
  } finally { actor.dispose(); stand.dispose(); }
});

test("a_warrior_with_the_simbicon_walk_sets_off_to_its_right_and_walks_there", async () => {
  // At 0.5 m/s on this ground, where a first step by the trailing foot falls the body the other way into a walk that keeps going there.
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, groundSize: 200 });
  const actor = labActor(stand.built, stand.world, { mind: WALKING });
  actor.drive({ name: "right", decide: () => ({ move: [0, 0.5], face: 0, guard: NO_COVER, attack: null }) });
  const gait = actor.skills.state.legs.gait;
  try {
    let first = null;
    for (let k = 0; k < 5 * 120; k++) { stand.step(1); if (first === null && gait.walking) first = gait.stance; }
    assert.equal(first, "left", "the leading foot swings first");
    const from = actor.body.view.stance.centre.clone();
    stand.step(stand.seconds(4));
    const to = actor.body.view.stance.centre;
    assert.equal(actor.body.view.down, false);
    assert.ok((to.x - from.x) / 4 > 0.35 && Math.abs(to.z - from.z) / 4 < 0.15, `to its right at ${((to.x - from.x) / 4).toFixed(2)}, ahead at ${((to.z - from.z) / 4).toFixed(2)} m/s`);
  } finally { actor.dispose(); stand.dispose(); }
});

test("asked_past_its_walk_a_warrior_with_the_simbicon_walk_runs_ten_metres_and_stops_on_the_stance", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, groundSize: 80 });
  const actor = labActor(stand.built, stand.world, { mind: WALKING });
  // Forward at 2 m/s, facing +z, until it has run 10 m; then stand.
  let from = null, ran = 0;
  actor.drive({ name: "run", decide: () => ({ move: ran < 10 ? [2, 0] : null, face: 0, guard: NO_COVER, attack: null }) });
  const gait = actor.skills.state.legs.gait;
  let began = null, stopped = null, handed = null, running = 0;
  try {
    for (let k = 0; k < 30 * 120 && !actor.body.view.down; k++) {
      stand.step(1);
      const s = actor.body.view.stance, t = actor.body.view.time;
      if (gait.running) {
        running++;
        if (began === null) { began = t; from = s.centre.z; }
      }
      if (from !== null && stopped === null) ran = s.centre.z - from;
      if (stopped === null && ran >= 10) stopped = t;
      if (stopped !== null && handed === null && !gait.walking) handed = t;
      if (handed !== null && t > handed + 3) break;
    }
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(began !== null && began < 8, `running from ${began?.toFixed(2)} s`);
    assert.ok(stopped !== null && (stopped - began) < 10 / 1.8, `10 m in ${(stopped - began).toFixed(2)} s`);
    assert.ok(running / 120 > 3, `ran ${(running / 120).toFixed(1)} s`);
    assert.ok(handed !== null && handed - stopped < 8, `given back to the stance ${(handed - stopped).toFixed(2)} s after the mark`);
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.05, `standing still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
    assert.equal(s.phase, "stand", "no step under way");
  } finally { actor.dispose(); stand.dispose(); }
});

test("the_simbicon_walk_is_a_fighters_locomotion_and_refuses_what_it_cannot_carry_out", () => {
  assert.deepEqual(treeFaults(WALKING, ["script"]), []);
  for (const bad of [{ seconds: 0 }, { longest: 0.1 }, { settle: 0 }, { swing: 1.5 }, { hold: 0 }, { ankle: -0.1 }, { turn: 0 }, { speedup: 0 }, { cd: Number.NaN }, { arms: -1 }, { run: 0 }]) {
    const faults = treeFaults({ ...WALKING, locomotion: { ...WALKING.locomotion, ...bad } }, ["script"]);
    assert.ok(faults.some((f) => f.toLowerCase().includes("simbicon")), `${JSON.stringify(bad)}: ${JSON.stringify(faults)}`);
  }
  // A kick and low support step from the stance, which a walk that drives the legs leaves.
  const kicking = treeFaults({ ...WALKING, kick: { kind: "front-kick" }, support: { kind: "support-fold" } }, ["script"]);
  assert.ok(kicking.some((f) => f.includes("kick: a walk that drives the legs")) && kicking.some((f) => f.includes("support: a walk that drives the legs")), JSON.stringify(kicking));
  assert.deepEqual(slotsOf(CONTROLLERS.fighter, WALKING).map((slot) => slot.key).filter((key) => key === "kick" || key === "support"), []);
});
