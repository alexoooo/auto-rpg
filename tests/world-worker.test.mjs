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
 * the tape the worker kept, which the person's lead changed. A Crypt run (`cryptStage`) whose hero
 * stands until a person draws it a route to the exit, an enemy built on the way, is held to
 * `buildCryptRun` taking the inputs on the tape the worker kept at the steps it kept them.
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
const { buildCryptRun } = await import("../src/worker/crypt-stage.ts");

Logger.LogLevels = Logger.NoneLogLevel;

const crowd = crowdFight(3);
const TEAM = { ...crowd, left: { ...crowd.left, count: 2 }, right: { ...crowd.right, count: 2 }, capSeconds: 2 };
const DUEL = { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 2 };

/** Wait `ms` of real time. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Let the messages already sent be heard: they are taken before an immediate runs. */
const heardOut = () => new Promise((resolve) => setImmediate(resolve));

/**
 * How long the page waits for an answer it asked for, ms: what has not come by then is not coming.
 * The worker shares the page's thread, so a slow build or a long console step delays the answer
 * without losing it; this is many times the slowest seen with the machine loaded.
 */
const PATIENCE_MS = 60000;

/**
 * Build `start` in a worker on a channel and play it to its end: 30 steps from the console, then
 * run in real time, each step 15 ms dearer for 400 ms, `meanwhile` told the page's end once the
 * world runs; then held, and the rest stepped from the console, at most `rest` steps. What the page
 * heard, and the stage's tape. An answer that does not come, or a fault, fails naming what the page
 * waited for; however it ends, the stage is stopped and the channel closed, or the open channel
 * would hold the test's process alive.
 */
