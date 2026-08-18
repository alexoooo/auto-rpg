/**
 * The worker protocol, at version 2.
 *
 * **What the bump is for.** V1 is the `#/game` diagnostic: a legacy world, three
 * pooled snapshot buffers, epochs, leases and a command queue. V2 adds a second
 * kind of session on the same worker module -- an arena *recording*, which runs
 * a configured duel to its end and posts one message transferring the buffers.
 * The two share the wasm instance and nothing else, which is why a worker is one
 * or the other for its whole life and never both.
 *
 * **V1 is still accepted, and that is a commitment rather than politeness.**
 * `articulated-mechanical-gate.md` already commits v2 to accepting exact V1
 * sessions as legacy-only for their lifetime. So `decodeClientMessage` takes
 * either version, refuses the arena kinds at V1 by name, and the host answers in
 * the version the session opened with. Bumping the constant alone would not have
 * been that: this decoder hard-refused anything but the current number, so a V1
 * client would have been told its version is unsupported.
 */
export const WORKER_PROTOCOL_VERSION = 2 as const;
/** The version an exact V1 session speaks, accepted for its lifetime. */
export const LEGACY_WORKER_PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = 1 | 2;

export const MAX_QUEUED_COMMANDS = 256;
export const MAX_FUTURE_TICKS = 600;
export const TICKS_PER_SECOND = 60;
export const MAX_ELAPSED_MICROS = 250_000;
export const MAX_CATCHUP_TICKS = 8;

export type BufferId = 0 | 1 | 2;

export type InitMessage = { kind: "init"; version: ProtocolVersion; requestId: number; seed: number };
export type ResetMessage = { kind: "reset"; version: ProtocolVersion; requestId: number; epoch: number; seed: number; paused: boolean };
export type SetPausedMessage = { kind: "setPaused"; version: ProtocolVersion; requestId: number; epoch: number; paused: boolean };
export type AdvanceMessage = { kind: "advance"; version: ProtocolVersion; requestId: number; epoch: number; elapsedMicros: number };
/**
 * What a client may ask the game session to do.
 *
 * **`goto` and `withdraw` were members here and they are gone, because the
 * channel under them is.** They dispatched to `set_goto` and `clear_order`, and
 * a standing order is a column of the legacy `Observation` that an
 * `ArticulatedObservation` does not have -- so on the embodied floor a click
 * moved the state hash, painted a destination pip in the frame header and
 * changed nothing about where anybody walked. A command a worker accepts and
 * cannot act on is the exact refusal this repository has paid for repeatedly;
 * removing it is the honest form. Direct control is the channel that survives:
 * `setControl` and `setInput` are answered every tick.
 */
export type LegacyClientCommand =
  | { kind: "setControl"; mask: number }
  | { kind: "setInput"; moveXMilli: number; moveYMilli: number; aimRaw: number; reachMilli: number; slot: number; strike: number; turnMilli: number }
  | { kind: "spawn"; kindCode: number; primary: number; secondary: number }
  | { kind: "respawn"; kindCode: number; primary: number; secondary: number };
export type CommandMessage = {
  kind: "command"; version: ProtocolVersion; requestId: number; epoch: number;
  sequence: number; targetTick: number; command: LegacyClientCommand;
};
export type ReturnSnapshotMessage = {
  kind: "returnSnapshot"; version: ProtocolVersion; requestId: number; epoch: number;
  bufferId: BufferId; leaseToken: number; buffer: ArrayBuffer;
};

/**
 * Record one configured duel and post it back whole.
 *
 * `config` is the exact `arena_config_len()` bytes, transferred, and validated
 * for length and for its layout field before the worker touches wasm with it --
 * the articulated-command payload rule, applied to the wider buffer. Nothing
 * else about it is judged here: the module is the one consumer that judges the
 * whole of it, and a second opinion on this side would be a second thing to
 * disagree with `install_arena` about.
 *
 * `checkpoint` carries the trained network's bytes when a side asks for policy
 * code 4, and is null otherwise. It travels *with* the start rather than as its
 * own message because `load_checkpoint` is the only allocating call in that set:
 * it belongs in the same warm-up as `init`, before any typed array
 * over the pose buffer exists, and a separate message would let a client
 * interleave it with a recording in flight.
 */
export type ArenaStartMessage = {
  kind: "arenaStart"; version: 2; requestId: number; seed: number;
  config: ArrayBuffer; checkpoint: ArrayBuffer | null;
};
export type ArenaCancelMessage = { kind: "arenaCancel"; version: 2; requestId: number };

export type ClientMessage = InitMessage | ResetMessage | SetPausedMessage | AdvanceMessage
  | CommandMessage | ReturnSnapshotMessage | ArenaStartMessage | ArenaCancelMessage;

