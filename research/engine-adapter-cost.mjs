/** Paired adapter cost and trajectory comparison on one installed solver artifact. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createRapierPhysics, rapierModule } from "../src/core/engine/rapier.ts";
import { buildBout } from "./bout.mjs";
import { traceOf } from "../tests/harness/trace.mjs";

const { values } = parseArgs({ options: { reference: { type: "string" }, runs: { type: "string", default: "3" } } });
const runs = Number(values.runs);
if (!values.reference || !/^[a-f0-9]{7,40}$/.test(values.reference) || !Number.isSafeInteger(runs) || runs < 1) {
  throw new Error("--reference requires a commit hash and --runs a positive integer");
}
const root = fileURLToPath(new URL("../", import.meta.url)), parent = resolve(root, ".tools");
await mkdir(parent, { recursive: true });
const temporary = await mkdtemp(resolve(parent, "adapter-cost-")), file = resolve(temporary, "reference.ts");
try {
  const source = execFileSync("git", ["show", `${values.reference}:src/core/engine/rapier.ts`], { cwd: root, encoding: "utf8" });
  await writeFile(file, source.replace(/from "(\.[^"]+)"/g, (_, relative) =>
    `from ${JSON.stringify(pathToFileURL(resolve(root, "src/core/engine", relative)).href)}`));
  const previous = (await import(pathToFileURL(file).href)).createRapierPhysics, R = await rapierModule();
  Logger.LogLevels = Logger.ErrorLogLevel;
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 12 };
  const play = async (factory) => {
    const bout = await buildBout(recipe, { physicsEngine: { name: "rapier", revision: "adapter-cost", createPhysics: (o) => factory(R, o) } });
    try {
      const trace = traceOf(Object.values(bout.duel.duelists).map((d) => d.built));
      const step = bout.world.physics.step.bind(bout.world.physics);
      let solver = 0, total = 0, count = 0;
      bout.world.physics.step = (dt) => { const start = performance.now(); step(dt); solver += performance.now() - start; };
      while (!bout.duel.verdict) {
        const start = performance.now(); bout.world.step(); total += performance.now() - start;
        trace.take(); count++;
      }
      return { steps: count, digest: trace.digest(), meanStepMs: total / count, meanSolverMs: solver / count };
    } finally { bout.dispose(); }
  };
  await play(previous); await play(createRapierPhysics);
  const rows = [];
  for (let i = 0; i < runs; i++) {
    const order = i % 2 === 0 ? ["reference", "current"] : ["current", "reference"], pair = {};
    for (const adapter of order) pair[adapter] = await play(adapter === "reference" ? previous : createRapierPhysics);
    assert.equal(pair.reference.steps, pair.current.steps);
    assert.equal(pair.reference.digest, pair.current.digest, "adapter change moved the paired bout");
    rows.push(pair);
  }
  console.log(JSON.stringify({ harness: "Node arena core world, Rapier SIMD, 120 Hz, symmetric, no assists",
    node: process.version, reference: values.reference, recipe, warmupPerAdapter: 1,
    note: "same installed solver artifact; alternating paired runs; no browser capacity claim", rows }, null, 2));
} finally { await unlink(file).catch(() => {}); await rmdir(temporary); }
