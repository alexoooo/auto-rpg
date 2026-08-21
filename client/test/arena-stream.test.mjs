// The arena stream: the three messages, the chunk boundary, and the two constants.
//
// **A suite of its own rather than more of `worker-protocol.test.mjs`.** That
// file is the whole v2 protocol -- the game session, the pool, the command queue
// and the arena's request correlation -- and what is here is one channel's
// arithmetic: where a chunk begins, what its index words are relative to, and
// what the two cadence constants are bounded by. It is also the file two sessions
// would otherwise have been writing at once.
//
// The wasm is not a dependency here. `wasm-memory.test.mjs` drives the real
// artifact and carries the byte-for-byte comparison against `lab trace`; this
// file drives a scripted publication feed, so the rows are ones it chose and the
// failures are about the transport rather than about a simulation.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tools", "arena-stream-test");
fs.mkdirSync(OUT, { recursive: true });
const tsc = spawnSync(process.execPath, [
  path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
  "--ignoreConfig",
  "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
  "--ignoreDeprecations", "6.0",
  "--strict", "--skipLibCheck", "--outDir", OUT, "--rootDir", ROOT,
  "client/src/protocol/abi.generated.ts", "client/src/protocol/messages.ts",
  "client/src/runtime/sim-worker-host.ts", "client/src/runtime/arena-config.ts",
  "client/src/runtime/arena-recorder.ts", "client/src/runtime/arena-client.ts",
  "client/src/fight/live.ts",
], { cwd: ROOT, encoding: "utf8" });
assert.equal(tsc.status, 0, `TypeScript test compilation failed:\n${tsc.stdout}\n${tsc.stderr}`);

const require = createRequire(import.meta.url);
const ABI = require(path.join(OUT, "client/src/protocol/abi.generated.js"));
const MSG = require(path.join(OUT, "client/src/protocol/messages.js"));
const CONFIG = require(path.join(OUT, "client/src/runtime/arena-config.js"));
const RECORDER = require(path.join(OUT, "client/src/runtime/arena-recorder.js"));
const { SimWorkerHost } = require(path.join(OUT, "client/src/runtime/sim-worker-host.js"));
const { ArenaClient } = require(path.join(OUT, "client/src/runtime/arena-client.js"));
const { StreamingFightSource } = require(path.join(OUT, "client/src/fight/live.js"));

const settle = async () => { for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); };
const CHUNK = MSG.ARENA_STREAM_CHUNK_TICKS;

// ------------------------------------------------------------- the fake arena
//
// Two bodies publishing one pose row each a tick, with a death that takes the
// count to one -- which is the whole reason the index exists and therefore the
// thing a chunk boundary is most likely to get wrong.

