/**
 * The worker protocol, at version 2.
 *
 * **What the bump is for.** V1 is the `#/game` diagnostic: a legacy world, three
 * pooled snapshot buffers, epochs, leases and a command queue. V2 adds a second
 * kind of session on the same worker module -- an arena *stream*, which drives a
 * configured duel and posts the fight as it produces it: one `arenaOpened`, a
 * run of `arenaChunk`s, and one `arenaFinished`. The two share the wasm instance
 * and nothing else, which is why a worker is one or the other for its whole life
 * and never both.
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
export const MAX_CONTROL_ELAPSED_MS = 250;
export const MAX_CONTROLLED_BATCH_TICKS = MAX_CONTROL_ELAPSED_MS * TICKS_PER_SECOND / 1_000;
export const MAX_ELAPSED_MICROS = 250_000;
export const MAX_CATCHUP_TICKS = 8;

/**
 * Ticks per streamed chunk on the spectator drive.
 *
 * **Bounded from both sides, and the two sides are different costs.** At 1 the
 * fight pays a `postMessage` and six buffer allocations per tick -- 3,600 of
 * each for one duel, against 121 at this value. At `RECORDING_CHUNK_TICKS`' 300
 * the first frame is five seconds of fight late at 1x, which is the wait this
 * value exists to remove: 30 ticks is half a second of fight, and on the slowest
 * pairing the picker can open on -- 3,816 to 5,349 ticks a second, measured on
 * `arena-recorder.ts` -- it is 5.6 to 7.9 ms of production before the page has
 * something to draw.
 *
 * It lives here rather than beside the drive because both ends of the channel
 * need it: the worker paces by it and `#/arena` sizes its lead against it, and a
 * page that carried its own copy would be a second answer to how long the wait
 * is. `the_stream_chunk_is_bounded_from_both_sides` asserts both ends.
 */
export const ARENA_STREAM_CHUNK_TICKS = 30;

/**
 * How far production must lead the playhead before playback starts or resumes.
 *
 * At 0 the playhead meets the producer at every chunk boundary and the fight
 * stutters once per chunk. At a whole chunk it is the old wait in smaller units
 * -- the page would sit out one chunk's production before every chunk it plays.
 * Half a chunk is the smallest lead that survives one late chunk, which is the
 * bound in the other direction, and `the_stream_lead_is_bounded_from_both_sides`
 * asserts both.
 */
export const ARENA_STREAM_LEAD_TICKS = ARENA_STREAM_CHUNK_TICKS / 2;

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
 * a standing order is a column of the legacy observation that an
 * `Observation` does not have -- so on the embodied floor a click
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
/** One sampled human command, driven for `ticksDue` separately published ticks. */
export type ArenaInputMessage = {
  kind: "arenaInput"; version: 2; requestId: number; arenaRequestId: number;
  faction: number; ticksDue: number; bytes: ArrayBuffer;
};
export type ArenaChunkAckMessage = {
  kind: "arenaChunkAck"; version: 2; requestId: number; arenaRequestId: number;
  firstFrame: number;
};
export type ClientMessage = InitMessage | ResetMessage | SetPausedMessage | AdvanceMessage
  | CommandMessage | ReturnSnapshotMessage | ArenaStartMessage | ArenaCancelMessage
  | ArenaInputMessage | ArenaChunkAckMessage;

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
  | "arenaBusy" | "checkpointRefused" | "cancelled" | "inputRefused";
