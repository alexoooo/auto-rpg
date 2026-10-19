/**
 * **The lab's log of what a mind decides** (`src/lab/mind-log.ts`): the log itself, the tactics that
 * write it, and what it holds of the Run and the Blow on the Node stand (Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { uprightness } from "../src/core/control/ground.ts";
import { paceRound, stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER, standIntent } from "../src/core/mind/intent.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { STAND } from "../src/core/skills/strike.ts";
import { labActor } from "../src/lab/actor.ts";
import { throwBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { createMindLog, logged, watchHas } from "../src/lab/mind-log.ts";
import { startLocomotion } from "../src/lab/locomotion-mode.ts";
import { CIRCLE_RADIUS, TRACKS, trackOf } from "../src/lab/track.ts";
import { coreStand } from "./harness/core-stand.mjs";

const texts = (notes) => notes.map((note) => note.text);

test("a_log_keeps_its_last_notes_and_gives_those_made_by_a_time", () => {
  const log = createMindLog(4);
  for (const [time, text] of [[0, "a"], [1, "b"], [1, "c"], [2, "d"], [3, "e"]]) log.note(time, text);
  // The oldest is gone; a note made at a time is among those made by it, and not among those made before.
  assert.deepEqual(log.upTo(Infinity, 10), [{ time: 1, text: "b" }, { time: 1, text: "c" }, { time: 2, text: "d" }, { time: 3, text: "e" }]);
  assert.deepEqual(texts(log.upTo(2, 10)), ["b", "c", "d"]);
  assert.deepEqual(texts(log.upTo(1.999, 10)), ["b", "c"]);
  assert.deepEqual(texts(log.upTo(0.5, 10)), []);
  // Of more than `count`, the latest.
  assert.deepEqual(texts(log.upTo(3, 2)), ["d", "e"]);
  assert.deepEqual(texts(log.upTo(2, 1)), ["d"]);
  // Of fewer than `count` made by a time, with more made after it, all of them.
  assert.deepEqual(texts(log.upTo(1, 3)), ["b", "c"]);
});

test("logged_tactics_decide_as_their_own_and_note_each_thing_as_it_changes", () => {
  const stand = { move: null, face: 0, guard: NO_COVER, actions: [] };
  const attack = { ...stand, actions: [{ id: 1, action: "strike", effector: "hand.right", target: { kind: "point", at: [0, 1, 1] } }] };
  const strike = (phase) => ({ actions: phase ? [{ id: 1, action: "strike", phase: phase === "chamber" ? "prepare" : "commit", stage: phase }] : [], ledger: [] });
  // Each step: what the tactics decide, and what they see of their skills.
  const steps = [
    [stand, strike(null)], [stand, strike(null)], [{ ...stand, move: [0.3, 0], face: 1 }, strike(null)],
    [{ ...stand, move: [0.3, 0], face: 2 }, strike(null)], [{ ...stand, move: [0.304, -0.1] }, strike(null)],
    [attack, strike(null)], [attack, strike("chamber")], [attack, strike("swing")], [stand, strike(null)],
    [attack, strike("swing")], [stand, strike(null)], [stand, strike(null)], [stand, strike(null)], [stand, strike(null)],
  ];
  // Tactics with a memory of their own: each decision is their next.
  let decided = 0;
  const own = { name: "scripted", state: { kept: 1 }, get decided() { return decided; }, decide: () => steps[decided++][0] };
  const log = createMindLog(), tactics = logged(own, log);
  for (let step = 0; step < steps.length; step++) {
    const [intent, seen] = steps[step];
    // What is theirs is read through to them as it is now, and they decide once a step.
    assert.deepEqual([tactics.name, tactics.decided], ["scripted", step]);
    assert.equal(tactics.state, own.state);
    assert.equal(tactics.decide({ view: { time: step / 10 }, report: seen }, 0.1), intent);
  }
  assert.equal(tactics.decided, steps.length);
  assert.deepEqual(log.upTo(Infinity, 100).map(({ time, text }) => `${time} ${text}`), [
    "0 stand", "0 left guard", "0 right guard", "0.2 move 0.30 0.00", "0.4 move 0.30 -0.10", "0.5 stand", "0.5 right attack",
    "0.6 #1 strike prepare/chamber", "0.7 #1 strike commit/swing", "0.8 right guard", "0.9 right attack", "0.9 #1 strike commit/swing",
    "1 right guard",
  ]);
});

test("the_log_of_a_run_and_of_a_blow_holds_what_their_scripts_decide", async () => {
  const dt = 1 / 120;
  {
    const spec = humanSpec("workshop-fighter"), stand = await coreStand(spec, { ground: true }), log = createMindLog();
    const run = startLocomotion(labActor(stand.built, stand.world, { around: (script) => logged(script, log) }), trackOf(TRACKS.circle.pieces));
    try {
      stand.step(stand.seconds(2));
      // It sets off on its second step, at the one pace the circle lets it walk (its fastest walk, or
      // what its turns carry round the circle, whichever is less).
      const { pace } = run.frame(), envelope = stanceEnvelope(spec);
      assert.ok(pace > 0 && pace === Math.min(envelope.walk.value, paceRound(envelope, CIRCLE_RADIUS)), `it walks at ${pace} m/s`);
      assert.deepEqual(log.upTo(Infinity, 100), [
        { time: 0, text: "move 0.00 0.00" }, { time: 0, text: "left guard" }, { time: 0, text: "right guard" },
        { time: dt, text: `move ${pace.toFixed(2)} 0.00` },
      ]);
    } finally { run.dispose(); stand.dispose(); }
  }
  {
    const stored = LAB_BLOWS[0], log = createMindLog();
    const stand = await coreStand(loadoutSpec({ model: stored.model, right: "club", left: "empty" }), { ground: true });
    const blow = throwBlow(labActor(stand.built, stand.world, { around: (script) => logged(script, log) }), { hand: stored.hand, strike: stored.strike, place: stored.place, band: stored.band });
    try {
      stand.step(stand.seconds(blow.pushing + 1));
      const notes = log.upTo(Infinity, 100);
      assert.ok(texts(notes).includes("right attack"));
      assert.ok(texts(notes).some(text => text.includes("strike prepare/")), texts(notes).join(", "));
      assert.ok(texts(notes).some(text => text.includes("strike commit/")), texts(notes).join(", "));
      const preparation = notes.find(note => note.text.includes("strike prepare/"));
      const committed = notes.find(note => note.text.includes("strike commit/"));
      assert.ok(preparation.time >= 0 && committed.time >= STAND && committed.time > preparation.time);

    } finally { blow.dispose(); stand.dispose(); }
  }
});

test("the_log_notes_who_has_the_body_each_time_it_changes_hands", async () => {
  /** The Warrior as a lab actor under a standing goal, laid on its back or stood and shoved `impulse` N s forward at its middle trunk a second in: the log's notes, and who had the body each step it changed. */
  const run = async ({ laid, impulse }) => {
    const spec = humanSpec("workshop-fighter"), rotation = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2).asArray();
    let place = { ground: true };
    if (laid) {
      const probe = await coreStand(spec, { posture: GUARD, rotation });
      place = { posture: GUARD, rotation, position: [0, 0.02 - uprightness(probe.built).lowest(), 0] };
      probe.dispose();
    }
    const stand = await coreStand(spec, place), log = createMindLog();
    const actor = labActor(stand.built, stand.world), has = watchHas(stand.world, actor.body, log);
    try {
      actor.drive({ name: "stand", decide: () => standIntent(0) });
      const changes = [];
      let last = actor.body.has;
      const watch = (steps) => {
        for (let i = 0; i < steps; i++) {
          stand.step();
          if (actor.body.has !== last) changes.push({ time: actor.body.view.time, text: `${last = actor.body.has} has the body` });
        }
      };
      watch(stand.seconds(1));
      const trunk = stand.built.segments.get("middleTrunk");
      if (impulse) trunk.body.applyImpulse(new Vector3(0, 0, impulse), centreOfToRef(trunk, new Vector3()));
      watch(stand.seconds(3));
      return { notes: log.upTo(Infinity, 100), changes };
    } finally { has.dispose(); actor.dispose(); stand.dispose(); }
  };
  const lying = await run({ laid: true });
  assert.ok(lying.changes.length > 0, "laid on its back, its body changes hands");
  assert.deepEqual(lying.notes, lying.changes);
  // The control: a body nobody takes is noted nowhere.
  assert.deepEqual(await run({ laid: false, impulse: 20 }), { notes: [], changes: [] });
});
