/** Compare effort accounting and physical posture traces against an unpacked reference package. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createRapierPhysics, loadRapier } from "../src/core/engine/rapier.ts";
import { createPostureHoldProbe } from "../src/core/tasks/posture-hold.ts";
import { saveState, loadState } from "../src/core/state.ts";

const { values } = parseArgs({ options: { reference: { type: "string" } } });
if (!values.reference) throw new Error("--reference must name the unpacked .6 package directory");
const directory = resolve(values.reference), manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
assert.equal(manifest.version, "0.21.0-auto-rpg.6");
const entry = resolve(directory, manifest.module), R = (await import(pathToFileURL(entry).href)).default;
await R.init();
Logger.LogLevels = Logger.ErrorLogLevel;
const reference = { name: "rapier-coordinate-coulomb", revision: manifest.version,
  createPhysics: (options) => createRapierPhysics(R, options, manifest.version, true, true) };
const installed = await loadRapier(true, true);
console.log(JSON.stringify({ harness: "Node core World, 120 Hz, corrected limits, per-point friction, Warrior, empty hands, no assists",
  reference: manifest.version, referenceEntrySha256: createHash("sha256").update(await readFile(entry)).digest("hex"),
  installed: installed.revision, servoSeconds: .01, speed: 10, activation: 1,
  physicalTrace: "all body observations, omitting only joints.effort", checkpointStep: 240 }));

function run(engine, iterations, posture) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createPostureHoldProbe(scene, engine, { model: "workshop-fighter", posture, hz: 120,
    actuation: "directional", servoSeconds: .01, speed: 10, activation: 1 });
  probe.world.physics.raw.numSolverIterations = iterations;
  try {
    const state = { world: probe.world.state, ...probe.state };
    const physical = createHash("sha256");
    const hashPhysical = (observation) => physical.update(JSON.stringify({ ...observation,
      joints: observation.joints.map(({ effort, ...joint }) => joint) }));
    for (let i = 0; i < 240; i++) { probe.world.step(); hashPhysical(probe.body.observe()); }
    const checkpoint = { physics: probe.world.physics.save(), state: saveState(state) };
    const branch = (first) => {
      const trace = createHash("sha256");
      while (!probe.complete) {
        probe.world.step(); const observation = probe.body.observe();
        trace.update(JSON.stringify(observation)); if (first) hashPhysical(observation);
      }
      return { task: probe.observe().task, state: saveState(state), digest: trace.digest("hex") };
    };
    const result = branch(true);
    probe.world.physics.load(checkpoint.physics); loadState(state, checkpoint.state);
    assert.deepEqual(branch(false), result, `${iterations}/${posture} replay`);
    return { outcome: result.task, physicalDigest: physical.digest("hex"), replayDigest: result.digest, replay: true };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}
for (const iterations of [16, 32, 64, 128, 256]) for (const posture of ["fours", "half-kneel", "squat"]) {
  const before = run(reference, iterations, posture), after = run(installed, iterations, posture);
  assert.equal(after.physicalDigest, before.physicalDigest, `${iterations}/${posture} physical parity`);
  console.log(JSON.stringify({ iterations, posture, before, after }));
}