class FakeArena {
  constructor({ ticks = 8, deathTick = null, eventsPerTick = 1, projectileAt = null } = {}) {
    this.ticks = ticks;
    this.deathTick = deathTick;
    this.eventsPerTick = eventsPerTick;
    this.projectileAt = projectileAt;
    this.now = 0;
    this.config = null;
    this.starts = 0;
  }
  warmUp() { return 0; }
  checkpointDigest() { return null; }
  writeConfig(bytes) { this.config = Uint8Array.from(bytes); }
  start(seed) { this.starts += 1; this.seed = seed; this.now = 0; return 1; }
  fingerprint() { return "0x00000000deadbeef"; }
  policy(faction) { return this.config[8 + faction * 56 + 1]; }
  // Read out of the staged bytes and not out of a field, so the read-back in
  // the drive is a claim about the encoder rather than a value compared with
  // itself.
  control(faction) { return this.config[8 + faction * 56 + 2]; }
  armMinReach() { return 16_384; }
  replayBaseline() { return Uint8Array.of(0); }
  stateDigest() { return { domain: 2, schema: 1, lo: 0, hi: 0 }; }
  tick() { return this.now; }
  step() { if (this.now < this.ticks) this.now += 1; }
  bodies() { return this.deathTick !== null && this.now >= this.deathTick ? 1 : 2; }
  read() {
    const bodies = this.bodies();
    const poses = new Uint32Array(bodies * ABI.POSE_STRIDE);
    for (let body = 0; body < bodies; body += 1) {
      const at = body * ABI.POSE_STRIDE;
      poses[at + ABI.POSE_ENTITY_INDEX] = this.deathTick !== null && bodies === 1 ? 1 : body;
      poses[at + ABI.POSE_ENTITY_GENERATION] = 1;
      // The tick and the slot, so a frame decoded out of the wrong chunk or the
      // wrong row is a value this file can name rather than a plausible number.
      poses[at + ABI.POSE_BODY_X] = this.now * 1000 + body;
      poses[at + ABI.POSE_INTENT] = 1;
    }
    const regions = new Uint32Array(bodies * ABI.REGIONS_PER_BODY * ABI.REGION_STRIDE);
    for (let row = 0; row < bodies * ABI.REGIONS_PER_BODY; row += 1) {
      regions[row * ABI.REGION_STRIDE + ABI.REGION_PRESENT] = 1;
    }
    const events = new Uint32Array(this.eventsPerTick * ABI.COMBAT_EVENT_STRIDE);
    for (let row = 0; row < this.eventsPerTick; row += 1) {
      events[row * ABI.COMBAT_EVENT_STRIDE + ABI.COMBAT_EVENT_TICK] = this.now;
      events[row * ABI.COMBAT_EVENT_STRIDE + ABI.COMBAT_EVENT_A_INDEX] = row;
    }
    const projectileRows = this.projectileAt === this.now ? 1 : 0;
    const projectiles = new Uint32Array(projectileRows * ABI.ARTICULATED_PROJECTILE_STRIDE);
    if (projectileRows !== 0) {
      projectiles[ABI.ARTICULATED_PROJECTILE_SLOT] = 4;
      projectiles[ABI.ARTICULATED_PROJECTILE_GENERATION] = 7;
      projectiles[ABI.ARTICULATED_PROJECTILE_POSITION_X] = 1234;
    }
    const stances = new Uint32Array(bodies * RECORDER.EMBODIED_STANCE_STRIDE);
    for (let body = 0; body < bodies; body += 1) {
      const at = body * RECORDER.EMBODIED_STANCE_STRIDE;
      stances[at] = poses[body * ABI.POSE_STRIDE + ABI.POSE_ENTITY_INDEX];
      stances[at + 1] = poses[body * ABI.POSE_STRIDE + ABI.POSE_ENTITY_GENERATION];
      stances[at + 2] = this.now;
    }
    return {
      poseRows: bodies, regionRows: bodies * ABI.REGIONS_PER_BODY,
      projectileRows, eventRows: this.eventsPerTick,
      posesDropped: 0, regionsDropped: 0, projectilesDropped: 0, eventsDropped: 0,
      poses, regions, projectiles, events, stances,
      alive: bodies === 1 ? [1, 0] : [1, 1],
      health: bodies === 1 ? [65_536, 0] : [65_536, 32_768],
      maxHealth: [65_536, 65_536],
      arena: [24 * 65_536, 16 * 65_536],
      stancesDropped: 0,
      commandRows: 0, commands: new Uint8Array(0), commandsDropped: 0,
    };
  }
}

class FakeWasm {
  constructor(arena) { this.arena = arena; }
  init() {}
  setControl() {}
  control() { return 0; }
  setInput() {}
  spawnMonster() { return 0; }
  swapInHero() { return 0; }
  step() {}
  tick() { return 0; }
  readPublication() { throw new Error("an arena session has no legacy publication"); }
}

const arenaConfig = ({ maxTicks = 3_600, seed = 3, policies = [0, 1] } = {}) => ({
  fighters: [0, 1].map((side) => ({
    anatomy: side,
    policy: policies[side],
    control: CONFIG.ARENA_CONTROL_POLICY,
    spawn: CONFIG.SHIPPED_SPAWNS[side],
    hands: [CONFIG.HAND_ITEMS.sword, CONFIG.HAND_ITEMS.shield],
    twoHanded: false,
  })),
  maxTicks,
  seed,
});

/** Drive the recorder directly and keep everything it posted. */
async function stream(arena, config = arenaConfig({ maxTicks: 200 }), cancelled = () => false) {
  const chunks = [];
  let opened = null;
  const result = await RECORDER.recordArenaFight(
    arena, config, CONFIG.encodeArenaConfig(config), null,
    {
      onOpened: (message) => { opened = message; },
      onChunk: (chunk) => { chunks.push(chunk); },
      yieldToMessages: async () => {},
    },
    cancelled,
  );
  return { opened, chunks, result };
}

