import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { sourced } from "../src/core/spec/quantity.ts";
import { Duel } from "../src/arena/duel.ts";
import { traceOf } from "./harness/trace.mjs";
import { freshEngine } from "./harness/core-stand.mjs";
import { characterDefaults } from "../src/core/models.ts";

// Node arena, rapier-coordinate, 120 Hz: immutable physical qualification recipes replay whole.
test("a qualification recipe retains its surface, load rule and bite settings through replay", async () => {
  const recipe = { left: "reptile", right: "reptile", gap: 2, rules: { pointLoad: { threshold: sourced(2, "N", "owner-point-load", "replay fixture"), rate: sourced(.2, "HP/(N s)", "owner-point-load", "replay fixture") } }, surfaces: { jaw: 2 },
    minds: { left: { kind: "quadruped", tuning: { bite: { open: .5 } } }, right: { kind: "quadruped" } } };
  const first = await buildBout(recipe, { physicsEngine: await freshEngine("rapier-coordinate") });
  const twin = await buildBout(recipe, { physicsEngine: await freshEngine("rapier-coordinate") });
  try {
    first.world.step(40);
    const saved = first.duel.save();
    assert.deepEqual(saved.recipe, { ...recipe, attributes: { left: characterDefaults("reptile"), right: characterDefaults("reptile") } });
    for (const side of ["left", "right"]) {
      const jaw = first.duel.duelists[side].built.spec.segments.find(s => s.name === "jaw");
      assert.equal(jaw.surface.stiffness.value, 34000);
      assert.equal(jaw.surface.layer, undefined);
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
    assert.throws(() => new Duel(first.world, { left: "reptile", right: "reptile", contactLayer: { stiffness: 500, dampingRatio: .5 } }), /obsolete contact-layer recipe/);
  } finally { first.dispose(); twin.dispose(); }
});
