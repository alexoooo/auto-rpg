import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tools", "client-test");
fs.mkdirSync(OUT, { recursive: true });
const tsc = spawnSync(process.execPath, [
  path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
  "--ignoreConfig",
  "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
  "--ignoreDeprecations", "6.0",
  "--strict", "--skipLibCheck", "--outDir", OUT, "--rootDir", ROOT,
  "client/src/protocol/abi.generated.ts", "client/src/protocol/messages.ts",
  "client/src/runtime/buffer-pool.ts", "client/src/state/snapshot.ts",
  "client/src/runtime/sim-worker-host.ts", "client/src/runtime/sim-client.ts",
  "client/src/runtime/arena-config.ts", "client/src/runtime/arena-recorder.ts",
  "client/src/fight/live.ts", "client/src/runtime/arena-client.ts",
], { cwd: ROOT, encoding: "utf8" });
assert.equal(tsc.status, 0, `TypeScript test compilation failed:\n${tsc.stdout}\n${tsc.stderr}`);

const require = createRequire(import.meta.url);
const ABI = require(path.join(OUT, "client/src/protocol/abi.generated.js"));
const MSG = require(path.join(OUT, "client/src/protocol/messages.js"));
const { SimWorkerHost } = require(path.join(OUT, "client/src/runtime/sim-worker-host.js"));
const { SimClient } = require(path.join(OUT, "client/src/runtime/sim-client.js"));
const { parseSnapshot, MAP_UNKNOWN } = require(path.join(OUT, "client/src/state/snapshot.js"));
const CONFIG = require(path.join(OUT, "client/src/runtime/arena-config.js"));
const RECORDER = require(path.join(OUT, "client/src/runtime/arena-recorder.js"));
const { LiveFightSource } = require(path.join(OUT, "client/src/fight/live.js"));
const { ArenaClient } = require(path.join(OUT, "client/src/runtime/arena-client.js"));

/** Let every already-resolved promise run: a run() awaits a fetch before posting. */
const settle = async () => { for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); };

const header = () => {
  const frame = new Float32Array(ABI.FRAME_MAX);
  frame[0] = 4; frame[1] = 4;
  return frame;
};

// ------------------------------------------------------------- the fake arena
//
// A scripted publication feed behind `ArenaWasmAdapter`, so the recorder's own
// behaviour -- the index, the caps, the cancel, the refusals -- is tested against
// rows this file chose rather than against a simulation. The real artifact is
// driven in `wasm-memory.test.mjs`, where the wasm is already a dependency; the
// two together are the split `snapshot.ts` and `sim.worker.ts` already have.
class FakeArena {
  constructor({ ticks = 8, deathTick = null, eventsPerTick = 1, startPacked = 1,
    checkpointPacked = 1, digest = null, projectileAt = null } = {}) {
    this.ticks = ticks;
    this.deathTick = deathTick;
    this.eventsPerTick = eventsPerTick;
    this.startPacked = startPacked;
    this.checkpointPacked = checkpointPacked;
    this.digest = digest;
    this.projectileAt = projectileAt;
    this.now = 0;
    this.config = null;
    this.warmed = 0;
    this.starts = 0;
    this.steps = 0;
  }
  warmUp(_seed, checkpoint) {
    this.warmed += 1;
    return checkpoint === null ? 0 : this.checkpointPacked;
  }
  checkpointDigest() { return this.digest; }
  writeConfig(bytes) { this.config = Uint8Array.from(bytes); }
  start(seed) {
    this.starts += 1;
    this.seed = seed;
    this.now = 0;
    return this.startPacked;
  }
  fingerprint() { return "0x00000000deadbeef"; }
  policy(faction) { return this.config[8 + faction * 56 + 1]; }
  tick() { return this.now; }
  step() {
    this.steps += 1;
    if (this.now < this.ticks) this.now += 1;
  }
  /** Two bodies until `deathTick`, then one -- which is the whole point of the index. */
  bodies() {
    return this.deathTick !== null && this.now >= this.deathTick ? 1 : 2;
  }
  read() {
    const bodies = this.bodies();
    const poses = new Uint32Array(bodies * ABI.POSE_STRIDE);
    for (let body = 0; body < bodies; body += 1) {
      const at = body * ABI.POSE_STRIDE;
      // Identity `index` is the surviving slot, so a reader that indexed by a
      // fixed stride would hand back body 0 where body 1 is published.
      poses[at + ABI.POSE_ENTITY_INDEX] = this.deathTick !== null && bodies === 1 ? 1 : body;
      poses[at + ABI.POSE_ENTITY_GENERATION] = 1;
      poses[at + ABI.POSE_BODY_X] = this.now * 1000 + body;
      poses[at + ABI.POSE_INTENT] = 1;
    }
    const regions = new Uint32Array(bodies * ABI.REGIONS_PER_BODY * ABI.REGION_STRIDE);
    for (let row = 0; row < bodies * ABI.REGIONS_PER_BODY; row += 1) {
      regions[row * ABI.REGION_STRIDE + ABI.REGION_PRESENT] = 1;
    }
    const events = new Uint32Array(this.eventsPerTick * ABI.COMBAT_EVENT_STRIDE);
    const projectileRows = this.projectileAt === this.now ? 1 : 0;
    const projectiles = new Uint32Array(projectileRows * ABI.ARTICULATED_PROJECTILE_STRIDE);
    if (projectileRows !== 0) {
      projectiles[ABI.ARTICULATED_PROJECTILE_SLOT] = 4;
      projectiles[ABI.ARTICULATED_PROJECTILE_GENERATION] = 7;
      projectiles[ABI.ARTICULATED_PROJECTILE_OWNER_INDEX] = 0;
      projectiles[ABI.ARTICULATED_PROJECTILE_OWNER_GENERATION] = 1;
      projectiles[ABI.ARTICULATED_PROJECTILE_POSITION_X] = 1234;
      projectiles[ABI.ARTICULATED_PROJECTILE_VELOCITY_X] = 5678;
      projectiles[ABI.ARTICULATED_PROJECTILE_RADIUS] = 321;
      projectiles[ABI.ARTICULATED_PROJECTILE_REMAINING_RANGE] = 9999;
    }
    for (let row = 0; row < this.eventsPerTick; row += 1) {
      events[row * ABI.COMBAT_EVENT_STRIDE + ABI.COMBAT_EVENT_TICK] = this.now;
      events[row * ABI.COMBAT_EVENT_STRIDE + ABI.COMBAT_EVENT_A_INDEX] = row;
    }
    return {
      poseRows: bodies, regionRows: bodies * ABI.REGIONS_PER_BODY,
      projectileRows, eventRows: this.eventsPerTick,
      posesDropped: 0, regionsDropped: 0, projectilesDropped: 0, eventsDropped: 0,
      poses, regions, projectiles, events,
      alive: bodies === 1 ? [1, 0] : [1, 1],
      health: bodies === 1 ? [65_536, 0] : [65_536, 32_768],
      maxHealth: [65_536, 65_536],
      arena: [24 * 65_536, 16 * 65_536],
    };
  }
}

class FakeWasm {
  constructor(arena = new FakeArena()) {
    this.arena = arena;
    this.now = 0;
    this.calls = [];
    this.frame = header();
    this.frameLength = ABI.HEADER_LEN;
    this.map = Uint8Array.from({ length: 16 }, (_, i) => i);
    this.vis = new Uint8Array(16).fill(2);
    this.furniture = new Uint8Array(ABI.FURNITURE_MAX * ABI.FURNITURE_STRIDE);
    this.furnitureLength = 0;
    this.dungeonObjects = new Uint32Array(ABI.MAX_DUNGEON_OBJECTS * ABI.DUNGEON_OBJECT_STRIDE);
    this.dungeonObjectLength = 0;
    this.focusEntityIndex = ABI.FOCUS_NONE;
    this.focusEntityGeneration = ABI.FOCUS_NONE;
    this.revision = 1;
    this.trap = false;
    this.controlMask = 0;
  }
  init(seed) { this.calls.push(["init", seed]); this.now = 0; }
  setControl(mask) { this.controlMask = mask & 7; this.calls.push(["control", mask]); }
  control() { return this.controlMask; }
  setInput(...values) { this.calls.push(["input", ...values]); }
  setGoto(x, y) { this.calls.push(["goto", x, y, this.now]); }
  clearOrder() { this.calls.push(["withdraw", this.now]); }
  spawnMonster(kind, primary, secondary) { this.calls.push(["spawn", kind, primary, secondary, this.now]); return 7; }
  step(ticks) { if (this.trap) throw new Error("trap"); this.calls.push(["step", ticks, this.now]); this.now += ticks; this.revision++; }
  tick() { return this.now; }
  readPublication() {
    if (this.trap) throw new Error("trap");
    return {
      frameLayoutVersion: ABI.FRAME_LAYOUT_VERSION, headerLength: ABI.HEADER_LEN,
      unitStride: ABI.UNIT_STRIDE, shotStride: ABI.SHOT_STRIDE,
      eventStride: ABI.EVENT_STRIDE, furnitureStride: ABI.FURNITURE_STRIDE,
      dungeonObjectLayoutVersion: ABI.DUNGEON_OBJECT_LAYOUT_VERSION,
      dungeonObjectStride: ABI.DUNGEON_OBJECT_STRIDE,
      frame: this.frame, map: this.map, vis: this.vis, furniture: this.furniture,
      dungeonObjects: this.dungeonObjects,
      frameLength: this.frameLength, mapLength: 16, visLength: 16,
      furnitureLength: this.furnitureLength, mapCols: 4, mapRows: 4,
      dungeonObjectLength: this.dungeonObjectLength, dungeonObjectsDropped: 0,
      mapTileSizeMilli: 1000, mapRevision: this.revision,
      visRevision: this.revision, furnitureRevision: this.revision,
      focusEntityIndex: this.focusEntityIndex, focusEntityGeneration: this.focusEntityGeneration,
    };
  }
  setRows({ units = [], shots = [], events = [] }) {
    this.frame.fill(0); this.frame[0] = 4; this.frame[1] = 4;
    this.frame[6] = units.length; this.frame[7] = shots.length; this.frame[8] = events.length;
    let at = ABI.HEADER_LEN;
    for (const row of units) { this.frame.set(row, at); at += ABI.UNIT_STRIDE; }
    for (const row of shots) { this.frame.set(row, at); at += ABI.SHOT_STRIDE; }
    for (const row of events) { this.frame.set(row, at); at += ABI.EVENT_STRIDE; }
    this.frameLength = at;
  }
}

// Every host-bound helper speaks the current version; `legacy` opens the exact
// V1 session `articulated-mechanical-gate.md` commits v2 to accepting.
const base = (kind, requestId, extra = {}) => ({ kind, version: MSG.WORKER_PROTOCOL_VERSION, requestId, ...extra });
const legacy = (kind, requestId, extra = {}) => ({ kind, version: MSG.LEGACY_WORKER_PROTOCOL_VERSION, requestId, ...extra });
const initMessage = (requestId = 1) => base("init", requestId, { seed: 4 });
const command = (requestId, sequence, targetTick, value, epoch = 1) =>
  base("command", requestId, { epoch, sequence, targetTick, command: value });
const advance = (requestId, elapsedMicros, epoch = 1) => base("advance", requestId, { epoch, elapsedMicros });

async function harness(initialize = true, open = base) {
  const wasm = new FakeWasm();
  const sent = [];
  let closes = 0;
  const host = new SimWorkerHost(() => wasm, (message, transfer = []) => sent.push({ message, transfer }), () => { closes++; });
  if (initialize) await host.handle(open("init", 1, { seed: 4 }));
  return { wasm, sent, host, closeCount: () => closes };
}
const messages = (sent, kind) => sent.map((entry) => entry.message).filter((message) => message.kind === kind);
async function returnSnapshot(host, snapshot, requestId = 900) {
  await host.handle(base("returnSnapshot", requestId, {
    epoch: snapshot.epoch, bufferId: snapshot.bufferId, leaseToken: snapshot.leaseToken, buffer: snapshot.buffer,
  }));
}
const unit = ({ x = 0.5, y = 0.5, visible = 1, index = 1, generation = 2 } = {}) => {
  const row = new Float32Array(ABI.UNIT_STRIDE);
  row[0] = x; row[1] = y; row[9] = index; row[10] = generation; row[28] = visible;
  return row;
};

class FakeWorker {
  constructor() {
    this.sent = [];
    this.listeners = new Map();
    this.terminated = false;
    this.terminateCalls = 0;
  }
  addEventListener(kind, listener) {
    const listeners = this.listeners.get(kind) ?? [];
    listeners.push(listener);
    this.listeners.set(kind, listeners);
  }
  postMessage(message, transfer = []) { this.sent.push({ message, transfer }); }
  terminate() { this.terminated = true; this.terminateCalls++; }
  emitMessage(data) {
    for (const listener of this.listeners.get("message") ?? []) listener({ data });
  }
}

