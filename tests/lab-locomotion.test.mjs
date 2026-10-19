/**
 * **The lab's locomotion mode** (`src/lab/locomotion-mode.ts`), on the Node stand as the page runs it,
 * at 120 Hz: what any walk passes. Each human sent round the circle for 10 s stays on its feet, goes
 * round it and stays near it, the mode asking for the body's fastest walk (`Body.envelope`) except
 * where its turn cannot carry that round the bend; sent on random commands, the Warrior reaches a
 * destination from beyond arriving and sets off for the next. How far and how fast it goes is
 * measured in `lab-locomotion-capability.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { paceRound } from "../src/core/control/stance-envelope.ts";
import { labActor } from "../src/lab/actor.ts";
import { startLocomotion } from "../src/lab/locomotion-mode.ts";
import { ARRIVED, LONGEST_STAND, commandsOf } from "../src/lab/commands.ts";
import { CIRCLE_RADIUS, TRACKS, trackOf } from "../src/lab/track.ts";
import { coreStand } from "./harness/core-stand.mjs";

const SECONDS = 10;
/** How far round the circle any walk gets in `SECONDS`, m, and how far off it, m: a body standing still gets nowhere. */
const ROUND = 1, OFF = 1;

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model}_goes_round_the_circle_on_its_feet`, async () => {
    const stand = await coreStand(humanSpec(model), { ground: true });
    const run = startLocomotion(labActor(stand.built, stand.world), trackOf(TRACKS.circle.pieces));
    let off = 0, frame = run.frame();
    /** The paces asked, on the straight and in a bend. */
    const paces = { straight: new Set(), bend: new Set() };
    try {
      for (let t = 0; t < SECONDS && !frame.fallen; t += 0.25) {
        stand.step(stand.seconds(0.25));
        frame = run.frame();
        if (frame.time > 1) off = Math.max(off, frame.off);
        if (frame.time > 0.5) paces[frame.bending ? "bend" : "straight"].add(frame.pace);
      }
    } finally { run.dispose(); stand.dispose(); }
    assert.ok(!frame.fallen, `${model}: fell at ${frame.time.toFixed(1)} s`);
    assert.ok(frame.travelled > ROUND, `${model}: ${frame.travelled.toFixed(2)} m round`);
    assert.ok(off < OFF, `${model}: ${(100 * off).toFixed(1)} cm off the circle`);
    const { walk } = run.body.envelope, bend = paceRound(run.body.envelope, CIRCLE_RADIUS);
    assert.deepEqual([...paces.straight], [walk.value], `${model}: paces off the bend`);
    assert.deepEqual([...paces.bend], bend < walk.value ? [bend] : [], `${model}: paces in the bend`);
  });
}

test("the_warrior_reaches_a_destination_on_random_commands_and_sets_off_for_the_next", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const commands = commandsOf(6, 1);
  const run = startLocomotion(labActor(stand.built, stand.world), commands);
  let frame = run.frame(), nearest = Infinity, reached = null;
  try {
    while (frame.time < 20 && !frame.fallen && (reached === null || frame.time < reached + LONGEST_STAND + 1)) {
      stand.step(stand.seconds(0.25));
      frame = run.frame();
      const c = run.body.view.stance.centre, to = commands.at(0);
      if (frame.laps === 0) nearest = Math.min(nearest, Math.hypot(c.x - to.x, c.z - to.z));
      if (reached === null && frame.laps > 0) reached = frame.time;
    }
  } finally { run.dispose(); stand.dispose(); }
  assert.ok(!frame.fallen, `fell at ${frame.time.toFixed(1)} s`);
  assert.ok(reached !== null, `no destination reached in ${frame.time.toFixed(1)} s; within ${nearest.toFixed(2)} m of the first`);
  assert.ok(nearest > ARRIVED, "it went to the first from beyond arriving");
  assert.ok(frame.leg && frame.leg.index >= 1 && frame.pace > 0, `the next under way: ${JSON.stringify(frame.leg)} at ${frame.pace} m/s`);
});