export type ReadyMessage = {
  kind: "ready"; version: ProtocolVersion; requestId: number; cause: "init" | "reset";
  epoch: number; tick: number; paused: boolean;
};
export type PauseChangedMessage = {
  kind: "pauseChanged"; version: ProtocolVersion; requestId: number; epoch: number; tick: number; paused: boolean;
};
export type AdvanceAckMessage = {
  kind: "advanceAck"; version: ProtocolVersion; requestId: number; epoch: number;
  tick: number; steppedTicks: number; droppedBacklog: boolean;
};
export type RejectReason =
  | "oldEpoch" | "futureEpoch" | "duplicateSequence" | "sequenceGap"
  | "lateTargetTick" | "regressedTargetTick" | "targetTooFar"
  | "queueFull" | "invalidCommand";
export type CommandAckMessage = {
  kind: "commandAck"; version: ProtocolVersion; requestId: number; epoch: number;
  sequence: number; targetTick: number; status: "accepted" | "rejected" | "applied";
  tick: number; reason?: RejectReason; result?: number;
};
export type SnapshotMessage = {
  kind: "snapshot"; version: ProtocolVersion; epoch: number; tick: number;
  lastAppliedSequence: number; coalescedSnapshots: number;
  coalescedSnapshotsSaturated: boolean;
  bufferId: BufferId; leaseToken: number;
  frameLayoutVersion: number; headerLength: number; unitStride: number;
  shotStride: number; eventStride: number; furnitureStride: number;
  dungeonObjectLayoutVersion: number; dungeonObjectStride: number;
  frameLength: number; mapLength: number; visLength: number;
  furnitureLength: number; dungeonObjectLength: number; dungeonObjectsDropped: number;
  mapCols: number; mapRows: number;
  mapTileSizeMilli: number; mapRevision: number; visRevision: number;
  furnitureRevision: number; dungeonObjectRevision: number;
  poolAllocationsTotal: 3; buffersFree: number; buffersOutstanding: number;
  queuedCommands: number; buffer: ArrayBuffer;
};
export type BufferReturnedMessage = {
  kind: "bufferReturned"; version: ProtocolVersion; requestId: number; epoch: number;
  bufferId: BufferId; leaseToken: number; disposition: "reclaimed";
};

/**
 * Why an `arenaStart` was refused, in the recorder's own vocabulary.
 *
 * **A separate union from `RejectReason` and not four more members of it.** That
 * one is a command acknowledgement's field, and every value in it names
 * something the command queue does -- an epoch, a sequence, a target tick. A
 * union carrying both would type-check a `commandAck` that said `arenaBusy`,
 * which is a state the command path cannot be in, and the decoder on the far
 * side would have to allow it.
 *
 * `invalidArenaConfig` is the one the module decides: it carries `arena_start`'s
 * packed word so a studio can name the fighter, the hand or the policy code the
 * refusal is about. The other three are the worker's own.
 */
export type ArenaRejectReason = "wrongModel" | "unknownLayout" | "invalidArenaConfig"
  | "arenaBusy" | "checkpointRefused" | "cancelled";
export type ArenaRejectedMessage = {
  kind: "arenaRejected"; version: 2; requestId: number;
  reason: ArenaRejectReason;
  /** `arena_start`'s or `load_checkpoint`'s packed word, or 0 when neither ran. */
  packed: number;
  detail: string;
};
export type ArenaProgressMessage = {
  kind: "arenaProgress"; version: 2; requestId: number;
  ticksDone: number; ticksTotal: number;
};

/** One carried item, as `lab trace` writes a `BodyInfo.carried` entry. */
export type RecordedItem = {
  action: string; binding: string; mass: number; balance: number;
  geometry: "segment" | "shield";
  length?: number; radius?: number;
  halfWidth?: number; halfHeight?: number; thickness?: number;
};
export type RecordedBody = {
  index: number; kind: string; faction: string;
  anatomy: {
    standingHeight: number; shoulderHeight: number; shoulderHalfWidth: number;
    armLength: number; handRadius: number;
  };
  carried: readonly (RecordedItem | null)[];
};

/**
 * One whole recorded fight, transferred.
 *
 * **Five buffers and an index, because the index is the point.** `pose_len` is
 * one per *live* articulated body, so a reader computing `tick * 2 * POSE_STRIDE`
 * misaligns from the death onwards -- which is exactly the frame anybody opened
 * the page to look at. Every section is therefore addressed by a start and a
 * count the recorder wrote down as it copied.
 *
 * **`spectator` travels in the message and not in a comment, and it is a gate
 * rather than a label.** The arena publishes unfiltered ground truth: both
 * fighters are the subject, there is no fog, and `SnapshotFilterState` never sees
 * these words. That is correct here and a leak the moment this path is copied
 * into the game path, so the exemption rides with the data rather than living in
 * a comment somebody will not read. `articulated-abi.md` is explicit that pose
 * rows must not cross to a renderer unfiltered.
 *
 * It was declared, typed and asserted and **read by nothing** until a review
 * pointed out that a recording claiming `spectator: false` was accepted and
 * rendered identically -- which is a field that travels and is not checked, and
 * so is documentation with a type on it. Two consumers now refuse a stream that
 * does not declare itself: `decodeArenaMessage` in
 * [`arena-client.ts`](../runtime/arena-client.ts#L59), at the protocol boundary,
 * and `LiveFightSource`'s constructor, which is the thing that would have drawn
 * it.
 */