/** A source with every chunk adopted, as `ArenaClient` builds one. */
function sourceOf(opened, chunks, finished = null) {
  const source = new StreamingFightSource(opened);
  for (const chunk of chunks) source.adopt(chunk);
  if (finished !== null) source.finish(finished);
  return source;
}

function arenaHost(arena) {
  const sent = [];
  const host = new SimWorkerHost(() => new FakeWasm(arena),
    (message, transfer = []) => sent.push({ message, transfer }), () => {});
  return { host, sent };
}

function startMessage(config, requestId = 1) {
  return {
    kind: "arenaStart", version: MSG.WORKER_PROTOCOL_VERSION, requestId,
    seed: config.seed, config: CONFIG.encodeArenaConfig(config).buffer, checkpoint: null,
  };
}

const kinds = (sent) => sent.map((entry) => entry.message.kind);

class FakeWorker {
  constructor() { this.sent = []; this.listeners = []; this.terminateCalls = 0; }
  addEventListener(kind, listener) { if (kind === "message") this.listeners.push(listener); }
  postMessage(message, transfer = []) { this.sent.push({ message, transfer }); }
  terminate() { this.terminateCalls += 1; }
  emit(data) { for (const listener of this.listeners) listener({ data }); }
}

// ------------------------------------------------------------ the two constants

test("the_stream_chunk_is_bounded_from_both_sides", () => {
  // **Both ends, and the two ends are different costs**, which is why one
  // inequality would not be a bound: a rule of the form "at least 2" is
  // satisfied by 300, and 300 is the wait this session exists to remove.
  // The cadence was measured for the shipped one-minute fight. Session 07
  // widened the selectable recording cap to ten minutes without changing the
  // default whose interactive delivery this bracket protects.
  const framesInAFight = CONFIG.ARENA_DEFAULT_TICKS + 1;
  // The slowest of the four pairings measured in `arena-recorder.ts`, which is
  // the one `populatePolicies` selects in both controls -- so it is the rate the
  // page actually opens on rather than the flattering one.
  const slowestTicksPerSecond = 3_816;
  const messagesPerFight = (chunk) => Math.ceil(framesInAFight / chunk);
  const msOfFightPerChunk = (chunk) => (chunk / slowestTicksPerSecond) * 1_000;

  // Below: a chunk small enough that the duel is mostly `postMessage`. Eight
  // buffer allocations and one structured clone per chunk, 3,601 of each at a
  // chunk of one.
  assert.ok(messagesPerFight(CHUNK) <= 200,
    `a ${CHUNK}-tick chunk posts ${messagesPerFight(CHUNK)} messages a duel`);
  // Above: production time before the page has anything to draw, which is what
  // the 100 ms acceptance is spent on. A whole `RECORDING_CHUNK_TICKS` is 79 ms
  // of fight at this rate and is the old wait in smaller units.
  assert.ok(msOfFightPerChunk(CHUNK) <= 10,
    `a ${CHUNK}-tick chunk is ${msOfFightPerChunk(CHUNK).toFixed(1)} ms of production`);

  // **The bracket, demonstrated rather than asserted in a comment.** Each of
  // these fails exactly one of the two rules above, so neither rule is doing all
  // the work and the pair admits [19, 38] around the chosen 30.
  const admitted = (chunk) => messagesPerFight(chunk) <= 200 && msOfFightPerChunk(chunk) <= 10;
  assert.ok(!admitted(1), "a chunk of one tick must be refused by the message cost");
  assert.ok(!admitted(18), "the lower bound is loose enough to admit 18");
  assert.ok(!admitted(39), "the upper bound is loose enough to admit 39");
  assert.ok(!admitted(RECORDER.RECORDING_CHUNK_TICKS),
    "the old cancel window must not be admissible as a delivery cadence");
  assert.ok(admitted(CHUNK), "the chosen value must be inside its own bracket");

  // And the two numbers are no longer one number, which is the whole of what
  // this session did to `RECORDING_CHUNK_TICKS`.
  assert.notEqual(CHUNK, RECORDER.RECORDING_CHUNK_TICKS);
  assert.ok(CHUNK < RECORDER.RECORDING_CHUNK_TICKS,
    "a chunk larger than the cancel window would be posted after the cancel check");
});

