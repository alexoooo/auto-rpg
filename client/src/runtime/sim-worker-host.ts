import { SNAPSHOT_BUFFER_BYTES } from "../protocol/abi.generated.js";
import {
  MAX_CATCHUP_TICKS, MAX_ELAPSED_MICROS, MAX_FUTURE_TICKS, MAX_QUEUED_COMMANDS,
  LEGACY_WORKER_PROTOCOL_VERSION, TICKS_PER_SECOND, WORKER_PROTOCOL_VERSION,
  decodeClientMessage, isU32,
  type ArenaRejectReason, type ArenaStartMessage, type ClientMessage,
  type CommandAckMessage, type CommandMessage, type ErrorMessage,
  type LegacyClientCommand, type ProtocolErrorCode, type ProtocolVersion,
  type ReturnSnapshotMessage, type SnapshotMessage, type WorkerMessage,
} from "../protocol/messages.js";
import { FixedBufferPool, LeaseTokenExhaustedError } from "./buffer-pool.js";
import { RevisionExhaustedError, SnapshotFilterState, validateLegacyPublication,
  type FilteredPublication, type LegacyPublication } from "../state/snapshot.js";
import {
  ARENA_CONFIG_BYTES, ARENA_CONFIG_LAYOUT_VERSION, decodeArenaConfig,
} from "./arena-config.js";
import { recordArenaFight, type ArenaWasmAdapter } from "./arena-recorder.js";

export interface LegacyWasmAdapter {
  init(seed: number): void;
  setControl(mask: number): void;
  control(): number;
  setInput(moveXMilli: number, moveYMilli: number, aimRaw: number, reachMilli: number, slot: number, strike: number, turnMilli: number): void;
  spawnMonster(kindCode: number, primary: number, secondary: number): number;
  swapInHero(kindCode: number, primary: number, secondary: number): number;
  step(ticks: number): void;
  tick(): number;
  readPublication(): LegacyPublication;
}

/**
 * One wasm instance, seen through both facets.
 *
 * The two share nothing but the module: a game session drives `init` and the
 * pooled snapshot path, an arena session drives `arena_start` and the recorder.
 * They are on one adapter because they are one instance, and a worker is one
 * kind of session or the other for its whole life -- `arena_start` installs a
 * world over `SIM`, so a recording started inside a live game would replace the
 * world its epochs and leases are about.
 */
export interface WasmAdapter extends LegacyWasmAdapter {
  readonly arena: ArenaWasmAdapter;
}

export type WasmFactory = () => WasmAdapter | Promise<WasmAdapter>;
export type WorkerSink = (message: WorkerMessage, transfer?: readonly ArrayBuffer[]) => void;
export type WorkerClose = () => void;
type Queued = CommandMessage;

export type HostDiagnostics = {
  initialized: boolean; fatal: boolean; epoch: number; paused: boolean;
  queueLength: number; lastAcceptedSequence: number; lastAppliedSequence: number;
  coalescedSnapshots: number; allocations: 0 | 3; freeBuffers: number; outstandingBuffers: number;
  coalescedSnapshotsSaturated: boolean;
};

export class SimWorkerHost {
  private readonly factory: WasmFactory;
  private readonly sink: WorkerSink;
  private readonly close: WorkerClose;
  private wasm: WasmAdapter | null = null;
  /**
   * The version this session opened with, and every later message must match it.
   *
   * `articulated-mechanical-gate.md` commits v2 to accepting **exact** V1
   * sessions, and exact is what this enforces: a session is one version for its
   * whole life, so the unsolicited messages -- a snapshot, a `terminated` --
   * have a version to carry without guessing which request they belong to.
   */
  private sessionVersion: ProtocolVersion | null = null;
  /** An arena recording is in flight for this request id. */
  private arenaRequestId: number | null = null;
  private arenaCancelled = false;
  /** An arena session has run here, so this worker is not a game worker. */
  private arenaSession = false;
  /** A game session has been initialized here, so this worker is not an arena. */
  private gameSession = false;
  private pool: FixedBufferPool | null = null;
  private initializing = false;
  private readonly filter = new SnapshotFilterState();
  private epoch = 0;
  private paused = false;
  private fatal = false;
  private terminated = false;
  private accumulator = 0;
  private queue: Queued[] = [];
  private lastAcceptedSequence = 0;
  private lastAcceptedTargetTick = 0;
  private lastAppliedSequence = 0;
  private coalescedSnapshots = 0;
  private coalescedSnapshotsSaturated = false;

