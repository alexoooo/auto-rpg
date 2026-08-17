import {
  WORKER_PROTOCOL_VERSION,
  MAX_CATCHUP_TICKS,
  type AdvanceAckMessage, type AdvanceMessage, type BufferReturnedMessage, type CommandAckMessage,
  type ErrorMessage, type LegacyClientCommand, type PauseChangedMessage,
  type InitMessage, type ReadyMessage, type ResetMessage, type ReturnSnapshotMessage,
  type SetPausedMessage, type SnapshotMessage,
  isU32, type WorkerMessage,
} from "../protocol/messages.js";
import { parseSnapshot, type SnapshotView } from "../state/snapshot.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isBufferId = (value: unknown): value is 0 | 1 | 2 => value === 0 || value === 1 || value === 2;
const rejectReasons = new Set([
  "oldEpoch", "futureEpoch", "duplicateSequence", "sequenceGap", "lateTargetTick",
  "regressedTargetTick", "targetTooFar", "queueFull", "invalidCommand",
]);
const errorCodes = new Set([
  "unknownVersion", "notInitialized", "alreadyInitialized", "invalidMessage",
  "invalidBufferId", "invalidLeaseToken", "invalidBufferCapacity", "epochExhausted",
  "leaseTokenExhausted", "revisionExhausted", "wasmAbiMismatch", "wasmTrap",
]);

function decodeWorkerMessage(value: unknown): WorkerMessage | null {
  if (!isRecord(value) || value.version !== WORKER_PROTOCOL_VERSION || typeof value.kind !== "string") return null;
  const request = () => isU32(value.requestId);
  const epoch = (nonzero = true) => isU32(value.epoch, nonzero);
  const tick = () => isU32(value.tick);
  switch (value.kind) {
    case "ready":
      if (request() && epoch() && tick() && (value.cause === "init" || value.cause === "reset")
        && typeof value.paused === "boolean") return value as ReadyMessage;
      break;
    case "pauseChanged":
      if (request() && epoch() && tick() && typeof value.paused === "boolean") return value as PauseChangedMessage;
      break;
    case "advanceAck":
      if (request() && epoch() && tick() && isU32(value.steppedTicks)
        && value.steppedTicks <= MAX_CATCHUP_TICKS
        && typeof value.droppedBacklog === "boolean") return value as AdvanceAckMessage;
      break;
    case "commandAck": {
      const status = value.status === "accepted" || value.status === "rejected" || value.status === "applied";
      const reason = value.reason === undefined || (typeof value.reason === "string" && rejectReasons.has(value.reason));
      const result = value.result === undefined || isU32(value.result);
      if (request() && epoch() && tick() && isU32(value.sequence, true) && isU32(value.targetTick)
        && status && reason && result && (value.status === "rejected") === (value.reason !== undefined)
        && (value.status === "applied" || value.result === undefined)) {
        return value as CommandAckMessage;
      }
      break;
    }
    case "snapshot": {
      const integers = [value.tick, value.lastAppliedSequence, value.coalescedSnapshots,
        value.frameLayoutVersion, value.headerLength, value.unitStride, value.shotStride,
        value.eventStride, value.furnitureStride, value.frameLength, value.mapLength,
        value.dungeonObjectLayoutVersion, value.dungeonObjectStride,
        value.visLength, value.furnitureLength, value.dungeonObjectLength, value.dungeonObjectsDropped,
        value.mapCols, value.mapRows, value.mapTileSizeMilli, value.mapRevision, value.visRevision,
        value.furnitureRevision, value.dungeonObjectRevision,
        value.poolAllocationsTotal, value.buffersFree, value.buffersOutstanding, value.queuedCommands];
      if (epoch() && isBufferId(value.bufferId) && isU32(value.leaseToken, true)
        && integers.every((field) => isU32(field))
        && typeof value.coalescedSnapshotsSaturated === "boolean"
        && value.buffer instanceof ArrayBuffer) return value as SnapshotMessage;
      break;
    }
    case "bufferReturned":
      if (request() && epoch() && isBufferId(value.bufferId) && isU32(value.leaseToken, true)
        && value.disposition === "reclaimed") return value as BufferReturnedMessage;
      break;
    case "error":
      if ((value.requestId === null || isU32(value.requestId)) && epoch(false)
        && typeof value.code === "string" && errorCodes.has(value.code)
        && typeof value.fatal === "boolean" && typeof value.detail === "string") return value as ErrorMessage;
      break;
    case "terminated":
      if (epoch(false)) return value as WorkerMessage;
      break;
  }
  return null;
}