async function clientHarness() {
  const worker = new FakeWorker();
  const client = new SimClient(worker);
  const ready = client.init(4);
  const init = worker.sent.at(-1).message;
  worker.emitMessage({ kind: "ready", version: MSG.WORKER_PROTOCOL_VERSION, requestId: init.requestId,
    cause: "init", epoch: 1, tick: 0, paused: false });
  await ready;
  return { client, worker };
}

async function snapshotPair() {
  const { host, sent } = await harness();
  await host.handle(advance(700, 20_000));
  return messages(sent, "snapshot").slice(0, 2);
}

test("generated_abi_matches_rust_layout", () => {
  assert.equal(ABI.FRAME_MAX, ABI.HEADER_LEN + ABI.MAX_UNITS * ABI.UNIT_STRIDE + ABI.MAX_SHOTS * ABI.SHOT_STRIDE + ABI.MAX_EVENTS * ABI.EVENT_STRIDE);
  assert.equal(ABI.MAP_OFFSET % 4, 0);
  assert.equal(ABI.SNAPSHOT_BUFFER_BYTES % 4, 0);
  const presentationNames = [
    "RAW_ANGLE_TURN", "MAP_TILE_MILLI", "MAP_OPEN", "MAP_SOLID", "MAP_UNKNOWN",
    "UNIT_X", "UNIT_Y", "UNIT_FACING_RAW", "UNIT_RADIUS", "UNIT_HP", "UNIT_MAX_HP",
    "UNIT_FACTION", "UNIT_KIND", "UNIT_INTENT", "UNIT_ENTITY_INDEX", "UNIT_ENTITY_GENERATION",
    "UNIT_LIMB_ANGLE_RAW", "UNIT_LIMB_REACH", "UNIT_LIMB_SPIN", "UNIT_ACTION_LENGTH",
    "UNIT_ACTION_ARC_RAW", "UNIT_HIT_FLASH", "UNIT_BLOCK_FLASH", "UNIT_PARRY_FLASH",
    "UNIT_LIMB_SWING", "UNIT_LIMB_SWING_LEFT", "UNIT_LIMB_LINE_RAW", "UNIT_ACTION_KIND",
    "UNIT_ACTION_ROLE", "UNIT_SLOT", "UNIT_SLOT0_ACTION", "UNIT_SLOT1_ACTION",
    "UNIT_SIGHT_RANGE", "UNIT_VISIBLE", "UNIT_VX", "UNIT_VY", "UNIT_STRIDE_PHASE",
    "UNIT_SWING_SPAN", "SHOT_X", "SHOT_Y", "SHOT_HEADING_RAW", "SHOT_FACTION",
    "EVENT_KIND", "EVENT_X", "EVENT_Y", "EVENT_AMOUNT", "EVENT_ACTOR_INDEX",
    "EVENT_OTHER_INDEX", "EVENT_AUX0", "EVENT_AUX1", "EVENT_DAMAGE", "EVENT_BLOCK",
    "EVENT_PARRY", "EVENT_DECLARE", "EVENT_DEATH", "EVENT_LOOSE", "EVENT_PHASE",
    "EVENT_STEP", "EVENT_SHOVE", "EVENT_PORTAL", "EVENT_DESCEND", "EVENT_KINDS",
    "FURNITURE_KIND", "FURNITURE_TX", "FURNITURE_TY", "FURNITURE_STATE",
    "FURNITURE_DOOR", "FURNITURE_TORCH", "FURNITURE_DOOR_SHUT",
    "FURNITURE_DOOR_OPEN", "TORCH_FACE_POS_X", "TORCH_FACE_POS_Y",
    "DUNGEON_OBJECT_KIND", "DUNGEON_OBJECT_IDENTITY", "DUNGEON_OBJECT_STATE_FLAGS",
    "DUNGEON_OBJECT_X_RAW", "DUNGEON_OBJECT_Y_RAW", "DUNGEON_OBJECT_YAW_RAW",
    "DUNGEON_OBJECT_HALF_X_RAW", "DUNGEON_OBJECT_HALF_Y_RAW", "DUNGEON_OBJECT_HP_RAW",
    "DUNGEON_OBJECT_MAX_HP_RAW", "DUNGEON_OBJECT_PROGRESS_RAW", "DUNGEON_OBJECT_MATERIAL_CODE",
  ];
  for (const name of presentationNames) assert.equal(typeof ABI[name], "number", `${name} is generated`);
  const checker = path.join(ROOT, "tools", "check_abi.js");
  if (fs.existsSync(checker)) assert.equal(spawnSync(process.execPath, [checker], { cwd: ROOT }).status, 0);
});

test("unknown_protocol_versions_fail_closed", async () => {
  const { host, sent, closeCount } = await harness(false);
  await host.handle({ kind: "init", version: 3, requestId: 3, seed: 1 });
  assert.deepEqual(sent.map((x) => [x.message.kind, x.message.code]), [["error", "unknownVersion"], ["terminated", undefined]]);
  assert.equal(closeCount(), 1);
  await host.handle(initMessage(4));
  assert.equal(sent.length, 2);
});