  constructor(factory: WasmFactory, sink: WorkerSink, close: WorkerClose = () => {}) {
    this.factory = factory;
    this.sink = sink;
    this.close = close;
  }

  async handle(raw: unknown): Promise<void> {
    if (this.terminated) return;
    if (this.fatal) {
      const returned = decodeClientMessage(raw);
      if (returned.ok && returned.message.kind === "returnSnapshot") this.returnSnapshot(returned.message);
      return;
    }
    const rawRecord = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;
    const rawVersion = rawRecord?.version;
    const knownVersion = rawVersion === WORKER_PROTOCOL_VERSION
      || rawVersion === LEGACY_WORKER_PROTOCOL_VERSION;
    // Ahead of the decoder, because a buffer id is the one field whose failure a
    // caller can act on -- "you sent slot 9" rather than "your message is
    // invalid". Both accepted versions, since a V1 session returns buffers too.
    if (rawRecord?.kind === "returnSnapshot" && knownVersion
      && rawRecord.bufferId !== 0 && rawRecord.bufferId !== 1 && rawRecord.bufferId !== 2) {
      const requestId = isU32(rawRecord.requestId) ? rawRecord.requestId : null;
      // **The session rule outranks the buffer id, and this branch sat in front
      // of it.** Standing ahead of the decoder also stood ahead of
      // `sessionVersion`, so a V1 `returnSnapshot` carrying slot 9 into a V2
      // session was answered `invalidBufferId` -- a non-fatal refusal about a
      // field -- when what is wrong with it is that it is a V1 message in a V2
      // session, which is fatal and is the property this file says a session has
      // for its whole life. Nothing mutated either way, which is why this was low
      // severity and not why it was acceptable.
      if (this.sessionVersion !== null && this.sessionVersion !== rawVersion) {
        return this.error(requestId, "unknownVersion", true,
          `this session opened at protocol version ${this.sessionVersion} and cannot mix version ${rawVersion}`);
      }
      // And answered in the message's *own* version rather than in the default,
      // because a refusal is not an acceptance: a malformed first message does
      // not open a session, so there is no session version to answer in and the
      // only honest one is the one the caller wrote down.
      this.error(requestId, "invalidBufferId", false, "snapshot buffer id is not 0, 1, or 2",
        rawVersion);
      return;
    }
    const decoded = decodeClientMessage(raw);
    if (!decoded.ok) {
      this.error(decoded.requestId, decoded.code, decoded.code === "unknownVersion", decoded.detail);
      return;
    }
    const message = decoded.message;
    if (this.sessionVersion === null) this.sessionVersion = message.version;
    else if (this.sessionVersion !== message.version) {
      return this.error(message.requestId, "unknownVersion", true,
        `this session opened at protocol version ${this.sessionVersion} and cannot mix version ${message.version}`);
    }
    if (message.kind === "returnSnapshot") return this.returnSnapshot(message);
    if (message.kind === "arenaStart") return this.arenaStart(message);
    if (message.kind === "arenaCancel") {
      // Idempotent and unacknowledged when nothing is recording. A reader who
      // pressed [Fight] and then navigated has no recording to stop, and a
      // refusal for that would be a message the page has nowhere to put.
      if (this.arenaRequestId !== null) this.arenaCancelled = true;
      return;
    }
    if (!this.gameSession) {
      if (this.arenaSession) {
        return this.error(message.requestId, "alreadyInitialized", false,
          "this worker is recording arena fights; a game session needs a worker of its own");
      }
      if (message.kind !== "init") return this.error(message.requestId, "notInitialized", false, "init must be the first message");
      if (this.initializing) return this.error(message.requestId, "alreadyInitialized", false, "worker initialization is already in progress");
      return this.initialize(message.requestId, message.seed);
    }
    if (message.kind === "init") return this.error(message.requestId, "alreadyInitialized", false, "worker is already initialized");
    if (message.kind === "command") return this.command(message);
    if (message.epoch !== this.epoch) return this.error(message.requestId, "invalidMessage", false, `message epoch ${message.epoch} does not match ${this.epoch}`);
    if (message.kind === "reset") return this.reset(message.requestId, message.seed, message.paused);
    if (message.kind === "setPaused") {
      this.paused = message.paused;
      this.accumulator = 0;
      this.send({ kind: "pauseChanged", version: this.version(), requestId: message.requestId, epoch: this.epoch, tick: this.tick(), paused: this.paused });
      return;
    }
    if (message.kind === "advance") return this.advance(message.requestId, message.elapsedMicros);
  }

