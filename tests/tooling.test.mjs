import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { changeOf } from "../scripts/entrant-check.mjs";
import { importRun } from "../scripts/evaluation-import.mjs";
import { hashBuildInputs } from "../scripts/build-identity.mjs";
import { learningWorker } from "../research/learning-worker.mjs";
import { workerJobPool, workerJobs } from "../research/worker-jobs.mjs";
import { Worker } from "node:worker_threads";

const temporary = run => {
  const base = resolve(".tmp/layer-boundaries/tooling"); mkdirSync(base, { recursive: true });
  const folder = mkdtempSync(join(base, "test-"));
  try { return run(folder); } finally { rmSync(folder, { recursive: true }); }
};

test("one entrant cannot remove another through the shared registry line", () => {
  const before = 'import { OPTION } from "../entrants/option/index.ts";\nimport { WALKER } from "../entrants/walker/index.ts";\nexport const ENTRANTS = [OPTION, WALKER];';
  const paths = ["src/entrants/option/index.ts", "src/app/entrants.ts"];
  assert.equal(changeOf(paths, { before, after: before.replace("[OPTION, WALKER]", "[OPTION]") }).kind, "mixed");
  assert.equal(changeOf(paths, { before, after: before.replace("[OPTION, WALKER]", "[WALKER]") }).kind, "entrant");
});

test("historical import refuses a complete count played at undeclared gaps", () => temporary(folder => {
  const configuration = JSON.stringify({ harness: "Node 120 Hz", protocol: { gaps: [1] }, unseen: {} });
  const rows = ["a/model/empty,empty|b/model/empty,empty|99", "b/model/empty,empty|a/model/empty,empty|99"]
    .map(key => ({ key, identity: { configuration, build: "build", protocol: "arena-tournament/1" } }));
  const bytes = Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  writeFileSync(join(folder, "rows.jsonl"), bytes);
  writeFileSync(join(folder, "provenance.json"), JSON.stringify({ file: "rows.jsonl", bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), build: "build", protocol: { name: "arena-tournament/1" },
    harness: "Node 120 Hz", entrants: 2, rows: { tournament: 2, unseen: 0, atCap: 0 } }));
  assert.throws(() => importRun(join(folder, "provenance.json"), process.cwd()), /pair-by-gap schedule/);
}));

test("build source identity canonicalizes included authoring text but preserves binary bytes", () => temporary(folder => {
  for (const suffix of ["py", "ps1", "md", "ts", "gltf"]) {
    const file = `source.${suffix}`; writeFileSync(join(folder, file), "one\ntwo\n");
    const before = hashBuildInputs(folder, [file]); writeFileSync(join(folder, file), "one\r\ntwo\r\n");
    assert.equal(hashBuildInputs(folder, [file]), before, suffix);
  }
  writeFileSync(join(folder, "data.bin"), "one\ntwo\n"); const before = hashBuildInputs(folder, ["data.bin"]);
  writeFileSync(join(folder, "data.bin"), "one\r\ntwo\r\n"); assert.notEqual(hashBuildInputs(folder, ["data.bin"]), before);
}));

test("idle learning-worker errors survive until the next protocol request", async () => {
  const worker = new EventEmitter(); let posted = false; worker.postMessage = () => { posted = true; };
  const server = learningWorker(worker);
  worker.emit("message", { ready: true, observationSize: 1, actionSize: 1 }); await server.ask(null);
  worker.emit("message", { error: "idle failed between trainer requests" });
  assert.deepEqual(await server.ask({ op: "step", actions: [[0]] }), { error: "idle failed between trainer requests" });
  assert.equal(posted, false);
});

test("a reported research job failure closes every worker before rejecting", async () => {
  const workers = [];
  await assert.rejects(workerJobs([0, 1], { lanes: 2, create: () => {
    const worker = new Worker('const {parentPort}=require("node:worker_threads");parentPort.on("message",()=>parentPort.postMessage({error:"research job failed"}));', { eval: true });
    workers.push(worker); return worker;
  } }), /research job failed/);
  assert.equal(workers.length, 2);
  assert.ok(workers.every(worker => worker.threadId === -1));
});


test("closing research workers settles queued work and refuses work after close", async () => {
  const workers = [];
  const pool = workerJobPool({ lanes: 1, create: () => {
    const worker = new Worker('const {parentPort}=require("node:worker_threads");parentPort.on("message",()=>{});', { eval: true });
    workers.push(worker); return worker;
  } });
  const pending = assert.rejects(pool.run([0, 1]), /worker pool closed/);
  await pool.close(); await pending;
  assert.equal(workers.length, 1);
  assert.equal(workers[0].threadId, -1);
  await assert.rejects(pool.run([2]), /worker pool closed/);
});

test("research worker exit after a completed sibling rejects and closes all workers", async () => {
  const workers = [], completed = [];
  await assert.rejects(workerJobs([0, 1], { lanes: 2, create: () => {
    const worker = new Worker('const {parentPort}=require("node:worker_threads");parentPort.on("message",job=>{if(job===0)parentPort.postMessage({result:0});else setTimeout(()=>process.exit(0),30);});', { eval: true });
    workers.push(worker); return worker;
  }, result: ({ result }) => { completed.push(result); return result; } }), /research worker exited/);
  assert.deepEqual(completed, [0]);
  assert.equal(workers.length, 2);
  assert.ok(workers.every(worker => worker.threadId === -1));
});
