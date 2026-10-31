/**
 * **A world a worker steps is Node's world** (Node, core world, the game's engine, 120 Hz). The
 * worker's own code (`serve`, `src/worker/serve.ts`) is driven through one end of a message channel,
 * as a page drives it, capped at 2 s, stepped from the console, then run in real time with each step
 * made slow on purpose and then not, so the world falls behind and catches up, then stepped from the
 * console to its end. Every step's frame arrives, in order and none twice, and the poses they carry
 * digest to what the same recipe gives built in-process and stepped to its end; the verdict told
 * beside the frames is the in-process bout's. A team bout of two Option Mind Warriors a side is held
 * to `buildTeamBout`; a duel as the Arena plays it (`duelStage`), a side led by a person's keys and
 * pointer as it runs, is held to `buildBout` under the Arena's playback (`arenaPlayback`) playing
 * the tape the worker kept, which the person's lead changed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";

const { serve } = await import("../src/worker/serve.ts");
const { frameLayout, BODY_HEAD, SEGMENT_ROW } = await import("../src/worker/frame.ts");
const { buildBout, buildTeamBout } = await import("../src/evaluation/bout.ts");
const { traceOf } = await import("../src/evaluation/trace.ts");
const { Sha256 } = await import("../src/evaluation/sha256.ts");
const { crowdFight } = await import("../src/arena/team-bout.ts");
const { arenaPlayback } = await import("../src/arena/playback.ts");

Logger.LogLevels = Logger.NoneLogLevel;

const crowd = crowdFight(3);
const TEAM = { ...crowd, left: { ...crowd.left, count: 2 }, right: { ...crowd.right, count: 2 }, capSeconds: 2 };
const DUEL = { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 2 };

/** Wait `ms` of real time. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build `start` in a worker on a channel and play it to its end: 30 steps from the console, then
 * run in real time, each step 15 ms dearer for 400 ms, `meanwhile` told the page's end once the
 * world runs; then held, and the rest stepped from the console. What the page heard, and the bout's tape.
 */
async function played(start, meanwhile = async () => {}) {
  const { port1: page, port2: worker } = new MessageChannel();
  let closed = false;
  serve(worker, () => { closed = true; worker.close(); });
  const heard = { ready: null, frames: [], verdict: null, faults: [], stepped: 0, tape: null };
  page.on("message", (message) => {
    switch (message.kind) {
      case "ready": heard.ready = message; return;
      case "frame": heard.frames.push(message.frame); if (message.news?.verdict) heard.verdict = message.news.verdict; return;
      case "news": return;
      case "stepped": heard.stepped += 1; return;
      case "tape": heard.tape = message.tape; return;
      case "fault": heard.faults.push(message.message); return;
      default: heard.faults.push(`unknown message ${message.kind}`);
    }
  });
  const until = async (done, ms) => { const end = Date.now() + ms; while (!done() && Date.now() < end && !heard.faults.length) await wait(5); };
  page.postMessage(start);
  await until(() => heard.ready, 20000);
  assert.deepEqual(heard.faults, []);
  assert.ok(heard.ready, "the worker built no stage");
  page.postMessage({ kind: "step", steps: 30 });
  await until(() => heard.stepped === 1, 20000);
  page.postMessage({ kind: "burden", ms: 15 });
  page.postMessage({ kind: "run", running: true });
  await Promise.all([meanwhile(page), wait(400).then(() => page.postMessage({ kind: "burden", ms: 0 }))]);
  page.postMessage({ kind: "run", running: false });
  page.postMessage({ kind: "step", steps: 1e6 });
  await until(() => heard.stepped === 2, 20000);
  page.postMessage({ kind: "tape" });
  await until(() => heard.tape, 2000);
  page.postMessage({ kind: "stop" });
  await until(() => closed, 2000);
  page.close();
  assert.deepEqual(heard.faults, []);
  assert.ok(heard.verdict && closed, `the bout gave no verdict in the worker, or it did not close: ${JSON.stringify(heard.verdict)}`);
  assert.ok(heard.frames.some((frame) => frame[2] < 0.9), "no frame ran behind real time");
  return heard;
}

