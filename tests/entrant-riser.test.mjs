import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { commandedBody } from "../src/core/mind/host.ts";
import { clockOf } from "../src/core/clock.ts";
import { bodyEffectors } from "../src/core/control/effectors.ts";
import { groundReading } from "../src/core/control/ground-reading.ts";
import { selectSet } from "../src/core/mind/choice.ts";
import { stepSet } from "../src/core/option/option.ts";
import { actionInstances } from "../src/core/skills/framework/action-instances.ts";
import { actionResources } from "../src/core/skills/framework/action-resources.ts";
import { RECOVERY_EXECUTOR, RECOVERY_ACTIONS } from "../src/entrants/riser/executor.ts";
import { RECOVERY_OPTIONS } from "../src/entrants/riser/options.ts";

test("recovery option handoffs keep the whole body claimed through the action arbiter", async () => {
  const stand = await coreStand(modelSpec("workshop-rogue"), { engine: "rapier-coordinate" });
  const hosted = commandedBody(stand.built, stand.world, {}), body = hosted.driver;
  try {
    stand.step();
    const executor = RECOVERY_EXECUTOR.make({ body, clock: clockOf(stand.world), guard: {}, aim: () => null }, RECOVERY_EXECUTOR.defaults, []);
    const effectors = bodyEffectors(body.built).map(e => e.model);
    const resources = actionResources(body.muscles.channels.map(c => c.name), effectors, ["foot.left", "foot.right"], []);
    const instances = actionInstances([{ name: "recovery", kind: RECOVERY_EXECUTOR.defaults.kind, executor }],
      Object.values(RECOVERY_ACTIONS).map(name => ({ name, executor: "recovery", effectors: ["foot.left"] })), resources);
    const options = RECOVERY_OPTIONS.flatMap(part => part.make(part.defaults, {}));
    const chooser = selectSet(options, (option, i) => ({ name: option.name, worth: options.length - i, terms: null, moves: null, letGo: 0 }), { rethink: .2 }, () => "");
    const ground = groundReading(body.built, stand.world.dt).read();
    const around = { heading: 0, placed: true, support: null, walk: null, lower: .03 };
    let planted = false;
    // Controlled observations isolate the protocol from the movement's physical success.
    for (let step = 0; step < 120 && !planted; step++) {
      const position = step === 0 ? "front" : "fours";
      const view = { ...body.view, time: step * stand.world.dt, down: true, ground: { ...ground, lie: "front", raw: position,
        position, settled: true, height: .2, footLoad: new Float64Array(2), flat: new Uint8Array(2) } };
      const now = { time: view.time, range: Infinity, down: true, sight: { view, instance: () => instances.instance(), needs: (...args) => instances.needs(...args),
        report: { heading: 0, actions: instances.live, ledger: instances.ledger } } };
      const selected = chooser.decide(now);
      const intent = stepSet(selected.set, now, stand.world.dt, () => ({ move: null, face: 0 }));
      instances.step(view, intent.actions, around, stand.world.dt);
      assert.equal(instances.live.length, 1, `no unowned control interval at step ${step}`);
      const live = instances.live[0], claim = executor.command(view, live.id, around);
      assert.equal(claim.legs, null);
      assert.deepEqual([...claim.pushes.map(push => push.channel)].sort(), [...body.muscles.channels.map(c => c.name)].sort());
      resources.validate(live.holds, claim);
      planted = live.action === RECOVERY_ACTIONS.plant;
    }
    assert.ok(planted, "the observation change reaches the next option");
    assert.deepEqual(instances.ledger.map(end => [end.action, end.ending.kind]), [[RECOVERY_ACTIONS.gather, "completed"]]);
  } finally { hosted.dispose(); stand.dispose(); }
});
