import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { Duel } from "../src/arena/duel.ts";
import { traceOf } from "./harness/trace.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

// Node arena, rapier-coordinate, 120 Hz: immutable physical qualification recipes replay whole.
test("a qualification recipe retains its layer, surface and bite settings through replay", async () => {
  const recipe = { left: "reptile", right: "reptile", gap: 2, surfaces: { jaw: 2 },
    contactLayer: { stiffness: 250, dampingRatio: .5 },
    minds: { left: { kind: "quadruped", tuning: { bite: { open: .5 } } }, right: { kind: "quadruped" } } };
  const first = await buildBout(recipe, { physicsEngine: await freshEngine("rapier-coordinate") });
  const twin = await buildBout(recipe, { physicsEngine: await freshEngine("rapier-coordinate") });
  try {
    first.world.step(40);
    const saved = first.duel.save();
    assert.deepEqual(saved.recipe, recipe);
    for (const side of ["left", "right"]) {
      const jaw = first.duel.duelists[side].built.spec.segments.find(s => s.name === "jaw");
      assert.equal(jaw.surface.stiffness.value, 34000);
      assert.deepEqual(Object.fromEntries(Object.entries(jaw.surface.layer).map(([k, q]) => [k, q.value])),
        { stiffness: 250, dampingRatio: .5, depth: .008 });
      assert.ok(jaw.contacts.every(c => c.surface.point && c.surface.stiffness.value === 10000000));
    }
    twin.duel.load(saved);
    const trace = run => traceOf(["left", "right"].map(side => run.duel.duelists[side].built));
    const traces = [trace(first), trace(twin)];
    for (let step = 0; step < 40; step++) {
      first.world.step(); twin.world.step(); traces.forEach(t => t.take());
    }
    assert.equal(traces[0].digest(), traces[1].digest());
    assert.deepEqual(twin.duel.save().state, first.duel.save().state);
    for (const contactLayer of [{ stiffness: 0, dampingRatio: 1 }, { stiffness: NaN, dampingRatio: 1 },
      { stiffness: 500, dampingRatio: -1 }, { stiffness: 500, dampingRatio: Infinity }])
      assert.throws(() => new Duel(first.world, { left: "reptile", right: "reptile", contactLayer }), /contact-layer cell/);
  } finally { first.dispose(); twin.dispose(); }
});