type PendingResponse = ReadyMessage | PauseChangedMessage | AdvanceAckMessage;
type ControlMessage = InitMessage | ResetMessage | SetPausedMessage | AdvanceMessage;
type PendingRequest = {
  kind: "control";
  responseKind: "ready" | "pauseChanged" | "advanceAck";
  epoch: number;
  tick: number;
  cause?: "init" | "reset";
  paused?: boolean;
  resolve: (message: PendingResponse) => void;
  reject: (error: Error) => void;
} | {
  kind: "command";
  epoch: number;
  sequence: number;
  targetTick: number;
  accepted: boolean;
  resolve: (message: CommandAckMessage) => void;
  reject: (error: Error) => void;
};

type CommandIntent = {
  command: LegacyClientCommand;
  targetTick: number | undefined;
  resolve: (message: CommandAckMessage) => void;
  reject: (error: Error) => void;
};

export type ClientDiagnostics = {
  epoch: number; tick: number; lastAppliedSequence: number; paused: boolean;
  retainedSnapshots: 0 | 1 | 2 | 3; pendingAdvances: 0 | 1; pendingRequests: number;
  coalescedSnapshots: number; coalescedSnapshotsSaturated: boolean;
  resetting: boolean; terminal: boolean; diagnosticBufferExhaustion: boolean;
  poolAllocationsTotal?: number; buffersFree?: number; buffersOutstanding?: number;
  queuedCommands?: number;
};

export type ClientSnapshot = { message: SnapshotMessage; view: SnapshotView };

