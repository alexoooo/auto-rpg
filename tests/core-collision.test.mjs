import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createCollisionProbe } from "../src/core/tasks/collision.ts";
import { foundationJobs } from "../research/control-foundation-trials.mjs";
import { runFoundation, summarizeFoundation } from "../research/control-foundation.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

test("CCD catches a translating or rotating bar against a thin moving defense that the discrete solver misses", async () => {
  const engine = await freshEngine();
  for (const mode of ["linear", "rotate"]) for (const ccd of [false, true]) {
    const rendering = new NullEngine(), scene = new Scene(rendering);
    const probe = createCollisionProbe(scene, engine, { mode, ccd, hz: 120, shieldHeight: 0.25, shieldSpeed: -1, actuation: "directional" });
    try {
      const saved = probe.world.physics.save();
      const rows = [];
      for (let i = 0; i < 5; i++) { probe.world.step(); rows.push(probe.observe()); }
      assert.equal(rows.some((r) => r.contacts.some((c) => c.shield && c.impulse > 0)), ccd, `${mode}, CCD ${ccd}`);
      if (ccd) {
        assert.ok(rows.at(-1).shieldVelocity[0] !== -1, "contact changes the moving defense's momentum");
        assert.ok(rows.some((r) => r.contacts.some((c) => c.pairs.some((p) => p.mine === 0 && p.theirs === 0))));
      } else if (mode === "linear") assert.ok(rows.at(-1).bar[0] > 4.9, "the control tunnels through the defense");
      probe.world.physics.load(saved);
      for (let i = 0; i < 5; i++) {
        probe.world.step();
        const repeated = probe.observe(); repeated.steps -= 5;
        assert.deepEqual(repeated, rows[i], "CCD state restores with physics");
      }
    } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
  }
});

test("the common runner keeps CCD controls separate and samples faster physics at the declared spacing", async () => {
  const jobs = foundationJobs({ suite: "ccd", samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 4);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.replayExact));
  assert.deepEqual(rows.map((r) => r.result.outcome.contacted), [false, true, false, true]);
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 4);
  assert.deepEqual(summary.cells.map((c) => c.success.successes), [0, 1, 0, 1]);
  const faster = foundationJobs({ suite: "ccd", hz: 480, samples: 1, actuation: "directional" });
  const fine = await runFoundation(faster.slice(0, 1), { workers: 1 });
  assert.deepEqual(fine[0].result.outcome.frames.map((f) => f.steps), [4, 8, 12, 16, 20]);
});
