import { SNAPSHOT_BUFFER_BYTES } from "../protocol/abi.generated.js";
import {
  MAX_CATCHUP_TICKS, MAX_ELAPSED_MICROS, MAX_FUTURE_TICKS, MAX_QUEUED_COMMANDS,
  TICKS_PER_SECOND, WORKER_PROTOCOL_VERSION, decodeClientMessage, isU32,
  type ClientMessage, type CommandAckMessage, type CommandMessage, type ErrorMessage,
  type LegacyClientCommand, type ProtocolErrorCode, type ReturnSnapshotMessage,
  type SnapshotMessage, type WorkerMessage,
} from "../protocol/messages.js";
import { FixedBufferPool, LeaseTokenExhaustedError } from "./buffer-pool.js";
import { RevisionExhaustedError, SnapshotFilterState, validateLegacyPublication,
  type FilteredPublication, type LegacyPublication } from "../state/snapshot.js";

export interface LegacyWasmAdapter {
  init(seed: number): void;
  setGoto(xMilli: number, yMilli: number): void;
  clearOrder(): void;
  spawnMonster(kindCode: number, primary: number, secondary: number): number;
  step(ticks: number): void;
  tick(): number;
  readPublication(): LegacyPublication;
}

export type WasmFactory = () => LegacyWasmAdapter | Promise<LegacyWasmAdapter>;
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
  private wasm: LegacyWasmAdapter | null = null;
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
    if (rawRecord?.kind === "returnSnapshot" && rawRecord.version === 1
      && rawRecord.bufferId !== 0 && rawRecord.bufferId !== 1 && rawRecord.bufferId !== 2) {
      this.error(isU32(rawRecord.requestId) ? rawRecord.requestId : null, "invalidBufferId", false, "snapshot buffer id is not 0, 1, or 2");
      return;
    }
    const decoded = decodeClientMessage(raw);
    if (!decoded.ok) {
      this.error(decoded.requestId, decoded.code, decoded.code === "unknownVersion", decoded.detail);
      return;
    }
    const message = decoded.message;
    if (message.kind === "returnSnapshot") return this.returnSnapshot(message);
    if (!this.wasm) {
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
      this.send({ kind: "pauseChanged", version: 1, requestId: message.requestId, epoch: this.epoch, tick: this.tick(), paused: this.paused });
      return;
    }
    if (message.kind === "advance") return this.advance(message.requestId, message.elapsedMicros);
  }

  diagnostics(): HostDiagnostics {
    const pool = this.pool?.diagnostics();
    return {
      initialized: this.wasm !== null, fatal: this.fatal, epoch: this.epoch, paused: this.paused,
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
      validateLegacyPublication(wasm.readPublication());
      this.wasm = wasm;
      this.pool = new FixedBufferPool(SNAPSHOT_BUFFER_BYTES);
      this.epoch = 1;
      this.paused = false;
      this.filter.reset();
      this.send({ kind: "ready", version: 1, requestId, cause: "init", epoch: 1, tick: this.tick(), paused: false });
      this.publish();
    } catch (error) {
      if (!this.fatal && !this.terminated) this.error(requestId, this.fatalCode(error), true, String(error));
    } finally {
      this.initializing = false;
    }
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
      validateLegacyPublication(this.requireWasm().readPublication());
      this.send({ kind: "ready", version: 1, requestId, cause: "reset", epoch: this.epoch, tick: this.tick(), paused });
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
      this.send({ kind: "advanceAck", version: 1, requestId, epoch: this.epoch, tick: this.tick(), steppedTicks: due, droppedBacklog });
    } catch (error) {
      this.error(requestId, this.fatalCode(error), true, String(error));
    }
  }

  private apply(command: LegacyClientCommand): number | undefined {
    const wasm = this.requireWasm();
    if (command.kind === "goto") return void wasm.setGoto(command.xMilli, command.yMilli);
    if (command.kind === "withdraw") return void wasm.clearOrder();
    return wasm.spawnMonster(command.kindCode, command.primary, command.secondary) >>> 0;
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
      kind: "snapshot", version: WORKER_PROTOCOL_VERSION, epoch: this.epoch, tick: this.tick(),
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
    this.send({ kind: "bufferReturned", version: 1, requestId: message.requestId, epoch: this.epoch,
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
    this.send({ kind: "commandAck", version: 1, requestId: message.requestId, epoch: this.epoch,
      sequence: message.sequence, targetTick: message.targetTick, status, tick, ...(reason ? { reason } : {}),
      ...(result === undefined ? {} : { result }) });
  }

  private error(requestId: number | null, code: ProtocolErrorCode, fatal: boolean, detail: string): void {
    const message: ErrorMessage = { kind: "error", version: 1, requestId, epoch: this.epoch, code, fatal, detail };
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
    this.send({ kind: "terminated", version: 1, epoch: this.epoch });
    this.close();
  }

  private tick(): number {
    return this.wasm ? this.wasm.tick() >>> 0 : 0;
  }

  private requireWasm(): LegacyWasmAdapter {
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