export type ArenaRejectedMessage = {
  kind: "arenaRejected"; version: 2; requestId: number;
  reason: ArenaRejectReason;
  /** `arena_start`'s or `load_checkpoint`'s packed word, or 0 when neither ran. */
  packed: number;
  detail: string;
};
/** Backpressure release for one sampled controlled-input batch. */
export type ArenaInputAckMessage = {
  kind: "arenaInputAck"; version: 2; requestId: number; arenaRequestId: number;
  steppedTicks: number;
};
/**
 * `arenaProgress` stood here and is deleted rather than kept beside the stream.
 *
 * It carried `ticksDone`/`ticksTotal` so a page could show a bar while it waited
 * for a fight it could not yet see. A chunk already says how far the fight has
 * got -- its own last frame is the answer, and the page is *drawing* that frame
 * -- so keeping both would be two messages answering one question, which is how
 * one of them goes stale. The bar it fed is now the fight itself.
 */

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
 * The fight is opening: everything knowable before the first tick is stepped.
 *
 * **One message becomes three, and the split is along "what is knowable when".**
 * A worker that posted a finished recording had to know the outcome, the tick
 * count and the frame count before it could say anything at all, so nothing was
 * drawn until the last tick existed. This message carries the whole of what
 * `arena_start` already decided -- the configuration, the fingerprint, the
 * layout versions and strides, and the per-body anatomy and carried blocks --
 * and says nothing about how the fight ends, because nobody knows yet.
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
 * so is documentation with a type on it. Two consumers refuse a stream that does
 * not declare itself, and the field moved to this message rather than being
 * dropped when the recording was split: `decodeArenaMessage` in
 * [`arena-client.ts`](../runtime/arena-client.ts#L89), at the protocol boundary,
 * and `StreamingFightSource`'s constructor, which is the thing that would have
 * drawn it.
 */
export type ArenaOpenedMessage = {
  kind: "arenaOpened"; version: 2; requestId: number;
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
  maxTicks: number;
  arena: readonly [number, number];
  /** Stream grammar within protocol V2; main and worker still ship together. */
  arenaStreamLayoutVersion: number; recordingIndexStride: number;
  /** The three layout versions and strides the buffers are packed with. */
  poseLayoutVersion: number; poseStride: number;
  regionLayoutVersion: number; regionStride: number; regionsPerBody: number;
  articulatedProjectileLayoutVersion: number; articulatedProjectileStride: number;
  combatEventLayoutVersion: number; combatEventStride: number;
  embodiedStanceLayoutVersion: number; embodiedStanceStride: number;
  embodiedStanceCapacity: number;
  acceptedCommandLayoutVersion: number; acceptedCommandStride: number;
  acceptedCommandCapacity: number; acceptedCommandSchema: number;
  /** Zero-tick codec-V2 ReplayEnvelope for this exact configured duel. */
  replayBaseline: ArrayBuffer;
  /** The single Human side, or null for a policy-only spectator fight. */
  controlledFaction: number | null;
  /** Authoritative `combat::ARM_MIN_REACH_RAW`, for direct hand-control clamps. */
  armMinReach: number;
  impactThreshold: number; contactEnergyFloor: number;
  bodySlot: number; noRegion: number;
  regionNames: readonly string[]; hintNames: readonly string[]; contactKinds: readonly string[];
  bodies: readonly RecordedBody[];
};

/**
 * One run of frames, transferred as it is produced.
 *
 * **Seven buffers and an index, because the index is the point.** `pose_len` is
 * one per *live* articulated body, so a reader computing `tick * 2 * POSE_STRIDE`
 * misaligns from the death onwards -- which is exactly the frame anybody opened
 * the page to look at. Every section is therefore addressed by a start and a
 * count the recorder wrote down as it copied. The count in the section heading
 * was **five** in this repository's own reference until 2026-08-19, which is the
 * argument for counting from the list: `projectiles` was omitted.
 *
 * **Every start in `index` is relative to this chunk's own buffers, not to the
 * fight.** That is the trap this shape exists to avoid rather than a convenience:
 * `TypedArray.prototype.subarray` clamps rather than throwing, so a whole-fight
 * offset into a chunk's short buffer is not an exception anybody sees -- it is a
 * zero-length view whose every read answers `undefined` and a body drawn from
 * `NaN`. The recorder rebases as it copies and `FightChunk` refuses a chunk whose
 * extents do not fit, so whichever end got it wrong is named at adopt time.
 *
 * `firstFrame` is the whole-fight index of the first frame here, and it is what
 * makes a chunk placeable without trusting the order it arrived in.
 */
export type ArenaChunkMessage = {
  kind: "arenaChunk"; version: 2; requestId: number;
  firstFrame: number; frameCount: number;
  /** `Uint32Array` words: pose, region, projectile and event rows, packed. */
  poses: ArrayBuffer; regions: ArrayBuffer; projectiles: ArrayBuffer; events: ArrayBuffer;
  /** Uint8Array codec-exact accepted submitted-command rows. */
  commands: ArrayBuffer;
  /** Optional on an old trace adapter; always present on a live arena chunk. */
  stances: ArrayBuffer;
  /**
   * `Uint32Array`, **eleven** words a frame: the tick, then a chunk-relative start
   * and a count for each pose, region, projectile, event and stance section.
   * `RECORDING_INDEX_STRIDE` owns the number and `INDEX_TICK` owns the word.
   */
  index: ArrayBuffer;
  /** `Int32Array`, two raw `Fx` a frame: the Heroes' and the Monsters' health fraction. */
  health: ArrayBuffer;
};

/**
 * The fight stopped, and this is everything that could not be known until it did.
 *
 * `outcome` is a string here and `null` on a header that has not received this
 * message, and the difference is the whole reason the split is worth making: a
 * fight in progress has no outcome, and the two dishonest options -- a default
 * string, or an absent field every reader prints as `undefined` -- are both
 * worse than saying so.
 *
 * `frameCount` is **`ticks + 1`** and not `ticks`. The drive captures once before
 * it steps at all -- tick 0 is a frame, and it is the one a viewer opens on --
 * and then once per tick that advanced. Hitting a cap is the one case where it is
 * *less*, which is what `recordingTruncated` says.
 */
export type ArenaFinishedMessage = {
  kind: "arenaFinished"; version: 2; requestId: number;
  outcome: string; timedOut: boolean;
  /** The tick the fight stopped at. */
  ticks: number;
  frameCount: number;
  /** A cap was reached and rows were not recorded. The studio must say so. */
  recordingTruncated: boolean;
  /** The module's own saturating drop counters, summed over the whole fight. */
  posesDropped: number; regionsDropped: number; articulatedProjectilesDropped: number;
  combatEventsDropped: number; embodiedStancesDropped: number;
  acceptedCommandsDropped: number;
  stateDigestDomain: number; stateDigestSchema: number;
  stateDigestLo: number; stateDigestHi: number;
};

/**
 * The three streamed bodies, minus the protocol envelope.
 *
 * Declared here rather than beside either consumer because both ends need the
 * same three shapes and neither may import the other: `live.ts` reads a chunk
 * and `arena-recorder.ts` writes one, and the recorder is what `live.ts` already
 * takes its index words from. A second `Omit` on either side would be a second
 * answer to what crosses the channel.
 */
export type ArenaOpened = Omit<ArenaOpenedMessage, "kind" | "version" | "requestId">;
export type ArenaChunk = Omit<ArenaChunkMessage, "kind" | "version" | "requestId">;
export type ArenaFinished = Omit<ArenaFinishedMessage, "kind" | "version" | "requestId">;

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
  | ArenaRejectedMessage | ArenaOpenedMessage | ArenaChunkMessage | ArenaFinishedMessage
  | ArenaInputAckMessage;

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
    // The two V2-only kinds a *client* may send. Refused by name at V1 rather
    // than falling through to "invalid arenaStart message", because the
    // difference between "your message is malformed" and "your session is a V1
    // session" is the whole content of the legacy-only commitment.
    //
    // **`arenaOpened`, `arenaChunk` and `arenaFinished` are deliberately not
    // here, and the omission is the honest form of the same rule.** They travel
    // worker to main and never the other way, so telling a client that one of
    // them "needs protocol version 2" would say that at version 2 it may send
    // one -- which is false, and a nearly-right refusal is the failure mode two
    // reviews here found ten instances of. Their V1 refusal by name lives at the
    // boundary they actually cross, `decodeArenaMessage` in `arena-client.ts`,
    // where a legacy-versioned chunk is named rather than dropped as unreadable.
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
    case "arenaInput":
      if (version !== WORKER_PROTOCOL_VERSION) {
        return { ok: false, code: "unknownVersion", requestId,
          detail: "arenaInput needs protocol version 2; this session is legacy V1" };
      }
      if (isU32(value.arenaRequestId, true) && (value.faction === 0 || value.faction === 1)
        && isU32(value.ticksDue) && value.ticksDue > MAX_CONTROLLED_BATCH_TICKS) {
        return { ok: false, code: "invalidMessage", requestId,
          detail: `arenaInput ticksDue ${value.ticksDue} exceeds MAX_CONTROLLED_BATCH_TICKS ${MAX_CONTROLLED_BATCH_TICKS}` };
      }
      if (isU32(value.arenaRequestId, true) && (value.faction === 0 || value.faction === 1)
        && isU32(value.ticksDue)
        && value.bytes instanceof ArrayBuffer
        && value.bytes.byteLength === 61) {
        return { ok: true, message: { kind: "arenaInput", version: WORKER_PROTOCOL_VERSION,
          requestId: value.requestId, arenaRequestId: value.arenaRequestId,
          faction: value.faction, ticksDue: value.ticksDue, bytes: value.bytes } };
      }
      break;
    case "arenaChunkAck":
      if (version !== WORKER_PROTOCOL_VERSION) {
        return { ok: false, code: "unknownVersion", requestId,
          detail: "arenaChunkAck needs protocol version 2; this session is legacy V1" };
      }
      if (isU32(value.arenaRequestId, true) && isU32(value.firstFrame)) {
        return { ok: true, message: { kind: "arenaChunkAck", version: WORKER_PROTOCOL_VERSION,
          requestId: value.requestId, arenaRequestId: value.arenaRequestId,
          firstFrame: value.firstFrame } };
      }
      break;
  }
  return { ok: false, code: "invalidMessage", requestId, detail: `invalid ${String(value.kind)} message` };
}