test("wasm_bound_numeric_domains_reject_values_javascript_would_coerce", () => {
  for (const value of [-1, 0x1_0000_0000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(MSG.decodeClientMessage({ ...initMessage(), seed: value }).ok, false);
  }
  for (const field of ["kindCode", "primary", "secondary"]) {
    const spawn = { kind: "spawn", kindCode: 1, primary: 2, secondary: 3, [field]: 1.5 };
    assert.equal(MSG.decodeClientMessage(command(1, 1, 0, spawn)).ok, false);
  }
  assert.equal(MSG.decodeClientMessage(advance(1, 1.5)).ok, false);
  assert.equal(MSG.decodeClientMessage(advance(1, Number.MAX_SAFE_INTEGER)).ok, true);
  assert.equal(MSG.decodeClientMessage(advance(1, Number.MAX_SAFE_INTEGER + 1)).ok, false);
});

test("init_and_reset_emit_the_exact_lifecycle_messages", async () => {
  const { host, sent, wasm } = await harness();
  assert.deepEqual(sent.slice(0, 2).map((x) => x.message.kind), ["ready", "snapshot"]);
  assert.deepEqual(sent[0].message, { kind: "ready", version: MSG.WORKER_PROTOCOL_VERSION, requestId: 1, cause: "init", epoch: 1, tick: 0, paused: false });
  await host.handle(base("reset", 2, { epoch: 1, seed: 9, paused: true, ignored: "yes" }));
  const ready = messages(sent, "ready").at(-1);
  assert.deepEqual(ready, { kind: "ready", version: MSG.WORKER_PROTOCOL_VERSION, requestId: 2, cause: "reset", epoch: 2, tick: 0, paused: true });
  assert.deepEqual(wasm.calls.filter((x) => x[0] === "init"), [["init", 4], ["init", 9]]);
  await host.handle(base("reset", 3, { epoch: 1, seed: 1, paused: false }));
  assert.equal(messages(sent, "error").at(-1).code, "invalidMessage");
});

test("mouse_orders_are_default_and_direct_tank_input_starts_released", async () => {
  const { wasm } = await harness();
  assert.deepEqual(wasm.calls.slice(0, 3), [
    ["init", 4], ["control", 0], ["input", 0, 0, 0, 0, 0, 0, 0],
  ]);
});

test("the_worker_forwards_the_signed_turn_channel_without_coercion", async () => {
  const { host, wasm } = await harness();
  await host.handle(command(2, 1, 0, { kind: "setInput", moveXMilli: 0, moveYMilli: 0,
    turnMilli: -1000, aimRaw: 0, reachMilli: 0, slot: 0, strike: 0 }));
  await host.handle(advance(3, 20_000));
  assert.deepEqual(wasm.calls.filter((call) => call[0] === "input").at(-1),
    ["input", 0, 0, 0, 0, 0, 0, -1000]);
});

test("control_switches_render_wasm_readback_not_requested_state", async () => {
  const { host, sent, wasm } = await harness();
  await host.handle(command(2, 1, 0, { kind: "setControl", mask: 0xffff_ffff }));
  await host.handle(advance(3, 20_000));
  assert.equal(messages(sent, "commandAck").at(-1).result, 7,
    "control switches render wasm readback, not requested state");
  assert.equal(wasm.control(), 7, "the readback, not the requested high bits, is authoritative");
});

test("initialization_is_single_flight_and_cannot_publish_after_fatal_termination", async () => {
  let release;
  let factories = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const sent = [];
  const host = new SimWorkerHost(async () => {
    factories++;
    await gate;
    return new FakeWasm();
  }, (message, transfer = []) => sent.push({ message, transfer }));
  const first = host.handle(initMessage(1));
  await host.handle(initMessage(2));
  assert.equal(factories, 1);
  assert.equal(messages(sent, "error").at(-1).code, "alreadyInitialized");
  release();
  await first;
  assert.deepEqual(messages(sent, "ready").map((message) => message.requestId), [1]);

  let releaseFatal;
  const fatalGate = new Promise((resolve) => { releaseFatal = resolve; });
  const fatalSent = [];
  let closed = 0;
  const fatalHost = new SimWorkerHost(async () => {
    await fatalGate;
    return new FakeWasm();
  }, (message, transfer = []) => fatalSent.push({ message, transfer }), () => { closed++; });
  const pending = fatalHost.handle(initMessage(3));
  await fatalHost.handle({ ...initMessage(4), version: 3 });
  releaseFatal();
  await pending;
  assert.deepEqual(fatalSent.map((entry) => entry.message.kind), ["error", "terminated"]);
  assert.equal(closed, 1);
});

test("fatal_state_ignores_everything_except_a_valid_outstanding_buffer_return", async () => {
  const { host, sent, wasm } = await harness();
  const lease = messages(sent, "snapshot")[0];
  wasm.trap = true;
  await host.handle(advance(2, 20_000));
  const afterFatal = sent.length;
  await host.handle({ kind: "advance", version: 3, requestId: 3 });
  await host.handle({ kind: "returnSnapshot", version: MSG.WORKER_PROTOCOL_VERSION, requestId: 4,
    epoch: lease.epoch, bufferId: 9, leaseToken: lease.leaseToken, buffer: lease.buffer });
  assert.equal(sent.length, afterFatal);
  await returnSnapshot(host, lease, 5);
  assert.deepEqual(sent.slice(-2).map((entry) => entry.message.kind), ["bufferReturned", "terminated"]);
});

test("commands_apply_before_stepping_their_target_tick_in_sequence_order", async () => {
  const { host, sent, wasm } = await harness();
  await host.handle(command(2, 1, 0, { kind: "goto", xMilli: -7, yMilli: 8 }));
  await host.handle(command(3, 2, 0, { kind: "spawn", kindCode: 3, primary: 255, secondary: 255 }));
  await host.handle(advance(4, 20_000));
  assert.deepEqual(wasm.calls.slice(3), [["goto", -7, 8, 0], ["spawn", 3, 255, 255, 0], ["step", 1, 0]]);
  const acks = messages(sent, "commandAck");
  assert.deepEqual(acks.map((ack) => [ack.sequence, ack.status, ack.tick]), [[1, "accepted", 0], [2, "accepted", 0], [1, "applied", 0], [2, "applied", 0]]);
  assert.equal(acks.at(-1).result, 7);
});

test("sequence_gaps_regressions_and_late_targets_are_rejected", async () => {
  const { host, sent } = await harness();
  await host.handle(command(2, 2, 0, { kind: "withdraw" }));
  await host.handle(command(3, 1, 2, { kind: "withdraw" }));
  await host.handle(command(4, 1, 2, { kind: "withdraw" }));
  await host.handle(command(5, 2, 1, { kind: "withdraw" }));
  await host.handle(advance(6, 50_000));
  await host.handle(command(7, 2, 1, { kind: "withdraw" }));
  assert.deepEqual(messages(sent, "commandAck").filter((x) => x.status === "rejected").map((x) => x.reason),
    ["sequenceGap", "duplicateSequence", "regressedTargetTick", "lateTargetTick"]);
});

test("queue_and_future_horizon_limits_reject_without_consuming_sequence", async () => {
  const { host, sent } = await harness();
  await host.handle(command(2, 1, 601, { kind: "withdraw" }));
  await host.handle(command(3, 1, 600, { kind: "withdraw" }));
  for (let sequence = 2; sequence <= 256; sequence++) await host.handle(command(100 + sequence, sequence, 600, { kind: "withdraw" }));
  await host.handle(command(999, 257, 600, { kind: "withdraw" }));
  assert.equal(messages(sent, "commandAck").find((x) => x.requestId === 2).reason, "targetTooFar");
  assert.equal(messages(sent, "commandAck").find((x) => x.requestId === 999).reason, "queueFull");
  assert.equal(host.diagnostics().lastAcceptedSequence, 256);
  assert.equal(host.diagnostics().queueLength, 256);
});

test("paused_advances_apply_current_tick_commands_without_stepping_or_accruing_time", async () => {
  const { host, wasm, sent } = await harness();
  await host.handle(base("setPaused", 2, { epoch: 1, paused: true }));
  await host.handle(command(3, 1, 0, { kind: "withdraw" }));
  await host.handle(advance(4, Number.MAX_SAFE_INTEGER));
  await host.handle(base("setPaused", 5, { epoch: 1, paused: false }));
  await host.handle(advance(6, 1));
  assert.equal(wasm.now, 0);
  assert.deepEqual(wasm.calls.filter((x) => x[0] === "withdraw"), [["withdraw", 0]]);
  assert.equal(messages(sent, "advanceAck").find((x) => x.requestId === 4).steppedTicks, 0);
});

test("reset_rejects_queued_commands_and_advances_the_epoch", async () => {
  const { host, sent } = await harness();
  await host.handle(command(2, 1, 10, { kind: "withdraw" }));
  await host.handle(command(3, 2, 11, { kind: "withdraw" }));
  await host.handle(base("reset", 4, { epoch: 1, seed: 2, paused: false }));
  assert.deepEqual(messages(sent, "commandAck").slice(-2).map((x) => [x.sequence, x.status, x.reason]), [[1, "rejected", "oldEpoch"], [2, "rejected", "oldEpoch"]]);
  assert.equal(host.diagnostics().epoch, 2);
  assert.equal(host.diagnostics().queueLength, 0);
});

test("an_old_epoch_buffer_return_reclaims_its_original_fixed_slot", async () => {
  const { host, sent } = await harness();
  const old = messages(sent, "snapshot")[0];
  await host.handle(base("reset", 2, { epoch: 1, seed: 3, paused: false }));
  await returnSnapshot(host, old, 3);
  const returned = messages(sent, "bufferReturned").at(-1);
  assert.equal(returned.epoch, 2);
  assert.equal(returned.bufferId, old.bufferId);
  assert.equal(host.diagnostics().allocations, 3);
});

test("wrong_buffer_ids_tokens_and_capacities_fail_closed", async () => {
  const { host, sent } = await harness();
  const snapshot = messages(sent, "snapshot")[0];
  await host.handle(base("returnSnapshot", 2, { epoch: 1, bufferId: 9, leaseToken: snapshot.leaseToken, buffer: snapshot.buffer }));
  await host.handle(base("returnSnapshot", 3, { epoch: 1, bufferId: snapshot.bufferId, leaseToken: snapshot.leaseToken + 1, buffer: snapshot.buffer }));
  await host.handle(base("returnSnapshot", 4, { epoch: 1, bufferId: snapshot.bufferId, leaseToken: snapshot.leaseToken, buffer: new ArrayBuffer(4) }));
  assert.deepEqual(messages(sent, "error").slice(-3).map((x) => x.code), ["invalidBufferId", "invalidLeaseToken", "invalidBufferCapacity"]);
});

test("buffer_exhaustion_coalesces_without_allocating_or_blocking_ticks", async () => {
  const { host, sent, wasm } = await harness();
  await host.handle(advance(2, 20_000));
  await host.handle(advance(3, 20_000));
  await host.handle(advance(4, 20_000));
  assert.equal(wasm.now, 3);
  assert.deepEqual(host.diagnostics(), { ...host.diagnostics(), allocations: 3, freeBuffers: 0, outstandingBuffers: 3, queueLength: 0 });
  const first = messages(sent, "snapshot")[0];
  host.setCoalescedSnapshotsForTest(0xffff_ffff);
  await host.handle(advance(5, 20_000));
  assert.equal(host.diagnostics().coalescedSnapshots, 0xffff_ffff);
  assert.equal(host.diagnostics().coalescedSnapshotsSaturated, true);
  await returnSnapshot(host, first);
  const saturated = messages(sent, "snapshot").at(-1);
  assert.equal(saturated.coalescedSnapshots, 0xffff_ffff);
  assert.equal(saturated.coalescedSnapshotsSaturated, true);
  assert.deepEqual([saturated.poolAllocationsTotal, saturated.buffersFree + saturated.buffersOutstanding,
    saturated.queuedCommands], [3, 3, 0]);
});

test("the_coalesced_counter_saturates_reports_and_clears_without_wrapping", async () => {
  const { host, sent } = await harness();
  await host.handle(advance(2, 20_000));
  await host.handle(advance(3, 20_000));
  const first = messages(sent, "snapshot")[0];
  host.setCoalescedSnapshotsForTest(0xffff_ffff);
  await host.handle(advance(4, 20_000));
  assert.deepEqual([host.diagnostics().coalescedSnapshots, host.diagnostics().coalescedSnapshotsSaturated],
    [0xffff_ffff, true]);
  await returnSnapshot(host, first);
  const report = messages(sent, "snapshot").at(-1);
  assert.deepEqual([report.coalescedSnapshots, report.coalescedSnapshotsSaturated], [0xffff_ffff, true]);
  assert.deepEqual([host.diagnostics().coalescedSnapshots, host.diagnostics().coalescedSnapshotsSaturated], [0, false]);
});

test("a_complete_snapshot_contains_one_atomic_frame_map_vis_furniture_and_object_publication", async () => {
  const { host, sent, wasm } = await harness(false);
  wasm.setRows({ units: [unit()] });
  wasm.map.fill(11); wasm.vis.fill(2);
  wasm.furniture.set([1, 1, 1, 7]); wasm.furnitureLength = 1;
  wasm.dungeonObjects.set([3, 0x3000_0007, 0, 98_304, 98_304, 0, 16_384, 16_384, 65_536, 65_536, 0, 2]);
  wasm.dungeonObjectLength = 1;
  await host.handle(initMessage());
  const snapshot = messages(sent, "snapshot")[0];
  const view = parseSnapshot(snapshot);
  assert.equal(view.frame[6], 1);
  assert.equal(view.map[0], 11);
  assert.equal(view.vis[0], 2);
  assert.deepEqual([...view.furniture], [1, 1, 1, 7]);
  assert.deepEqual([...view.dungeonObjects], [3, 0x3000_0007, 0, 98_304, 98_304, 0, 16_384, 16_384, 65_536, 65_536, 0, 2]);
  for (const mutation of [
    { ...snapshot, frameLength: 3.5 }, { ...snapshot, mapCols: 99 },
    { ...snapshot, furnitureLength: ABI.FURNITURE_MAX + 1 },
    { ...snapshot, dungeonObjectLength: ABI.MAX_DUNGEON_OBJECTS + 1 },
  ]) assert.throws(() => parseSnapshot(mutation), RangeError);
});

test("snapshot_lengths_shapes_and_byte_extents_are_validated_before_views_exist", async () => {
  const { sent } = await harness();
  const snapshot = messages(sent, "snapshot")[0];
  for (const mutation of [
    { frameLength: ABI.FRAME_MAX + 1 }, { mapLength: snapshot.mapLength - 1 },
    { visLength: snapshot.visLength - 1 }, { furnitureLength: ABI.FURNITURE_MAX + 1 },
    { dungeonObjectLength: ABI.MAX_DUNGEON_OBJECTS + 1 },
    { bufferId: 3 },
    { poolAllocationsTotal: 4 }, { buffersFree: 3 }, { queuedCommands: 257 },
    { coalescedSnapshotsSaturated: 1 },
  ]) assert.throws(() => parseSnapshot({ ...snapshot, ...mutation }), RangeError);
});

test("unused_snapshot_tails_are_zeroed_before_transfer", async () => {
  const { host, sent, wasm } = await harness();
  const first = messages(sent, "snapshot")[0];
  new Uint8Array(first.buffer).fill(0xaa);
  await returnSnapshot(host, first);
  wasm.setRows({});
  await host.handle(advance(3, 0));
  const reused = messages(sent, "snapshot").find((x) => x.bufferId === first.bufferId && x.leaseToken !== first.leaseToken);
  const bytes = new Uint8Array(reused.buffer);
  const liveFrameBytes = reused.frameLength * 4;
  assert.ok(bytes.subarray(liveFrameBytes, ABI.MAP_OFFSET).every((x) => x === 0));
  assert.ok(bytes.subarray(ABI.FURNITURE_OFFSET + reused.furnitureLength * ABI.FURNITURE_STRIDE).every((x) => x === 0));
});

test("hidden_units_shots_events_furniture_and_objects_do_not_cross_the_worker_boundary", async () => {
  const { host, sent, wasm } = await harness(false);
  const shown = unit({ x: 0.5, y: 0.5, index: 1, generation: 4 });
  const hidden = unit({ x: 2.5, y: 2.5, visible: 0, index: 9, generation: 8 });
  const shotShown = Float32Array.from([0.5, 0.5, 0, 0]);
  const shotHidden = Float32Array.from([2.5, 2.5, 0, 0]);
  const eventShown = Float32Array.from([1, 0.5, 0.5, 0, 1, 9, 0, 0]);
  const eventHidden = Float32Array.from([1, 2.5, 2.5, 0, 9, 1, 0, 0]);
  wasm.setRows({ units: [shown, hidden], shots: [shotShown, shotHidden], events: [eventShown, eventHidden] });
  wasm.frame[2] = 3; wasm.frame[3] = 2.5; wasm.frame[4] = 2.5;
  wasm.focusEntityIndex = 9; wasm.focusEntityGeneration = 8;
  wasm.vis.fill(2); wasm.vis[10] = 0;
  wasm.furniture.set([1, 0, 0, 1, 1, 2, 2, 9]); wasm.furnitureLength = 2;
  wasm.dungeonObjects.set([
    3, 0x3000_0001, 0, 32_768, 32_768, 0, 16_384, 16_384, 65_536, 65_536, 0, 2,
    4, 0x3000_0002, 0, 163_840, 163_840, 0, 16_384, 16_384, 65_536, 65_536, 0, 3,
  ]);
  wasm.dungeonObjectLength = 2;
  await host.handle(initMessage());
  const snapshot = messages(sent, "snapshot")[0];
  const view = parseSnapshot(snapshot);
  assert.deepEqual([view.frame[6], view.frame[7], view.frame[8]], [1, 1, 1]);
  assert.deepEqual([view.frame[3], view.frame[4]], [0, 0]);
  const eventAt = ABI.HEADER_LEN + ABI.UNIT_STRIDE + ABI.SHOT_STRIDE;
  assert.deepEqual([view.frame[eventAt + 4], view.frame[eventAt + 5]], [1, -1]);
  assert.equal(view.map[10], MAP_UNKNOWN);
  assert.deepEqual([...view.furniture], [1, 0, 0, 1]);
  assert.deepEqual([...view.dungeonObjects], [
    3, 0x3000_0001, 0, 32_768, 32_768, 0, 16_384, 16_384, 65_536, 65_536, 0, 2,
  ]);
  const originalRevision = snapshot.mapRevision;
  await returnSnapshot(host, snapshot);
  wasm.map[1] = 77; wasm.vis[1] = 1;
  await host.handle(advance(3, 0));
  const remembered = messages(sent, "snapshot").at(-1);
  assert.notEqual(parseSnapshot(remembered).map[1], 77);
  assert.equal(remembered.mapRevision, originalRevision);
});

test("focus_headers_and_remembered_tiles_do_not_leak_hidden_motion_or_door_changes", async () => {
  const { host, sent, wasm } = await harness(false);
  wasm.setRows({ units: [
    unit({ x: 2.5, y: 2.5, index: 9, generation: 7 }),
    unit({ x: 2.5, y: 2.5, visible: 0, index: 9, generation: 8 }),
  ] });
  wasm.frame[2] = 3; wasm.frame[3] = 2.5; wasm.frame[4] = 2.5;
  wasm.focusEntityIndex = 9; wasm.focusEntityGeneration = 8;
  wasm.map[1] = 41; wasm.vis.fill(2);
  await host.handle(initMessage());
  const first = messages(sent, "snapshot")[0];
  assert.deepEqual([...parseSnapshot(first).frame.subarray(3, 5)], [0, 0]);
  assert.equal(parseSnapshot(first).map[1], 41);
  await returnSnapshot(host, first);
  wasm.map[1] = 99; wasm.vis[1] = 1;
  await host.handle(advance(2, 0));
  assert.equal(parseSnapshot(messages(sent, "snapshot").at(-1)).map[1], 41);
});

test("filtered_revisions_move_only_when_disclosed_payload_moves", async () => {
  const { host, sent, wasm } = await harness();
  const first = messages(sent, "snapshot")[0];
  await returnSnapshot(host, first);
  wasm.vis[5] = 0;
  await host.handle(advance(2, 0));
  const hidden = messages(sent, "snapshot").at(-1);
  await returnSnapshot(host, hidden);
  wasm.map[5] = 201;
  wasm.furniture[0] = 99;
  await host.handle(advance(3, 0));
  const changedBehindFog = messages(sent, "snapshot").at(-1);
  assert.equal(changedBehindFog.mapRevision, hidden.mapRevision);
  assert.equal(changedBehindFog.furnitureRevision, hidden.furnitureRevision);
  assert.equal(changedBehindFog.visRevision, hidden.visRevision);
  await returnSnapshot(host, changedBehindFog);
  wasm.vis[5] = 2;
  await host.handle(advance(4, 0));
  const disclosed = messages(sent, "snapshot").at(-1);
  assert.ok(disclosed.mapRevision > changedBehindFog.mapRevision);
  assert.ok(disclosed.visRevision > changedBehindFog.visRevision);
});

test("initial_undisclosed_map_and_vis_match_the_cleared_revision_baseline", async () => {
  const { host, sent, wasm } = await harness(false);
  wasm.map.fill(73);
  wasm.vis.fill(0);
  await host.handle(initMessage());
  const initial = messages(sent, "snapshot")[0];
  const view = parseSnapshot(initial);
  assert.ok(view.map.every((value) => value === MAP_UNKNOWN));
  assert.ok(view.vis.every((value) => value === 0));
  assert.deepEqual([initial.mapRevision, initial.visRevision, initial.furnitureRevision], [0, 0, 0]);
});

test("entity_identity_is_index_plus_generation", async () => {
  const { host, sent, wasm } = await harness(false);
  wasm.setRows({ units: [unit({ index: 7, generation: 1 }), unit({ index: 7, generation: 2 })] });
  await host.handle(initMessage());
  const view = parseSnapshot(messages(sent, "snapshot")[0]);
  assert.equal(view.entityKey(0), "7:1");
  assert.equal(view.entityKey(1), "7:2");
  assert.notEqual(view.entityKey(0), view.entityKey(1));
});

test("catch_up_is_capped_at_eight_ticks_and_drops_the_remainder", async () => {
  const { host, sent, wasm } = await harness();
  await host.handle(advance(2, Number.MAX_SAFE_INTEGER));
  let ack = messages(sent, "advanceAck").at(-1);
  assert.deepEqual([ack.steppedTicks, ack.droppedBacklog, wasm.now], [8, true, 8]);
  await host.handle(advance(3, 16_666));
  ack = messages(sent, "advanceAck").at(-1);
  assert.equal(ack.steppedTicks, 0);
  await host.handle(advance(4, 1));
  assert.equal(messages(sent, "advanceAck").at(-1).steppedTicks, 1);
  await host.handle(advance(5, 1.5));
  assert.equal(messages(sent, "error").at(-1).code, "invalidMessage");
});

test("stale_snapshots_are_returned_after_reset_without_being_parsed_or_displayed", async () => {
  const { host, sent } = await harness();
  const stale = messages(sent, "snapshot")[0];
  await host.handle(base("reset", 2, { epoch: 1, seed: 2, paused: false }));
  assert.equal(stale.epoch, 1);
  await returnSnapshot(host, stale, 3);
  assert.equal(messages(sent, "bufferReturned").at(-1).disposition, "reclaimed");
});

test("sim_client_returns_an_old_snapshot_after_reset_without_parsing_or_displaying_it", async () => {
  const { client, worker } = await clientHarness();
  const [shown, delayed] = await snapshotPair();
  let displays = 0;
  client.onSnapshot = () => { displays++; };
  worker.emitMessage(shown);
  assert.equal(displays, 1);

  const reset = client.reset(9, false);
  const resetMessage = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "reset");
  worker.emitMessage({ kind: "ready", version: MSG.WORKER_PROTOCOL_VERSION, requestId: resetMessage.requestId,
    cause: "reset", epoch: 2, tick: 0, paused: false });
  await reset;

  // Deliberately malformed: epoch rejection must happen before parseSnapshot.
  delayed.frameLength = 0;
  worker.emitMessage(delayed);
  assert.equal(displays, 1);
  assert.equal(client.diagnostics().terminal, false);
  const staleReturn = worker.sent.map((entry) => entry.message).findLast((message) =>
    message.kind === "returnSnapshot" && message.bufferId === delayed.bufferId);
  assert.deepEqual([staleReturn.epoch, staleReturn.leaseToken], [1, delayed.leaseToken]);

  const current = { ...shown, epoch: 2, leaseToken: shown.leaseToken + 100,
    frameLength: ABI.HEADER_LEN, buffer: new ArrayBuffer(ABI.SNAPSHOT_BUFFER_BYTES) };
  worker.emitMessage(current);
  assert.equal(displays, 2);
  assert.equal(client.snapshot().message.epoch, 2);
});

