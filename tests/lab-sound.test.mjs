/**
 * **What the lab's body sounded of** (`src/lab/sound-log.ts`): the log gives what the time shown
 * passed and no more than a page frame of it; a shove is told as it is applied, and sounds as a
 * hand with the energy its impulse gives; and under each of the lab's modes, what a step sounded
 * of is held at the time the frame that step recorded shows, on its feet and down. Node core
 * stand, Rapier, 120 Hz, balance 0 %.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { airOf, hearTouches } from "../src/audio/body-sounds.ts";
import { contactMass } from "../src/core/build/contact-mass.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { STAND } from "../src/core/skills/strike.ts";
import { labActor } from "../src/lab/actor.ts";
import { throwBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
import { watchClubBlow } from "../src/lab/club-blow.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { CATCH_UP_MS } from "../src/lab/player.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { startRun } from "../src/lab/run-mode.ts";
import { createSoundLog, LAB_BODY, landingCue, logSounds, shoveSound } from "../src/lab/sound-log.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { TRACKS, trackOf } from "../src/lab/track.ts";
import { coreStand } from "./harness/core-stand.mjs";

const DT = 1 / 120;
const cue = (name) => ({ key: name, kind: "body", strength: 0.5, severed: false, point: { x: 0, z: 0 } });
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
      assert.deepEqual({ ...cues[i], strength: 0 }, { key: `${LAB_BODY}:hand`, kind: "body", strength: 0, severed: false, point: { x: at.x, z: at.z } });
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

/**
 * Run `mode` (`start(actor, logging)` returns `{ time(), act?(step), dispose() }`) on `spec` for
 * `seconds` under `logSounds`, and after every step hold the log to the frame that step recorded:
 * the frame's time (`time()`) is a step on from the last, the air held at it is the air of this
 * step, and what passed since the last frame is what this step sounded of.
 */
async function logged(spec, seconds, start) {
  const stand = await coreStand(spec, { ground: true });
  const actor = labActor(stand.built, stand.world), log = createSoundLog(stand.world.dt, 2);
  const logging = logSounds(stand.world, actor.body, log);
  let sounded = 0;
  const heard = (c) => { if (c) sounded += 1; logging.heard(c); };
  const mode = start(actor, { ...logging, heard }, stand);
  const touches = hearTouches(stand.world, [{ id: LAB_BODY, built: stand.built }], () => { sounded += 1; });
  const air = airOf(stand.built), at = new Vector3();
  const faults = [], all = [];
  let last = -Infinity, steps = 0, fastest = 0, down = false;
  const check = stand.world.afterStep(() => {
    const time = mode.time(), speed = air(at), held = log.airAt(time), passed = log.passed(last, time);
    if (steps > 0 && Math.abs(time - last - stand.world.dt) > 1e-9) faults.push(`step ${steps}: the frame's time went from ${last} to ${time}`);
    if (!held || held.speed !== speed || held.at.x !== at.x || held.at.z !== at.z) faults.push(`step ${steps}: the air held at ${time} is ${held?.speed}, and this step's ${speed}`);
    if (passed.length !== sounded) faults.push(`step ${steps}: ${passed.length} cues passed at ${time}, and ${sounded} sounded`);
    all.push(...passed);
    fastest = Math.max(fastest, speed);
    down ||= actor.body.view.down;
    sounded = 0; last = time; steps += 1;
  });
  try {
    for (let i = 0; i < stand.seconds(seconds); i++) { mode.act?.(i); stand.step(1); }
    return { faults, cues: all, fastest, down, steps };
  } finally { check.dispose(); touches.dispose(); mode.dispose(); logging.dispose(); stand.dispose(); }
}

test("what a step sounded of is held at the time its frame shows, under every mode, on its feet and down", async () => {
  // The Stance: a walk, then a shove from the front that puts it down. The shove's cue is logged before the solver steps.
  const stance = await logged(modelSpec("workshop-fighter"), 7, (actor, logging, stand) => {
    const shoved = shoveSound(actor.body.built);
    const session = startStance(actor, (segment, impulse, at) => logging.heard(shoved(segment, impulse, at)));
    session.orders.forward = 0.3;
    return { time: () => session.frame().time, act: (step) => { if (step === stand.seconds(4)) session.shove(120, 180); }, dispose: () => session.dispose() };
  });
  assert.deepEqual(stance.faults.slice(0, 5), []);
  assert.ok(stance.down, "the shove put it down");
  const hands = stance.cues.filter((c) => c.key === `${LAB_BODY}:hand`), falls = stance.cues.filter((c) => c.key === `${LAB_BODY}:ground`);
  assert.equal(hands.length, 1);
  assert.equal(hands[0].strength, 1);
  assert.ok(falls.length > 10 && Math.max(...falls.map((c) => c.strength)) > 0.5, `${falls.length} touches of the ground`);

  // The Routine, knocked down while it walks out: its frame's time goes on while another mind has the body.
  const routine = await logged(modelSpec("workshop-fighter"), 6, (actor, _, stand) => {
    const session = startRoutine(actor), trunk = stand.built.segments.get("middleTrunk");
    return {
      time: () => session.time(),
      act: (step) => { if (step === stand.seconds(2)) trunk.body.applyImpulse(new Vector3(0, 0, -150), centreOfToRef(trunk, new Vector3())); },
      dispose: () => session.dispose(),
    };
  });
  assert.deepEqual(routine.faults.slice(0, 5), []);
  assert.ok(routine.down, "the push put it down");
  assert.ok(routine.cues.length > 5);

  // The Run, round the shuttle.
  const run = await logged(modelSpec("workshop-fighter"), 4, (actor) => {
    const session = startRun(actor, trackOf(TRACKS.shuttle.pieces));
    return { time: () => session.frame().time, dispose: () => session.dispose() };
  });
  assert.deepEqual(run.faults.slice(0, 5), []);
  assert.ok(!run.down && run.cues.length >= 6 && run.cues.every((c) => c.key === `${LAB_BODY}:ground`), `${run.cues.length} footfalls`);

  // The Blow: the landing on the mark is the scenario's own cue, at the step the watch first reads it.
  const stored = LAB_BLOWS[0];
  let landedAt = null;
  const blow = await logged(loadoutSpec({ model: stored.model, right: "club", left: "empty", boots: true, armour: true }), STAND + stored.strike.chamber.seconds + 0.6, (actor, logging, stand) => {
    const thrown = throwBlow(actor, stored.strike, stored.distance);
    const watch = watchClubBlow(stand.built, stand.world, thrown, stored.distance, stored.hand);
    const sounding = stand.world.afterStep(() => {
      if (landedAt !== null || !watch.landed) return;
      landedAt = { time: thrown.body.view.time, landed: watch.landed };
      logging.heard(landingCue(stand.built, stored.hand, watch.landed));
    });
    return { time: () => thrown.body.view.time, dispose: () => { sounding.dispose(); watch.dispose(); thrown.dispose(); } };
  });
  assert.deepEqual(blow.faults.slice(0, 5), []);
  assert.ok(landedAt, "the blow landed");
  const marks = blow.cues.filter((c) => c.key === `${LAB_BODY}:mark`);
  // Wood on a head of flesh: the softer one's voice, at the point the club touched.
  assert.deepEqual(marks, [{ key: `${LAB_BODY}:mark`, kind: "body", strength: 1, severed: false, point: { x: landedAt.landed.point[0], z: landedAt.landed.point[2] } }]);
  assert.ok(landedAt.landed.energy > 60 && blow.fastest > 19, `${landedAt.landed.energy} J, ${blow.fastest} m/s`);
});
