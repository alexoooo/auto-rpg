/**
 * **The core lab's run mode** (`src/core-lab/run-mode.ts`), on the Node stand as the page runs it:
 * each human round each track for 30 s, at 120 Hz. It stays on its feet, gets round -- past the
 * shuttle's first half-turn, a quarter of the way round the circle -- and stays near the track. It
 * asks for the body's fastest walk (`CoreBody.envelope`) except where its turns cannot carry that
 * round a bend: the shuttle's half-turns.
 *
 * Measured by this test (Node stand, Rapier, 120 Hz, 2026-09-30), Warrior and Rogue, asked their
 * fastest walk, 0.5 m/s, and 0.4 round the shuttle's half-turns (`paceRound`): none fell; the mean
 * speed along the track was 0.464 and 0.464 m/s on the circle and 0.465 and 0.429 on the shuttle;
 * the farthest off the track after the first second was 13.6 and 13.2 cm on the circle (the pursuit
 * of a point 1 m on cuts inside a 4 m circle by about 1 / (2 * 4) m, 12 cm) and 31.0 and 31.5 cm on
 * the shuttle, at its half-turns of 0.3 m radius. Before the run kept a bend's pace past it (an
 * earlier envelope, the Warrior at 0.5 m/s and 1 rad/s, the Rogue at 0.4 and 2), the Warrior went
 * 45.6 cm off the shuttle, and the Rogue 39.6 cm in 70 s, within 1 % of `OFF`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { paceRound } from "../src/core/control/stance-envelope.ts";
import { startRun } from "../src/core-lab/run-mode.ts";
import { CIRCLE_RADIUS, SHUTTLE_METRES, SHUTTLE_TURN_RADIUS, TRACKS, trackOf } from "../src/core-lab/track.ts";
import { coreStand } from "./harness/core-stand.mjs";

const SECONDS = 30;
/** The farthest off the track the run may go, m. */
const OFF = 0.4;
/** How far round each track it must get in `SECONDS`, m. */
const ROUND = { circle: Math.PI / 2 * CIRCLE_RADIUS, shuttle: SHUTTLE_METRES + Math.PI * SHUTTLE_TURN_RADIUS };

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  for (const id of ["circle", "shuttle"]) {
    test(`${model}_runs_round_the_${id}`, async () => {
      const stand = await coreStand(humanSpec(model), { ground: true });
      const run = startRun(stand.built, stand.world, trackOf(TRACKS[id].pieces));
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
      console.log(`MUT run ${model} ${id}: ${frame.fallen ? "fell" : "held"}, ${frame.travelled.toFixed(2)} m in ${frame.time.toFixed(1)} s,`
        + ` mean ${frame.mean.toFixed(3)} m/s, farthest off ${(100 * off).toFixed(1)} cm`);
      assert.ok(!frame.fallen, `${model} ${id}: fell at ${frame.time.toFixed(1)} s`);
      assert.ok(frame.travelled > ROUND[id], `${model} ${id}: ${frame.travelled.toFixed(2)} m round, not past ${ROUND[id].toFixed(2)}`);
      // The walk off the bends; in them, what the turn carries round, where that is slower.
      const { walk } = run.body.envelope;
      const bend = paceRound(run.body.envelope, id === "shuttle" ? SHUTTLE_TURN_RADIUS : CIRCLE_RADIUS);
      assert.deepEqual([...paces.straight], [walk.value], `${model} ${id}: paces off the bends`);
      assert.deepEqual([...paces.bend], bend < walk.value ? [bend] : [], `${model} ${id}: paces in the bends`);
      assert.ok(off < OFF, `${model} ${id}: ${(100 * off).toFixed(1)} cm off the track`);
    });
  }
}
