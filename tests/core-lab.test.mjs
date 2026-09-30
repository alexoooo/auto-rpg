/**
 * **The core lab's stance mode** (`src/core-lab/stance-mode.ts`), run on the Node stand as the page
 * runs it: the page's orders, made an intent by the keys' mind and carried out by the skills, and a
 * shove at the middle trunk. What the page shows is what these read.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { TURN_LEAD } from "../src/core/skills/locomotion.ts";
import { startStance } from "../src/core-lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

async function session(model, script) {
  const stand = await coreStand(humanSpec(model), { ground: true });
  const stance = startStance(stand.built, stand.world);
  try { return script(stance, (seconds) => stand.step(stand.seconds(seconds))); }
  finally { stance.dispose(); stand.dispose(); }
}

test("in the lab, each human stands with its guard up, catches a shove, turns only while it walks, walks the way it faces, and stops", async () => {
  // Shoved toward where it faces, each human holds 20 (Rogue) or 30 N s (Warrior) without a step and
  // these with one (`STANCE_RECOVERY`); to the side a step holds little more than standing does.
  for (const [model, impulse] of [["workshop-fighter", 55], ["workshop-rogue", 35]]) {
    const r = await session(model, (stance, run) => {
      run(2);
      const stood = stance.frame();
      // Shoved from behind, from the stance it was built in, it steps and stands.
      stance.shove(impulse, 0);
      run(3);
      const shoved = stance.frame();
      // Asked to turn while standing, it holds its heading.
      stance.orders.turn = 1;
      run(1);
      const held = stance.frame().heading;
      // Walking forward, it turns a quarter to its right once the walk is under way, then goes +x.
      stance.orders.forward = 0.3;
      run(TURN_LEAD + Math.PI / 2);
      stance.orders.turn = 0;
      const turned = stance.frame().heading;
      const from = stance.body.view.stance.centre.clone();
      run(4);
      const to = stance.body.view.stance.centre.clone(), walked = stance.frame();
      stance.orders.forward = 0;
      run(3);
      const stopped = stance.frame();
      // Asked to stand lower, it goes lower: not all the way, as the stance does not crouch yet (`STANCE_LOWER`).
      stance.orders.lower += 0.03;
      run(2);
      const lowered = stance.frame();
      return { stood, shoved, held, turned, walked, stopped, lowered, dx: to.x - from.x, dz: to.z - from.z };
    });
    const at = `${model}`;
    assert.ok(r.stood.phase === "stand" && r.stood.strides === 0 && r.stood.recoveries === 0 && r.stood.speed < 0.01 && !r.stood.fallen
      && Math.abs(r.stood.height - r.stood.goal) < 0.005,
      `${at} standing: ${JSON.stringify(r.stood)}`);
    assert.ok(r.held === 0 && Math.abs(r.turned - Math.PI / 2) < 0.02, `${at} turning: held ${r.held}, turned ${r.turned}`);
    assert.ok(r.walked.strides >= 8 && r.dx > 0.6 && Math.abs(r.dz) < 0.3 && !r.walked.fallen, `${at} walking: ${r.dx.toFixed(2)}, ${r.dz.toFixed(2)} m`);
    assert.ok(r.stopped.phase === "stand" && !r.stopped.fallen, `${at} stopping: ${JSON.stringify(r.stopped)}`);
    assert.ok(Math.abs(r.lowered.goal - (r.stopped.goal - 0.03)) < 1e-6 && r.lowered.height < r.stopped.height - 0.005
      && r.lowered.phase === "stand" && !r.lowered.fallen, `${at} lowered: ${JSON.stringify(r.lowered)}`);
    assert.ok(r.shoved.recoveries >= 1 && !r.shoved.fallen && r.shoved.phase === "stand" && r.shoved.speed < 0.05,
      `${at} shoved: ${JSON.stringify(r.shoved)}`);
  }
});