  diagnostics(): HostDiagnostics {
    const pool = this.pool?.diagnostics();
    return {
      initialized: this.gameSession, fatal: this.fatal, epoch: this.epoch, paused: this.paused,
      queueLength: this.queue.length, lastAcceptedSequence: this.lastAcceptedSequence,
      lastAppliedSequence: this.lastAppliedSequence, coalescedSnapshots: this.coalescedSnapshots,
      coalescedSnapshotsSaturated: this.coalescedSnapshotsSaturated,
      allocations: pool ? 3 : 0, freeBuffers: pool?.free ?? 0, outstandingBuffers: pool?.outstanding ?? 0,
    };
  }

  handleUnhandledError(error: unknown): void {
    if (this.terminated) return;
    if (!this.fatal) this.error(null, "wasmTrap", true, String(error));
    else this.maybeTerminate();
  }

  private async initialize(requestId: number, seed: number): Promise<void> {
    this.initializing = true;
    try {
      const wasm = await this.factory();
      if (this.fatal || this.terminated) return;
      wasm.init(seed);
      wasm.setControl(0);
      wasm.setInput(0, 0, 0, 0, 0, 0, 0);
      validateLegacyPublication(wasm.readPublication());
      this.wasm = wasm;
      this.gameSession = true;
      this.pool = new FixedBufferPool(SNAPSHOT_BUFFER_BYTES);
      this.epoch = 1;
      this.paused = false;
      this.filter.reset();
      this.send({ kind: "ready", version: this.version(), requestId, cause: "init", epoch: 1, tick: this.tick(), paused: false });
      this.publish();
    } catch (error) {
      if (!this.fatal && !this.terminated) this.error(requestId, this.fatalCode(error), true, String(error));
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Record one configured duel and post it back whole.
   *
   * **Refused rather than queued when a game session owns this worker.**
   * `arena_start` installs a world over `SIM`, so a recording started inside a
   * live game would replace the world that session's epoch, its command targets
   * and its outstanding leases are all about -- and nothing in the snapshot path
   * would notice. `wrongModel` is the honest name for it: the request is fine,
   * the worker is the wrong one.
   */
  private async arenaStart(message: ArenaStartMessage): Promise<void> {
    if (this.gameSession || this.initializing) {
      return this.arenaRejected(message.requestId, "wrongModel", 0,
        "this worker is running a game session; an arena recording needs a worker of its own");
    }
    if (this.arenaRequestId !== null) {
      return this.arenaRejected(message.requestId, "arenaBusy", 0,
        `a recording started by request ${this.arenaRequestId} is still running`);
    }
    // Length and the sole layout field, checked before wasm is touched -- the
    // articulated-command payload rule applied to the wider buffer. Everything
    // else about these bytes is the module's to judge, and it answers a named
    // refusal for each; a second opinion here would be a second thing to
    // disagree with `install_arena` about.
    const bytes = new Uint8Array(message.config);
    const config = decodeArenaConfig(bytes, message.seed);
    if (config === null) {
      return this.arenaRejected(message.requestId, "unknownLayout", 0,
        `an arena configuration is ${ARENA_CONFIG_BYTES} bytes at layout version ` +
        `${ARENA_CONFIG_LAYOUT_VERSION}, and this one is ${bytes.length} bytes`);
    }
    this.arenaSession = true;
    this.arenaRequestId = message.requestId;
    this.arenaCancelled = false;
    try {
      const wasm = this.wasm ?? await this.factory();
      if (this.fatal || this.terminated) return;
      this.wasm = wasm;
      const checkpoint = message.checkpoint === null ? null : new Uint8Array(message.checkpoint);
      const result = await recordArenaFight(
        wasm.arena, config, bytes, checkpoint,
        {
          onProgress: (ticksDone, ticksTotal) => {
            if (this.fatal || this.terminated) return;
            this.send({ kind: "arenaProgress", version: WORKER_PROTOCOL_VERSION,
              requestId: message.requestId, ticksDone, ticksTotal });
          },
          // A macrotask and not a microtask. A worker services no message while
          // JavaScript is on the stack, and a microtask queue drains before the
          // event loop turns -- so `queueMicrotask` here would yield to nothing
          // and cancel would arrive after the fight had already finished.
          yieldToMessages: () => new Promise<void>((resolve) => { setTimeout(resolve, 0); }),
        },
        () => this.arenaCancelled,
      );
      if (this.fatal || this.terminated) return;
      if (!result.ok) {
        return this.arenaRejected(message.requestId, result.reason, result.packed, result.detail);
      }
      const recording = {
        kind: "fightRecording" as const, version: WORKER_PROTOCOL_VERSION,
        requestId: message.requestId, ...result.recording,
      };
      this.send(recording, [
        recording.poses, recording.regions, recording.projectiles,
        recording.events, recording.index, recording.health,
      ]);
    } catch (error) {
      if (!this.fatal && !this.terminated) this.error(message.requestId, this.fatalCode(error), true, String(error));
    } finally {
      this.arenaRequestId = null;
      this.arenaCancelled = false;
    }
  }

  private arenaRejected(requestId: number, reason: ArenaRejectReason, packed: number, detail: string): void {
    this.send({ kind: "arenaRejected", version: WORKER_PROTOCOL_VERSION, requestId, reason, packed, detail });
  }

  private reset(requestId: number, seed: number, paused: boolean): void {
    if (this.epoch === 0xffff_ffff) return this.error(requestId, "epochExhausted", true, "epoch cannot wrap to zero");
    const oldTick = this.tick();
    for (const queued of this.queue) this.commandAck(queued, "rejected", oldTick, "oldEpoch");
    this.queue = [];
    this.epoch++;
    this.lastAcceptedSequence = 0;
    this.lastAcceptedTargetTick = 0;
    this.lastAppliedSequence = 0;
    this.accumulator = 0;
    this.paused = paused;
    this.filter.reset();
    try {
      this.requireWasm().init(seed);
      this.requireWasm().setControl(0);
      this.requireWasm().setInput(0, 0, 0, 0, 0, 0, 0);
      validateLegacyPublication(this.requireWasm().readPublication());
      this.send({ kind: "ready", version: this.version(), requestId, cause: "reset", epoch: this.epoch, tick: this.tick(), paused });
      this.publish();
    } catch (error) {
      return this.error(requestId, this.fatalCode(error), true, String(error));
    }
  }

  private command(message: CommandMessage): void {
    const tick = this.tick();
    if (message.epoch !== this.epoch) return this.commandAck(message, "rejected", tick, message.epoch < this.epoch ? "oldEpoch" : "futureEpoch");
    if (message.sequence <= this.lastAcceptedSequence) return this.commandAck(message, "rejected", tick, "duplicateSequence");
    if (message.sequence !== this.lastAcceptedSequence + 1) return this.commandAck(message, "rejected", tick, "sequenceGap");
    if (message.targetTick < tick) return this.commandAck(message, "rejected", tick, "lateTargetTick");
    if (message.targetTick < this.lastAcceptedTargetTick) return this.commandAck(message, "rejected", tick, "regressedTargetTick");
    if (message.targetTick - tick > MAX_FUTURE_TICKS) return this.commandAck(message, "rejected", tick, "targetTooFar");
    if (this.queue.length >= MAX_QUEUED_COMMANDS) return this.commandAck(message, "rejected", tick, "queueFull");
    this.queue.push(message);
    this.lastAcceptedSequence = message.sequence;
    this.lastAcceptedTargetTick = message.targetTick;
    this.commandAck(message, "accepted", tick);
  }

  private advance(requestId: number, elapsedMicros: number): void {
    let due = 0;
    let droppedBacklog = false;
    if (!this.paused) {
      this.accumulator += Math.min(elapsedMicros, MAX_ELAPSED_MICROS) * TICKS_PER_SECOND;
      due = Math.floor(this.accumulator / 1_000_000);
      if (due > MAX_CATCHUP_TICKS) {
        due = MAX_CATCHUP_TICKS;
        droppedBacklog = true;
        this.accumulator = 0;
      } else {
        this.accumulator -= due * 1_000_000;
      }
    } else {
      this.accumulator = 0;
    }

    let remaining = due;
    let published = false;
    try {
      while (true) {
        while (this.queue[0]?.targetTick === this.tick()) {
          const queued = this.queue.shift() as Queued;
          const result = this.apply(queued.command);
          this.lastAppliedSequence = queued.sequence;
          this.commandAck(queued, "applied", queued.targetTick, undefined, result);
          this.publish();
          published = true;
        }
        if (remaining === 0) break;
        const tick = this.tick();
        const nextTarget = this.queue[0]?.targetTick;
        const batch = Math.min(remaining, nextTarget === undefined ? remaining : Math.max(1, nextTarget - tick));
        this.requireWasm().step(batch);
        remaining -= batch;
        this.publish();
        published = true;
      }
      if (!published) this.publish();
      this.send({ kind: "advanceAck", version: this.version(), requestId, epoch: this.epoch, tick: this.tick(), steppedTicks: due, droppedBacklog });
    } catch (error) {
      this.error(requestId, this.fatalCode(error), true, String(error));
    }
  }

  private apply(command: LegacyClientCommand): number | undefined {
    const wasm = this.requireWasm();
    if (command.kind === "setControl") {
      wasm.setControl(command.mask);
      return wasm.control() >>> 0;
    }
    if (command.kind === "setInput") return void wasm.setInput(command.moveXMilli, command.moveYMilli,
      command.aimRaw, command.reachMilli, command.slot, command.strike, command.turnMilli);
    if (command.kind === "spawn") {
      return wasm.spawnMonster(command.kindCode, command.primary, command.secondary) >>> 0;
    }
    return wasm.swapInHero(command.kindCode, command.primary, command.secondary) >>> 0;
  }

  private publish(): void {
    const pool = this.pool;
    if (!pool) return;
    let lease;
    try {
      lease = pool.checkout(this.epoch);
    } catch (error) {
      if (error instanceof LeaseTokenExhaustedError) return this.error(null, "leaseTokenExhausted", true, error.message);
      throw error;
    }
    if (!lease) {
      if (this.coalescedSnapshots === 0xffff_ffff) this.coalescedSnapshotsSaturated = true;
      else this.coalescedSnapshots++;
      return;
    }
    let metadata: FilteredPublication;
    try {
      metadata = this.filter.filter(this.requireWasm().readPublication(), lease.buffer);
    } catch (error) {
      pool.reclaimUntransferred(lease);
      throw error;
    }
    const message: SnapshotMessage = {
      kind: "snapshot", version: this.version(), epoch: this.epoch, tick: this.tick(),
      lastAppliedSequence: this.lastAppliedSequence, coalescedSnapshots: this.coalescedSnapshots,
      coalescedSnapshotsSaturated: this.coalescedSnapshotsSaturated,
      poolAllocationsTotal: 3, buffersFree: pool.diagnostics().free, buffersOutstanding: pool.outstandingCount(),
      queuedCommands: this.queue.length,
      bufferId: lease.bufferId, leaseToken: lease.leaseToken, ...metadata, buffer: lease.buffer,
    };
    this.coalescedSnapshots = 0;
    this.coalescedSnapshotsSaturated = false;
    this.send(message, [lease.buffer]);
  }

  private returnSnapshot(message: ReturnSnapshotMessage): void {
    if (!this.pool) return this.error(message.requestId, "invalidLeaseToken", false, "no snapshot lease exists before init");
    const returned = this.pool.reclaim(message);
    if (!returned.ok) return this.error(message.requestId, returned.error, false, `snapshot return failed: ${returned.error}`);
    new Uint8Array(message.buffer).fill(0);
    this.send({ kind: "bufferReturned", version: this.version(), requestId: message.requestId, epoch: this.epoch,
      bufferId: message.bufferId, leaseToken: message.leaseToken, disposition: "reclaimed" });
    if (this.coalescedSnapshots > 0 && !this.fatal) {
      try {
        this.publish();
      } catch (error) {
        this.error(message.requestId, this.fatalCode(error), true, String(error));
      }
    }
    this.maybeTerminate();
  }

  private commandAck(message: CommandMessage, status: "accepted" | "rejected" | "applied", tick: number,
    reason?: CommandAckMessage["reason"], result?: number): void {
    this.send({ kind: "commandAck", version: this.version(), requestId: message.requestId, epoch: this.epoch,
      sequence: message.sequence, targetTick: message.targetTick, status, tick, ...(reason ? { reason } : {}),
      ...(result === undefined ? {} : { result }) });
  }

  /**
   * `version` overrides the session's, for the one caller that has no session.
   *
   * A refusal issued before any message was accepted has no session version to
   * answer in -- `version()` would answer the default, which is a claim about a
   * session that does not exist -- so the pre-decoder buffer-id branch passes the
   * version the caller wrote down instead.
   */
  private error(requestId: number | null, code: ProtocolErrorCode, fatal: boolean, detail: string,
    version: ProtocolVersion = this.version()): void {
    const message: ErrorMessage = { kind: "error", version, requestId, epoch: this.epoch, code, fatal, detail };
    if (fatal) {
      this.fatal = true;
      this.queue = [];
    }
    this.send(message);
    if (fatal) this.maybeTerminate();
  }

  private fatalCode(error: unknown): ProtocolErrorCode {
    if (error instanceof RevisionExhaustedError) return "revisionExhausted";
    if (error instanceof RangeError) return "wasmAbiMismatch";
    return "wasmTrap";
  }

  private maybeTerminate(): void {
    if (!this.fatal || this.terminated || (this.pool?.outstandingCount() ?? 0) !== 0) return;
    this.terminated = true;
    this.send({ kind: "terminated", version: this.version(), epoch: this.epoch });
    this.close();
  }

  private version(): ProtocolVersion {
    return this.sessionVersion ?? WORKER_PROTOCOL_VERSION;
  }

  private tick(): number {
    return this.wasm ? this.wasm.tick() >>> 0 : 0;
  }

  private requireWasm(): WasmAdapter {
    if (!this.wasm) throw new Error("wasm is not initialized");
    return this.wasm;
  }

  private send(message: WorkerMessage, transfer?: readonly ArrayBuffer[]): void {
    this.sink(message, transfer);
  }

  // Boundary seams for exact exhaustion/saturation tests without billions of messages.
  setEpochForTest(epoch: number): void { this.epoch = epoch; }
  setCoalescedSnapshotsForTest(value: number): void {
    this.coalescedSnapshots = value;
    this.coalescedSnapshotsSaturated = false;
  }
  setNextLeaseTokenForTest(value: number): void { this.pool?.setNextLeaseTokenForTest(value); }
}