async function played(start, meanwhile = async () => {}, rest = 1e6) {
  const { port1: page, port2: worker } = new MessageChannel();
  let closed = false;
  serve(worker, () => { closed = true; worker.close(); });
  const heard = { ready: null, frames: [], verdict: null, crypt: [], faults: [], stepped: 0, tape: null };
  const told = (news) => { if (news?.verdict) heard.verdict = news.verdict; if (news?.crypt) heard.crypt.push(news.crypt); };
  page.on("message", (message) => {
    switch (message.kind) {
      case "ready": heard.ready = message; return;
      case "frame": heard.frames.push(message.frame); told(message.news); return;
      case "news": told(message.news); return;
      case "stepped": heard.stepped += 1; return;
      case "tape": heard.tape = message.tape; return;
      case "fault": heard.faults.push(message.message); return;
      default: heard.faults.push(`unknown message ${message.kind}`);
    }
  });
  /** Wait until `done()`: a fault, or `PATIENCE_MS` without it, fails saying `what` the page waited for. */
  const until = async (what, done) => {
    const end = Date.now() + PATIENCE_MS;
    for (;;) {
      if (!done() && Date.now() >= end) await heardOut();
      if (done()) return;
      assert.deepEqual(heard.faults, [], `the ${start.kind} stage's worker faulted while the page waited for ${what}`);
      assert.ok(Date.now() < end, `the ${start.kind} stage's worker sent no ${what} in ${PATIENCE_MS / 1000} s: ${heard.frames.length} frames heard`);
      await wait(5);
    }
  };
  try {
    page.postMessage(start);
    await until("ready (its stage built)", () => heard.ready);
    page.postMessage({ kind: "step", steps: 30 });
    await until("stepped after the first 30 console steps", () => heard.stepped === 1);
    page.postMessage({ kind: "burden", ms: 15 });
    page.postMessage({ kind: "run", running: true });
    await Promise.all([meanwhile(page), wait(400).then(() => page.postMessage({ kind: "burden", ms: 0 }))]);
    page.postMessage({ kind: "run", running: false });
    page.postMessage({ kind: "step", steps: rest });
    await until(`stepped after the rest of the console steps (at most ${rest})`, () => heard.stepped === 2);
    page.postMessage({ kind: "tape" });
    await until("tape", () => heard.tape);
    page.postMessage({ kind: "stop" });
    await until("close (it was told to stop)", () => closed);
  } finally {
    if (!closed) {
      page.postMessage({ kind: "stop" });
      for (const end = Date.now() + PATIENCE_MS; !closed && Date.now() < end;) await wait(5);
    }
    page.close();
    worker.close();
  }
  assert.deepEqual(heard.faults, []);
  const ended = heard.verdict ?? (heard.crypt.at(-1)?.status === "playing" ? null : heard.crypt.at(-1)?.status);
  assert.ok(ended, `the stage did not end in the worker: ${JSON.stringify(ended)}`);
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

/**
 * A corridor a body wide: the hero at its west end, the exit 6 m east, and a skeleton waiting 19 m
 * east, past the distance a party member wakes it from (`WAKE_METRES`, 16 m) until the hero walks.
 */
function corridor() {
  const size = 24, floor = new Uint8Array(size * size);
  for (let z = 1; z <= 3; z++) for (let x = 1; x <= 22; x++) floor[z * size + x] = 1;
  return { seed: 0, size, floor, rooms: [{ id: 0, centre: { x: 11, z: 2 }, min: { x: 1, z: 1 }, max: { x: 22, z: 3 } }], doors: [], obstacles: [],
    start: { x: 2, z: 2 }, exit: { x: 8, z: 2 }, spawns: [{ x: 21, z: 2 }] };
}

test("a Crypt run a person commands in its worker replays in Node from the tape it kept", async () => {
  const lead = { mode: { keyboard: false, facing: false }, cursor: null, right: 0, up: 0, walk: false, toward: { x: 0, z: 1 } };
  const start = { seed: 0, layout: corridor(), minds: {}, attributes: {}, lead };
  const heard = await played({ kind: "crypt", start }, async (page) => {
    await wait(150);
    const input = (input) => page.postMessage({ kind: "input", input });
    input({ kind: "select", ids: null });
    input({ kind: "lead", lead: { ...lead, mode: { keyboard: false, facing: true }, cursor: { x: 8, z: 2 } } });
    input({ kind: "command", command: { kind: "go", route: { points: [{ x: 3, z: 2 }], drawing: true } } });
    await wait(40);
    input({ kind: "route", points: [{ x: 3, z: 2 }, { x: 5, z: 2.2 }], drawing: true });
    await wait(40);
    input({ kind: "route", points: [{ x: 3, z: 2 }, { x: 5, z: 2.2 }, { x: 8, z: 2 }], drawing: false });
  }, 12000);
  const built = heard.crypt.map((news) => news.actors.find((actor) => actor.id === "enemy-0").built);
  assert.equal(heard.crypt.at(-1).status, "won", `the hero did not reach the exit: ${JSON.stringify(heard.crypt.at(-1))}`);
  assert.ok(!built[0] && built.at(-1), `the enemy was not built while the run played: ${built[0]} then ${built.at(-1)}`);
  assert.deepEqual(heard.tape.map((entry) => entry.input.kind), ["select", "lead", "command", "route", "route"]);
  const sent = framesDigest(heard);
  const { run, apply, dispose } = await buildCryptRun(start);
  const hash = new Sha256(), row = new Float64Array(7), bytes = new Uint8Array(row.buffer);
  let steps = 0, entry = 0;
  while (run.status === "playing") {
    while (heard.tape[entry]?.step === run.world.steps) apply(heard.tape[entry++].input);
    run.step(); steps++;
    heard.ready.roster.forEach((body, b) => {
      const segments = run.actors[b].fighter?.built.segments;
      for (const name of body.segments) {
        const node = segments?.get(name).pose;
        if (node) row.set([node.position.x, node.position.y, node.position.z, node.rotation.x, node.rotation.y,
          node.rotation.z, node.rotation.w]);
        else row.set([0, 0, 0, 0, 0, 0, 1]);
        hash.update(bytes);
      }
    });
  }
  dispose();
  assert.equal(entry, heard.tape.length, "the replay did not reach every input on the tape");
  assert.equal(heard.frames.length, steps);
  assert.equal(sent, hash.hex().slice(0, 16));
});
