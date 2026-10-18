/**
 * **The walk and run** (`walkRun`, `src/core/skills/walk-run.ts`), on the Node stand at 120 Hz: a
 * Warrior with it walks forward 5 m by the stance's own walk, never running, and stops on its feet;
 * asked to hold, it stands; it walks to its right, back and to its left at the pace asked and stops
 * on its feet; asked to go faster than it walks, with no envelope to cap it, it runs 10 m and stops
 * on its feet, and told it may not run, brakes to the walk and walks again; its settings and its run's, set for
 * the Warrior's leg, come through to the Warrior as set and to a shorter leg scaled by dynamic
 * similarity; and its faults refuse settings it cannot carry out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { wentAsAsked } from "../src/core/control/stance-envelope.ts";
import { legOf, scaledGait } from "../src/core/skills/gait-scale.ts";
import { WALK_RUN, WALK_RUN_CYCLE } from "../src/core/skills/walk-run.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const WALKING = { ...LAB_PRESETS.script.config, locomotion: { kind: "walk-run", ...WALK_RUN } };

/** The walk and run's memory in a mind's state. */
function memoryOf(state, depth = 0) {
  if (!state || typeof state !== "object" || depth > 6) return null;
  if (state.walkRun && "running" in state.walkRun) return state.walkRun;
  for (const value of Object.values(state)) { const found = memoryOf(value, depth + 1); if (found) return found; }
  return null;
}

test("a_warrior_with_the_walk_and_run_walks_five_metres_forward_by_the_stance_and_stops_on_its_feet", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: WALKING });
  const start = actor.body.view.stance.centre.z;
  // Forward at 0.8 m/s, under the pace it runs past, facing +z, until the centre of mass is 5 m on; then stand.
  actor.drive({ name: "five-metres", decide: ({ view }) => ({ move: view.stance.centre.z - start < 5 ? [0.8, 0] : null, face: 0, guard: NO_COVER, actions: [] }) });
  const memory = memoryOf(actor.skills.state);
  let stopped = null, ran = 0, steps = 0, last = null;
  const unled = [];
  try {
    for (let k = 0; k < 16 * 120 && !actor.body.view.down; k++) {
      stand.step(1);
      const s = actor.body.view.stance, t = actor.body.view.time;
      if (memory.running) ran++;
      if (t > 0 && actor.skills.state.command.stance === null) unled.push(+t.toFixed(3));
      if (s.phase === "swing" && s.own && s.own.foot !== last) { steps++; last = s.own.foot; }
      if (stopped === null && s.centre.z - start >= 5) stopped = t;
      if (stopped !== null && t > stopped + 4) break;
    }
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.equal(ran, 0, "it walks");
    assert.deepEqual(unled, [], "the stance walks the body");
    assert.ok(stopped !== null && stopped < 12, `5 m on by ${stopped?.toFixed(2)} s`);
    assert.ok(steps >= 6, `its steps: ${steps}`);
    assert.ok(s.centre.z - start < 7, `stopped within 2 m of the mark: ${(s.centre.z - start).toFixed(2)} m`);
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.05, `standing still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
    assert.equal(s.phase, "stand", "no step under way");
  } finally { actor.dispose(); stand.dispose(); }
});

test("asked_to_hold_a_warrior_with_the_walk_and_run_stands", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: WALKING });
  actor.drive({ name: "hold", decide: () => ({ move: null, face: 0, guard: NO_COVER, actions: [] }) });
  try {
    stand.step(stand.seconds(10));
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false);
    assert.equal(memoryOf(actor.skills.state).running, false);
    assert.notEqual(actor.skills.state.command.stance, null, "the stance stands it");
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.02, `still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
  } finally { actor.dispose(); stand.dispose(); }
});

