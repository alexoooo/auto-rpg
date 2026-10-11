import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

async function doubleFrontShove(script) {
  const spec = modelSpec("workshop-fighter");
  const stand = await coreStand(spec, { engine: "rapier-coordinate", groundSize: 40, posture: guardPosture(spec) });
  const mind = { ...LAB_PRESETS.script.config, subs: [{ kind: "dynamic-rise" }] };
  const stance = startStance(labActor(stand.built, stand.world, { mind }));
  try {
    stand.world.step(240);
    assert.equal(stance.body.down, false, "the Lab starts from a standing Warrior");
    stance.shove(60, 0);
    stand.world.step(24);
    stance.shove(60, 0);
    return await script(stance, stand.world);
  } finally { stance.dispose(); stand.dispose(); }
}

test("a new dynamic-rise stage measures its own progress after two Lab Front shoves", async () => {
  await doubleFrontShove((stance, world) => {
    const p = stance.body.state.mind.subs[0].policy;
    let transition = null;
    for (let step = 0; step < 240; step++) {
      const before = { phase: p.phase, stage: p.stage };
      world.step();
      if (before.phase === "acquire" && before.stage === 0 && p.phase === "acquire" && p.stage === 1) {
        transition = { phase: p.phase, stage: p.stage, time: p.time, retries: p.retries };
        assert.equal(p.retries, 0, "the physical fall advances without a stall retry");
        break;
      }
    }
    assert.deepEqual(transition, { phase: "acquire", stage: 1, time: 0, retries: 0 });
    const knee = () => stance.body.observe().joints.find(j => j.name === "knee.left flexion").angle;
    const from = knee();
    world.step(122);
    assert.deepEqual({ phase: p.phase, stage: p.stage, attempts: p.attempts, retries: p.retries },
      { phase: "acquire", stage: 1, attempts: 1, retries: 0 }, "the incoming pose keeps progressing past the outgoing error's stall deadline");
    assert.ok(knee() - from > .5, "the tuck moves the actual knee through the physics solver");
    assert.equal(stance.body.down, true);
    assert.deepEqual({ landed: p.landed, force: stance.body.assist.meter.force, moment: stance.body.assist.meter.moment },
      { landed: true, force: 0, moment: 0 });
  });
});

test("dynamic rise stands and hands back control within six seconds after two Lab Front shoves", {
  todo: "the Warrior repeats orientation and acquisition attempts instead of completing recovery",
}, async () => {
  await doubleFrontShove((stance, world) => {
    const p = stance.body.state.mind.subs[0].policy;
    let fellAt = null;
    for (let step = 0; step < 840; step++) {
      world.step();
      if (stance.body.down && fellAt === null) fellAt = world.time;
      if (fellAt !== null && (p.completed > 0 || world.time - fellAt >= 6)) break;
    }
    assert.notEqual(fellAt, null, "both shoves produce an actual fall");
    assert.deepEqual({ completed: p.completed, phase: p.phase, down: stance.body.down },
      { completed: 1, phase: "complete", down: false }, "the quiet two-foot recovery gate completes before the deadline");
    assert.ok(p.finished - fellAt <= 6);
    for (let step = 0; step < 240; step++) {
      world.step();
      assert.equal(stance.body.down, false, "the resumed host keeps the Warrior standing");
    }
    const from = stance.body.observe().centre;
    stance.orders.forward = .3;
    for (let step = 0; step < 120; step++) {
      world.step();
      assert.equal(stance.body.down, false, "walking after recovery remains supported");
    }
    const to = stance.body.observe().centre;
    assert.ok((to[0] - from[0]) * (to[0] - from[0]) + (to[2] - from[2]) * (to[2] - from[2]) > .01);
  });
});