export type FightRecordingMessage = {
  kind: "fightRecording"; version: 2; requestId: number;
  spectator: true;
  /** Raw units in one world unit. Carried rather than assumed, as the trace does. */
  one: number;
  scenario: string; mirrored: false;
  /** `arena_fingerprint_*`, as `0x%016x`. What this fight is *named* by. */
  fingerprint: string;
  seed: number;
  heroes: string; monsters: string;
  /** SHA-256 of the installed checkpoint, or null when none was loaded. */
  checkpoint: string | null;
  outcome: string; timedOut: boolean;
  /** The tick the fight stopped at. */
  ticks: number; maxTicks: number;
  /**
   * How many frames the recording holds, which is **`ticks + 1`** and not `ticks`.
   *
   * The drive captures once before it steps at all -- tick 0 is a frame, and it is
   * the one a viewer opens on -- and then once per tick that advanced. So the
   * learned fight that ends at tick 3,339 holds 3,340 frames, which is what
   * `the_index_survives_a_death` asserts. This comment used to say the two were
   * equal "unless a cap was hit"; it is exactly backwards, since hitting a cap is
   * the one case where `frameCount` is *less* than `ticks + 1`.
   */
  frameCount: number;
  /** A cap was reached and rows were not recorded. The studio must say so. */
  recordingTruncated: boolean;
  arena: readonly [number, number];
  /** The three layout versions and strides the buffers were packed with. */
  poseLayoutVersion: number; poseStride: number;
  regionLayoutVersion: number; regionStride: number; regionsPerBody: number;
  articulatedProjectileLayoutVersion: number; articulatedProjectileStride: number;
  combatEventLayoutVersion: number; combatEventStride: number;
  /** The module's own saturating drop counters, summed over the recording. */
  posesDropped: number; regionsDropped: number; articulatedProjectilesDropped: number;
  combatEventsDropped: number;
  impactThreshold: number; contactEnergyFloor: number;
  bodySlot: number; noRegion: number;
  regionNames: readonly string[]; hintNames: readonly string[]; contactKinds: readonly string[];
  bodies: readonly RecordedBody[];
  /** `Uint32Array` words: pose, region, projectile and event rows, packed. */
  poses: ArrayBuffer; regions: ArrayBuffer; projectiles: ArrayBuffer; events: ArrayBuffer;
  /**
   * `Uint32Array`, **nine** words a frame: the tick, then a start and a count
   * for each of the pose, region, projectile and event sections. `RECORDING_INDEX_STRIDE`
   * owns the number and `INDEX_TICK` owns the word this comment used to omit.
   */
  index: ArrayBuffer;
  /** `Int32Array`, two raw `Fx` a frame: the Heroes' and the Monsters' health fraction. */
  health: ArrayBuffer;
};

export type ProtocolErrorCode =
  | "unknownVersion" | "notInitialized" | "alreadyInitialized"
  | "invalidMessage" | "invalidBufferId" | "invalidLeaseToken"
  | "invalidBufferCapacity" | "epochExhausted" | "leaseTokenExhausted"
  | "revisionExhausted" | "wasmAbiMismatch" | "wasmTrap";
export type ErrorMessage = {
  kind: "error"; version: ProtocolVersion; requestId: number | null; epoch: number;
  code: ProtocolErrorCode; fatal: boolean; detail: string;
};
export type TerminatedMessage = { kind: "terminated"; version: ProtocolVersion; epoch: number };
export type WorkerMessage = ReadyMessage | PauseChangedMessage | AdvanceAckMessage | CommandAckMessage
  | SnapshotMessage | BufferReturnedMessage | ErrorMessage | TerminatedMessage
  | ArenaRejectedMessage | ArenaProgressMessage | FightRecordingMessage;

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
  if (value.kind === "setControl" && isU32(value.mask)) return { kind: "setControl", mask: value.mask };
  if (value.kind === "setInput" && isI32(value.moveXMilli) && isI32(value.moveYMilli)
      && isU32(value.aimRaw) && isI32(value.reachMilli) && isU32(value.slot) && isU32(value.strike)
      && isI32(value.turnMilli)) {
    return { kind: "setInput", moveXMilli: value.moveXMilli, moveYMilli: value.moveYMilli,
      aimRaw: value.aimRaw, reachMilli: value.reachMilli, slot: value.slot, strike: value.strike,
      turnMilli: value.turnMilli };
  }
  if ((value.kind === "spawn" || value.kind === "respawn")
      && isU32(value.kindCode) && isU32(value.primary) && isU32(value.secondary)) {
    const body = value.kind === "spawn"
      ? value.kindCode === 0 || value.kindCode === 2
      : value.kindCode === 0;
    const primary = value.primary === 2 || value.primary === 4;
    const secondary = value.secondary === 2 || value.secondary === 4 || value.secondary === 255;
    if (body && primary && secondary) {
      return { kind: value.kind, kindCode: value.kindCode,
        primary: value.primary, secondary: value.secondary };
    }
  }
  return null;
}