test("sim_client_reset_barrier_returns_pre_ready_snapshots_without_displaying_them", async () => {
  const { client, worker } = await clientHarness();
  const [shown, delayed] = await snapshotPair();
  let displays = 0;
  client.onSnapshot = () => { displays++; };
  worker.emitMessage(shown);
  const reset = client.reset(11, false);
  const resetMessage = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "reset");

  delayed.frameLength = 0;
  worker.emitMessage(delayed);
  assert.equal(displays, 1);
  assert.equal(client.diagnostics().resetting, true);
  assert.equal(client.diagnostics().terminal, false);
  const returned = worker.sent.map((entry) => entry.message).findLast((message) =>
    message.kind === "returnSnapshot" && message.bufferId === delayed.bufferId);
  assert.deepEqual([returned.epoch, returned.leaseToken], [1, delayed.leaseToken]);

  worker.emitMessage({ kind: "ready", version: MSG.WORKER_PROTOCOL_VERSION, requestId: resetMessage.requestId,
    cause: "reset", epoch: 2, tick: 0, paused: false });
  await reset;
  assert.equal(client.diagnostics().resetting, false);
});

test("sim_client_posts_a_default_tick_command_only_after_the_outstanding_advance_ack", async () => {
  const { client, worker } = await clientHarness();
  const advancing = client.advance(20_000);
  const advanceMessage = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "advance");
  const applying = client.command({ kind: "withdraw" });
  assert.equal(worker.sent.some((entry) => entry.message.kind === "command"), false);

  worker.emitMessage({ kind: "advanceAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: advanceMessage.requestId,
    epoch: 1, tick: 1, steppedTicks: 1, droppedBacklog: false });
  await advancing;
  await Promise.resolve();
  const posted = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "command");
  assert.deepEqual([posted.sequence, posted.targetTick], [1, 1]);
  worker.emitMessage({ kind: "commandAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: posted.requestId,
    epoch: 1, sequence: 1, targetTick: 1, status: "accepted", tick: 1 });
  worker.emitMessage({ kind: "commandAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: posted.requestId,
    epoch: 1, sequence: 1, targetTick: 1, status: "applied", tick: 1 });
  assert.equal((await applying).status, "applied");
});

test("sim_client_posts_pause_only_after_the_outstanding_advance_ack", async () => {
  const { client, worker } = await clientHarness();
  const advancing = client.advance(20_000);
  const advanceMessage = worker.sent.at(-1).message;
  const pausing = client.setPaused(true);
  assert.equal(worker.sent.some((entry) => entry.message.kind === "setPaused"), false);
  worker.emitMessage({ kind: "advanceAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: advanceMessage.requestId,
    epoch: 1, tick: 1, steppedTicks: 1, droppedBacklog: false });
  await advancing;
  await Promise.resolve();
  const pauseMessage = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "setPaused");
  worker.emitMessage({ kind: "pauseChanged", version: MSG.WORKER_PROTOCOL_VERSION, requestId: pauseMessage.requestId,
    epoch: 1, tick: 1, paused: true });
  assert.equal((await pausing).tick, 1);
});

test("sim_client_rejects_malformed_and_cross_wired_worker_responses_fatally", async () => {
  {
    const { client, worker } = await clientHarness();
    const pausing = client.setPaused(true);
    const rejected = assert.rejects(pausing, /malformed worker response/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "pauseChanged", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, tick: "0", paused: true });
    await rejected;
    assert.equal(client.diagnostics().terminal, true);
    assert.equal(worker.terminateCalls, 1);
    client.dispose();
    assert.equal(worker.terminateCalls, 1);
  }
  {
    const { client, worker } = await clientHarness();
    const pausing = client.setPaused(true);
    const rejected = assert.rejects(pausing, /does not match its pending request/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "advanceAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, tick: 0, steppedTicks: 0, droppedBacklog: false });
    await rejected;
    assert.equal(client.diagnostics().terminal, true);
    assert.equal(worker.terminateCalls, 1);
  }
  {
    const worker = new FakeWorker();
    const client = new SimClient(worker);
    const initializing = client.init(4);
    const rejected = assert.rejects(initializing, /cause or pause state/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "ready", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      cause: "reset", epoch: 1, tick: 0, paused: false });
    await rejected;
    assert.equal(client.diagnostics().terminal, true);
    assert.equal(worker.terminateCalls, 1);
  }
  {
    const { client, worker } = await clientHarness();
    const [first, second] = await snapshotPair();
    worker.emitMessage(first);
    worker.emitMessage(second);
    const request = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "returnSnapshot");
    worker.emitMessage({ kind: "bufferReturned", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, bufferId: request.bufferId, leaseToken: request.leaseToken + 1, disposition: "reclaimed" });
    assert.equal(client.diagnostics().terminal, true);
    assert.equal(worker.terminateCalls, 1);
  }
});

