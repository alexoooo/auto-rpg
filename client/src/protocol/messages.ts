export const WORKER_PROTOCOL_VERSION = 1 as const;
export const MAX_QUEUED_COMMANDS = 256;
export const MAX_FUTURE_TICKS = 600;
export const TICKS_PER_SECOND = 60;
export const MAX_ELAPSED_MICROS = 250_000;
export const MAX_CATCHUP_TICKS = 8;

export type BufferId = 0 | 1 | 2;

export type InitMessage = { kind: "init"; version: 1; requestId: number; seed: number };
export type ResetMessage = { kind: "reset"; version: 1; requestId: number; epoch: number; seed: number; paused: boolean };
export type SetPausedMessage = { kind: "setPaused"; version: 1; requestId: number; epoch: number; paused: boolean };
export type AdvanceMessage = { kind: "advance"; version: 1; requestId: number; epoch: number; elapsedMicros: number };
export type LegacyClientCommand =
  | { kind: "goto"; xMilli: number; yMilli: number }
  | { kind: "withdraw" }
  | { kind: "spawn"; kindCode: number; primary: number; secondary: number };
export type CommandMessage = {
  kind: "command"; version: 1; requestId: number; epoch: number;
  sequence: number; targetTick: number; command: LegacyClientCommand;
};
export type ReturnSnapshotMessage = {
  kind: "returnSnapshot"; version: 1; requestId: number; epoch: number;
  bufferId: BufferId; leaseToken: number; buffer: ArrayBuffer;
};
export type ClientMessage = InitMessage | ResetMessage | SetPausedMessage | AdvanceMessage | CommandMessage | ReturnSnapshotMessage;

export type ReadyMessage = {
  kind: "ready"; version: 1; requestId: number; cause: "init" | "reset";
  epoch: number; tick: number; paused: boolean;
};
export type PauseChangedMessage = {
  kind: "pauseChanged"; version: 1; requestId: number; epoch: number; tick: number; paused: boolean;
};
export type AdvanceAckMessage = {
  kind: "advanceAck"; version: 1; requestId: number; epoch: number;
  tick: number; steppedTicks: number; droppedBacklog: boolean;
};
export type RejectReason =
  | "oldEpoch" | "futureEpoch" | "duplicateSequence" | "sequenceGap"
  | "lateTargetTick" | "regressedTargetTick" | "targetTooFar"
  | "queueFull" | "invalidCommand";
export type CommandAckMessage = {
  kind: "commandAck"; version: 1; requestId: number; epoch: number;
  sequence: number; targetTick: number; status: "accepted" | "rejected" | "applied";
  tick: number; reason?: RejectReason; result?: number;
};
export type SnapshotMessage = {
  kind: "snapshot"; version: 1; epoch: number; tick: number;
  lastAppliedSequence: number; coalescedSnapshots: number;
  coalescedSnapshotsSaturated: boolean;
  bufferId: BufferId; leaseToken: number;
  frameLayoutVersion: number; headerLength: number; unitStride: number;
  shotStride: number; eventStride: number; furnitureStride: number;
  frameLength: number; mapLength: number; visLength: number;
  furnitureLength: number; mapCols: number; mapRows: number;
  mapTileSizeMilli: number; mapRevision: number; visRevision: number;
  furnitureRevision: number;
  poolAllocationsTotal: 3; buffersFree: number; buffersOutstanding: number;
  queuedCommands: number; buffer: ArrayBuffer;
};
export type BufferReturnedMessage = {
  kind: "bufferReturned"; version: 1; requestId: number; epoch: number;
  bufferId: BufferId; leaseToken: number; disposition: "reclaimed";
};
export type ProtocolErrorCode =
  | "unknownVersion" | "notInitialized" | "alreadyInitialized"
  | "invalidMessage" | "invalidBufferId" | "invalidLeaseToken"
  | "invalidBufferCapacity" | "epochExhausted" | "leaseTokenExhausted"
  | "revisionExhausted" | "wasmAbiMismatch" | "wasmTrap";
