// The main thread's half of the recording channel.
//
// One `Worker` per mounted arena route, reused for every [Fight]. Not one per
// fight: instantiating `web.wasm` and warming `init` costs more than
// the fight does, and a worker that is thrown away after each recording pays
// both again every time.
//
// **A different worker from the game's, and that is the rule rather than a
// convenience.** `arena_start` installs a world over `SIM`, so a recording
// inside a live game session would replace the world that session's epoch, its
// command targets and its outstanding leases are all about --
// `SimWorkerHost` refuses the mixture by name in both directions.

import type {
  ArenaProgressMessage, ArenaRejectedMessage, ErrorMessage, FightRecordingMessage,
  TerminatedMessage,
} from "../protocol/messages.js";
import { WORKER_PROTOCOL_VERSION, isU32 } from "../protocol/messages.js";
import { encodeArenaConfig, type ArenaConfig } from "./arena-config.js";
import type { Recording } from "../fight/live.js";

export type ArenaProgress = (ticksDone: number, ticksTotal: number) => void;

/** A fight this build cannot run, with the sentence a reader can act on. */
export class ArenaRefused extends Error {}

/** The five kinds this client answers, and nothing else reaches `#receive`. */
type ArenaWorkerMessage = FightRecordingMessage | ArenaProgressMessage | ArenaRejectedMessage
  | ErrorMessage | TerminatedMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";
const arenaRejectReasons = new Set([
  "wrongModel", "unknownLayout", "invalidArenaConfig", "arenaBusy", "checkpointRefused", "cancelled",
]);
const errorCodes = new Set([
  "unknownVersion", "notInitialized", "alreadyInitialized", "invalidMessage",
  "invalidBufferId", "invalidLeaseToken", "invalidBufferCapacity", "epochExhausted",
  "leaseTokenExhausted", "revisionExhausted", "wasmAbiMismatch", "wasmTrap",
]);

/**
 * The arena half of `sim-client.ts`'s `decodeWorkerMessage`, and it is owed for
 * the same reason: **a TypeScript type is not a trust boundary.** A `postMessage`
 * from a worker is structured-cloned data and the `as` casts this file used to
 * make were assertions about a message nobody had read. The failure mode is not
 * a thrown `TypeError` either -- a missing `frameCount` makes every `!` in
 * `LiveFightSource` answer `undefined` and a body decodes as garbage, which is
 * the shape of failure a reader cannot diagnose from the picture.
 *
 * `spectator` is checked here rather than trusted, which is what makes the field
 * a gate instead of documentation: the arena publishes unfiltered ground truth,
 * and a producer that does not *say* so is refused rather than rendered.
 */
function decodeArenaMessage(value: unknown): ArenaWorkerMessage | null {
  if (!isRecord(value) || !isString(value.kind)) return null;
  switch (value.kind) {
    case "arenaProgress":
      if (value.version === WORKER_PROTOCOL_VERSION && isU32(value.requestId)
        && isU32(value.ticksDone) && isU32(value.ticksTotal)) {
        return value as unknown as ArenaProgressMessage;
      }
      break;
    case "arenaRejected":
      if (value.version === WORKER_PROTOCOL_VERSION && isU32(value.requestId)
        && isString(value.reason) && arenaRejectReasons.has(value.reason)
        && isU32(value.packed) && isString(value.detail)) {
        return value as unknown as ArenaRejectedMessage;
      }
      break;
    case "fightRecording":
      if (isRecording(value)) return value as unknown as FightRecordingMessage;
      break;
    case "error":
      if (value.version === WORKER_PROTOCOL_VERSION
        && (value.requestId === null || isU32(value.requestId)) && isU32(value.epoch)
        && isString(value.code) && errorCodes.has(value.code)
        && typeof value.fatal === "boolean" && isString(value.detail)) {
        return value as unknown as ErrorMessage;
      }
      break;
    case "terminated":
      if (value.version === WORKER_PROTOCOL_VERSION && isU32(value.epoch)) {
        return value as unknown as TerminatedMessage;
      }
      break;
  }
  return null;
}

function isRecording(value: Record<string, unknown>): boolean {
  const buffers = [
    value.poses, value.regions, value.projectiles, value.events, value.index, value.health,
  ];
  const counts = [value.one, value.seed, value.ticks, value.maxTicks, value.frameCount,
    value.poseLayoutVersion, value.poseStride, value.regionLayoutVersion, value.regionStride,
    value.regionsPerBody, value.articulatedProjectileLayoutVersion,
    value.articulatedProjectileStride, value.combatEventLayoutVersion, value.combatEventStride,
    value.posesDropped, value.regionsDropped, value.articulatedProjectilesDropped,
    value.combatEventsDropped,
    value.impactThreshold, value.contactEnergyFloor, value.bodySlot, value.noRegion];
  const names = [value.regionNames, value.hintNames, value.contactKinds];
  return value.version === WORKER_PROTOCOL_VERSION && isU32(value.requestId)
    // **Not `truthy` and not `!== false`.** The exemption is the whole reason
    // this field exists, so the only value that passes is the one the recorder
    // is documented to write.
    && value.spectator === true
    && buffers.every((buffer) => buffer instanceof ArrayBuffer)
    && counts.every((count) => isU32(count))
    && names.every((list) => Array.isArray(list) && list.every(isString))
    && isString(value.scenario) && value.mirrored === false && isString(value.fingerprint)
    && isString(value.heroes) && isString(value.monsters)
    && (value.checkpoint === null || isString(value.checkpoint))
    && isString(value.outcome) && typeof value.timedOut === "boolean"
    && typeof value.recordingTruncated === "boolean"
    && Array.isArray(value.arena) && value.arena.length === 2
    && value.arena.every((word) => isU32(word))
    && Array.isArray(value.bodies) && value.bodies.every(isRecord);
}

