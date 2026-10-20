/** Obstacle falls share the Lab's physical path and report failure honestly (Node, Rapier, 120 Hz). */
import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../src/core/models.ts";
import { GROUND_LEVELS, groundEnvironment } from "../src/lab/ground-environment.ts";
import { labAddress, labHref } from "../src/lab/scenarios.ts";
import { groundPlacement, groundPlacementFaults } from "../src/lab/ground-starts.ts";
import { startGround } from "../src/lab/ground-mode.ts";
import { labActor } from "../src/lab/actor.ts";
import { STAND_UP } from "../src/core/mind/config.ts";
import { risingJobs, risingOptions, risingReport } from "../research/rising-bed.mjs";
import { risingTrial } from "../research/rising-trial.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { traceOf } from "./harness/trace.mjs";

test("fall environments round-trip and never extend the canonical target", () => {
  const target = risingJobs(risingOptions(["--target"]));
  assert.equal(target.length, 64);
  assert.ok(target.every(job => job.target && !Object.hasOwn(job, "level")));
  assert.throws(() => risingOptions(["--target", "--obstacles"]), /separate from --target/);
  const jobs = risingJobs(risingOptions(["--obstacles"]));
  assert.equal(jobs.length, 256);
  assert.ok(jobs.every(job => job.obstacle && job.target === false && job.balance === 0 && job.grit === 0));
  assert.equal(new Set(jobs.map(job => `${job.level}/${job.model}/${job.held}/${job.degrees}`)).size, jobs.length);
  const failed = jobs.map(job => ({ ...job, stood: false, verified: null, handback: null, phases: {} }));
  const report = risingReport(failed);
  assert.equal(report.mode, "obstacle falls");
  assert.equal(report.gates, null);
  assert.equal(report.claims.meetsOwnerTarget, "not evaluated by the obstacle suite");
  assert.ok(report.groups.every(group => group.median === 30 && group.stood === 0 && group.all === 16));
  assert.throws(() => risingReport(failed.slice(0, 64), true), /cannot satisfy/);
  for (const level of Object.keys(GROUND_LEVELS)) {
    const address = labAddress(`?scenario=ground&groundLevel=${level}`);
    assert.deepEqual(labAddress(labHref(address)), address);
    assert.equal(address.ground.level, level);
  }
});

test("initial obstacle placements clear their actual shapes, including low furniture tops", () => {
  const spec = modelSpec("workshop-fighter");
  for (const level of Object.keys(GROUND_LEVELS)) for (const start of ["shoved", "placed", "dropped"]) {
    const address = labAddress(`?scenario=ground&groundLevel=${level}&groundStart=${start}&groundPosture=back&seed=4`);
    const placement = groundPlacement(spec, address), environment = groundEnvironment(level);
    assert.deepEqual(groundPlacementFaults(spec, placement, environment.solids), [], `${level}/${start}`);
    if (environment.dropOnTop && start === "placed") assert.equal(placement.position[2], environment.solids[0].centre[2]);
  }
});

test("a fall beside each obstacle is sensed, stays finite and replays without promising a successful rise", async () => {
  const spec = modelSpec("workshop-fighter");
  const play = async level => {
    const address = labAddress(`?scenario=ground&groundLevel=${level}&groundStart=placed&groundPosture=back&seed=4`);
    const stand = await coreStand(spec, groundPlacement(spec, address));
    const run = startGround(labActor(stand.built, stand.world, { mind: { ...address.mind, subs: [STAND_UP] } }), address, { cap: .1 });
    try {
      const trace = traceOf([stand.built]);
      for (let step = 0; step < 16; step++) { stand.step(); trace.take(); }
      assert.deepEqual(run.body.observe().senses.solids, groundEnvironment(level).solids);
      const frame = run.frame();
      assert.ok(frame.down || frame.check.takeover !== null, `${level}: fixture did not reach a fall`);
      assert.equal(frame.level, level);
      for (const part of stand.built.segments.values()) assert.ok([...part.node.position.asArray(), ...part.node.rotationQuaternion.asArray()].every(Number.isFinite));
      return { frame, trace: trace.digest() };
    } finally { run.dispose(); stand.dispose(); }
  };
  for (const level of ["column", "wall", "tomb", "bench"]) assert.deepEqual(await play(level), await play(level), `${level} replay`);
  await assert.rejects(() => risingTrial({ model: "workshop-fighter", held: "empty", seed: 1, start: "shoved", target: true, level: "column" }), /fixes the open floor/);
});
