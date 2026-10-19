/**
 * **Edge support on all fours** (`foursSupport`, `tests/fixtures/fours-support.mjs`), on the Node core
 * stand, the coordinate engine, 120 Hz: a knee-weight shift that all-corner sticking lets collapse is
 * retained on the shins' edges, nothing else of the body touching, within every joint's effort and
 * unassisted, and a fork of it plays the same. How far the shift goes is
 * `core-support-pivot-capability.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { foursSupport } from "./fixtures/fours-support.mjs";
import { saveStand, loadStand } from "./harness/core-stand.mjs";

test("edge support retains a knee-weight shift on all fours that all-corner sticking rejects", async () => {
  const baseline = await foursSupport();
  try {
    baseline.stand.step(60);
    assert.ok(baseline.up() < 0, "the same actual fall exposes the all-corner prediction's collapse");
  } finally { baseline.dispose(); }
  const f = await foursSupport(.0001);
  try {
    const take = () => {
      f.stand.step(); const o = f.observe();
      assert.ok(f.up() > -.05, "the loaded shins keep the pelvis above its prone orientation");
      assert.equal(o.contacts.some(c => /Trunk|head/.test(c.segment) && c.fixed !== null && c.impulse > 0), false);
      for (const j of o.joints) assert.ok(j.effort <= j.positive + 1e-4 && -j.effort <= j.negative + 1e-4, j.name);
      assert.deepEqual({ force: f.body.own.assist.meter.force, moment: f.body.own.assist.meter.moment }, { force: 0, moment: 0 });
      return o;
    };
    for (let step = 0; step < 240; step++) take();
    const states = { body: f.body.state }, saved = saveStand(f.stand.world, states);
    const finish = () => {
      const trace = [];
      for (let step = 0; step < 360; step++) trace.push(take());
      return { trace, state: saveStand(f.stand.world, states).state };
    };
    const expected = finish(); loadStand(f.stand.world, states, saved); assert.deepEqual(finish(), expected);
    const o = expected.trace.at(-1), load = name => o.contacts.filter(c => c.segment === name && c.fixed !== null)
      .reduce((sum, c) => sum + c.impulse / f.stand.world.dt, 0);
    assert.ok(load("shank.left") > 100 && load("shank.right") > 100);
    assert.equal(f.body.mind.state.tracking.contact.status, "accepted");
  } finally { f.dispose(); }
});
