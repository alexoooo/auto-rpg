/**
 * **How well the reptile bites and trots** (`src/core/reptile/`), measured and not a gate
 * (`tests/experimental.json`): an autonomous bite and a closing jaw that land fast and hard, and a
 * trot's pace, reverse and turn (Node core stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { biteTrial } from "../research/reptile-bite.mjs";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { quadrupedMind } from "../src/core/reptile/mind.ts";
import { hostedMind } from "../src/core/mind/host.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("autonomous tactics capture a sensed surface, snap and verify release", async () => {
  const row = await biteTrial({ autonomous: true });
  const hit = row.hits.find(h => h.blow.kind === "load" && h.blow.sides.some(side => side.mechanism === "point"));
  assert.ok(hit && hit.before.phase === "swing" && hit.before.rate < -2 && hit.before.elapsed < .12
    && hit.blow.impulse.some(n => n > 0), JSON.stringify(row));
  assert.ok(hit.blow.sides[1].damage > 0);
  assert.deepEqual(row.cycle, { launched: 1, returned: 1, failed: 0, phase: null });
  assert.equal(row.clear, true); assert.equal(row.down, false);
  assert.deepEqual(row.assist, { steps: 0, force: 0, moment: 0 });
});

test("a closing jaw strikes during its fast motion and releases after cancellation", async () => {
  const row = await biteTrial();
  const hit = row.hits.find(h => h.blow.kind === "load" && h.blow.sides.some(side => side.mechanism === "point"));
  assert.ok(hit && hit.before.rate < -2 && hit.before.elapsed < .12, JSON.stringify(row));
  assert.ok(hit.blow.impulse.some(n => n > 0));
  assert.ok(row.cycles.some(cycle => cycle.support === 4 && cycle.damage > .002 && cycle.release !== null));
  assert.deepEqual(hit.blow.sides.map(side => side.segment), ["jaw", "jaw"]);
  assert.ok(hit.blow.sides[1].damage > 0 && hit.blow.sides[1].wound !== null);
  assert.ok(row.bars.every(bar => bar < 1));
  assert.ok(hit.blow.sides[0].region?.startsWith("tooth."));
  assert.equal(hit.blow.sides[1].mechanism, "point");
  assert.ok(hit.blow.sides[1].damage > .002, JSON.stringify(hit.blow));
  assert.deepEqual(row.cycle, { launched: 1, returned: 1, failed: 0, phase: null });
  assert.equal(row.clear, true); assert.equal(row.down, false);
  assert.deepEqual(row.assist, { steps: 0, force: 0, moment: 0 });
});

test("the trot travels quickly, stops, reverses and turns on physical paw landings", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", groundSize: 100 });
  let orders = STAND_ORDERS, biteAt = null;
  const mind = hostedMind(stand.built, stand.world, { orders: () => orders }, (host, wiring) => quadrupedMind(host, wiring));
  const host = mind.body.state.mind.host, crawl = host.crawl;
  const groups = [[0, 1], [2, 3]];
  const run = seconds => {
    for (let i = 0; i < seconds * stand.world.hz; i++) {
      const steps = crawl.steps, paw = crawl.paw;
      stand.step();
      assert.equal(mind.body.down, false);
      assert.ok(crawl.command.endpoints.filter(endpoint => !endpoint.bearing).length <= 2);
      if (crawl.steps !== steps) {
        assert.equal(crawl.steps, steps + 2);
        assert.equal(crawl.lifted, true);
        for (const i of groups[paw]) {
          assert.equal(crawl.liftedPaws[i], true);
          assert.equal(host.motor.endpoints[i].contact, true, `paw ${i} lands in physics`);
        }
      }
    }
    return mind.body.observe().centre;
  };
  try {
    const start = run(2);
    orders = { move: { kind: "direct", direction: { x: 0, z: 1 } }, face: { x: 0, z: 1 } };
    const forward = run(10);
    assert.ok(forward[2] - start[2] >= 2, "at least .2 m/s including acceleration");
    assert.ok(crawl.steps >= 60);
    orders = STAND_ORDERS; run(5);
    assert.equal(crawl.phase, "settle");
    const stopped = mind.body.observe().centre, stoppedSteps = crawl.steps;
    run(5);
    assert.equal(crawl.steps, stoppedSteps);
    const quiet = mind.body.observe().centre;
    assert.ok(Math.hypot(quiet[0] - stopped[0], quiet[2] - stopped[2]) < .02);
    orders = { move: { kind: "direct", direction: { x: 0, z: -1 } }, face: { x: 0, z: 1 } };
    const backward = run(10);
    assert.ok(quiet[2] - backward[2] >= 1.8);
    orders = { move: null, face: { x: 1, z: 0 } }; run(20);
    assert.ok(Math.abs(crawl.yaw - Math.PI / 2) < .1);
    orders = { move: { kind: "direct", direction: { x: 1, z: 0 } }, face: { x: 1, z: 0 } };
    const turning = mind.body.observe().centre, right = run(10);
    assert.ok(right[0] - turning[0] >= 2);
    assert.equal(mind.body.assist.meter.force, 0);
    assert.equal(mind.body.assist.meter.moment, 0);
  } finally { mind.body.dispose(); stand.dispose(); }
});