test("sim_client_requires_exact_command_epoch_target_and_status_transitions", async () => {
  for (const mutation of [
    { epoch: 2 },
    { targetTick: 1 },
    { status: "applied" },
  ]) {
    const { client, worker } = await clientHarness();
    const applying = client.command({ kind: "withdraw" }, 0);
    const rejected = assert.rejects(applying, /matching request|before it was accepted/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "commandAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, sequence: 1, targetTick: 0, status: "accepted", tick: 0, ...mutation });
    await rejected;
    assert.equal(client.diagnostics().terminal, true);
    assert.equal(worker.terminateCalls, 1);
  }
});

test("sim_client_rejects_tick_inconsistent_matching_acknowledgements", async () => {
  {
    const worker = new FakeWorker();
    const client = new SimClient(worker);
    const initializing = client.init(4);
    const rejected = assert.rejects(initializing, /ready tick/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "ready", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      cause: "init", epoch: 1, tick: 1, paused: false });
    await rejected;
  }
  {
    const { client, worker } = await clientHarness();
    const pausing = client.setPaused(true);
    const rejected = assert.rejects(pausing, /pauseChanged tick/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "pauseChanged", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, tick: 1, paused: true });
    await rejected;
  }
  {
    const { client, worker } = await clientHarness();
    const advancing = client.advance(20_000);
    const rejected = assert.rejects(advancing, /advanceAck tick/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "advanceAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, tick: 2, steppedTicks: 1, droppedBacklog: false });
    await rejected;
  }
  {
    const { client, worker } = await clientHarness();
    const applying = client.command({ kind: "withdraw" }, 0);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "commandAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, sequence: 1, targetTick: 0, status: "accepted", tick: 0 });
    const rejected = assert.rejects(applying, /tick does not match its target/);
    worker.emitMessage({ kind: "commandAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, sequence: 1, targetTick: 0, status: "applied", tick: 1 });
    await rejected;
  }
});

test("command_sequence_exhaustion_never_emits_a_value_above_u32", async () => {
  {
    const { client, worker } = await clientHarness();
    client.setNextSequenceForTest(0x1_0000_0000);
    const rejected = assert.rejects(client.command({ kind: "withdraw" }), /command sequence exhausted/);
    await rejected;
    assert.equal(worker.sent.some((entry) => entry.message.kind === "command"), false);
    assert.equal(client.diagnostics().terminal, true);
    assert.equal(worker.terminateCalls, 1);
  }
  {
    const { client, worker } = await clientHarness();
    client.setNextSequenceForTest(0xffff_ffff);
    const applying = client.command({ kind: "withdraw" }, 0);
    const rejected = assert.rejects(applying, /command sequence exhausted/);
    const request = worker.sent.at(-1).message;
    assert.equal(request.sequence, 0xffff_ffff);
    worker.emitMessage({ kind: "commandAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
      epoch: 1, sequence: 0xffff_ffff, targetTick: 0, status: "accepted", tick: 0 });
    await rejected;
    assert.ok(worker.sent.filter((entry) => entry.message.kind === "command")
      .every((entry) => entry.message.sequence <= 0xffff_ffff));
    assert.equal(worker.terminateCalls, 1);
    assert.throws(() => client.command({ kind: "withdraw" }), /command sequence exhausted/);
  }
});

test("request_id_exhaustion_returns_the_retained_lease_without_recursion", async () => {
  const { client, worker } = await clientHarness();
  const [snapshot] = await snapshotPair();
  worker.emitMessage(snapshot);
  client.setNextRequestIdForTest(0x1_0000_0000);
  assert.throws(() => client.setPaused(true), /request id exhausted/);
  const returned = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "returnSnapshot");
  assert.deepEqual([returned.requestId, returned.epoch, returned.bufferId, returned.leaseToken],
    [0, snapshot.epoch, snapshot.bufferId, snapshot.leaseToken]);
  assert.deepEqual([client.snapshot(), client.diagnostics().terminal], [null, true]);
  assert.equal(worker.terminateCalls, 1);
  assert.throws(() => client.advance(1), /request id exhausted/);
});

test("worker_termination_rejects_every_pending_request_and_stops_advances", async () => {
  const { host, sent, wasm, closeCount } = await harness();
  const lease = messages(sent, "snapshot")[0];
  wasm.trap = true;
  await host.handle(advance(2, 20_000));
  assert.equal(messages(sent, "error").at(-1).fatal, true);
  assert.equal(messages(sent, "terminated").length, 0);
  await returnSnapshot(host, lease, 3);
  assert.equal(messages(sent, "terminated").length, 1);
  assert.equal(closeCount(), 1);
  const count = sent.length;
  await host.handle(advance(4, 20_000));
  assert.equal(sent.length, count);
});

test("sim_client_fatal_error_and_termination_reject_all_promises_and_prevent_advances", async () => {
  for (const terminalMessage of [
    { kind: "error", version: MSG.WORKER_PROTOCOL_VERSION, requestId: null, epoch: 1,
      code: "wasmTrap", fatal: true, detail: "deliberate trap" },
    { kind: "terminated", version: MSG.WORKER_PROTOCOL_VERSION, epoch: 1 },
  ]) {
    const { client, worker } = await clientHarness();
    const [snapshot] = await snapshotPair();
    worker.emitMessage(snapshot);
    const pause = client.setPaused(true);
    const commandPromise = client.command({ kind: "withdraw" }, 0);
    const pauseRejected = assert.rejects(pause);
    const commandRejected = assert.rejects(commandPromise);
    worker.emitMessage(terminalMessage);
    await Promise.all([pauseRejected, commandRejected]);
    assert.deepEqual([client.diagnostics().terminal, client.diagnostics().pendingRequests], [true, 0]);
    assert.equal(worker.terminateCalls, 1);
    client.dispose();
    assert.equal(worker.terminateCalls, 1);
    assert.throws(() => client.advance(16_667), /trap|terminated/);
  }
});

test("ownership_diagnostics_preserve_three_buffers_and_one_retained_snapshot", async () => {
  const { host, sent } = await harness();
  const snapshot = messages(sent, "snapshot")[0];
  assert.equal(snapshot.poolAllocationsTotal, 3);
  assert.equal(snapshot.buffersFree + snapshot.buffersOutstanding, 3);
  assert.ok(snapshot.buffersOutstanding >= 1 && snapshot.buffersOutstanding <= 3);
  assert.ok(snapshot.queuedCommands <= MSG.MAX_QUEUED_COMMANDS);
  assert.deepEqual([host.diagnostics().allocations,
    host.diagnostics().freeBuffers + host.diagnostics().outstandingBuffers], [3, 3]);
});

test("sim_client_retains_only_the_latest_snapshot_and_returns_the_previous_lease", async () => {
  const { client, worker } = await clientHarness();
  const [first, second] = await snapshotPair();
  let displays = 0;
  client.onSnapshot = () => { displays++; };
  worker.emitMessage(first);
  worker.emitMessage(second);

  const returned = worker.sent.map((entry) => entry.message).filter((message) => message.kind === "returnSnapshot");
  assert.equal(returned.length, 1);
  assert.deepEqual([returned[0].epoch, returned[0].bufferId, returned[0].leaseToken],
    [first.epoch, first.bufferId, first.leaseToken]);
  assert.equal(client.snapshot().message.leaseToken, second.leaseToken);
  const diagnostics = client.diagnostics();
  assert.deepEqual([displays, diagnostics.retainedSnapshots, diagnostics.poolAllocationsTotal], [2, 1, 3]);
  assert.equal(diagnostics.buffersFree + diagnostics.buffersOutstanding, 3);
});

test("sim_client_ownership_diagnostics_never_exceed_one_pending_advance", async () => {
  const { client, worker } = await clientHarness();
  const first = client.advance(20_000);
  const second = client.advance(20_000);
  assert.equal(first, second);
  assert.ok(client.diagnostics().pendingAdvances <= 1);
  const request = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "advance");
  worker.emitMessage({ kind: "advanceAck", version: MSG.WORKER_PROTOCOL_VERSION, requestId: request.requestId,
    epoch: 1, tick: 1, steppedTicks: 1, droppedBacklog: false });
  await Promise.all([first, second]);
  await Promise.resolve();
  assert.equal(client.diagnostics().pendingAdvances, 0);
});

test("diagnostic_buffer_exhaustion_holds_three_leases_while_ticks_advance_then_releases_exactly", async () => {
  const { host, sent } = await harness();
  await host.handle(advance(700, 20_000));
  await host.handle(advance(701, 20_000));
  const held = messages(sent, "snapshot").slice(0, 3);
  assert.equal(held.length, 3);
  assert.equal(new Set(held.map((snapshot) => snapshot.bufferId)).size, 3);
  await host.handle(advance(702, 20_000));
  assert.deepEqual([host.diagnostics().outstandingBuffers, host.diagnostics().coalescedSnapshots], [3, 1]);
  const hostAdvance = messages(sent, "advanceAck").find((message) => message.requestId === 702);
  assert.deepEqual(
    [hostAdvance.epoch, hostAdvance.tick, hostAdvance.steppedTicks, hostAdvance.droppedBacklog],
    [1, 3, 1, false],
  );

  const { client, worker } = await clientHarness();
  let displays = 0;
  client.onSnapshot = () => { displays++; };
  client.beginDiagnosticBufferExhaustion();
  for (const snapshot of held) worker.emitMessage(snapshot);
  assert.deepEqual(
    [client.diagnostics().retainedSnapshots, client.diagnostics().diagnosticBufferExhaustion, displays],
    [3, true, 3],
  );
  assert.equal(worker.sent.some((entry) => entry.message.kind === "returnSnapshot"), false);

  client.setNextRequestIdForTest(702);
  const advancing = client.advance(20_000);
  const advanceRequest = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "advance");
  assert.equal(advanceRequest.requestId, hostAdvance.requestId);
  worker.emitMessage(hostAdvance);
  await advancing;
  assert.deepEqual([client.diagnostics().tick, client.diagnostics().retainedSnapshots], [3, 3]);

  client.releaseDiagnosticBufferExhaustion();
  const returned = worker.sent.map((entry) => entry.message).filter((message) => message.kind === "returnSnapshot");
  assert.deepEqual(
    returned.map((message) => [message.epoch, message.bufferId, message.leaseToken]),
    held.map((message) => [message.epoch, message.bufferId, message.leaseToken]),
  );
  assert.equal(client.diagnostics().retainedSnapshots, 0);

  const releaseStart = sent.length;
  for (const message of returned) await host.handle(message);
  for (const message of messages(sent.slice(releaseStart), "bufferReturned")) worker.emitMessage(message);
  const resumed = messages(sent.slice(releaseStart), "snapshot");
  assert.equal(resumed.length, 1);
  worker.emitMessage(resumed[0]);
  assert.deepEqual(
    [client.diagnostics().retainedSnapshots, client.diagnostics().diagnosticBufferExhaustion,
      client.diagnostics().tick, client.diagnostics().coalescedSnapshots, displays],
    [1, false, 3, 1, 4],
  );
  assert.equal(client.snapshot().message.leaseToken, resumed[0].leaseToken);
});

test("the_worker_source_alone_instantiates_wasm_and_the_shell_page_boots_the_studio", () => {
  // Read, never skipped. Each of these three used to be guarded by an
  // `existsSync`, so a rename turned the assertion off instead of turning it
  // red -- which is exactly what happened to the pages this session replaced.
  const read = (...parts) => {
    const file = path.join(ROOT, ...parts);
    assert.ok(fs.existsSync(file), `${parts.join("/")} is named by this test and does not exist`);
    return fs.readFileSync(file, "utf8");
  };
  assert.doesNotMatch(read("client", "src", "v2.ts"), /WebAssembly\.(?:instantiate|compile)/);
  assert.match(read("client", "src", "runtime", "sim.worker.ts"), /WebAssembly\.(?:instantiate|compile)/);
  assert.match(read("web", "index.html"), /client-src\/studio\.ts/);
});

test("vite_dev_serves_the_studio_shell_its_game_route_and_the_wasm_from_the_web_root", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(manifest.scripts.dev,
    "cargo build --release --target wasm32-unknown-unknown -p web && node node_modules/vite/bin/vite.js");
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(ROOT, "vite.config.ts"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address === "object", "Vite did not bind an HTTP port");
    const origin = `http://127.0.0.1:${address.port}`;
    const htmlResponse = await fetch(`${origin}/`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /src="\/client-src\/studio\.ts"/);
    const entryResponse = await fetch(`${origin}/client-src/v2.ts`);
    assert.equal(entryResponse.status, 200);
    assert.match(entryResponse.headers.get("content-type") ?? "", /(?:java|type)script/);
    const entry = await entryResponse.text();
    assert.match(entry, /SimClient/);
    const workerMatch = entry.match(/["']([^"']*sim\.worker\.ts\?worker_file&type=module[^"']*)["']/);
    assert.ok(workerMatch?.[1], "transformed v2 entry does not name its module worker URL");
    const workerResponse = await fetch(new URL(workerMatch[1], `${origin}/`));
    assert.equal(workerResponse.status, 200);
    assert.match(workerResponse.headers.get("content-type") ?? "", /(?:java|type)script/);
    assert.match(await workerResponse.text(), /fetch\("\/web\.wasm"/);

    const wasmResponse = await fetch(`${origin}/web.wasm`);
    assert.equal(wasmResponse.status, 200);
    assert.equal(wasmResponse.headers.get("content-type"), "application/wasm");
    const magic = new Uint8Array(await wasmResponse.arrayBuffer(), 0, 4);
    assert.deepEqual([...magic], [0x00, 0x61, 0x73, 0x6d]);
  } finally {
    await server.close();
    // `server.close()` does not reap the config-file watcher on Vite 8.1.5:
    // measured 2026-08-16, two `FSEventWrap` handles survive it and only once a
    // module has been transformed, which is why the plain HTML fetch above does
    // not show it. Node then runs every test green and never exits, which reads
    // as a hung suite rather than a leak. Closing the watcher explicitly is the
    // whole fix; drop it when Vite reaps its own.
    await server.watcher.close();
  }
});

// --------------------------------------------------------- v2: the arena channel
//
// The recorder against a scripted feed. What is under test here is the channel
// -- the index, the caps, the refusals, the cancel, the session rule -- and not
// the simulation; `wasm-memory.test.mjs` drives the same recorder against the
// real artifact, where the fight is the subject.

const arenaConfig = ({
  policies = [1, 2], hands = [["shield", "sword"], ["empty", "club"]],
  twoHanded = [false, false], anatomies = [0, 1], seed = 3, maxTicks = 16,
} = {}) => ({
  fighters: [0, 1].map((side) => ({
    anatomy: anatomies[side],
    policy: policies[side],
    spawn: CONFIG.SHIPPED_SPAWNS[side],
    hands: [CONFIG.HAND_ITEMS[hands[side][0]], CONFIG.HAND_ITEMS[hands[side][1]]],
    twoHanded: twoHanded[side],
  })),
  maxTicks,
  seed,
});

function arenaStartMessage(config, requestId = 1, checkpoint = null) {
  const bytes = CONFIG.encodeArenaConfig(config);
  return {
    kind: "arenaStart", version: MSG.WORKER_PROTOCOL_VERSION, requestId,
    seed: config.seed, config: bytes.buffer, checkpoint,
  };
}

function arenaHost(arena) {
  const sent = [];
  const host = new SimWorkerHost(() => new FakeWasm(arena),
    (message, transfer = []) => sent.push({ message, transfer }), () => {});
  return { host, sent };
}