type Pending = {
  readonly requestId: number;
  readonly onProgress: ArenaProgress;
  readonly resolve: (recording: Recording) => void;
  readonly reject: (error: Error) => void;
};

export class ArenaClient {
  /**
   * How a worker is made. `createSimWorker` in production, a fake in a test.
   *
   * An argument rather than a line in this file, and both halves of the reason
   * are on [`sim-worker.ts`](./sim-worker.ts): Vite needs the literal at the
   * construction site, and `import.meta` does not compile to CommonJS -- so a
   * class carrying it could not be required by a Node test, and the correlation
   * rules below are exactly the half of this channel a wasm fixture cannot
   * reach.
   */
  readonly #createWorker: () => Worker;
  #worker: Worker | null = null;
  #pending: Pending | null = null;
  /**
   * Settles when the newest claimed `run` has finished, however it finished.
   *
   * **Armed synchronously at the top of `run` and not when the start is posted**,
   * which is the whole of the fix for the race below: a gate that only exists
   * once a message has gone out is no gate at all across an `await`.
   */
  #idle: Promise<void> = Promise.resolve();
  /**
   * Which press owns the channel. Incremented before `run`'s first `await`.
   *
   * A counter rather than a boolean because the question a waiter asks when it
   * wakes is not "is anything running" -- three presses answer that the same way
   * -- but "am I still the newest", which is the only one with one answer.
   */
  #claim = 0;
  #nextRequestId = 1;
  #disposed = false;

  constructor(createWorker: () => Worker) {
    this.#createWorker = createWorker;
  }