for (const [way, move] of [["right", [0, 0.4]], ["back", [-0.4, 0]], ["left", [0, -0.4]]]) test(`a_warrior_with_the_walk_and_run_walks_${way}_at_the_pace_asked_and_stops_on_its_feet`, async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, groundSize: 200 });
  const actor = labActor(stand.built, stand.world, { mind: WALKING });
  let walking = true;
  actor.drive({ name: way, decide: () => ({ move: walking ? move : null, face: 0, guard: NO_COVER, actions: [] }) });
  try {
    // Set off and come up to the pace; then the walk over 3 s, along the way asked and across it.
    stand.step(stand.seconds(4));
    const from = actor.body.view.stance.centre.clone();
    stand.step(stand.seconds(3));
    const to = actor.body.view.stance.centre, speed = Math.hypot(move[0], move[1]), ux = move[1] / speed, uz = move[0] / speed;
    const along = ((to.x - from.x) * ux + (to.z - from.z) * uz) / 3, across = ((to.x - from.x) * uz - (to.z - from.z) * ux) / 3;
    assert.ok(wentAsAsked(along, across, speed), `${along.toFixed(2)} m/s along, ${across.toFixed(2)} across`);
    walking = false;
    stand.step(stand.seconds(5));
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.05, `standing still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
  } finally { actor.dispose(); stand.dispose(); }
});

test("asked_past_its_walk_a_warrior_with_the_walk_and_run_runs_ten_metres_and_stops_on_its_feet", async () => {
  // Measured, with no envelope to cap its pace.
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, groundSize: 80 });
  const actor = labActor(stand.built, stand.world, { mind: WALKING, measuring: true });
  // Forward at 2 m/s, facing +z, until it has run 10 m; then stand.
  let from = null, ran = 0;
  actor.drive({ name: "run", decide: () => ({ move: ran < 10 ? [2, 0] : null, face: 0, guard: NO_COVER, actions: [] }) });
  const memory = memoryOf(actor.skills.state);
  let began = null, stopped = null, handed = null, running = 0;
  try {
    for (let k = 0; k < 30 * 120 && !actor.body.view.down; k++) {
      stand.step(1);
      const s = actor.body.view.stance, t = actor.body.view.time;
      if (memory.running) {
        running++;
        if (began === null) { began = t; from = s.centre.z; }
      }
      if (from !== null && stopped === null) ran = s.centre.z - from;
      if (stopped === null && ran >= 10) stopped = t;
      if (stopped !== null && handed === null && !memory.running) handed = t;
      if (handed !== null && t > handed + 4) break;
    }
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(began !== null && began < 8, `running from ${began?.toFixed(2)} s`);
    // Faster than the walk goes at the most it is asked.
    assert.ok(stopped !== null && (stopped - began) < 10 / WALK_RUN.run, `10 m in ${(stopped - began).toFixed(2)} s`);
    assert.ok(running / 120 > 3, `ran ${(running / 120).toFixed(1)} s`);
    assert.ok(handed !== null && handed - stopped < 8, `given back to the stance ${(handed - stopped).toFixed(2)} s after the mark`);
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.05, `standing still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
    assert.equal(s.phase, "stand", "no step under way");
  } finally { actor.dispose(); stand.dispose(); }
});

test("a_run_told_it_may_not_run_brakes_to_the_walk_and_walks_again_on_its_feet_though_it_is_asked_faster_than_the_walk", async () => {
  // Move's Run while it is sent past 6 m, its Walk nearer: asked 2 m/s throughout, measured, with no envelope to cap it.
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, groundSize: 80 });
  const locomotion = { kind: "move", rules: [{ kind: "when-distance", of: "destination", than: "over", metres: 6, gait: "run" }], otherwise: "braced" };
  const actor = labActor(stand.built, stand.world, { mind: { ...WALKING, locomotion }, measuring: true });
  let near = false;
  actor.drive({ name: "run", decide: () => ({ move: [2, 0], face: 0, guard: NO_COVER, actions: [], destination: near ? 3 : 20 }) });
  const memory = memoryOf(actor.skills.state);
  try {
    stand.step(stand.seconds(8));
    assert.equal(memory.running, true, "running while sent far");
    near = true;
    const going = actor.body.view.stance.velocity.z;
    let walked = null;
    for (let k = 0; k < stand.seconds(8) && !actor.body.view.down; k++) {
      stand.step(1);
      if (walked === null && !memory.running) walked = k / 120;
    }
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    // Braked at the run's rate from the pace it went to the walk's, and a stride or two more.
    const braking = (going - WALK_RUN.run) / WALK_RUN_CYCLE.brake + 2;
    assert.ok(walked !== null && walked < braking, `walking ${walked?.toFixed(2)} s after it was told it may not run at ${going.toFixed(2)} m/s, not ${braking.toFixed(2)}`);
  } finally { actor.dispose(); stand.dispose(); }
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
