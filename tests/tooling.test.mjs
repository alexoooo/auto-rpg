import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { learningWorker } from "../research/learning-worker.mjs";
import { workerJobPool, workerJobs } from "../research/worker-jobs.mjs";
import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUILD_IDENTITY_FORM } from "../src/core/world/recording.ts";

/**
 * On uncommitted code each process made its own mark, so a worker's recordings carried another
 * build's identity and were refused. Start a process with no inherited identity and verify its
 * worker thread and child process read the one it made. The gate's runs are on committed code,
 * where every process makes the same mark.
 */
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

/**
 * Reproduce a background environment failure discarded while no request waits; the next trainer
 * request must receive that failure. Skill outcomes do not establish worker error delivery.
 */
test("idle learning-worker errors survive until the next protocol request", async () => {
  const worker = new EventEmitter(); let posted = false; worker.postMessage = () => { posted = true; };
  const server = learningWorker(worker);
  worker.emit("message", { ready: true, observationSize: 1, actionSize: 1 }); await server.ask(null);
  worker.emit("message", { error: "idle failed between trainer requests" });
  assert.deepEqual(await server.ask({ op: "step", actions: [[0]] }), { error: "idle failed between trainer requests" });
  assert.equal(posted, false);
});

/**
 * Reproduce a rejected posture job leaving its worker message listener alive and preventing child
 * exit. The check asserts every owned worker is terminated before failure reaches the caller.
 * A run's results do not show a worker left alive, only a process that does not end.
 */
test("a reported research job failure closes every worker before rejecting", async () => {
  const workers = [];
  await assert.rejects(workerJobs([0, 1], { lanes: 2, create: () => {
    const worker = new Worker('const {parentPort}=require("node:worker_threads");parentPort.on("message",()=>parentPort.postMessage({error:"research job failed"}));', { eval: true });
    workers.push(worker); return worker;
  } }), /research job failed/);
  assert.equal(workers.length, 2);
  assert.ok(workers.every(worker => worker.threadId === -1));
});


/**
 * Closing a pool left queued promises pending and admitted subsequent work. A run closes its pool
 * once its work is done, so none closes it with work queued.
 */
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

/**
 * A worker exit after its sibling completes settles the remaining job and terminates both workers.
 * The fixture requests that exit from the completion callback; skill outcomes do not establish
 * worker cleanup.
 */
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
