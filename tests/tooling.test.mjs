import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { changeOf } from "../scripts/entrant-check.mjs";
import { learningWorker } from "../research/learning-worker.mjs";
import { workerJobPool, workerJobs } from "../research/worker-jobs.mjs";
import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUILD_IDENTITY_FORM } from "../src/core/world/recording.ts";

test("one entrant cannot remove another through the shared registry line", () => {
  const before = 'import { OPTION } from "../entrants/option/index.ts";\nimport { WALKER } from "../entrants/walker/index.ts";\nexport const ENTRANTS = [OPTION, WALKER];';
  const paths = ["src/entrants/option/index.ts", "src/app/entrants.ts"];
  assert.equal(changeOf(paths, { before, after: before.replace("[OPTION, WALKER]", "[OPTION]") }).kind, "mixed");
  assert.equal(changeOf(paths, { before, after: before.replace("[OPTION, WALKER]", "[WALKER]") }).kind, "entrant");
});

test("a build's identity is one for the process, its worker threads and the processes it starts", () => {
  // A process with no identity of its parent's makes one; with a build input not committed, each make differs.
  const module = JSON.stringify(pathToFileURL(fileURLToPath(new URL("../scripts/build-identity.mjs", import.meta.url))).href);
  const script = `
    import { BUILD_IDENTITY } from ${module};
    import { Worker } from "node:worker_threads";
    import { execFileSync } from "node:child_process";
    const thread = await new Promise((done, fail) => {
      const worker = new Worker('import { parentPort } from "node:worker_threads"; import { BUILD_IDENTITY } from ${module}; parentPort.postMessage(BUILD_IDENTITY);', { eval: true });
      worker.once("message", (value) => { void worker.terminate(); done(value); }); worker.once("error", fail);
    });
    const child = execFileSync(process.execPath, ["--input-type=module", "-e", 'import { BUILD_IDENTITY } from ${module}; console.log(BUILD_IDENTITY)'], { encoding: "utf8" }).trim();
    console.log(JSON.stringify({ main: BUILD_IDENTITY, thread, child }));`;
  const env = { ...process.env }; delete env.AUTO_RPG_BUILD_IDENTITY;
  const { main, thread, child } = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env }).trim().split("\n").at(-1));
  assert.match(main, BUILD_IDENTITY_FORM);
  assert.deepEqual({ thread, child }, { thread: main, child: main });
});

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
    const worker = new Worker('const {parentPort,threadId}=require("node:worker_threads");parentPort.on("message",job=>{if(job===0)parentPort.postMessage({result:0,threadId});else if(job==="exit")process.exit(0);});', { eval: true });
    workers.push(worker); return worker;
  }, result: ({ result, threadId }) => {
    completed.push(result);
    const sibling = workers.find(worker => worker.threadId !== threadId);
    assert.ok(sibling, "the fixture needs a live sibling before requesting its exit");
    sibling.postMessage("exit");
    return result;
  } }), /research worker exited/);
  assert.deepEqual(completed, [0]);
  assert.equal(workers.length, 2);
  assert.ok(workers.every(worker => worker.threadId === -1));
});