test("the_stream_lead_is_bounded_from_both_sides", () => {
  const lead = MSG.ARENA_STREAM_LEAD_TICKS;
  // Below: at zero the playhead meets the producer at every chunk boundary and
  // the fight stutters once a chunk -- 121 times over a duel.
  assert.ok(lead > 0, "a lead of zero is no lead");
  // Above: at a whole chunk the page waits out one chunk's production before
  // every chunk it plays, which is the old wait in smaller units.
  assert.ok(lead < CHUNK, `a lead of ${lead} against a ${CHUNK}-tick chunk is the old wait`);
  // Half a chunk is the smallest lead that survives one late chunk, and that is
  // a value rather than a range: a lead of half means the playhead has a whole
  // chunk's worth of frames in hand when the next one is due.
  assert.equal(lead * 2, CHUNK);
});

// ------------------------------------------------------ the chunk and its index

test("a_chunk_whose_index_starts_are_not_chunk_relative_is_refused_at_adopt", async () => {
  const { opened, chunks } = await stream(new FakeArena({ ticks: CHUNK * 3 }));
  assert.ok(chunks.length >= 2, "the fixture must produce a chunk that is not the first");

  // The honest stream first, so the refusal below is about the bend and not
  // about a fixture that never worked.
  assert.ok(sourceOf(opened, chunks) instanceof StreamingFightSource);

  // **The exact mistake, made on purpose.** Chunk 1's first frame begins at
  // whole-fight pose row `CHUNK * 2` and at chunk-relative row 0; writing the
  // former is what a producer that forgot to rebase would do, and `subarray`
  // would clamp rather than throw, so the reader would draw a body out of `NaN`
  // instead of refusing.
  const wholeFightStart = chunks[0].frameCount * 2;
  assert.ok(wholeFightStart > 0);
  const bent = { ...chunks[1], index: chunks[1].index.slice(0) };
  new Uint32Array(bent.index)[RECORDER.INDEX_POSE_START] = wholeFightStart;
  const source = new StreamingFightSource(opened);
  source.adopt(chunks[0]);
  assert.throws(() => source.adopt(bent), /addresses pose rows/);

  // The other four sections, so the check is over the index and not over one
  // word of it.
  for (const [word, what] of [
    [RECORDER.INDEX_REGION_START, /addresses region rows/],
    [RECORDER.INDEX_PROJECTILE_COUNT, /addresses projectile rows/],
    [RECORDER.INDEX_EVENT_START, /addresses combat-event rows/],
    [RECORDER.INDEX_STANCE_START, /addresses stance rows/],
  ]) {
    const other = { ...chunks[1], index: chunks[1].index.slice(0) };
    new Uint32Array(other.index)[word] = 100_000;
    const fresh = new StreamingFightSource(opened);
    fresh.adopt(chunks[0]);
    assert.throws(() => fresh.adopt(other), what);
  }

  // And a chunk that does not continue the fight at all, which is the same
  // arithmetic one level up: a hole would decode as somebody else's tick.
  const gap = new StreamingFightSource(opened);
  gap.adopt(chunks[0]);
  assert.throws(() => gap.adopt(chunks[2]), /does not continue a fight/);
});