  /**
   * Record one configured duel.
   *
   * **A second call cancels the first rather than racing it.** [Fight] pressed
   * twice is the same problem a navigation is: two recordings landing in either
   * order would leave the panels showing whichever finished last. The worker
   * refuses a concurrent `arenaStart` by name, so the cancel is awaited to its
   * refusal before the new one is posted -- which is also what proves the worker
   * survives a cancel, since the fight after it is a real one.
   *
   * **The claim is taken before the first `await` and the wake-up is checked
   * against it, and both halves were missing.** The guard used to be one
   * `if (this.#pending !== null)` over a field assigned *inside* the returned
   * promise's executor -- which ran after an `await` on the checkpoint fetch.
   * Two presses of a `learned` matchup therefore both found the slot empty while
   * suspended on the same fetch, both posted a start, and the second came back
   * `arenaBusy` from a worker recording the first. The same hole in a second
   * shape: two waiters released by one `cancelled` refusal both resumed past a
   * test that had been true when they took it, and the middle promise never
   * settled because `#pending` had already been overwritten. **The fetch went in
   * v2-ui-08 and the guard stays**: `await previous` is still an `await` before
   * the slot is written, so the second shape is reachable with no fetch at all.
   *
   * So a press that is superseded before it posts anything is refused rather
   * than queued. Queueing was the alternative and it is wrong for a button: a
   * reader who pressed [Fight] three times wants the third fight, not all three
   * in the order they were asked for.
   *
   * Rejects rather than resolving with a failure, because every caller here is
   * an `await` inside a `try` that already has to explain a refusal to a reader:
   * two shapes of failure would mean two places that could forget one.
   */
  async run(config: ArenaConfig, onProgress: ArenaProgress): Promise<Recording> {
    if (this.#disposed) throw new Error("the arena client is disposed");
    const claim = (this.#claim += 1);
    const previous = this.#idle;
    let release = (): void => {};
    this.#idle = new Promise<void>((resolve) => { release = resolve; });
    // Posted before the wait rather than after it: a recording already in flight
    // should stop as soon as the press lands, not once the queue reaches it.
    this.cancel();
    try {
      await previous;
      this.#requireNewest(claim);
      // **No policy code asks for a network since v2-ui-08**, so this is always
      // `null` and the fetch that used to stand here is gone. `#/arena` reads
      // `EmbodiedPolicyKind`, which has no `learned` entry; `arena-config.ts`
      // carries the reason. The *field* survives because the worker's
      // `warmUp(seed, checkpoint)` and its `checkpointRefused` refusal are the
      // browser's only path for installing a network at all, and retiring a
      // transport because its one caller went is a protocol change with nothing
      // asking for it. **It is owed a decision** -- either a policy that wants
      // it or a removal -- and this comment is the record that it is unset
      // rather than merely unused.
      const checkpoint: ArrayBuffer | null = null;
      const worker = this.#requireWorker();
      const requestId = this.#nextRequestId++;
      // `encodeArenaConfig` allocates its own array, so the buffer under it is an
      // `ArrayBuffer` this call owns outright and may transfer -- which is why it
      // is copied out rather than aliased from anything the page holds.
      const bytes = new Uint8Array(encodeArenaConfig(config));
      return await new Promise<Recording>((resolve, reject) => {
        this.#pending = { requestId, onProgress, resolve, reject };
        const transfer: ArrayBuffer[] = [bytes.buffer as ArrayBuffer];
        if (checkpoint !== null) transfer.push(checkpoint);
        worker.postMessage({
          kind: "arenaStart", version: WORKER_PROTOCOL_VERSION, requestId,
          seed: config.seed, config: bytes.buffer, checkpoint,
        }, transfer);
      });
    } finally {
      release();
    }
  }

  /** Refuse a press a later one has replaced, and a disposed client with it. */
  #requireNewest(claim: number): void {
    if (this.#disposed) throw new Error("the arena client is disposed");
    if (claim !== this.#claim) {
      throw new ArenaRefused(
        "this recording was cancelled by a later Fight before it started");
    }
  }

  /**
   * Ask the worker to stop the recording in flight.
   *
   * Fire and forget: the worker answers the *start* request with a refusal when
   * it notices, so the promise `run` handed out is what settles. A cancel with
   * nothing running is ignored on the far side rather than refused -- a reader
   * who navigated away has no recording to stop and nowhere to put a refusal.
   */
  cancel(): void {
    if (this.#pending === null || this.#worker === null) return;
    this.#worker.postMessage({
      kind: "arenaCancel", version: WORKER_PROTOCOL_VERSION, requestId: this.#nextRequestId++,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#settle(new Error("the arena client was disposed"));
    this.#worker?.terminate();
    this.#worker = null;
  }

  #requireWorker(): Worker {
    if (this.#worker !== null) return this.#worker;
    const worker = this.#createWorker();
    worker.addEventListener("message", (event: MessageEvent<unknown>) => { this.#receive(event.data); });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      this.#settle(new Error(event.message || "the arena worker failed"));
    });
    worker.addEventListener("messageerror", () => {
      this.#settle(new Error("the arena worker sent an unreadable message"));
    });
    this.#worker = worker;
    return worker;
  }

  #receive(raw: unknown): void {
    const pending = this.#pending;
    if (pending === null) return;
    const message = decodeArenaMessage(raw);
    // A message this client cannot read is not a message it may act on. It is
    // dropped rather than made fatal for the same reason a stray request id is:
    // the worker is a module this page built, so a kind it does not answer is a
    // version skew, and the recording in flight is still the one being waited on.
    if (message === null) return;
    // **A fatal error and a `terminated` do not have to name this request**, and
    // that is the case worth writing down: `handleUnhandledError` reports a wasm
    // trap with a *null* request id, so a client that matched on the id alone
    // would leave the promise pending forever and the page saying "Recording..."
    // with nothing recording. Everything else must correlate exactly.
    const terminal = message.kind === "terminated"
      || (message.kind === "error" && message.fatal);
    if (!terminal && message.requestId !== pending.requestId) return;
    if (message.kind === "arenaProgress") {
      pending.onProgress(message.ticksDone, message.ticksTotal);
      return;
    }
    if (message.kind === "fightRecording") {
      const { kind: _kind, version: _version, requestId: _requestId, ...recording } = message;
      this.#clear();
      pending.resolve(recording);
      return;
    }
    if (message.kind === "arenaRejected") {
      this.#clear();
      pending.reject(new ArenaRefused(message.detail));
      return;
    }
    if (message.kind === "terminated") {
      this.#settle(new Error("the arena worker terminated"));
      this.#worker = null;
      return;
    }
    if (message.kind === "error") {
      const error = message;
      this.#clear();
      pending.reject(new Error(`${error.code}: ${error.detail}`));
      // A fatal worker error means the wasm instance is poisoned for the life of
      // the page -- a trap behind `pub extern "C"` leaves linear memory halfway
      // through a mutation -- so the worker goes with it and the next [Fight]
      // builds a new one.
      if (error.fatal) {
        this.#worker?.terminate();
        this.#worker = null;
      }
    }
  }

  // The gate is opened by `run`'s own `finally` and not from here, so the one
  // place that arms it is the one place that releases it.
  #clear(): void {
    this.#pending = null;
  }

  #settle(error: Error): void {
    const pending = this.#pending;
    if (pending === null) return;
    this.#clear();
    pending.reject(error);
  }
}