async function record(arena, config, checkpoint = null) {
  const { host, sent } = arenaHost(arena);
  await host.handle(arenaStartMessage(config, 1, checkpoint));
  return { host, sent, last: sent.at(-1).message };
}

test("the_arena_configuration_round_trips_through_its_own_bytes", () => {
  const config = arenaConfig({ policies: [4, 3], hands: [["sword", "shield"], ["club", "club"]] });
  const bytes = CONFIG.encodeArenaConfig(config);
  assert.equal(bytes.length, CONFIG.ARENA_CONFIG_BYTES);
  assert.deepEqual(CONFIG.decodeArenaConfig(bytes, config.seed), config);
  // The rules the buffer states about its own header, read off the bytes rather
  // than off the encoder that wrote them.
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(0, true), CONFIG.ARENA_CONFIG_LAYOUT_VERSION);
  assert.equal(view.getUint8(2), CONFIG.ARENA_FIGHTERS);
  assert.equal(view.getUint8(3), 0, "the header's reserved byte must be zero");
  assert.equal(view.getUint32(4, true), config.maxTicks);
  // Every word of an empty hand is zero, which the module refuses otherwise.
  const empty = CONFIG.encodeArenaConfig(arenaConfig({ hands: [["empty", "sword"], ["empty", "club"]] }));
  const emptyHand = empty.subarray(8 + 12, 8 + 12 + 22);
  assert.equal(emptyHand[0], CONFIG.EMPTY_HAND_CODE);
  assert.deepEqual([...emptyHand.subarray(1)], new Array(21).fill(0));
  // A length or a layout this build does not know is refused rather than read.
  // `1` is the retired layout whose hand byte was reserved-zero, and reading it
  // under today's rules would misread that byte as a grip.
  assert.equal(CONFIG.decodeArenaConfig(bytes.subarray(0, 119), 3), null);
  const wrongLayout = Uint8Array.from(bytes);
  new DataView(wrongLayout.buffer).setUint16(0, 1, true);
  assert.equal(CONFIG.decodeArenaConfig(wrongLayout, 3), null);

  // The grip round-trips beside everything else: byte 1 of the right hand
  // block, and only on the side that asked for it.
  const gripped = arenaConfig({ hands: [["shield", "sword"], ["empty", "club"]],
    twoHanded: [false, true] });
  const grippedBytes = CONFIG.encodeArenaConfig(gripped);
  assert.equal(grippedBytes[8 + 56 + 12 + 22 + 1], 1);
  assert.equal(grippedBytes[8 + 12 + 22 + 1], 0);
  assert.deepEqual(CONFIG.decodeArenaConfig(grippedBytes, gripped.seed), gripped);
});

test("the_shipped_arrangement_carries_the_dimensions_the_spec_document_states", () => {
  // `combat-specs.md`'s fixture block, reduced by `Fx::from_ratio`, which
  // truncates. Written out as products here so a wrong *rounding* rule in
  // `fx()` -- to nearest rather than toward zero -- fails rather than
  // reproducing itself on both sides of the comparison.
  assert.deepEqual(CONFIG.HAND_ITEMS.sword,
    { code: 2, mass: 81_264, balance: 36_044, a: 62_259, b: 2_621, c: 0 });
  assert.deepEqual(CONFIG.HAND_ITEMS.shield,
    { code: 4, mass: 58_982, balance: 22_937, a: 16_384, b: 16_384, c: 3_276 });
  assert.deepEqual(CONFIG.HAND_ITEMS.club,
    { code: 3, mass: 146_145, balance: 39_976, a: 95_027, b: 3_932, c: 0 });
  assert.deepEqual(CONFIG.HAND_ITEMS.bow,
    { code: 6, mass: 52_428, balance: 32_768, a: 52_428, b: 2_184, c: 0 });
  assert.deepEqual(CONFIG.ANATOMIES.map((row) => row.armLength), [49_152, 55_705]);
  assert.deepEqual(CONFIG.SHIPPED_SPAWNS, [{ x: 458_752, y: 393_216 }, { x: 1_114_112, y: 655_360 }]);
  assert.equal(CONFIG.ARENA_MAX_TICKS, 3_600);
  // A guard yields carrying slot zero, so a sword-and-board fighter carries
  // [sword, shield] -- the shipped fixture's own arrangement, and the order
  // `lab trace` writes.
  const carried = CONFIG.carriedOf(arenaConfig().fighters[0]);
  assert.deepEqual(carried.map((slot) => [slot.hand.code, slot.binding]), [[2, "Right"], [4, "Left"]]);
});

test("the_canonical_bow_is_exactly_one_right_hand_block_with_the_both_marker", () => {
  const config = arenaConfig({
    hands: [["empty", "bow"], ["shield", "sword"]],
    twoHanded: [true, false],
  });
  const bytes = CONFIG.encodeArenaConfig(config);
  const right = 8 + 12 + 22;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint8(right), 6);
  assert.equal(view.getUint8(right + 1), 1);
  assert.equal(view.getInt32(right + 2, true), 52_428);
  assert.equal(view.getInt32(right + 6, true), 32_768);
  assert.equal(view.getInt32(right + 10, true), 52_428);
  assert.equal(view.getInt32(right + 14, true), 2_184);
  assert.equal(view.getInt32(right + 18, true), 0);
  assert.equal(view.getUint8(8 + 12), CONFIG.EMPTY_HAND_CODE,
    "Bow must not be mirrored into the occupied left-hand block");
  assert.deepEqual(CONFIG.decodeArenaConfig(bytes, config.seed), config);
});

test("an_arena_refusal_reads_its_policy_code_and_not_a_hand_index", () => {
  const packed = (reason, fighter, last) => (reason << 8 | fighter << 16 | last << 24) >>> 0;
  // `ARENA_NO_CHECKPOINT`. Bits 24..31 carry the **policy code**, and 4 is a
  // perfectly good hand index -- a client decoding by the older table, which
  // named only reason 7, reports hand 4 on a fighter that has two hands.
  const word = packed(CONFIG.ARENA_NO_CHECKPOINT, 0, 4);
  assert.equal((word >>> 24) & 0xff, 4, "the byte a naive decoder would read as a hand");
  const noCheckpoint = CONFIG.decodeArenaRefusal(word);
  assert.deepEqual([noCheckpoint.reason, noCheckpoint.fighter, noCheckpoint.hand, noCheckpoint.policy],
    [26, 0, null, 4]);
  assert.match(noCheckpoint.sentence, /no checkpoint/);
  const unavailable = CONFIG.decodeArenaRefusal(packed(CONFIG.ARENA_POLICY_UNAVAILABLE, 1, 4));
  assert.deepEqual([unavailable.hand, unavailable.policy], [null, 4]);
  // Every other reason reads the same byte as a hand.
  const unknownItem = CONFIG.decodeArenaRefusal(packed(5, 1, 0));
  assert.deepEqual([unknownItem.reason, unknownItem.fighter, unknownItem.hand, unknownItem.policy],
    [5, 1, 0, null]);
  const whole = CONFIG.decodeArenaRefusal(packed(1, 255, 255));
  assert.deepEqual([whole.fighter, whole.hand, whole.policy], [null, null, null]);
  // Every declared reason has a sentence of its own, which is the whole reason
  // the module answers twenty-seven codes rather than one opaque zero.
  const sentences = new Set(Object.values(CONFIG.ARENA_REFUSALS));
  assert.equal(sentences.size, Object.keys(CONFIG.ARENA_REFUSALS).length);
  assert.equal(Object.keys(CONFIG.ARENA_REFUSALS).length, 28);
  assert.match(CONFIG.ARENA_REFUSALS[27], /bow.*right-hand.*two-handed/i);
});

test("a_recorded_fight_transfers_its_buffers_and_its_index", async () => {
  const arena = new FakeArena({ ticks: 16 });
  const { sent, last } = await record(arena, arenaConfig());
  assert.equal(last.kind, "fightRecording");
  assert.equal(last.spectator, true, "the arena's unfiltered ground truth must say so in the message");
  assert.equal(last.ticks, 16);
  assert.equal(last.frameCount, 17, "one frame before the first step and one after every step");
  assert.equal(last.recordingTruncated, false);
  assert.equal(last.heroes, "composed");
  assert.equal(last.monsters, "windmill");
  assert.equal(last.fingerprint, "0x00000000deadbeef");
  assert.equal(last.checkpoint, null);
  assert.equal(arena.warmed, 1, "the allocating calls run once, before any buffer exists");
  // Every buffer is transferred rather than copied: six of them, in order.
  assert.deepEqual(sent.at(-1).transfer,
    [last.poses, last.regions, last.projectiles, last.events, last.index, last.health]);
  const source = new LiveFightSource(last);
  assert.equal(source.frameCount(), 17);
  for (let frame = 0; frame < source.frameCount(); frame += 1) {
    assert.equal(source.frameAt(frame).t, frame, "the index carries its own tick word");
    assert.equal(source.frameAt(frame).poses.length, 2);
    assert.equal(source.frameAt(frame).projectiles.length, 0);
    assert.equal(source.frameAt(frame).poses[0].regions.length, ABI.REGIONS_PER_BODY);
  }
  assert.throws(() => source.frameAt(17), /out of range/);
  // The five columns the event row does not carry are null and not zero: a zero
  // closing speed is a measurement and a reader cannot tell it from an absence.
  const contact = source.frameAt(3).contacts[0];
  assert.deepEqual([contact.velocityA, contact.impulseB, contact.alpha], [null, null, null]);
});

test("the_index_survives_a_death", async () => {
  // A fight whose second body stops being published at tick 9, which is what a
  // kill looks like from this side: pose_len is one per **live** articulated
  // body.
  const arena = new FakeArena({ ticks: 20, deathTick: 9 });
  const { last } = await record(arena, arenaConfig({ maxTicks: 20 }));
  const source = new LiveFightSource(last);
  assert.equal(source.frameAt(8).poses.length, 2);
  assert.equal(source.frameAt(9).poses.length, 1);
  assert.equal(source.frameAt(20).poses.length, 1);
  // The survivor, by identity. The fake publishes the surviving *slot*, so a
  // reader that computed its offset from a fixed two-rows-a-tick stride would be
  // handed body 0's row where body 1 is published.
  assert.equal(source.frameAt(20).poses[0].id[0], 1);

  // **What the index buys, as an assertion rather than as a comment.** This is
  // the arithmetic a reader without an index would do, and after the death it
  // lands on a different row of the same buffer -- so deleting the index cannot
  // leave this test passing.
  const poses = new Uint32Array(last.poses);
  const strided = 20 * 2 * ABI.POSE_STRIDE + ABI.POSE_BODY_X;
  const indexed = new Uint32Array(last.index);
  const start = indexed[20 * RECORDER.RECORDING_INDEX_STRIDE + RECORDER.INDEX_POSE_START];
  assert.notEqual(start, 20 * 2, "the recording must actually have gone short of two rows a tick");
  assert.notEqual(poses[strided], poses[start * ABI.POSE_STRIDE + ABI.POSE_BODY_X]);
  assert.equal(source.frameAt(20).poses[0].body[0], poses[start * ABI.POSE_STRIDE + ABI.POSE_BODY_X]);

  // region_len == REGIONS_PER_BODY * pose_len is the contract a reader checks
  // before it indexes, and the death is where it moves.
  assert.equal(indexed[20 * RECORDER.RECORDING_INDEX_STRIDE + RECORDER.INDEX_REGION_COUNT],
    ABI.REGIONS_PER_BODY);
  // The outcome the module would have answered, from the alive counts alone.
  assert.deepEqual([last.outcome, last.timedOut], ["HeroesWin", false]);
});

test("a_projectile_row_uses_its_own_index_extent_and_stable_identity", async () => {
  const { last } = await record(
    new FakeArena({ ticks: 3, projectileAt: 2 }), arenaConfig({ maxTicks: 3 }),
  );
  const source = new LiveFightSource(last);
  assert.equal(source.frameAt(1).projectiles.length, 0);
  assert.deepEqual(source.frameAt(2).projectiles, [{
    id: [4, 7], owner: [0, 1], position: [1234, 0, 0], velocity: [5678, 0, 0],
    radius: 321, remainingRange: 9999,
  }]);
  assert.equal(source.frameAt(3).projectiles.length, 0,
    "a reaped projectile is retired rather than repeated from the preceding extent");
  const index = new Uint32Array(last.index);
  assert.equal(index[2 * RECORDER.RECORDING_INDEX_STRIDE + RECORDER.INDEX_PROJECTILE_COUNT], 1);
});

