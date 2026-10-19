/** **A lab body's sounds logged as a page reads them** (`src/lab/sound-log.ts`), under any of the lab's modes. */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { airOf, hearTouches } from "../../src/audio/body-sounds.ts";
import { centreOfToRef } from "../../src/core/control/support.ts";
import { modelSpec } from "../../src/core/models.ts";
import { rulebook } from "../../src/core/rules/rulebook.ts";
import { guardPosture } from "../../src/core/skills/guard.ts";
import { STAND } from "../../src/core/skills/strike.ts";
import { labActor } from "../../src/lab/actor.ts";
import { throwBlow, watchBlow } from "../../src/lab/blow.ts";
import { LAB_BLOWS } from "../../src/lab/blows.ts";
import { loadoutSpec } from "../../src/lab/loadout.ts";
import { startLocomotion } from "../../src/lab/locomotion-mode.ts";
import { startRoutine } from "../../src/lab/routine.ts";
import { createSoundLog, LAB_BODY, LAB_OTHER, logSounds, shoveSound } from "../../src/lab/sound-log.ts";
import { startStance } from "../../src/lab/stance-mode.ts";
import { hardestOn } from "../../src/lab/targets.ts";
import { TRACKS, trackOf } from "../../src/lab/track.ts";
import { coreStand } from "../harness/core-stand.mjs";

/**
 * Run `mode` (`start(actor, logging, stand)` returns `{ time(), act?(step), done?(), dispose() }`) on
 * `spec`, built in its guard as the lab builds it, at `hz` (the game's when omitted) for `seconds`,
 * or until it is `done`, under `logSounds`, and after every step hold the log to the frame that step
 * recorded:
 * the frame's time (`time()`) is a step on from the last, the air held at it is the air of this
 * step, and what passed since the last frame is what this step sounded of.
 */
async function logged(spec, seconds, start, hz) {
  const stand = await coreStand(spec, { ground: true, posture: guardPosture(spec), ...(hz ? { hz } : {}) });
  const actor = labActor(stand.built, stand.world), log = createSoundLog(stand.world.dt, 2);
  const logging = logSounds(stand.world, actor.body, log);
  let sounded = 0;
  const heard = (c) => { if (c) sounded += 1; logging.heard(c); };
  const own = { id: LAB_BODY, built: stand.built };
  // A body hung beside it is logged, and counted here as the log's own listener hears it.
  const hears = (built) => {
    const logs = logging.hears(built), counts = hearTouches(stand.world, [{ id: LAB_OTHER, built }], () => { sounded += 1; }, [own]);
    return { dispose() { logs.dispose(); counts.dispose(); } };
  };
  const mode = start(actor, { ...logging, heard, hears }, stand);
  const touches = hearTouches(stand.world, [own], () => { sounded += 1; });
  const air = airOf(stand.built), at = new Vector3();
  const faults = [], all = [];
  let last = -Infinity, steps = 0, fastest = 0, down = false;
  // As a page reads it: once the step is over, whatever listener was made in it included.
  const check = () => {
    const time = mode.time(), speed = air(at), held = log.airAt(time), passed = log.passed(last, time);
    if (steps > 0 && Math.abs(time - last - stand.world.dt) > 1e-9) faults.push(`step ${steps}: the frame's time went from ${last} to ${time}`);
    if (!held || held.speed !== speed || held.at.x !== at.x || held.at.z !== at.z) faults.push(`step ${steps}: the air held at ${time} is ${held?.speed}, and this step's ${speed}`);
    if (passed.length !== sounded) faults.push(`step ${steps}: ${passed.length} cues passed at ${time}, and ${sounded} sounded`);
    all.push(...passed);
    fastest = Math.max(fastest, speed);
    down ||= actor.body.view.down;
    sounded = 0; last = time; steps += 1;
  };
  try {
    for (let i = 0; i < stand.seconds(seconds) && !mode.done?.(); i++) { mode.act?.(i); stand.step(1); check(); }
    return { faults, cues: all, fastest, down, steps };
  } finally { touches.dispose(); mode.dispose(); logging.dispose(); stand.dispose(); }
}

/** The Stance: a walk, then a shove from the front at 4 s, its cue logged before the solver steps. */
export const stanceShoved = () => logged(modelSpec("workshop-fighter"), 7, (actor, logging, stand) => {
  const shoved = shoveSound(actor.body.built);
  const session = startStance(actor, (segment, impulse, at) => logging.heard(shoved(segment, impulse, at)));
  session.orders.forward = 0.3;
  return { time: () => session.frame().time, act: (step) => { if (step === stand.seconds(4)) session.shove(120, 180); }, dispose: () => session.dispose() };
});

/** The Routine, pushed from behind at 2 s as it walks out: its frame's time goes on while another mind has the body. */
export const routinePushed = () => logged(modelSpec("workshop-fighter"), 6, (actor, _, stand) => {
  const session = startRoutine(actor), trunk = stand.built.segments.get("middleTrunk");
  return {
    time: () => session.time(),
    act: (step) => { if (step === stand.seconds(2)) trunk.body.applyImpulse(new Vector3(0, 0, -150), centreOfToRef(trunk, new Vector3())); },
    dispose: () => session.dispose(),
  };
});

/** The Routine to the reading of its one target, or 40 s, the body hung for it heard with the body; and that reading. */
export async function routineStruck() {
  let reading = null;
  const run = await logged(modelSpec("workshop-fighter"), 40, (actor, logging) => {
    const session = startRoutine(actor, { targets: 1, hung: logging.hears });
    return { time: () => session.time(), done: () => (reading = session.readings[0] ?? null) !== null, dispose: () => session.dispose() };
  });
  return { ...run, reading };
}

/** The Run, 4 s round the shuttle. */
export const runShuttle = () => logged(modelSpec("workshop-fighter"), 4, (actor) => {
  const session = startLocomotion(actor, trackOf(TRACKS.shuttle.pieces));
  return { time: () => session.frame().time, dispose: () => session.dispose() };
});

/**
 * The Blow, the body hung for it heard with the body, at 480 Hz, where the unit blow, searched at
 * 960 Hz, lands as written (at 120 Hz its first throw misses: `research/core-club-unit.json`); and
 * the blow that took the most from the target, read at every step to the end.
 */
export async function blowThrown() {
  const stored = LAB_BLOWS[0];
  let landed = null;
  const run = await logged(loadoutSpec({ model: stored.model, right: "club", left: "empty", boots: true, armour: true }), STAND + stored.strike.chamber.seconds + 0.6, (actor, logging) => {
    const thrown = throwBlow(actor, { hand: stored.hand, strike: stored.strike, place: stored.place, band: stored.band });
    const watch = watchBlow(actor, thrown, rulebook("arena"), { hung: logging.hears });
    return { time: () => thrown.body.view.time, done: () => { landed = hardestOn(watch.reading.blows, "dummy"); return false; }, dispose: () => { watch.dispose(); thrown.dispose(); } };
  }, 480);
  return { ...run, landed };
}
