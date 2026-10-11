/**
 * **The lab's run mode** (`src/lab/run-mode.ts`), on the Node stand as the page runs it:
 * each human round each track for 30 s, at 120 Hz. It stays on its feet, gets round -- past the
 * shuttle's first half-turn, a quarter of the way round the circle -- and stays near the track. It
 * asks for the body's fastest walk (`Body.envelope`) except where its turns cannot carry that
 * round a bend. Pursuing a point 1 m on cuts inside the 4 m circle by
 * about 1 / (2 * 4) m, 12 cm. Readings: `docs/reference/lab.md#run-tolerance`. The Warrior walks the
 * square facing +z, forward, right and back, at no more than its fastest walk when asked for more.
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
    test(`${model}_runs_round_the_${id}`, async (t) => {
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
      t.diagnostic(`${model} ${id}: ${(frame.travelled / frame.time).toFixed(3)} m/s along the track, ${(100 * off).toFixed(1)} cm off it at most after the first second`);
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

test("the_warrior_walks_the_square_facing_one_way_forward_right_and_back", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  // Asked past its fastest walk: the stance's walk takes no more than its envelope's.
  const run = startRun(labActor(stand.built, stand.world), trackOf(TRACKS.square.size.of(2)), { top: 3, facing: TRACKS.square.facing });
  let frame = run.frame(), turned = 0;
  const walked = new Set();
  try {
    while (frame.time < 10 && !frame.fallen) {
      stand.step(stand.seconds(0.25));
      frame = run.frame();
      turned = Math.max(turned, Math.abs(frame.heading));
      if (frame.time > 0.5) walked.add(frame.walking);
    }
  } finally { run.dispose(); stand.dispose(); }
  assert.ok(!frame.fallen, `fell at ${frame.time.toFixed(1)} s`);
  assert.ok(turned < 0.05, `it faces +z throughout: turned ${turned.toFixed(3)} rad`);
  assert.deepEqual([...walked], [run.body.envelope.walk.value], "the pace walked");
  // Past the first corner and the second: up the forward side, across the right one, onto the way back.
  assert.ok(frame.travelled > 4.2, `${frame.travelled.toFixed(2)} m round`);
  assert.equal(frame.pieces.length, 4);
  assert.ok(frame.pieces.slice(0, 3).every((v) => v !== null && v > 0.2), `each side's speed: ${frame.pieces}`);
  assert.ok(frame.gait.touchdowns > 10 && frame.gait.step > 0.1 && frame.gait.double > 0 && frame.gait.flight === 0, `its feet: ${JSON.stringify(frame.gait)}`);
});