/** The two versions this worker answers, and which kinds each of them may carry. */
function acceptedVersion(value: unknown): ProtocolVersion | null {
  if (value === WORKER_PROTOCOL_VERSION) return WORKER_PROTOCOL_VERSION;
  if (value === LEGACY_WORKER_PROTOCOL_VERSION) return LEGACY_WORKER_PROTOCOL_VERSION;
  return null;
}

export function decodeClientMessage(value: unknown): DecodeResult {
  if (!isRecord(value)) return { ok: false, code: "invalidMessage", requestId: null, detail: "message is not an object" };
  const requestId = requestIdOf(value);
  const version = acceptedVersion(value.version);
  if (version === null) {
    return { ok: false, code: "unknownVersion", requestId, detail: `protocol version ${String(value.version)} is not supported` };
  }
  if (!isU32(value.requestId)) return { ok: false, code: "invalidMessage", requestId: null, detail: "requestId is not u32" };
  const commonEpoch = () => isU32(value.epoch, true);
  switch (value.kind) {
    case "init":
      if (isU32(value.seed)) return { ok: true, message: { kind: "init", version, requestId: value.requestId, seed: value.seed } };
      break;
    case "reset":
      if (commonEpoch() && isU32(value.seed) && typeof value.paused === "boolean") return { ok: true, message: { kind: "reset", version, requestId: value.requestId, epoch: value.epoch as number, seed: value.seed, paused: value.paused } };
      break;
    case "setPaused":
      if (commonEpoch() && typeof value.paused === "boolean") return { ok: true, message: { kind: "setPaused", version, requestId: value.requestId, epoch: value.epoch as number, paused: value.paused } };
      break;
    case "advance":
      if (commonEpoch() && isSafeUnsigned(value.elapsedMicros)) return { ok: true, message: { kind: "advance", version, requestId: value.requestId, epoch: value.epoch as number, elapsedMicros: value.elapsedMicros } };
      break;
    case "command": {
      const command = decodeCommand(value.command);
      if (commonEpoch() && isU32(value.sequence, true) && isU32(value.targetTick) && command) return { ok: true, message: { kind: "command", version, requestId: value.requestId, epoch: value.epoch as number, sequence: value.sequence, targetTick: value.targetTick, command } };
      break;
    }
    case "returnSnapshot":
      if (commonEpoch() && (value.bufferId === 0 || value.bufferId === 1 || value.bufferId === 2)
        && isU32(value.leaseToken, true) && value.buffer instanceof ArrayBuffer) {
        return { ok: true, message: { kind: "returnSnapshot", version, requestId: value.requestId, epoch: value.epoch as number, bufferId: value.bufferId, leaseToken: value.leaseToken, buffer: value.buffer } };
      }
      break;
    // The two V2-only kinds. Refused by name at V1 rather than falling through
    // to "invalid arenaStart message", because the difference between "your
    // message is malformed" and "your session is a V1 session" is the whole
    // content of the legacy-only commitment.
    case "arenaStart":
      if (version !== WORKER_PROTOCOL_VERSION) {
        return { ok: false, code: "unknownVersion", requestId, detail: "arenaStart needs protocol version 2; this session is legacy V1" };
      }
      if (isU32(value.seed) && value.config instanceof ArrayBuffer
        && (value.checkpoint === null || value.checkpoint instanceof ArrayBuffer)) {
        return { ok: true, message: { kind: "arenaStart", version: WORKER_PROTOCOL_VERSION, requestId: value.requestId, seed: value.seed, config: value.config, checkpoint: value.checkpoint } };
      }
      break;
    case "arenaCancel":
      if (version !== WORKER_PROTOCOL_VERSION) {
        return { ok: false, code: "unknownVersion", requestId, detail: "arenaCancel needs protocol version 2; this session is legacy V1" };
      }
      return { ok: true, message: { kind: "arenaCancel", version: WORKER_PROTOCOL_VERSION, requestId: value.requestId } };
  }
  return { ok: false, code: "invalidMessage", requestId, detail: `invalid ${String(value.kind)} message` };
}