export type ErrorMessage = {
  kind: "error"; version: 1; requestId: number | null; epoch: number;
  code: ProtocolErrorCode; fatal: boolean; detail: string;
};
export type TerminatedMessage = { kind: "terminated"; version: 1; epoch: number };
export type WorkerMessage = ReadyMessage | PauseChangedMessage | AdvanceAckMessage | CommandAckMessage
  | SnapshotMessage | BufferReturnedMessage | ErrorMessage | TerminatedMessage;

export type DecodeFailure = { ok: false; code: "unknownVersion" | "invalidMessage"; requestId: number | null; detail: string };
export type DecodeResult = { ok: true; message: ClientMessage } | DecodeFailure;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export const isU32 = (value: unknown, nonzero = false): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= (nonzero ? 1 : 0) && value <= 0xffff_ffff;
export const isSafeUnsigned = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export const isI32 = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= -0x8000_0000 && value <= 0x7fff_ffff;

function requestIdOf(value: Record<string, unknown>): number | null {
  return isU32(value.requestId) ? value.requestId : null;
}

function decodeCommand(value: unknown): LegacyClientCommand | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "withdraw") return { kind: "withdraw" };
  if (value.kind === "goto" && isI32(value.xMilli) && isI32(value.yMilli)) {
    return { kind: "goto", xMilli: value.xMilli, yMilli: value.yMilli };
  }
  if (value.kind === "spawn" && isU32(value.kindCode) && isU32(value.primary) && isU32(value.secondary)) {
    return { kind: "spawn", kindCode: value.kindCode, primary: value.primary, secondary: value.secondary };
  }
  return null;
}

export function decodeClientMessage(value: unknown): DecodeResult {
  if (!isRecord(value)) return { ok: false, code: "invalidMessage", requestId: null, detail: "message is not an object" };
  const requestId = requestIdOf(value);
  if (value.version !== WORKER_PROTOCOL_VERSION) {
    return { ok: false, code: "unknownVersion", requestId, detail: `protocol version ${String(value.version)} is not supported` };
  }
  if (!isU32(value.requestId)) return { ok: false, code: "invalidMessage", requestId: null, detail: "requestId is not u32" };
  const commonEpoch = () => isU32(value.epoch, true);
  switch (value.kind) {
    case "init":
      if (isU32(value.seed)) return { ok: true, message: { kind: "init", version: 1, requestId: value.requestId, seed: value.seed } };
      break;
    case "reset":
      if (commonEpoch() && isU32(value.seed) && typeof value.paused === "boolean") return { ok: true, message: { kind: "reset", version: 1, requestId: value.requestId, epoch: value.epoch as number, seed: value.seed, paused: value.paused } };
      break;
    case "setPaused":
      if (commonEpoch() && typeof value.paused === "boolean") return { ok: true, message: { kind: "setPaused", version: 1, requestId: value.requestId, epoch: value.epoch as number, paused: value.paused } };
      break;
    case "advance":
      if (commonEpoch() && isSafeUnsigned(value.elapsedMicros)) return { ok: true, message: { kind: "advance", version: 1, requestId: value.requestId, epoch: value.epoch as number, elapsedMicros: value.elapsedMicros } };
      break;
    case "command": {
      const command = decodeCommand(value.command);
      if (commonEpoch() && isU32(value.sequence, true) && isU32(value.targetTick) && command) return { ok: true, message: { kind: "command", version: 1, requestId: value.requestId, epoch: value.epoch as number, sequence: value.sequence, targetTick: value.targetTick, command } };
      break;
    }
    case "returnSnapshot":
      if (commonEpoch() && (value.bufferId === 0 || value.bufferId === 1 || value.bufferId === 2)
        && isU32(value.leaseToken, true) && value.buffer instanceof ArrayBuffer) {
        return { ok: true, message: { kind: "returnSnapshot", version: 1, requestId: value.requestId, epoch: value.epoch as number, bufferId: value.bufferId, leaseToken: value.leaseToken, buffer: value.buffer } };
      }
      break;
  }
  return { ok: false, code: "invalidMessage", requestId, detail: `invalid ${String(value.kind)} message` };
}