test("a_streamed_fight_decodes_frame_for_frame_as_one_message_would_have", async () => {
  // **The transport changed and the fight must not have.** A chunked fight and
  // the same fight delivered in one piece have to decode to the same frames, or
  // "streaming is a transport change" is a claim nothing checks. The one-piece
  // side is built by handing the source a single chunk covering the whole fight,
  // which is what `LiveFightSource` used to be.
  const arena = new FakeArena({ ticks: CHUNK * 4 + 7, deathTick: CHUNK * 2 + 3, projectileAt: 5 });
  const { opened, chunks, result } = await stream(arena);
  assert.equal(result.ok, true);
  const streamed = sourceOf(opened, chunks, result.finished);

  const whole = await stream(new FakeArena({
    ticks: CHUNK * 4 + 7, deathTick: CHUNK * 2 + 3, projectileAt: 5,
  }), arenaConfig({ maxTicks: 200 }));
  // One chunk of the same fight, assembled out of the chunks the drive posted --
  // which is only possible because the rebase is invertible.
  const single = joinChunks(whole.opened, whole.chunks);
  const oneMessage = sourceOf(whole.opened, [single], whole.result.finished);

  assert.equal(streamed.frameCount(), oneMessage.frameCount());
  assert.ok(streamed.frameCount() > CHUNK * 4, "the fixture must span several chunks");
  for (let frame = 0; frame < streamed.frameCount(); frame += 1) {
    assert.deepEqual(streamed.frameAt(frame), oneMessage.frameAt(frame), `frame ${frame}`);
  }
  // The death, named, because it is the frame where a stride-based reader goes
  // wrong and therefore the one a chunk boundary is most likely to hide.
  assert.equal(streamed.frameAt(arena.deathTick).poses.length, 1);
  assert.equal(streamed.frameAt(arena.deathTick - 1).poses.length, 2);
});

/** Every chunk's rows in one chunk, with the starts put back where they were. */
function joinChunks(opened, chunks) {
  const sections = [
    ["poses", opened.poseStride, RECORDER.INDEX_POSE_START],
    ["regions", opened.regionStride, RECORDER.INDEX_REGION_START],
    ["projectiles", opened.articulatedProjectileStride, RECORDER.INDEX_PROJECTILE_START],
    ["events", opened.combatEventStride, RECORDER.INDEX_EVENT_START],
    ["stances", opened.embodiedStanceStride, RECORDER.INDEX_STANCE_START],
    ["commands", opened.acceptedCommandStride, RECORDER.INDEX_COMMAND_START, Uint8Array],
  ];
  const parts = new Map(sections.map(([name]) => [name, []]));
  const bases = new Map(sections.map(([name]) => [name, 0]));
  const index = [];
  const health = [];
  let frames = 0;
  for (const chunk of chunks) {
    const words = new Uint32Array(chunk.index);
    for (let frame = 0; frame < chunk.frameCount; frame += 1) {
      const at = frame * RECORDER.RECORDING_INDEX_STRIDE;
      const row = words.slice(at, at + RECORDER.RECORDING_INDEX_STRIDE);
      for (const [name, , start] of sections) row[start] += bases.get(name);
      index.push(...row);
    }
    for (const [name, stride, , View = Uint32Array] of sections) {
      const rows = new View(chunk[name]);
      parts.get(name).push(...rows);
      bases.set(name, bases.get(name) + rows.length / stride);
    }
    health.push(...new Int32Array(chunk.health));
    frames += chunk.frameCount;
  }
  const out = {
    firstFrame: 0, frameCount: frames,
    index: Uint32Array.from(index).buffer, health: Int32Array.from(health).buffer,
  };
  for (const [name, , , View = Uint32Array] of sections) out[name] = View.from(parts.get(name)).buffer;
  return out;
}

// ------------------------------------------------------------- the three messages

test("the_worker_posts_one_opening_a_run_of_chunks_and_one_finish", async () => {
  const arena = new FakeArena({ ticks: CHUNK * 2 + 4 });
  const { host, sent } = arenaHost(arena);
  await host.handle(startMessage(arenaConfig({ maxTicks: 200 })));
  const posted = kinds(sent);
  assert.equal(posted[0], "arenaOpened", "the fight is named before a frame of it exists");
  assert.equal(posted.at(-1), "arenaFinished");
  assert.deepEqual(new Set(posted.slice(1, -1)), new Set(["arenaChunk"]));
  assert.equal(posted.filter((kind) => kind === "arenaChunk").length,
    Math.ceil((arena.ticks + 1) / CHUNK));
  // **`arenaProgress` and `fightRecording` are gone**, and their absence is
  // asserted rather than assumed: a chunk already says how far the fight has
  // got, and two messages answering one question is how one of them goes stale.
  assert.equal(posted.filter((kind) => kind === "arenaProgress").length, 0);
  assert.equal(posted.filter((kind) => kind === "fightRecording").length, 0);

  // Eight buffers, transferred, per spectator chunk. The count is read off the message
  // rather than written down: the reference said five for two sessions while
  // the code moved six.
  for (const entry of sent.filter((one) => one.message.kind === "arenaChunk")) {
    assert.deepEqual(entry.transfer, [entry.message.poses, entry.message.regions,
      entry.message.projectiles, entry.message.events, entry.message.stances,
      entry.message.commands, entry.message.index, entry.message.health]);
    assert.equal(entry.transfer.length, 8);
  }
  const opened = sent[0].message;
  assert.equal(opened.spectator, true, "the arena's unfiltered ground truth must say so");
  assert.equal(opened.armMinReach, 16_384);
  assert.equal(opened.outcome, undefined, "an opening message cannot know the outcome");
  const finished = sent.at(-1).message;
  assert.deepEqual([finished.outcome, finished.timedOut, finished.ticks],
    ["Decision(Heroes)", true, arena.ticks]);
  assert.equal(finished.frameCount, arena.ticks + 1,
    "one frame before the first step and one after every step");
});

