/**
 * **The lab's run mode** (`src/lab/run-mode.ts`), on the Node stand as the page runs it:
 * each human round each track for 30 s, at 120 Hz. It stays on its feet, gets round -- past the
 * shuttle's first half-turn, a quarter of the way round the circle -- and stays near the track. It
 * asks for the body's fastest walk (`Body.envelope`) except where its turns cannot carry that
 * round a bend: the shuttle's half-turns. Pursuing a point 1 m on cuts inside the 4 m circle by
 * about 1 / (2 * 4) m, 12 cm. Readings: `docs/reference/lab.md#run-tolerance`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { paceRound } from "../src/core/control/stance-envelope.ts";
import { labActor } from "../src/lab/actor.ts";
import { startRun } from "../src/lab/run-mode.ts";
import { CIRCLE_RADIUS, SHUTTLE_METRES, SHUTTLE_TURN_RADIUS, TRACKS, trackOf } from "../src/lab/track.ts";
import { coreStand } from "./harness/core-stand.mjs";

const SECONDS = 30;
/**
 * The farthest off the track the run may go, m: over the widest run measured, under a run that
 * speeds up at a bend's end instead of keeping the bend's pace past it.
 */
const OFF = 0.4;
/** How far round each track it must get in `SECONDS`, m. */
const ROUND = { circle: Math.PI / 2 * CIRCLE_RADIUS, shuttle: SHUTTLE_METRES + Math.PI * SHUTTLE_TURN_RADIUS };

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  for (const id of ["circle", "shuttle"]) {
    test(`${model}_runs_round_the_${id}`, async () => {
      const stand = await coreStand(humanSpec(model), { ground: true });
      const run = startRun(labActor(stand.built, stand.world), trackOf(TRACKS[id].pieces));
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
