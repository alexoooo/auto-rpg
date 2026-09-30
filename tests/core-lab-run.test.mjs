/**
 * **The core lab's run mode** (`src/core-lab/run-mode.ts`), on the Node stand as the page runs it:
 * each human round each track for 30 s, at 120 Hz. It stays on its feet, gets round -- past the
 * shuttle's first half-turn, a quarter of the way round the circle -- and stays near the track. It
 * asks for `RUN_PACE` except into the shuttle's half-turns, where it asks for the Routine's
 * `TURN_PACE`, the only pace a turn was measured at.
 *
 * Measured by this test (Node stand, Rapier, 120 Hz, 2026-09-29), Warrior and Rogue: none fell;
 * the mean speed along the track was 0.365 and 0.367 m/s on the circle and 0.358 and 0.360 on the
 * shuttle, asked 0.4; the farthest off the track after the first second was 13.4 cm on the circle
 * for each (the pursuit of a point 1 m on cuts inside a 4 m circle by about 1 / (2 * 4) m, 12 cm)
 * and 37.7 and 39.2 cm on the shuttle, at its half-turns of 0.3 m radius. Run 70 s, none fell, and
 * the shuttle's farthest was 39.6 and 39.2 cm: within 1 % of `OFF`, the farthest the test allows.
 * On Havok's stance, whose walk went slower than asked, the shuttle's half-turns were cut within
 * 29.0 and 32.1 cm; on Rapier's the walk goes the pace asked, which the turn rate carries round a
 * half-turn with nothing to spare.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { RUN_PACE, startRun } from "../src/core-lab/run-mode.ts";
import { TURN_PACE } from "../src/core-lab/routine.ts";
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
      // The circle is all one pace; the shuttle slows to the turn's pace into its first half-turn.
      assert.deepEqual([...paces.straight], [RUN_PACE], `${model} ${id}: paces off the bends`);
      assert.deepEqual([...paces.bend], id === "shuttle" ? [TURN_PACE] : [], `${model} ${id}: paces in the bends`);
      assert.ok(off < OFF, `${model} ${id}: ${(100 * off).toFixed(1)} cm off the track`);
    });
  }
}