test("a_cancelled_stream_keeps_the_frames_it_already_delivered", async () => {
  // The cancel lands at the first yield, which is one `RECORDING_CHUNK_TICKS`
  // window in -- so several chunks have already crossed by the time the request
  // is refused, and they are what the reader is left with.
  const arena = new FakeArena({ ticks: RECORDER.RECORDING_CHUNK_TICKS * 3 });
  const { host, sent } = arenaHost(arena);
  const running = host.handle(startMessage(arenaConfig({ maxTicks: 1_200 })));
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await host.handle({ kind: "arenaCancel", version: MSG.WORKER_PROTOCOL_VERSION, requestId: 2 });
  await running;

  const posted = kinds(sent);
  const delivered = posted.filter((kind) => kind === "arenaChunk").length;
  assert.ok(delivered >= Math.floor(RECORDER.RECORDING_CHUNK_TICKS / CHUNK),
    `a cancel after one window delivered only ${delivered} chunks`);
  assert.equal(posted.at(-1), "arenaRejected");
  assert.equal(sent.at(-1).message.reason, "cancelled");
  // **No `arenaFinished`, and that is the honest half of the refusal.** A fight
  // that was stopped has no outcome, and this channel does not invent one.
  assert.equal(posted.filter((kind) => kind === "arenaFinished").length, 0);

  // The frames that did cross are readable, which is what "keeps" means.
  const opened = sent[0].message;
  const chunks = sent.filter((one) => one.message.kind === "arenaChunk")
    .map((one) => one.message);
  const source = sourceOf(opened, chunks);
  assert.equal(source.frameCount(), chunks.reduce((n, c) => n + c.frameCount, 0));
  assert.equal(source.frameAt(source.frameCount() - 1).t, source.frameCount() - 1);
  assert.equal(source.finished, false, "a cancelled fight is not a finished one");
  assert.equal(source.header.outcome, null, "and it reports no outcome");
});

// ------------------------------------------------- the main thread's trust boundary

test("an_arena_chunk_is_refused_at_v1_by_name_rather_than_as_malformed", async () => {
  // **"Your session is a V1 session" and "your message is invalid" are different
  // instructions**, and this channel used to give the second for both: anything
  // that failed the decode was dropped in silence, so a legacy-versioned chunk
  // left the page saying it was still producing a fight that had stopped.
  const worker = new FakeWorker();
  const client = new ArenaClient(() => worker);
  const running = client.run(arenaConfig(), { onOpened: () => {}, onChunk: () => {} });
  await settle();
  const requestId = worker.sent.at(-1).message.requestId;

  worker.emit({ kind: "arenaChunk", version: MSG.LEGACY_WORKER_PROTOCOL_VERSION, requestId,
    firstFrame: 0, frameCount: 1,
    poses: new ArrayBuffer(0), regions: new ArrayBuffer(0), projectiles: new ArrayBuffer(0),
    events: new ArrayBuffer(0), stances: new ArrayBuffer(0), commands: new ArrayBuffer(0),
    index: new ArrayBuffer(0), health: new ArrayBuffer(0) });
  await assert.rejects(running, /arenaChunk needs protocol version 2/);
  await assert.rejects(running, /legacy V1/);

  // **And a correlated malformed V2 chunk is terminal by its own name**, which
  // is what keeps a known response from leaving the page producing forever.
  const second = new FakeWorker();
  const client2 = new ArenaClient(() => second);
  let opened = 0;
  const pending = client2.run(arenaConfig(), { onOpened: () => { opened += 1; }, onChunk: () => {} });
  await settle();
  const id2 = second.sent.at(-1).message.requestId;
  second.emit({ kind: "arenaChunk", version: MSG.WORKER_PROTOCOL_VERSION, requestId: id2,
    firstFrame: 0, frameCount: 1, poses: [0], regions: new ArrayBuffer(0),
    projectiles: new ArrayBuffer(0), events: new ArrayBuffer(0),
    stances: new ArrayBuffer(0), commands: new ArrayBuffer(0),
    index: new ArrayBuffer(0), health: new ArrayBuffer(0) });
  await assert.rejects(pending, /malformed arenaChunk response/);
  assert.equal(opened, 0, "a malformed chunk must not open a fight");
  assert.equal(second.terminateCalls, 1);
});

