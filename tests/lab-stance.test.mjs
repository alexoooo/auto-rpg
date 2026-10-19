/**
 * **The lab's stance mode** (`src/lab/stance-mode.ts`), run on the Node stand as the page
 * runs it: the page's orders, made an intent by the keys' tactics and carried out by the skills, and a
 * shove at the middle trunk. What any stance passes: it stands, holds its heading standing, turns
 * while it walks, walks the way it faces, stops, stands lower when asked, and stands through a light
 * shove. How far it turns, how far it walks and what shove it catches is measured in
 * `lab-stance-capability.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

/** A shove from behind that any stance stands through, N s: under what each human holds without a step. */
const LIGHT = 15;

test("in the lab, each human stands, turns only while it walks, walks the way it faces, stops, stands lower and stands through a light shove", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) {
    const stand = await coreStand(humanSpec(model), { ground: true });
    const stance = startStance(labActor(stand.built, stand.world));
    const run = (seconds) => stand.step(stand.seconds(seconds));
    let r;
    try {
      run(2);
      const stood = stance.frame();
      // Asked to turn while standing, it holds its heading.
      stance.orders.turn = 1;
      run(1);
      const held = stance.frame().heading;
      // Walking forward, it turns to its right as it walks, then goes the way it faces.
      stance.orders.forward = 0.3;
      run(Math.PI / 2);
      stance.orders.turn = 0;
      const turned = stance.frame().heading;
      const from = stance.body.view.stance.centre.clone();
      run(4);
      const to = stance.body.view.stance.centre.clone(), walked = stance.frame();
      stance.orders.forward = 0;
      run(3);
      const stopped = stance.frame();
      stance.orders.lower += 0.03;
      run(2);
      const lowered = stance.frame();
      stance.shove(LIGHT, 0);
      run(3);
      const shoved = stance.frame();
      // Along the heading it walked and across it.
      const ux = Math.sin(turned), uz = Math.cos(turned), dx = to.x - from.x, dz = to.z - from.z;
      r = { stood, held, turned, walked, stopped, lowered, shoved, along: dx * ux + dz * uz, across: dx * uz - dz * ux };
    } finally { stance.dispose(); stand.dispose(); }
    assert.ok(r.stood.phase === "stand" && r.stood.recoveries === 0 && r.stood.speed < 0.05 && !r.stood.fallen, `${model} standing: ${JSON.stringify(r.stood)}`);
    assert.ok(r.held === 0 && r.turned > 0.5, `${model} turning: held ${r.held}, turned ${r.turned}`);
    assert.ok(r.walked.strides > 0 && r.along > 0.3 && Math.abs(r.across) < r.along && !r.walked.fallen,
      `${model} walking: ${r.along.toFixed(2)} m along, ${r.across.toFixed(2)} across`);
    assert.ok(r.stopped.phase === "stand" && r.stopped.speed < 0.1 && !r.stopped.fallen, `${model} stopping: ${JSON.stringify(r.stopped)}`);
    assert.ok(Math.abs(r.lowered.goal - (r.stopped.goal - 0.03)) < 1e-6 && r.lowered.height < r.stopped.height && !r.lowered.fallen,
      `${model} lowered: ${JSON.stringify(r.lowered)}`);
    assert.ok(!r.shoved.fallen && r.shoved.phase === "stand", `${model} shoved: ${JSON.stringify(r.shoved)}`);
  }
});
