/**
 * What the lab's mind log holds of a whole circle walked, and of a shove that fells the stance:
 * how well the controller does, on the Node stand (Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { paceRound, stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { labActor } from "../src/lab/actor.ts";
import { createMindLog, logged, watchHas } from "../src/lab/mind-log.ts";
import { startLocomotion } from "../src/lab/locomotion-mode.ts";
import { CIRCLE_RADIUS, TRACKS, trackOf } from "../src/lab/track.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("the_log_of_a_circle_walked_for_20_s_is_its_scripts_first_steps_alone", async () => {
  const dt = 1 / 120;
  {
    const spec = humanSpec("workshop-fighter"), stand = await coreStand(spec, { ground: true }), log = createMindLog();
    const run = startLocomotion(labActor(stand.built, stand.world, { around: (script) => logged(script, log) }), trackOf(TRACKS.circle.pieces));
    try {
      stand.step(stand.seconds(20));
      // It sets off on its second step, at the one pace the circle lets it walk (its fastest walk, or
      // what its turns carry round the circle, whichever is less), and asks nothing else all the way round.
      const { pace } = run.frame(), envelope = stanceEnvelope(spec);
      assert.ok(pace > 0 && pace === Math.min(envelope.walk.value, paceRound(envelope, CIRCLE_RADIUS)), `it walks at ${pace} m/s`);
      assert.deepEqual(log.upTo(Infinity, 100), [
        { time: 0, text: "move 0.00 0.00" }, { time: 0, text: "left guard" }, { time: 0, text: "right guard" },
        { time: dt, text: `move ${pace.toFixed(2)} 0.00` },
      ]);
    } finally { run.dispose(); stand.dispose(); }
  }
});

test("the_log_notes_who_has_the_body_when_it_changes_hands", async () => {
  /** The Warrior as a lab actor, standing, shoved `impulse` N s forward at its middle trunk a second in: the log's notes, and the time its view first said down. */
  const shoved = async (impulse) => {
    const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true }), log = createMindLog();
    const actor = labActor(stand.built, stand.world), has = watchHas(stand.world, actor.body, log);
    try {
      actor.drive({ name: "stand", decide: () => standIntent(0) });
      stand.step(stand.seconds(1));
      const trunk = stand.built.segments.get("middleTrunk");
      trunk.body.applyImpulse(new Vector3(0, 0, impulse), centreOfToRef(trunk, new Vector3()));
      let at = null;
      for (let i = 0; i < stand.seconds(4); i++) {
        stand.step();
        if (actor.body.view.down) at ??= actor.body.view.time;
      }
      return { notes: log.upTo(Infinity, 100), at };
    } finally { has.dispose(); actor.dispose(); stand.dispose(); }
  };
  const fell = await shoved(120);
  assert.ok(fell.at !== null, "the shove fells it");
  assert.deepEqual(fell.notes, [{ time: fell.at, text: "lie has the body" }], "one note, at the step it went down");
  // The control: a body nobody takes is noted nowhere.
  assert.deepEqual(await shoved(20), { notes: [], at: null });
});
