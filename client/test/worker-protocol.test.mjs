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
], { cwd: ROOT, encoding: "utf8" });
assert.equal(tsc.status, 0, `TypeScript test compilation failed:\n${tsc.stdout}\n${tsc.stderr}`);

const require = createRequire(import.meta.url);
const ABI = require(path.join(OUT, "client/src/protocol/abi.generated.js"));
const MSG = require(path.join(OUT, "client/src/protocol/messages.js"));
const { SimWorkerHost } = require(path.join(OUT, "client/src/runtime/sim-worker-host.js"));
const { SimClient } = require(path.join(OUT, "client/src/runtime/sim-client.js"));
const { parseSnapshot, MAP_UNKNOWN } = require(path.join(OUT, "client/src/state/snapshot.js"));

const header = () => {
  const frame = new Float32Array(ABI.FRAME_MAX);
  frame[0] = 4; frame[1] = 4;
  return frame;
};

class FakeWasm {
  constructor() {
    this.now = 0;
    this.calls = [];
    this.frame = header();
    this.frameLength = ABI.HEADER_LEN;
    this.map = Uint8Array.from({ length: 16 }, (_, i) => i);
    this.vis = new Uint8Array(16).fill(2);
    this.furniture = new Uint8Array(ABI.FURNITURE_MAX * ABI.FURNITURE_STRIDE);
    this.furnitureLength = 0;
    this.focusEntityIndex = ABI.FOCUS_NONE;
    this.focusEntityGeneration = ABI.FOCUS_NONE;
    this.revision = 1;
    this.trap = false;
  }
  init(seed) { this.calls.push(["init", seed]); this.now = 0; }
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
      frame: this.frame, map: this.map, vis: this.vis, furniture: this.furniture,
      frameLength: this.frameLength, mapLength: 16, visLength: 16,
      furnitureLength: this.furnitureLength, mapCols: 4, mapRows: 4,
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

const base = (kind, requestId, extra = {}) => ({ kind, version: 1, requestId, ...extra });
const initMessage = (requestId = 1) => base("init", requestId, { seed: 4 });
const command = (requestId, sequence, targetTick, value, epoch = 1) =>
  base("command", requestId, { epoch, sequence, targetTick, command: value });
const advance = (requestId, elapsedMicros, epoch = 1) => base("advance", requestId, { epoch, elapsedMicros });

async function harness(initialize = true) {
  const wasm = new FakeWasm();
  const sent = [];
  let closes = 0;
  const host = new SimWorkerHost(() => wasm, (message, transfer = []) => sent.push({ message, transfer }), () => { closes++; });
  if (initialize) await host.handle(initMessage());
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
  worker.emitMessage({ kind: "ready", version: 1, requestId: init.requestId,
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
  ];
  for (const name of presentationNames) assert.equal(typeof ABI[name], "number", `${name} is generated`);
  const checker = path.join(ROOT, "tools", "check_abi.js");
  if (fs.existsSync(checker)) assert.equal(spawnSync(process.execPath, [checker], { cwd: ROOT }).status, 0);
});

test("unknown_protocol_versions_fail_closed", async () => {
  const { host, sent, closeCount } = await harness(false);
  await host.handle({ kind: "init", version: 2, requestId: 3, seed: 1 });
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
  assert.deepEqual(sent[0].message, { kind: "ready", version: 1, requestId: 1, cause: "init", epoch: 1, tick: 0, paused: false });
  await host.handle(base("reset", 2, { epoch: 1, seed: 9, paused: true, ignored: "yes" }));
  const ready = messages(sent, "ready").at(-1);
  assert.deepEqual(ready, { kind: "ready", version: 1, requestId: 2, cause: "reset", epoch: 2, tick: 0, paused: true });
  assert.deepEqual(wasm.calls.filter((x) => x[0] === "init"), [["init", 4], ["init", 9]]);
  await host.handle(base("reset", 3, { epoch: 1, seed: 1, paused: false }));
  assert.equal(messages(sent, "error").at(-1).code, "invalidMessage");
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
  await fatalHost.handle({ ...initMessage(4), version: 2 });
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
  await host.handle({ kind: "advance", version: 2, requestId: 3 });
  await host.handle({ kind: "returnSnapshot", version: 1, requestId: 4,
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
  assert.deepEqual(wasm.calls.slice(1), [["goto", -7, 8, 0], ["spawn", 3, 255, 255, 0], ["step", 1, 0]]);
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

test("a_complete_snapshot_contains_one_atomic_frame_map_vis_and_furniture_publication", async () => {
  const { host, sent, wasm } = await harness(false);
  wasm.setRows({ units: [unit()] });
  wasm.map.fill(11); wasm.vis.fill(2);
  wasm.furniture.set([1, 1, 1, 7]); wasm.furnitureLength = 1;
  await host.handle(initMessage());
  const snapshot = messages(sent, "snapshot")[0];
  const view = parseSnapshot(snapshot);
  assert.equal(view.frame[6], 1);
  assert.equal(view.map[0], 11);
  assert.equal(view.vis[0], 2);
  assert.deepEqual([...view.furniture], [1, 1, 1, 7]);
  for (const mutation of [
    { ...snapshot, frameLength: 3.5 }, { ...snapshot, mapCols: 99 },
    { ...snapshot, furnitureLength: ABI.FURNITURE_MAX + 1 },
  ]) assert.throws(() => parseSnapshot(mutation), RangeError);
});

test("snapshot_lengths_shapes_and_byte_extents_are_validated_before_views_exist", async () => {
  const { sent } = await harness();
  const snapshot = messages(sent, "snapshot")[0];
  for (const mutation of [
    { frameLength: ABI.FRAME_MAX + 1 }, { mapLength: snapshot.mapLength - 1 },
    { visLength: snapshot.visLength - 1 }, { furnitureLength: ABI.FURNITURE_MAX + 1 },
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

test("hidden_units_shots_events_and_furniture_do_not_cross_the_worker_boundary", async () => {
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
  await host.handle(initMessage());
  const snapshot = messages(sent, "snapshot")[0];
  const view = parseSnapshot(snapshot);
  assert.deepEqual([view.frame[6], view.frame[7], view.frame[8]], [1, 1, 1]);
  assert.deepEqual([view.frame[3], view.frame[4]], [0, 0]);
  const eventAt = ABI.HEADER_LEN + ABI.UNIT_STRIDE + ABI.SHOT_STRIDE;
  assert.deepEqual([view.frame[eventAt + 4], view.frame[eventAt + 5]], [1, -1]);
  assert.equal(view.map[10], MAP_UNKNOWN);
  assert.deepEqual([...view.furniture], [1, 0, 0, 1]);
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
  worker.emitMessage({ kind: "ready", version: 1, requestId: resetMessage.requestId,
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

  worker.emitMessage({ kind: "ready", version: 1, requestId: resetMessage.requestId,
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

  worker.emitMessage({ kind: "advanceAck", version: 1, requestId: advanceMessage.requestId,
    epoch: 1, tick: 1, steppedTicks: 1, droppedBacklog: false });
  await advancing;
  await Promise.resolve();
  const posted = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "command");
  assert.deepEqual([posted.sequence, posted.targetTick], [1, 1]);
  worker.emitMessage({ kind: "commandAck", version: 1, requestId: posted.requestId,
    epoch: 1, sequence: 1, targetTick: 1, status: "accepted", tick: 1 });
  worker.emitMessage({ kind: "commandAck", version: 1, requestId: posted.requestId,
    epoch: 1, sequence: 1, targetTick: 1, status: "applied", tick: 1 });
  assert.equal((await applying).status, "applied");
});

test("sim_client_posts_pause_only_after_the_outstanding_advance_ack", async () => {
  const { client, worker } = await clientHarness();
  const advancing = client.advance(20_000);
  const advanceMessage = worker.sent.at(-1).message;
  const pausing = client.setPaused(true);
  assert.equal(worker.sent.some((entry) => entry.message.kind === "setPaused"), false);
  worker.emitMessage({ kind: "advanceAck", version: 1, requestId: advanceMessage.requestId,
    epoch: 1, tick: 1, steppedTicks: 1, droppedBacklog: false });
  await advancing;
  await Promise.resolve();
  const pauseMessage = worker.sent.map((entry) => entry.message).findLast((message) => message.kind === "setPaused");
  worker.emitMessage({ kind: "pauseChanged", version: 1, requestId: pauseMessage.requestId,
    epoch: 1, tick: 1, paused: true });
  assert.equal((await pausing).tick, 1);
});

test("sim_client_rejects_malformed_and_cross_wired_worker_responses_fatally", async () => {
  {
    const { client, worker } = await clientHarness();
    const pausing = client.setPaused(true);
    const rejected = assert.rejects(pausing, /malformed worker response/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "pauseChanged", version: 1, requestId: request.requestId,
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
    worker.emitMessage({ kind: "advanceAck", version: 1, requestId: request.requestId,
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
    worker.emitMessage({ kind: "ready", version: 1, requestId: request.requestId,
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
    worker.emitMessage({ kind: "bufferReturned", version: 1, requestId: request.requestId,
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
    worker.emitMessage({ kind: "commandAck", version: 1, requestId: request.requestId,
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
    worker.emitMessage({ kind: "ready", version: 1, requestId: request.requestId,
      cause: "init", epoch: 1, tick: 1, paused: false });
    await rejected;
  }
  {
    const { client, worker } = await clientHarness();
    const pausing = client.setPaused(true);
    const rejected = assert.rejects(pausing, /pauseChanged tick/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "pauseChanged", version: 1, requestId: request.requestId,
      epoch: 1, tick: 1, paused: true });
    await rejected;
  }
  {
    const { client, worker } = await clientHarness();
    const advancing = client.advance(20_000);
    const rejected = assert.rejects(advancing, /advanceAck tick/);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "advanceAck", version: 1, requestId: request.requestId,
      epoch: 1, tick: 2, steppedTicks: 1, droppedBacklog: false });
    await rejected;
  }
  {
    const { client, worker } = await clientHarness();
    const applying = client.command({ kind: "withdraw" }, 0);
    const request = worker.sent.at(-1).message;
    worker.emitMessage({ kind: "commandAck", version: 1, requestId: request.requestId,
      epoch: 1, sequence: 1, targetTick: 0, status: "accepted", tick: 0 });
    const rejected = assert.rejects(applying, /tick does not match its target/);
    worker.emitMessage({ kind: "commandAck", version: 1, requestId: request.requestId,
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
    worker.emitMessage({ kind: "commandAck", version: 1, requestId: request.requestId,
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
    { kind: "error", version: 1, requestId: null, epoch: 1,
      code: "wasmTrap", fatal: true, detail: "deliberate trap" },
    { kind: "terminated", version: 1, epoch: 1 },
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
  worker.emitMessage({ kind: "advanceAck", version: 1, requestId: request.requestId,
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

test("only_the_worker_instantiates_wasm_and_the_vite_build_keeps_v2_paths", () => {
  const main = path.join(ROOT, "client", "src", "v2.ts");
  const worker = path.join(ROOT, "client", "src", "runtime", "sim.worker.ts");
  if (fs.existsSync(main)) assert.doesNotMatch(fs.readFileSync(main, "utf8"), /WebAssembly\.(?:instantiate|compile)/);
  if (fs.existsSync(worker)) assert.match(fs.readFileSync(worker, "utf8"), /WebAssembly\.(?:instantiate|compile)/);
  const html = path.join(ROOT, "web", "v2.html");
  if (fs.existsSync(html)) assert.match(fs.readFileSync(html, "utf8"), /client-src\/v2\.ts/);
});

test("vite_dev_serves_the_v2_entry_from_the_web_root", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(manifest.scripts.dev,
    "cargo build --release --target wasm32-unknown-unknown -p web && vite");
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
    const htmlResponse = await fetch(`${origin}/v2.html`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /src="\/client-src\/v2\.ts"/);
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
  }
});
