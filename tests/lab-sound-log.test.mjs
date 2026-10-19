/**
 * **The lab's sound log** (`src/lab/sound-log.ts`): the log gives what the time shown passed and no
 * more than a page frame of it; a shove is told as it is applied, and sounds as a hand with the
 * energy its impulse gives. Node core stand, Rapier, 120 Hz. What each mode sounds of is `lab-sound`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { contactMass } from "../src/core/build/contact-mass.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { modelSpec } from "../src/core/models.ts";
import { labActor } from "../src/lab/actor.ts";
import { CATCH_UP_MS } from "../src/lab/player.ts";
import { createSoundLog, LAB_BODY, shoveSound } from "../src/lab/sound-log.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

const DT = 1 / 120;
const cue = (name) => ({ key: name, kind: "body", strength: 0.5, point: { x: 0, z: 0 } });
const names = (cues) => cues.map((c) => c.key);

test("a log gives what the time shown passed, and no more than a frame of it", () => {
  const log = createSoundLog(DT, 1);
  log.note(1, cue("a"));
  log.note(1 + DT, cue("b"));
  log.note(1.5, cue("c"));
  // On by a step: the cue of that step, once.
  assert.deepEqual(names(log.passed(1 - DT, 1)), ["a"]);
  assert.deepEqual(names(log.passed(1, 1 + DT)), ["b"]);
  // The time shown stays, as on a held frame, or goes back, as on a scrub: nothing.
  assert.deepEqual(names(log.passed(1, 1)), []);
  assert.deepEqual(names(log.passed(1.5, 1)), []);
  // From nothing shown, and over a jump of the time shown: the last frame's worth, and no more.
  assert.equal(CATCH_UP_MS, 100);
  assert.deepEqual(names(log.passed(-Infinity, 1)), ["a"]);
  assert.deepEqual(names(log.passed(0, 1.55)), ["c"]);
  assert.deepEqual(names(log.passed(0, 1.05)), ["a", "b"]);
  // After a scrub back, playing on from there gives the same cues again.
  assert.deepEqual(names(log.passed(1 - DT, 1)), ["a"]);

  // The air: a second of steps is held, each at its own time.
  assert.equal(log.airAt(5 * DT), null);
  for (let k = 1; k <= 130; k++) log.air(k * DT, k, { x: k, z: -k });
  assert.deepEqual(log.airAt(125 * DT), { speed: 125, at: { x: 125, z: -125 } });
  assert.deepEqual(log.airAt(11 * DT), { speed: 11, at: { x: 11, z: -11 } });
  // A step rolled past, whose slot a later step has; and steps never logged.
  assert.equal(log.airAt(5 * DT), null);
  assert.equal(log.airAt(131 * DT), null);
  assert.equal(log.airAt(500 * DT), null);

  // The log keeps the latest cues, and drops the oldest.
  const long = createSoundLog(DT, 1);
  for (let k = 1; k <= 1030; k++) long.note(k * DT, cue(String(k)));
  assert.deepEqual(names(long.passed(0, 8 * DT)), ["7", "8"]);
});

test("a shove is told as it is applied, and sounds as a hand, louder with its impulse", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { ground: true });
  const told = [];
  const stance = startStance(labActor(stand.built, stand.world), (segment, impulse, at) => told.push({ segment, impulse: impulse.asArray(), at: at.asArray() }));
  try {
    stand.step(stand.seconds(1));
    const trunk = stand.built.segments.get("middleTrunk"), centre = centreOfToRef(trunk, new Vector3()).asArray();
    const heading = stance.frame().heading;
    stance.shove(30, 90);
    assert.equal(told.length, 0);
    stand.step(1);
    assert.equal(told.length, 1);
    assert.equal(told[0].segment, trunk);
    // Level, to its right; at the trunk's centre of mass as the step began.
    const a = heading + Math.PI / 2, want = [30 * Math.sin(a), 0, 30 * Math.cos(a)];
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(told[0].impulse[i] - want[i]) < 1e-9, `impulse ${told[0].impulse}`);
      assert.ok(Math.abs(told[0].at[i] - centre[i]) < 1e-9, `at ${told[0].at}, the centre ${centre}`);
    }
    stand.step(10);
    assert.equal(told.length, 1);

    // Its sound: a hand's, with what the impulse gives the mass it meets from rest.
    const shoved = shoveSound(stand.built), mass = contactMass(stand.built), at = centreOfToRef(trunk, new Vector3());
    mass.update();
    const kg = mass.along(trunk, at.asArray(), [0, 0, 1]);
    assert.ok(kg > 5 && kg < 60, `${kg} kg`);
    const cues = [5, 10, 20].map((impulse) => shoved(trunk, new Vector3(0, 0, impulse), at));
    for (const [i, impulse] of [5, 10, 20].entries()) {
      assert.deepEqual({ ...cues[i], strength: 0 }, { key: `${LAB_BODY}:hand`, kind: "body", strength: 0, point: { x: at.x, z: at.z } });
      assert.ok(Math.abs(cues[i].strength - Math.sqrt(impulse * impulse / (2 * kg) / 60)) < 1e-12, `${impulse} N s: ${cues[i].strength}`);
    }
    assert.ok(cues[0].strength < cues[1].strength && cues[1].strength < cues[2].strength && cues[2].strength < 1);
    assert.equal(shoved(trunk, new Vector3(0, 0, 200), at).strength, 1);
  } finally { stance.dispose(); stand.dispose(); }

  // A hand on bone is still a hand: the softer of the two.
  const bones = await coreStand(modelSpec("crypt-skeleton"), { ground: true });
  try {
    const trunk = bones.built.segments.get("middleTrunk");
    assert.equal(shoveSound(bones.built)(trunk, new Vector3(0, 0, 20), centreOfToRef(trunk, new Vector3())).kind, "body");
  } finally { bones.dispose(); }
});