export class SimClient {
  readonly worker: Worker;
  onSnapshot: ((snapshot: ClientSnapshot) => void) | null = null;
  onDiagnostics: ((diagnostics: ClientDiagnostics) => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  private epoch = 0;
  private tick = 0;
  private paused = false;
  private nextRequestId = 1;
  private nextSequence = 1;
  private lastAppliedSequence = 0;
  private coalescedSnapshots = 0;
  private coalescedSnapshotsSaturated = false;
  private terminalError: Error | null = null;
  private workerTerminated = false;
  private resetBarrierRequestId: number | null = null;
  private current: ClientSnapshot | null = null;
  private diagnosticBufferExhaustion = false;
  private readonly diagnosticHeldSnapshots: ClientSnapshot[] = [];
  private readonly pending = new Map<number, PendingRequest>();
  private readonly pendingReturns = new Map<number, { bufferId: 0 | 1 | 2; leaseToken: number }>();
  private advancePromise: Promise<AdvanceAckMessage> | null = null;
  private commandAwaitingAcceptance = false;
  private readonly commandIntents: CommandIntent[] = [];

  constructor(worker: Worker) {
    this.worker = worker;
    worker.addEventListener("message", (event: MessageEvent<unknown>) => this.receive(event.data));
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || "simulation worker failed"), false);
    });
    worker.addEventListener("messageerror", () => this.fail(new Error("simulation worker sent an unreadable message"), false));
  }

  init(seed: number): Promise<ReadyMessage> {
    if (this.epoch !== 0) return Promise.reject(new Error("simulation client is already initialized"));
    const requestId = this.allocateRequestId();
    return this.control<ReadyMessage>({ kind: "init", version: WORKER_PROTOCOL_VERSION, requestId, seed });
  }

  reset(seed: number, paused = this.paused): Promise<ReadyMessage> {
    this.assertReady();
    this.releaseAllSnapshots();
    this.rejectUnsentCommands(new Error("reset discarded an unsent command"));
    const requestId = this.allocateRequestId();
    this.resetBarrierRequestId = requestId;
    return this.control<ReadyMessage>({ kind: "reset", version: WORKER_PROTOCOL_VERSION, requestId, epoch: this.epoch, seed, paused });
  }

  setPaused(paused: boolean): Promise<PauseChangedMessage> {
    this.assertReady();
    if (this.advancePromise) return this.advancePromise.then(() => this.setPaused(paused));
    const requestId = this.allocateRequestId();
    return this.control<PauseChangedMessage>({ kind: "setPaused", version: WORKER_PROTOCOL_VERSION, requestId, epoch: this.epoch, paused });
  }

  advance(elapsedMicros: number): Promise<AdvanceAckMessage> {
    this.assertReady();
    if (this.advancePromise) return this.advancePromise;
    const requestId = this.allocateRequestId();
    const promise = this.control<AdvanceAckMessage>({
      kind: "advance", version: WORKER_PROTOCOL_VERSION, requestId, epoch: this.epoch, elapsedMicros,
    });
    this.advancePromise = promise;
    void promise.finally(() => {
      if (this.advancePromise === promise) this.advancePromise = null;
      this.pumpCommands();
      this.reportDiagnostics();
    }).catch(() => undefined);
    this.reportDiagnostics();
    return promise;
  }

  command(command: LegacyClientCommand, targetTick?: number): Promise<CommandAckMessage> {
    this.assertReady();
    return new Promise((resolve, reject) => {
      this.commandIntents.push({ command, targetTick, resolve, reject });
      this.pumpCommands();
    });
  }

  snapshot(): ClientSnapshot | null {
    return this.diagnosticHeldSnapshots.at(-1) ?? this.current;
  }

  /** Diagnostic only: deliberately exhaust the three-slot snapshot pool. */
  beginDiagnosticBufferExhaustion(): void {
    this.assertReady();
    if (this.diagnosticBufferExhaustion) throw new Error("diagnostic buffer exhaustion is already active");
    this.diagnosticBufferExhaustion = true;
    this.releaseCurrent();
    this.reportDiagnostics();
  }

  /** Diagnostic only: return every exact lease held by the exhaustion probe. */
  releaseDiagnosticBufferExhaustion(): void {
    this.assertReady();
    if (!this.diagnosticBufferExhaustion) throw new Error("diagnostic buffer exhaustion is not active");
    this.diagnosticBufferExhaustion = false;
    const held = this.diagnosticHeldSnapshots.splice(0);
    for (const snapshot of held) this.returnSnapshot(snapshot.message);
    this.reportDiagnostics();
  }

  diagnostics(): ClientDiagnostics {
    const message = this.snapshot()?.message as (SnapshotMessage & {
      poolAllocationsTotal?: number; buffersFree?: number;
      buffersOutstanding?: number; queuedCommands?: number;
    }) | undefined;
    return {
      epoch: this.epoch, tick: this.tick, lastAppliedSequence: this.lastAppliedSequence,
      paused: this.paused,
      retainedSnapshots: (this.diagnosticHeldSnapshots.length || (this.current ? 1 : 0)) as 0 | 1 | 2 | 3,
      pendingAdvances: this.advancePromise ? 1 : 0,
      pendingRequests: this.pending.size + this.pendingReturns.size,
      coalescedSnapshots: this.coalescedSnapshots,
      coalescedSnapshotsSaturated: this.coalescedSnapshotsSaturated,
      resetting: this.resetBarrierRequestId !== null, terminal: this.terminalError !== null,
      diagnosticBufferExhaustion: this.diagnosticBufferExhaustion,
      ...(message?.poolAllocationsTotal === undefined ? {} : { poolAllocationsTotal: message.poolAllocationsTotal }),
      ...(message?.buffersFree === undefined ? {} : { buffersFree: message.buffersFree }),
      ...(message?.buffersOutstanding === undefined ? {} : { buffersOutstanding: message.buffersOutstanding }),
      ...(message?.queuedCommands === undefined ? {} : { queuedCommands: message.queuedCommands }),
    };
  }

  dispose(): void {
    if (this.terminalError) {
      this.terminateWorker();
      return;
    }
    this.releaseAllSnapshots();
    this.fail(new Error("simulation client disposed"), false);
  }

  private control<T extends PendingResponse>(message: ControlMessage): Promise<T> {
    this.assertLive();
    return new Promise<T>((resolve, reject) => {
      const common = { kind: "control" as const,
        resolve: resolve as (response: PendingResponse) => void, reject };
      if (message.kind === "init") {
        this.pending.set(message.requestId, { ...common, responseKind: "ready", epoch: 1, tick: 0,
          cause: "init", paused: false });
      } else if (message.kind === "reset") {
        this.pending.set(message.requestId, { ...common, responseKind: "ready", epoch: message.epoch + 1,
          tick: 0, cause: "reset", paused: message.paused });
      } else if (message.kind === "setPaused") {
        this.pending.set(message.requestId, { ...common, responseKind: "pauseChanged", epoch: message.epoch,
          tick: this.tick, paused: message.paused });
      } else {
        this.pending.set(message.requestId, { ...common, responseKind: "advanceAck", epoch: message.epoch,
          tick: this.tick });
      }
      this.worker.postMessage(message);
      this.reportDiagnostics();
    });
  }

  private pumpCommands(): void {
    if (this.commandAwaitingAcceptance || this.advancePromise || this.resetBarrierRequestId !== null
      || this.commandIntents.length === 0 || this.terminalError) return;
    if (this.nextSequence > 0xffff_ffff) {
      this.fail(new Error("command sequence exhausted"), true);
      return;
    }
    const intent = this.commandIntents.shift() as CommandIntent;
    let requestId: number;
    try {
      requestId = this.allocateRequestId();
    } catch (error) {
      intent.reject(error as Error);
      this.rejectUnsentCommands(error as Error);
      return;
    }
    this.commandAwaitingAcceptance = true;
    const targetTick = intent.targetTick ?? this.tick;
    this.pending.set(requestId, {
      kind: "command", epoch: this.epoch, sequence: this.nextSequence, targetTick, accepted: false,
      resolve: intent.resolve, reject: intent.reject,
    });
    this.worker.postMessage({
      kind: "command", version: WORKER_PROTOCOL_VERSION, requestId, epoch: this.epoch,
      sequence: this.nextSequence, targetTick, command: intent.command,
    });
    this.reportDiagnostics();
  }

  private receive(raw: unknown): void {
    if (this.terminalError) return;
    const message = decodeWorkerMessage(raw);
    if (!message) {
      if (isRecord(raw) && raw.kind === "snapshot" && isU32(raw.epoch, true)
        && isBufferId(raw.bufferId) && isU32(raw.leaseToken, true) && raw.buffer instanceof ArrayBuffer) {
        this.returnSnapshot(raw as unknown as SnapshotMessage);
      }
      this.fail(new Error("malformed worker response"), true);
      return;
    }
    if (message.kind === "snapshot") return this.receiveSnapshot(message);
    if (message.kind === "error") {
      const error = new Error(`${message.code}: ${message.detail}`);
      if (message.fatal) this.fail(error, true);
      else {
        if (message.requestId === null || !this.pending.has(message.requestId) || message.epoch !== this.epoch) {
          this.fail(new Error("worker error does not match a pending request"), true);
          return;
        }
        if (message.requestId === this.resetBarrierRequestId) this.resetBarrierRequestId = null;
        this.rejectPending(message.requestId, error);
        this.onError?.(error);
      }
      return;
    }
    if (message.kind === "terminated") return this.fail(new Error("simulation worker terminated"), false);
    if (message.kind === "bufferReturned") return this.receiveBufferReturn(message);
    if (message.kind === "commandAck") return this.receiveCommandAck(message);

    const pending = this.pending.get(message.requestId);
    if (!pending || pending.kind !== "control" || pending.responseKind !== message.kind
      || pending.epoch !== message.epoch) {
      this.fail(new Error(`${message.kind} does not match its pending request`), true);
      return;
    }
    const tickMatches = message.kind === "advanceAck"
      ? pending.tick + message.steppedTicks <= 0xffff_ffff
        && message.tick === pending.tick + message.steppedTicks
      : message.tick === pending.tick;
    if (!tickMatches) {
      this.fail(new Error(`${message.kind} tick does not match its pending request`), true);
      return;
    }
    if (message.kind === "ready" && (pending.cause !== message.cause || pending.paused !== message.paused)) {
      this.fail(new Error("ready cause or pause state does not match its pending request"), true);
      return;
    }
    if (message.kind === "pauseChanged" && pending.paused !== message.paused) {
      this.fail(new Error("pause response does not match its pending request"), true);
      return;
    }
    this.pending.delete(message.requestId);
    if (message.kind === "ready") {
      this.epoch = message.epoch;
      this.tick = message.tick;
      this.paused = message.paused;
      if (message.cause === "reset") {
        if (this.resetBarrierRequestId !== message.requestId) {
          const error = new Error("reset ready does not match the active reset barrier");
          pending.reject(error);
          this.fail(error, true);
          return;
        }
        this.resetBarrierRequestId = null;
        this.nextSequence = 1;
        this.lastAppliedSequence = 0;
      }
    } else if (message.kind === "pauseChanged") {
      this.tick = message.tick;
      this.paused = message.paused;
    } else if (message.kind === "advanceAck") {
      this.tick = message.tick;
    }
    pending.resolve(message);
    this.reportDiagnostics();
  }

  private receiveSnapshot(message: SnapshotMessage): void {
    if (this.resetBarrierRequestId !== null) {
      this.returnSnapshot(message);
      return;
    }
    if (message.epoch !== this.epoch) {
      this.returnSnapshot(message);
      if (message.epoch > this.epoch) this.fail(new Error(`future snapshot epoch ${message.epoch}`), true);
      return;
    }
    let view: SnapshotView;
    try {
      view = parseSnapshot(message);
    } catch (error) {
      this.returnSnapshot(message);
      this.fail(error instanceof Error ? error : new Error(String(error)), true);
      return;
    }
    const snapshot = { message, view };
    if (this.diagnosticBufferExhaustion) {
      if (this.diagnosticHeldSnapshots.length >= 3
        || this.diagnosticHeldSnapshots.some((held) => held.message.bufferId === message.bufferId)) {
        this.returnSnapshot(message);
        this.fail(new Error("diagnostic buffer exhaustion received a duplicate or fourth lease"), true);
        return;
      }
      this.diagnosticHeldSnapshots.push(snapshot);
    } else {
      this.releaseCurrent();
      this.current = snapshot;
    }
    this.tick = message.tick;
    this.lastAppliedSequence = message.lastAppliedSequence;
    this.coalescedSnapshots = message.coalescedSnapshots;
    this.coalescedSnapshotsSaturated = message.coalescedSnapshotsSaturated;
    this.onSnapshot?.(snapshot);
    this.reportDiagnostics();
  }

  private receiveCommandAck(message: CommandAckMessage): void {
    const pending = this.pending.get(message.requestId);
    if (!pending || pending.kind !== "command" || pending.epoch !== message.epoch
      || pending.sequence !== message.sequence || pending.targetTick !== message.targetTick) {
      this.fail(new Error("command acknowledgement has no matching request"), true);
      return;
    }
    if (message.status === "accepted") {
      if (pending.accepted) return this.fail(new Error("command was accepted twice"), true);
      pending.accepted = true;
      if (pending.sequence === 0xffff_ffff) {
        this.fail(new Error("command sequence exhausted"), true);
        return;
      }
      this.nextSequence = pending.sequence + 1;
      this.commandAwaitingAcceptance = false;
      this.pumpCommands();
      return;
    }
    if (message.status === "applied" && !pending.accepted) {
      this.fail(new Error("command applied before it was accepted"), true);
      return;
    }
    if (message.status === "applied" && message.tick !== pending.targetTick) {
      this.fail(new Error("applied command tick does not match its target"), true);
      return;
    }
    this.pending.delete(message.requestId);
    if (!pending.accepted) {
      this.commandAwaitingAcceptance = false;
      this.pumpCommands();
    }
    if (message.status === "applied") this.lastAppliedSequence = message.sequence;
    pending.resolve(message);
    this.reportDiagnostics();
  }

  private receiveBufferReturn(message: BufferReturnedMessage): void {
    const pending = this.pendingReturns.get(message.requestId);
    if (!pending || pending.bufferId !== message.bufferId || pending.leaseToken !== message.leaseToken
      || message.epoch !== this.epoch) {
      this.fail(new Error("buffer return response does not match its pending lease"), true);
      return;
    }
    this.pendingReturns.delete(message.requestId);
    this.reportDiagnostics();
  }

  private returnSnapshot(message: SnapshotMessage): void {
    if (message.buffer.byteLength === 0) return;
    if (this.nextRequestId > 0xffff_ffff) {
      this.postSnapshotReturn(message, 0, false);
      this.fail(new Error("request id exhausted"), true);
      return;
    }
    this.postSnapshotReturn(message, this.nextRequestId++, true);
  }

  private postSnapshotReturn(message: SnapshotMessage, requestId: number, track: boolean): void {
    const request: ReturnSnapshotMessage = {
      kind: "returnSnapshot", version: WORKER_PROTOCOL_VERSION, requestId,
      epoch: message.epoch, bufferId: message.bufferId, leaseToken: message.leaseToken,
      buffer: message.buffer,
    };
    if (track) this.pendingReturns.set(request.requestId, { bufferId: request.bufferId, leaseToken: request.leaseToken });
    this.worker.postMessage(request, [request.buffer]);
  }

  private releaseCurrent(emergency = false): void {
    const current = this.current;
    if (!current) return;
    this.current = null;
    if (emergency) this.postSnapshotReturn(current.message, 0, false);
    else this.returnSnapshot(current.message);
  }

  private releaseAllSnapshots(emergency = false): void {
    this.diagnosticBufferExhaustion = false;
    const held = this.diagnosticHeldSnapshots.splice(0);
    const current = this.current;
    this.current = null;
    for (const snapshot of held) {
      if (emergency) this.postSnapshotReturn(snapshot.message, 0, false);
      else this.returnSnapshot(snapshot.message);
    }
    if (current) {
      if (emergency) this.postSnapshotReturn(current.message, 0, false);
      else this.returnSnapshot(current.message);
    }
  }

  private rejectPending(requestId: number, error: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (pending.kind === "command" && !pending.accepted) {
      this.commandAwaitingAcceptance = false;
      this.pumpCommands();
    }
    pending.reject(error);
  }

  private rejectUnsentCommands(error: Error): void {
    for (const intent of this.commandIntents.splice(0)) intent.reject(error);
  }

  private fail(error: Error, canReturnBuffers: boolean): void {
    if (this.terminalError) return;
    if (canReturnBuffers) {
      const owned = this.diagnosticHeldSnapshots.length + (this.current ? 1 : 0);
      this.releaseAllSnapshots(this.nextRequestId + owned - 1 > 0xffff_ffff);
    } else {
      this.diagnosticBufferExhaustion = false;
      this.diagnosticHeldSnapshots.splice(0);
      this.current = null;
    }
    this.terminalError = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.pendingReturns.clear();
    this.rejectUnsentCommands(error);
    this.commandAwaitingAcceptance = false;
    this.terminateWorker();
    this.onError?.(error);
    this.reportDiagnostics();
  }

  private allocateRequestId(): number {
    this.assertLive();
    if (this.nextRequestId > 0xffff_ffff) {
      const error = new Error("request id exhausted");
      this.fail(error, true);
      throw error;
    }
    return this.nextRequestId++;
  }

  private assertReady(): void {
    this.assertLive();
    if (this.epoch === 0) throw new Error("simulation client is not initialized");
    if (this.resetBarrierRequestId !== null) throw new Error("simulation reset is in progress");
  }

  private assertLive(): void {
    if (this.terminalError) throw this.terminalError;
  }

  private reportDiagnostics(): void {
    this.onDiagnostics?.(this.diagnostics());
  }

  private terminateWorker(): void {
    if (this.workerTerminated) return;
    this.workerTerminated = true;
    this.worker.terminate();
  }

  setNextRequestIdForTest(value: number): void {
    this.nextRequestId = value;
  }

  setNextSequenceForTest(value: number): void {
    this.nextSequence = value;
  }
}
