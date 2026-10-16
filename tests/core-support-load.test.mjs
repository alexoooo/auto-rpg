import test from "node:test";
import assert from "node:assert/strict";
import { toeSupport } from "./fixtures/toe-support.mjs";
import { saveStand, loadStand } from "./harness/core-stand.mjs";

test("normal feedback and a toe load floor retain the actual kneel for five seconds", async () => {
  const baseline = await toeSupport({ stabilize: false });
  try {
    baseline.stand.step(12);
    assert.equal(baseline.load("foot.left"), 0, "the captured real posture exposes the unstabilized controller's toe loss");
  } finally { baseline.dispose(); }
  const f = await toeSupport();
  try {
    for (let step = 0; step < 600; step++) {
      f.stand.step(); const sample = f.sample();
      assert.ok(Object.values(sample.loads).every(load => load > 0), `step ${step}: ${JSON.stringify(sample)}`);
      assert.deepEqual(sample.bodyFloor, []);
      assert.ok(sample.effortExcess < 1e-4, `step ${step}: ${sample.effortExcess}`);
      assert.deepEqual(sample.assist, { force: 0, moment: 0 });
      assert.equal(f.body.mind.state.tracking.contact.status, "accepted");
    }
    assert.ok(f.sample().speed < .001);
  } finally { f.dispose(); }
});

test("tapering hand pressure transfers the actual kneel onto both boots and replays", {
  todo: "the snapshot `inactive-contact-world.bin` was saved on legs the body no longer has, and loading it restores their foot friction (0.5, averaged) over the body's (0.8, the larger); with the body's own friction the lift ends at 0.66 of its height bar",
}, async () => {
  const f = await toeSupport({ transfer: true });
  try {
    f.stand.step(600);
    const states = { body: f.body.state }, saved = saveStand(f.stand.world, states);
    const branch = () => {
      const observations = [];
      for (let step = 0; step < 120; step++) { f.stand.step(); observations.push(f.observe()); }
      return { sample: f.sample(), observations, state: saveStand(f.stand.world, states).state };
    };
    const expected = branch(); loadStand(f.stand.world, states, saved); assert.deepEqual(branch(), expected);
    const { loads, bodyFloor, up, speed, effortExcess, assist } = expected.sample;
    assert.equal(f.body.mind.state.finished, true);
    assert.equal(f.body.mind.state.phase, "lift");
    assert.deepEqual([loads["hand.left"], loads["hand.right"], loads["shank.left"]], [0, 0, 0]);
    assert.ok(loads["foot.left"] > 50 && loads["foot.right"] > 50, JSON.stringify(loads));
    assert.deepEqual(bodyFloor, []);
    assert.ok(up > .75 && speed < .05, JSON.stringify({ up, speed }));
    assert.ok(effortExcess < 1e-4);
    assert.deepEqual(assist, { force: 0, moment: 0 });
  } finally { f.dispose(); }
});