test("a_stream_that_does_not_declare_itself_spectator_is_refused_at_the_boundary", async () => {
  // The arena publishes unfiltered ground truth -- both fighters are the subject
  // and there is no fog -- which is correct here and a leak the moment this path
  // is copied into the game path. So the exemption rides in the message and is
  // *checked*, at both ends: a field nothing reads is a comment with a type on it.
  const { opened, chunks, result } = await stream(new FakeArena({ ticks: 4 }));
  assert.equal(opened.spectator, true);

  for (const spectator of [undefined, false, 1, "true"]) {
    const worker = new FakeWorker();
    const client = new ArenaClient(() => worker);
    let seen = 0;
    const running = client.run(arenaConfig(), { onOpened: () => { seen += 1; }, onChunk: () => {} });
    await settle();
    const requestId = worker.sent.at(-1).message.requestId;
    const message = { kind: "arenaOpened", version: MSG.WORKER_PROTOCOL_VERSION, requestId,
      ...opened, spectator };
    if (spectator === undefined) delete message.spectator;
    worker.emit(message);
    await assert.rejects(running, /malformed arenaOpened response/);
    assert.equal(seen, 0, `spectator ${String(spectator)} opened a fight`);
    assert.equal(worker.terminateCalls, 1);
  }

  const worker = new FakeWorker();
  const client = new ArenaClient(() => worker);
  let seen = 0;
  const running = client.run(arenaConfig(), { onOpened: () => { seen += 1; }, onChunk: () => {} });
  await settle();
  const requestId = worker.sent.at(-1).message.requestId;
  worker.emit({ kind: "arenaOpened", version: MSG.WORKER_PROTOCOL_VERSION, requestId, ...opened });
  await settle();
  assert.equal(seen, 1);
  for (const chunk of chunks) {
    worker.emit({ kind: "arenaChunk", version: MSG.WORKER_PROTOCOL_VERSION, requestId, ...chunk });
  }
  worker.emit({ kind: "arenaFinished", version: MSG.WORKER_PROTOCOL_VERSION, requestId,
    ...result.finished });
  const source = await running;
  assert.equal(source.header.outcome, result.finished.outcome);

  // The same gate on the consuming side, because the source is constructed
  // straight from an opening in this file and in the studio.
  assert.throws(() => new StreamingFightSource({ ...opened, spectator: false }),
    /does not declare itself a spectator stream/);
});

test("a_chunk_before_an_opening_is_refused_rather_than_read_against_a_guess", async () => {
  // A chunk has no strides of its own: the layout is the opening's, and reading
  // rows against a guessed stride is the `NaN` body this channel refuses
  // everywhere else. So the fight is abandoned by name rather than half-drawn.
  const { chunks } = await stream(new FakeArena({ ticks: 4 }));
  const worker = new FakeWorker();
  const client = new ArenaClient(() => worker);
  const running = client.run(arenaConfig(), { onOpened: () => {}, onChunk: () => {} });
  await settle();
  const requestId = worker.sent.at(-1).message.requestId;
  worker.emit({ kind: "arenaChunk", version: MSG.WORKER_PROTOCOL_VERSION, requestId, ...chunks[0] });
  await assert.rejects(running, /arenaChunk arrived before the fight was opened/);
});
