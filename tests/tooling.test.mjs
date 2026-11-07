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
import { mindSubject } from "../src/evaluation/evaluation.ts";
import { harnessOf, recordedSubject, recordIdentity, recordText, readRecord } from "../src/evaluation/record.ts";
import { compareRecords } from "../src/evaluation/record-comparison.ts";

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

test("paired comparison reads imported null worlds and qualifies missing recipes", () => {
  const play = { target: "travel" }, engine = "rapier-coordinate", harness = harnessOf(engine, 1);
  const environment = "sha256:" + "a".repeat(64), code = "sha256:" + "b".repeat(64);
  const fixture = (id, speed) => {
    const subject = recordedSubject(mindSubject(id, id, { kind: "option" }), play, environment, null, () => code);
    const header = { identity: recordIdentity(code, engine, harness, play), evaluation: "travel", protocol: "minimum", play,
      engine, harness, commit: "c".repeat(40), date: "2026-01-01", schedule: "all",
      pool: { protocol: subject.version.protocol, environment }, subjects: [subject], imported: { source: "native rows" } };
    const line = { subjects: [id], condition: { model: "workshop-fighter", mode: "forward" }, world: null, code,
      key: id, reading: { speed }, digest: id, played: 19, fault: null };
    return { name: id, ...readRecord(recordText(header, [line]), id) };
  };
  const before = fixture("before", 4), after = fixture("after", 5);
  assert.equal(before.lines[0].world, null, "the admitted import must exercise the missing-world path");
  const figures = [{ name: "speed", unit: "m/s", kind: "mean", better: "higher", of: r => r.speed }];
  const report = compareRecords(before, after, "after", "before", figures, []);
  const estimate = value => ({ value, low: value, high: value });
  const difference = { figure: "speed", unit: "m/s", better: "higher", pairs: 1,
    baseline: estimate(4), candidate: estimate(5), difference: estimate(1) };
  const coverage = { units: 1, withinSubject: [], incomplete: [], faults: [], unmatched: [] };
  const described = record => ({ subject: record.name, opponent: null, version: record.header.subjects[0].version.version,
    opponentVersion: null, condition: record.lines[0].condition, keys: [record.lines[0].key] });
  assert.deepEqual(report, {
    baseline: { record: "before", commit: "c".repeat(40), subject: "before" },
    candidate: { record: "after", commit: "c".repeat(40), subject: "after" },
    context: ["imported evidence has incomplete provenance", "a physical recipe is not recorded"],
    coverage: { paired: 1, baseline: coverage, candidate: coverage }, figures: [difference],
    opponents: [{ opponent: null, figures: [difference] }], pairs: [{ baseline: described(before), candidate: described(after) }],
  });
});

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
