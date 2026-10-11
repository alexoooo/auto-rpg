import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { extensionCanStand } from "../src/core/mind/rise/supported-extension.ts";
import { footStatesOf } from "../src/core/control/support.ts";

test("production extension raises an actual half-kneel, hands over, walks and forks exactly", async () => {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec,
    { engine: "rapier-coordinate", groundSize: 40, posture: guardPosture(spec) });
  let stance;
  try {
    stand.step(240);
    // The checkpoint follows a real two-shove Lab fall, upright knee support, rear sole acquisition and a muscle-driven lead step.
    stand.world.physics.load(new Uint8Array(readFileSync(new URL("fixtures/actual-half-kneel-world.bin", import.meta.url))));
    const actor = labActor(stand.built, stand.world, { mind: { ...LAB_PRESETS.script.config, subs: [{ kind: "dynamic-rise" }] } });
    stance = startStance(actor);
    const body = stance.body, root = stand.built.segments.get("lowerTrunk"), feet = footStatesOf(stand.built),
      model = { channels: [], segments: [...stand.built.segments.values()].map(p => ({ name: p.spec.name, mass: p.rigid.mass })),
        rest: root.rest.asArray(), feet: Object.fromEntries(feet.map(foot => [foot.side, {
          rest: foot.segment.rest.asArray(), edge: foot.ahead.slice(0, 2).map(i => foot.sole[i].asArray()),
          up: Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(foot.segment.rest), new Vector3()).asArray(),
        }])) };
    const initial = body.observe();
    assert.equal(initial.down, true);
    assert.equal(extensionCanStand(initial, model, stand.world.dt), false, "a tipped rear boot cannot hand over");
    assert.ok(initial.contacts.some(c => c.segment === "shank.right" && c.fixed !== null && c.impulse > 0));
    assert.deepEqual(initial.contacts.filter(c => c.fixed !== null && c.impulse > 0).map(c => c.segment).sort(),
      ["foot.left", "foot.right", "shank.right"]);
    stand.step(60);
    const sub = body.state.mind.subs[0], states = { body: body.state, skills: actor.skills.state, orders: stance.orders }, saved = saveStand(stand.world, states), checkpointTime = stand.world.time;
    assert.deepEqual({ phase: sub.policy.phase, extension: sub.extension.phase, native: sub.extendingNative },
      { phase: "extend", extension: "shift", native: false });
    const branch = () => {
      const trace = []; let completed = null, walkedFrom = null, sawNative = false;
      for (let step = 0; step < 1200; step++) {
        stand.step(); const o = body.observe(); trace.push(o);
        for (const j of o.joints) assert.ok(j.effort <= j.positive + 1e-4 && -j.effort <= j.negative + 1e-4, j.name);
        assert.deepEqual({ force: body.assist.meter.force, moment: body.assist.meter.moment }, { force: 0, moment: 0 });
        assert.equal(o.contacts.some(c => c.fixed !== null && c.impulse > 0 && /Trunk|head/.test(c.segment)), false);
        sawNative ||= sub.extendingNative;
        if (sub.policy.completed > 0 && completed === null) {
          completed = stand.world.time; assert.equal(sub.policy.phase, "complete");
          assert.ok(sub.policy.ready >= .5); assert.equal(sub.policy.retries, 0);
        }
        if (completed !== null) {
          assert.equal(o.down, false, "handover and walking stay upright");
          if (stand.world.time - completed < 2) assert.equal(extensionCanStand(o, model, stand.world.dt), true);
          if (stand.world.time - completed >= 2 && walkedFrom === null) { walkedFrom = [...o.centre]; stance.orders.forward = .4; }
          if (stand.world.time - completed >= 3) { stance.orders.forward = 0; break; }
        }
      }
      assert.equal(sawNative, true); assert.ok(completed !== null && walkedFrom !== null);
      assert.ok(completed - checkpointTime + .5 <= 6, "this component completes within six seconds of the half-kneel");
      assert.equal(body.has, "command");
      const last = trace.at(-1), dx = last.centre[0] - walkedFrom[0], dz = last.centre[2] - walkedFrom[2];
      assert.ok(dx * dx + dz * dz > .05 * .05, "the resumed host actually walks");
      return { trace, completed, walkedFrom, state: saveStand(stand.world, states).state };
    };
    const expected = branch(); loadStand(stand.world, states, saved); assert.deepEqual(branch(), expected);
  } finally { stance?.dispose(); stand.dispose(); }
});