/** The digest of the poses `frames` carry, as `traceOf` takes them, and that every step's frame came once, in order. */
function framesDigest({ ready: { roster, frame: first }, frames }) {
  const { offsets, length } = frameLayout(roster);
  assert.deepEqual(frames.map((frame) => frame[1]), frames.map((_, k) => k + 1));
  assert.ok(frames.every((frame) => frame.length === length));
  const moved = Math.max(...offsets.map((at) => Math.abs(frames.at(-1)[at + 3] - first[at + 3]) + Math.abs(frames.at(-1)[at + 5] - first[at + 5])));
  assert.ok(moved > 0.1, `the bodies moved ${moved} m`);
  const hash = new Sha256(), row = new Float64Array(7), bytes = new Uint8Array(row.buffer);
  for (const frame of frames) roster.forEach((body, b) => {
    for (let s = 0; s < body.segments.length; s++) {
      const at = offsets[b] + BODY_HEAD + s * SEGMENT_ROW;
      row.set(frame.subarray(at, at + 7)); hash.update(bytes);
    }
  });
  return hash.hex().slice(0, 16);
}

/** `bout`'s bodies stepped in-process until `done`: their digest, the steps and the verdict. */
function stepped(world, bout, builts, done) {
  const trace = traceOf(builts);
  let steps = 0;
  while (!done()) { world.step(); trace.take(); steps++; }
  return { digest: trace.digest(), steps, verdict: bout.verdict };
}

test("a team bout stepped in its worker digests to Node's, step for step, slow or not", async () => {
  const heard = await played({ kind: "team", recipe: TEAM, aftermath: 0 });
  const sent = framesDigest(heard);
  const { world, bout, dispose } = await buildTeamBout(TEAM);
  assert.deepEqual(heard.ready.roster.map(({ id, segments }) => ({ id, segments })), bout.members.map((member) => ({ id: member.id, segments: [...member.built.segments.keys()] })));
  const node = stepped(world, bout, bout.members.map((member) => member.built), () => bout.verdict && bout.clock >= bout.verdict.time);
  dispose();
  assert.equal(heard.frames.length, node.steps);
  assert.deepEqual(heard.verdict, node.verdict);
  assert.equal(sent, node.digest);
});

test("a duel a person leads in its worker replays in Node from the tape it kept", async () => {
  const start = { recipe: DUEL, tape: [], played: null, person: "left", hold: false, traced: false, beside: null };
  const heard = await played({ kind: "duel", start }, async (page) => {
    await wait(150);
    const ray = { origin: [0, 3, 6], direction: [0, -0.6, -0.8], length: 50 };
    page.postMessage({ kind: "input", input: { kind: "lead", lead: { keys: { x: 0, z: -1 }, walk: true, ray, attacking: false } } });
    await wait(300);
    page.postMessage({ kind: "input", input: { kind: "lead", lead: null } });
  });
  assert.ok(heard.tape.some((entry) => entry.side === "left" && entry.orders?.move), `the tape kept no move of the person's: ${JSON.stringify(heard.tape)}`);
  const sent = framesDigest(heard);
  const replay = async (tape) => {
    const { world, duel, dispose } = await buildBout(DUEL);
    const playback = arenaPlayback(duel);
    duel.play(tape);
    const node = stepped(world, duel, ["left", "right"].map((side) => duel.duelists[side].built), () => playback.done);
    dispose();
    return node;
  };
  const node = await replay(heard.tape), unordered = await replay([]);
  assert.equal(heard.frames.length, node.steps);
  assert.deepEqual(heard.verdict, node.verdict);
  assert.equal(sent, node.digest);
  assert.notEqual(unordered.digest, node.digest, "the orders changed nothing");
});