test("a_truncated_recording_says_so", async () => {
  // A hundred rows a tick over four hundred ticks is 40,100 rows, so the
  // recording stops short and has to say why. The feed is asserted against the
  // constant rather than against the number it happened to be, because this cap
  // has already moved once -- from 16,384 to 32,768, when its corpus was
  // re-recorded over picker-reachable loadouts.
  const arena = new FakeArena({ ticks: 400, eventsPerTick: 100 });
  assert.ok(400 * 100 > RECORDER.RECORDING_EVENT_ROW_CAP,
    "the scripted feed no longer overruns the cap, so this test proves nothing");
  const { last } = await record(arena, arenaConfig({ maxTicks: 400 }));
  assert.equal(last.recordingTruncated, true);
  assert.ok(last.frameCount < 401, "a truncated recording holds fewer frames than the fight has ticks");
  assert.ok(new Uint32Array(last.events).length / ABI.COMBAT_EVENT_STRIDE
    <= RECORDER.RECORDING_EVENT_ROW_CAP, "the event cap was exceeded");
  // A recording that stopped early has not watched the fight end, so it must
  // not claim an outcome it did not see.
  assert.match(last.outcome, /truncated/);
  assert.equal(last.timedOut, false);
  const source = new LiveFightSource(last);
  assert.equal(source.frameCount(), last.frameCount);
  assert.equal(source.frameAt(source.frameCount() - 1).contacts.length, 100);
});

test("a_cancelled_recording_leaves_the_worker_able_to_start_another_fight", async () => {
  // Long enough to reach a chunk boundary, which is the only place a worker can
  // service a message at all: nothing is delivered while JavaScript is on the
  // stack, so a recording that never yielded would be one nobody could stop.
  const arena = new FakeArena({ ticks: RECORDER.RECORDING_CHUNK_TICKS * 3 });
  const { host, sent } = arenaHost(arena);
  const running = host.handle(arenaStartMessage(arenaConfig({ maxTicks: 1_200 }), 1));
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await host.handle({ kind: "arenaCancel", version: MSG.WORKER_PROTOCOL_VERSION, requestId: 2 });
  await running;
  const rejected = messages(sent, "arenaRejected").at(-1);
  assert.deepEqual([rejected.reason, rejected.requestId], ["cancelled", 1]);
  assert.equal(messages(sent, "fightRecording").length, 0);
  assert.ok(messages(sent, "arenaProgress").length > 0, "a chunked drive reports its progress");

  // **Started again, for real.** A trap behind a `pub extern "C"` export poisons
  // the instance for the life of the page, so "cancel left it usable" is only
  // demonstrated by using it.
  arena.ticks = 12;
  await host.handle(arenaStartMessage(arenaConfig({ maxTicks: 12 }), 3));
  const recording = messages(sent, "fightRecording").at(-1);
  assert.deepEqual([recording.requestId, recording.ticks], [3, 12]);
  assert.deepEqual([arena.starts, arena.warmed], [2, 2]);
});

test("a_second_recording_while_one_runs_is_refused_as_busy", async () => {
  const arena = new FakeArena({ ticks: RECORDER.RECORDING_CHUNK_TICKS * 2 });
  const { host, sent } = arenaHost(arena);
  const running = host.handle(arenaStartMessage(arenaConfig({ maxTicks: 900 }), 1));
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await host.handle(arenaStartMessage(arenaConfig({ maxTicks: 900 }), 2));
  const refused = messages(sent, "arenaRejected").at(-1);
  assert.deepEqual([refused.requestId, refused.reason], [2, "arenaBusy"]);
  await running;
  assert.equal(messages(sent, "fightRecording").length, 1);
  assert.equal(arena.starts, 1);
});

test("a_game_session_and_an_arena_recording_refuse_to_share_one_worker", async () => {
  // arena_start installs a world over SIM, so a recording inside a live game
  // would replace the world that session's epoch, command targets and
  // outstanding leases are all about -- and nothing in the snapshot path would
  // notice.
  const { host, sent } = await harness(true, legacy);
  await host.handle({ ...arenaStartMessage(arenaConfig(), 50), version: 1 });
  assert.equal(messages(sent, "error").at(-1).code, "unknownVersion");

  const arena = new FakeArena({ ticks: 4 });
  const { host: second, sent: secondSent } = arenaHost(arena);
  await second.handle(arenaStartMessage(arenaConfig({ maxTicks: 4 }), 1));
  assert.equal(messages(secondSent, "fightRecording").length, 1);
  await second.handle({ ...initMessage(2), version: MSG.WORKER_PROTOCOL_VERSION });
  assert.equal(messages(secondSent, "error").at(-1).code, "alreadyInitialized");
  assert.equal(second.diagnostics().initialized, false);
});

test("an_arena_recording_is_refused_inside_a_v2_game_session", async () => {
  const wasm = new FakeWasm(new FakeArena());
  const sent = [];
  const host = new SimWorkerHost(() => wasm, (message, transfer = []) => sent.push({ message, transfer }), () => {});
  await host.handle({ ...initMessage(1), version: MSG.WORKER_PROTOCOL_VERSION });
  await host.handle(arenaStartMessage(arenaConfig(), 50));
  const refused = messages(sent, "arenaRejected").at(-1);
  assert.deepEqual([refused.requestId, refused.reason], [50, "wrongModel"]);
  assert.equal(wasm.arena.starts, 0);
});

test("an_arena_refusal_names_what_the_module_refused", async () => {
  // The module's own packed word, carried whole, so a studio can say which
  // fighter and which hand -- or which policy code.
  const arena = new FakeArena({ startPacked: (26 << 8 | 0 << 16 | 4 << 24) >>> 0 });
  const { last } = await record(arena, arenaConfig({ policies: [4, 2] }));
  assert.equal(last.kind, "arenaRejected");
  assert.equal(last.reason, "invalidArenaConfig");
  assert.equal(last.packed, (26 << 8 | 4 << 24) >>> 0);
  assert.match(last.detail, /no checkpoint/);
  assert.match(last.detail, /policy code 4/);

  // A configuration this build cannot even parse is refused before wasm is
  // touched, which is the articulated-command payload rule applied to the wider
  // buffer.
  const { host, sent } = arenaHost(new FakeArena());
  await host.handle({ kind: "arenaStart", version: MSG.WORKER_PROTOCOL_VERSION, requestId: 7,
    seed: 1, config: new ArrayBuffer(64), checkpoint: null });
  const short = messages(sent, "arenaRejected").at(-1);
  assert.deepEqual([short.requestId, short.reason], [7, "unknownLayout"]);
});

test("a_refused_checkpoint_stops_the_recording_and_names_the_file", async () => {
  const arena = new FakeArena({ checkpointPacked: (3 << 8 | 0xffff << 16) >>> 0 });
  const { last } = await record(arena, arenaConfig({ policies: [4, 2] }), new ArrayBuffer(32));
  assert.equal(last.kind, "arenaRejected");
  assert.equal(last.reason, "checkpointRefused");
  assert.equal(arena.starts, 0, "a refused checkpoint must not start a fight");
  assert.match(CONFIG.describeCheckpointRefusal(last.packed), /checkpoint magic/);
});

test("an_installed_checkpoint_is_named_in_the_recording", async () => {
  const digest = "7a05fc8c76ad47858ac69f770d595fa556b1bfb81dbf7d62ced831e751e26b6c";
  const arena = new FakeArena({ ticks: 4, digest });
  const { last } = await record(arena, arenaConfig({ policies: [4, 2] }), new ArrayBuffer(15_580));
  assert.equal(last.kind, "fightRecording");
  assert.equal(last.checkpoint, digest);
  assert.equal(last.heroes, "learned");
});

test("a_legacy_v1_session_is_accepted_and_refused_the_arena_kinds", async () => {
  // articulated-mechanical-gate.md commits v2 to accepting exact V1 sessions as
  // legacy-only for their lifetime. Accepted, answered in V1, and told by name
  // that the arena kinds are not part of that promise.
  const { host, sent } = await harness(true, legacy);
  assert.equal(sent[0].message.version, MSG.LEGACY_WORKER_PROTOCOL_VERSION);
  const refused = MSG.decodeClientMessage({
    kind: "arenaStart", version: 1, requestId: 4, seed: 1,
    config: new ArrayBuffer(CONFIG.ARENA_CONFIG_BYTES), checkpoint: null,
  });
  assert.deepEqual([refused.ok, refused.code], [false, "unknownVersion"]);
  assert.match(refused.detail, /legacy V1/);
  await host.handle({ kind: "arenaCancel", version: 1, requestId: 5 });
  assert.equal(messages(sent, "error").at(-1).code, "unknownVersion");
});

test("a_session_cannot_mix_protocol_versions", async () => {
  const { host, sent } = await harness(true, legacy);
  await host.handle({ kind: "setPaused", version: MSG.WORKER_PROTOCOL_VERSION,
    requestId: 9, epoch: 1, paused: true });
  const error = messages(sent, "error").at(-1);
  assert.deepEqual([error.code, error.fatal], ["unknownVersion", true]);
  assert.match(error.detail, /opened at protocol version 1/);

  // **The branch that ran before `sessionVersion` was consulted.** A buffer id is
  // checked ahead of the decoder so the refusal can say "you sent slot 9" rather
  // than "your message is invalid", and standing ahead of the decoder also stood
  // ahead of the session rule: a V1 `returnSnapshot` into a V2 session was
  // answered `invalidBufferId`, non-fatally, when what is wrong with it is the
  // version. Nothing mutated either way; the rule this file states about a
  // session's whole life still has to hold on every path into it.
  const v2 = await harness(true);
  await v2.host.handle({ kind: "returnSnapshot", version: MSG.LEGACY_WORKER_PROTOCOL_VERSION,
    requestId: 11, epoch: 1, bufferId: 9, leaseToken: 1, buffer: new ArrayBuffer(8) });
  const mixed = messages(v2.sent, "error").at(-1);
  assert.deepEqual([mixed.code, mixed.fatal], ["unknownVersion", true]);
  assert.match(mixed.detail, /opened at protocol version 2/);

  // And the other half: a malformed message is not an *accepted* one, so it opens
  // no session -- and the refusal answers in the version the caller wrote down
  // rather than claiming a session version that does not exist yet.
  const fresh = await harness(false);
  await fresh.host.handle({ kind: "returnSnapshot", version: MSG.LEGACY_WORKER_PROTOCOL_VERSION,
    requestId: 12, epoch: 1, bufferId: 9, leaseToken: 1, buffer: new ArrayBuffer(8) });
  const first = messages(fresh.sent, "error").at(-1);
  assert.deepEqual([first.code, first.fatal, first.version],
    ["invalidBufferId", false, MSG.LEGACY_WORKER_PROTOCOL_VERSION]);
  // Nothing was fixed by it, so a V2 `init` afterwards still opens a V2 session.
  await fresh.host.handle(initMessage(13));
  assert.equal(messages(fresh.sent, "ready").at(-1).version, MSG.WORKER_PROTOCOL_VERSION);
});

test("a_v2_session_answers_in_v2", async () => {
  const arena = new FakeArena({ ticks: 2 });
  const { sent } = await record(arena, arenaConfig({ maxTicks: 2 }));
  for (const entry of sent) assert.equal(entry.message.version, MSG.WORKER_PROTOCOL_VERSION);
});


// ------------------------------------------------- the arena client's own rules
//
// The main thread's half of the channel, over the same `FakeWorker` the game
// client is driven with. What lives here and nowhere else: the request
// correlation, the terminal messages that deliberately do **not** name the
// request they kill, and the cancel that waits for its own refusal before
// posting the next start.

function arenaClientHarness() {
  const worker = new FakeWorker();
  const client = new ArenaClient(() => worker);
  return { worker, client };
}

const recordingMessage = (requestId, over) => ({
  kind: "fightRecording", version: MSG.WORKER_PROTOCOL_VERSION, requestId,
  spectator: true, one: 65_536, scenario: "configured-duel-v1", mirrored: false,
  fingerprint: "0x00000000deadbeef", seed: 3, heroes: "composed", monsters: "windmill",
  checkpoint: null, outcome: "Draw", timedOut: true, ticks: 2, maxTicks: 3_600,
  frameCount: 3, recordingTruncated: false, arena: [0, 0],
  poseLayoutVersion: 1, poseStride: ABI.POSE_STRIDE,
  regionLayoutVersion: 1, regionStride: ABI.REGION_STRIDE, regionsPerBody: ABI.REGIONS_PER_BODY,
  articulatedProjectileLayoutVersion: 1,
  articulatedProjectileStride: ABI.ARTICULATED_PROJECTILE_STRIDE,
  combatEventLayoutVersion: 1, combatEventStride: ABI.COMBAT_EVENT_STRIDE,
  posesDropped: 0, regionsDropped: 0, articulatedProjectilesDropped: 0,
  combatEventsDropped: 0,
  impactThreshold: 3_932, contactEnergyFloor: 144, bodySlot: 255, noRegion: 4_294_967_295,
  regionNames: [], hintNames: [], contactKinds: [], bodies: [],
  poses: new ArrayBuffer(0), regions: new ArrayBuffer(0), projectiles: new ArrayBuffer(0),
  events: new ArrayBuffer(0),
  index: new ArrayBuffer(0), health: new ArrayBuffer(0),
  ...over,
});

test("the_arena_client_transfers_its_configuration_and_reports_progress", async () => {
  const { worker, client } = arenaClientHarness();
  const seen = [];
  const running = client.run(arenaConfig(), (done, total) => seen.push([done, total]));
  await settle();
  const posted = worker.sent.at(-1);
  assert.equal(posted.message.kind, "arenaStart");
  assert.equal(posted.message.version, MSG.WORKER_PROTOCOL_VERSION);
  assert.equal(posted.message.config.byteLength, CONFIG.ARENA_CONFIG_BYTES);
  assert.equal(posted.message.checkpoint, null, "a scripted matchup fetches no checkpoint");
  // Transferred rather than copied, which is what makes a 120-byte buffer the
  // worker may write over safe to hand across.
  assert.deepEqual(posted.transfer, [posted.message.config]);
  const requestId = posted.message.requestId;

  // A progress message for another request is not this one's, and the whole
  // point of a request id is that it says so.
  worker.emitMessage({ kind: "arenaProgress", version: MSG.WORKER_PROTOCOL_VERSION,
    requestId: requestId + 99, ticksDone: 1, ticksTotal: 2 });
  worker.emitMessage({ kind: "arenaProgress", version: MSG.WORKER_PROTOCOL_VERSION,
    requestId, ticksDone: 300, ticksTotal: 3_600 });
  worker.emitMessage(recordingMessage(requestId));
  const fight = await running;
  assert.deepEqual(seen, [[300, 3_600]]);
  assert.equal(fight.spectator, true);
  assert.equal(fight.kind, undefined, "the protocol envelope must not reach the source");
  assert.equal(fight.requestId, undefined);
});

test("a_fatal_worker_error_settles_a_recording_it_does_not_name", async () => {
  // `handleUnhandledError` reports a wasm trap with a **null** request id, so a
  // client correlating on the id alone would leave the promise pending forever
  // and the page saying "Recording..." with nothing recording.
  const { worker, client } = arenaClientHarness();
  const running = client.run(arenaConfig(), () => {});
  await settle();
  worker.emitMessage({ kind: "error", version: MSG.WORKER_PROTOCOL_VERSION, requestId: null,
    epoch: 1, code: "wasmTrap", fatal: true, detail: "deliberate trap" });
  await assert.rejects(running, /wasmTrap/);
  assert.equal(worker.terminateCalls, 1, "a poisoned instance is not reused");

  // And a `terminated`, which is likewise unsolicited.
  const second = arenaClientHarness();
  const pending = second.client.run(arenaConfig(), () => {});
  await settle();
  second.worker.emitMessage({ kind: "terminated", version: MSG.WORKER_PROTOCOL_VERSION, epoch: 1 });
  await assert.rejects(pending, /terminated/);
});

test("a_second_fight_cancels_the_first_and_waits_for_its_refusal", async () => {
  const { worker, client } = arenaClientHarness();
  const first = client.run(arenaConfig(), () => {});
  await settle();
  const firstId = worker.sent.at(-1).message.requestId;
  const rejected = assert.rejects(first, /cancelled/);

  const second = client.run(arenaConfig({ seed: 11 }), () => {});
  await settle();
  // **Nothing is posted yet.** The worker refuses a concurrent `arenaStart` by
  // name, so the second start waits for the first to answer rather than racing
  // it into an `arenaBusy`.
  assert.deepEqual(worker.sent.map((entry) => entry.message.kind), ["arenaStart", "arenaCancel"]);
  worker.emitMessage({ kind: "arenaRejected", version: MSG.WORKER_PROTOCOL_VERSION,
    requestId: firstId, reason: "cancelled", packed: 0, detail: "the recording was cancelled" });
  await rejected;
  await settle();
  const posted = worker.sent.at(-1).message;
  assert.equal(posted.kind, "arenaStart");
  assert.equal(posted.seed, 11);
  assert.notEqual(posted.requestId, firstId, "request ids are never reused");
  worker.emitMessage(recordingMessage(posted.requestId, { seed: 11 }));
  assert.equal((await second).seed, 11);
  assert.equal(worker.terminateCalls, 0, "a cancel must leave the worker usable");

  // **Three presses inside one turn, which the interleaving above cannot reach.**
  // The guard used to be a single `if (this.#pending !== null)`, so two waiters
  // released by the same refusal both found the slot empty and both posted a
  // start: `arenaStart arenaCancel arenaCancel arenaStart arenaStart`, with the
  // middle promise never settling at all because `#pending` had already been
  // overwritten by the third when its answer arrived. Every press must settle
  // and exactly one of them may be posted.
  // On the unfixed guard this test does not fail -- it **hangs**, `test timed out
  // after 20000ms`, because an unsettled promise is exactly what the page showed
  // as "Recording..." forever.
  const rapid = arenaClientHarness();
  const first3 = rapid.client.run(arenaConfig({ seed: 3 }), () => {});
  await settle();
  const first3Id = rapid.worker.sent.at(-1).message.requestId;
  const second3 = rapid.client.run(arenaConfig({ seed: 5 }), () => {});
  const third3 = rapid.client.run(arenaConfig({ seed: 7 }), () => {});
  const settled3 = [assert.rejects(first3, /cancelled/), assert.rejects(second3, /cancelled/)];
  await settle();
  rapid.worker.emitMessage({ kind: "arenaRejected", version: MSG.WORKER_PROTOCOL_VERSION,
    requestId: first3Id, reason: "cancelled", packed: 0, detail: "the recording was cancelled" });
  await Promise.all(settled3);
  await settle();
  assert.deepEqual(rapid.worker.sent.map((entry) => entry.message.kind),
    ["arenaStart", "arenaCancel", "arenaCancel", "arenaStart"],
    "three presses post one start, one cancel each for the two that found one running, and one start");
  const newest = rapid.worker.sent.at(-1).message;
  assert.equal(newest.seed, 7, "the newest press is the one that runs");
  rapid.worker.emitMessage(recordingMessage(newest.requestId, { seed: 7 }));
  assert.equal((await third3).seed, 7);

  // **Two presses with `learned`, which is the shape that reached the browser.**
  // `run` awaits the checkpoint fetch, and the old guard tested `#pending`
  // *before* that await while assigning it *after* -- so both presses found the
  // slot empty, both posted a start, and no cancel was posted at all. The second
  // then came back `arenaBusy` from a worker that was recording the first.
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(15_580),
    });
    const learned = arenaClientHarness();
    const early = learned.client.run(arenaConfig({ policies: [4, 2], seed: 3 }), () => {});
    const late = learned.client.run(arenaConfig({ policies: [4, 2], seed: 11 }), () => {});
    const earlyRejected = assert.rejects(early, /cancelled/);
    await settle();
    await settle();
    assert.deepEqual(learned.worker.sent.map((entry) => entry.message.kind), ["arenaStart"],
      "two presses that both suspend on the checkpoint fetch must post one start, not two");
    await earlyRejected;
    const only = learned.worker.sent.at(-1).message;
    assert.equal(only.seed, 11, "the newest press is the one that runs");
    learned.worker.emitMessage(recordingMessage(only.requestId, { seed: 11 }));
    assert.equal((await late).seed, 11);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a_recording_is_decoded_rather_than_cast_and_an_unfiltered_stream_must_declare_itself", async () => {
  // **A `postMessage` is structured-cloned data and a TypeScript type is not a
  // trust boundary.** `SimClient` has had `decodeWorkerMessage` since v2-ui-02
  // and this channel had three `as` casts instead, which is the same gap the
  // snapshot path already refuses: a missing `frameCount` does not throw, it
  // makes every `!` in `LiveFightSource` answer `undefined` and draws a body out
  // of `NaN`.
  const { worker, client } = arenaClientHarness();
  const running = client.run(arenaConfig(), () => {});
  await settle();
  const requestId = worker.sent.at(-1).message.requestId;

  const malformed = [
    ["spectator is absent", (over) => { delete over.spectator; }],
    ["spectator is false", (over) => { over.spectator = false; }],
    ["spectator is merely truthy", (over) => { over.spectator = 1; }],
    ["frameCount is missing", (over) => { delete over.frameCount; }],
    ["a buffer is not an ArrayBuffer", (over) => { over.index = [0, 0, 0]; }],
    ["a stride is fractional", (over) => { over.poseStride = 66.5; }],
    ["the fingerprint is not a string", (over) => { over.fingerprint = 0xdeadbeef; }],
  ];
  for (const [what, break_] of malformed) {
    const message = recordingMessage(requestId);
    break_(message);
    worker.emitMessage(message);
    await settle();
    assert.equal(worker.sent.length, 1, `${what}: nothing more is posted`);
  }
  // Not one of the seven settled the promise: a message this client cannot read
  // is dropped, and the recording it is still waiting for arrives afterwards.
  worker.emitMessage(recordingMessage(requestId, { seed: 3 }));
  assert.equal((await running).seed, 3);

  // The same gate on the consuming side, because `LiveFightSource` is also
  // constructed straight from a `Recording` in this file and in the studio.
  assert.throws(() => new LiveFightSource({ ...recordingMessage(1), spectator: false }),
    /does not declare itself a spectator stream/);
});

test("a_recorded_index_that_points_past_its_own_buffers_is_refused_rather_than_clamped", async () => {
  // `subarray` clamps silently, so an index whose start runs past the end of a
  // section is not an exception a reader ever sees -- it is a zero-length view
  // whose every `!` answers `undefined`, and a body decoded out of that draws as
  // garbage rather than throwing. Checked once at construction, so the failure
  // lands at adopt time and not at whatever scrub position somebody dragged to.
  const arena = new FakeArena({ ticks: 8 });
  const { last } = await record(arena, arenaConfig({ maxTicks: 8 }));
  assert.ok(new LiveFightSource(last) instanceof LiveFightSource, "the honest recording is readable");

  const bend = (word, to) => {
    const index = new Uint32Array(new Uint32Array(last.index));
    index[4 * RECORDER.RECORDING_INDEX_STRIDE + word] = to;
    return { ...last, index: index.buffer };
  };
  assert.throws(() => new LiveFightSource(bend(RECORDER.INDEX_POSE_START, 10_000)),
    /addresses pose rows/);
  assert.throws(() => new LiveFightSource(bend(RECORDER.INDEX_REGION_START, 10_000)),
    /addresses region rows/);
  assert.throws(() => new LiveFightSource(bend(RECORDER.INDEX_EVENT_COUNT, 10_000)),
    /addresses combat-event rows/);
  // And a section that is not a whole number of rows at all.
  assert.throws(() => new LiveFightSource({ ...last, poseStride: ABI.POSE_STRIDE + 1 }),
    /not a whole number of rows/);
});

test("the_learned_policy_fetches_its_checkpoint_and_says_so_when_it_cannot", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404, statusText: "Not Found" });
    const { client } = arenaClientHarness();
    await assert.rejects(client.run(arenaConfig({ policies: [4, 2] }), () => {}),
      /checkpoints\/v2-probe\.ckpt/);

    const bytes = new Uint8Array(15_580).fill(7);
    let fetches = 0;
    globalThis.fetch = async (url) => {
      fetches += 1;
      assert.equal(url, "/checkpoints/v2-probe.ckpt");
      return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(0) };
    };
    const second = arenaClientHarness();
    const running = second.client.run(arenaConfig({ policies: [4, 2] }), () => {});
    await settle();
    const posted = second.worker.sent.at(-1);
    assert.equal(posted.message.checkpoint.byteLength, 15_580);
    assert.equal(posted.transfer.length, 2, "the checkpoint travels transferred beside the config");
    second.worker.emitMessage(recordingMessage(posted.message.requestId));
    await running;
    // Fetched once and kept: a reader pressing [Fight] twice should not pull the
    // same fifteen kilobytes twice, and a fresh copy travels each time because
    // the last one was transferred away.
    const again = second.client.run(arenaConfig({ policies: [4, 2] }), () => {});
    await settle();
    assert.equal(fetches, 1);
    assert.equal(second.worker.sent.at(-1).message.checkpoint.byteLength, 15_580);
    second.worker.emitMessage(recordingMessage(second.worker.sent.at(-1).message.requestId));
    await again;
  } finally {
    globalThis.fetch = original;
  }
});
