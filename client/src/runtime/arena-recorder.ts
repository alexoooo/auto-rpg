// Recording one configured duel: the wasm facet, and the streaming drive over it.
//
// **This file used to argue against streaming, and the argument is kept because
// two thirds of it were right.** It read: *"Record the whole fight, then transfer
// once. The viewer scrubs, so random access over 3,600 ticks is the requirement,
// and it decides the model. Streaming tick by tick was considered and rejected for
// three reasons, the last decisive: the main thread would reassemble 3,600
// messages into the same arrays anyway; one uninterrupted worker-side run is
// reproducible from `(config, seed)` by inspection while a run interleaved with
// other messages is not; and `combat_event_len` is cleared per `step` call rather
// than per publication, so a per-tick event index requires `step(1)`."*
//
// The third reason still holds and is why the drive is still `step(1)` per tick.
// The second still holds and is why nothing but the *transport* changed: the drive
// is uninterrupted between yields exactly as it was, and the fight it produces is
// the same fight -- `a_live_fight_matches_the_traced_fight` compares it against
// `lab trace` frame for frame and is this session's acceptance for saying so.
//
// **The first reason was answered by measuring what it cost the reader.** Nothing
// was drawn until the last tick existed, which on the pairing the picker opens on
// is 0.67 to 0.94 s of staring at a status line. And the deeper cost was never the
// wait: a message shaped like a finished recording *cannot* carry a fight that has
// not finished, so a hand on the controls was unreachable underneath it. Streaming
// per **chunk** rather than per tick keeps the reassembly cheap -- 121 messages a
// duel at `ARENA_STREAM_CHUNK_TICKS`, not 3,600 -- and the main thread does not
// reassemble anything at all: `StreamingFightSource` keeps the chunks and finds
// the one a frame is in.
//
// **Not the pooled snapshot buffer**, and three independently sufficient reasons.
// `SimWorkerHost.returnSnapshot` zero-fills the whole buffer on every return and
// the pool is sized for one publication; `SimWorkerHost.publish` *coalesces* --
// when no buffer is free it increments a counter and drops the publication, which
// is correct for a live 60 Hz game and silent data loss for a recording; and the
// lifetimes differ, since a pooled buffer is borrowed for a frame while a
// recording is allocated once per fight and owned by the main thread for the whole
// scrubbing session.
//
// **The drive yields every `RECORDING_CHUNK_TICKS` and that is what makes cancel
// possible.** A worker services no message while JavaScript is on the stack, so a
// single uninterrupted 3,600-tick loop would be a recording nobody could stop.
// Between windows the loop awaits a macrotask, which is the only yield that lets
// a `postMessage` in. **That window is not the chunk cadence and the two used to
// be one number**: posting a chunk needs no yield at all, because `postMessage`
// enqueues onto the main thread's task queue rather than this one's.

import {
  ARTICULATED_PROJECTILE_LAYOUT_VERSION, ARTICULATED_PROJECTILE_STRIDE,
  COMBAT_EVENT_BODY_SLOT, COMBAT_EVENT_LAYOUT_VERSION, COMBAT_EVENT_NO_BODY_PART,
  COMBAT_EVENT_STRIDE, HEADER_LEN, HEADER_UNIT_COUNT, MAX_COMBAT_EVENTS,
  MAX_ARTICULATED_PROJECTILES, MAX_POSES, MAX_REGIONS, POSE_LAYOUT_VERSION, POSE_STRIDE, REGION_LAYOUT_VERSION,
  REGION_STRIDE, REGIONS_PER_BODY, UNIT_FACTION, UNIT_HP, UNIT_MAX_HP, UNIT_STRIDE,
} from "../protocol/abi.generated.js";
import {
  ARENA_STREAM_CHUNK_TICKS,
  type ArenaChunk, type ArenaFinished, type ArenaOpened,
  type RecordedBody, type RecordedItem,
} from "../protocol/messages.js";
import {
  ACTION_NAMES, ANATOMIES, ARENA_CONFIG_BYTES, ARENA_CONFIG_LAYOUT_VERSION, ARENA_FIGHTERS,
  ARENA_CONTROL_HUMAN, ARENA_POLICY_NAMES, ONE_RAW, arenaStarted, carriedOf,
  describeArenaInputRefusal, describeArenaRefusal, isGuardAction,
  type ArenaConfig, type CarriedSlot,
} from "./arena-config.js";

/**
 * The recording's tick ceiling.
 *
 * `ARENA_MAX_TICKS`, because that is the limit every live fight is configured
 * with and a fight cannot outlive its own `max_ticks`. It is a *cap* and not an
 * assumption: a configuration asking for more records its first 3,600 ticks and
 * says `recordingTruncated`, rather than allocating whatever it was asked for.
 */
export const RECORDING_TICK_CAP = 60 * 60;

/**
 * How many combat-event rows one recording may hold, and the corpus that sized it.
 *
 * **The first corpus behind this number was understated by a factor of two, and
 * the reason is worth more than the number.** It drove seven configurations, all
 * of them spawned where *it* chose, and the busiest it found was 4,948 rows -- two
 * Brutes with a club in each hand, two units apart. But the picker cannot move a
 * spawn: `SHIPPED_SPAWNS` reaches `Scenario::fingerprint`, so every fight a reader
 * can actually ask for starts where `DuelConfigV1::shipped()` puts it. A corpus
 * whose busiest cell is unreachable from the controls is not a corpus for this
 * cap.
 *
 * **Re-recorded on 2026-08-11 over picker-reachable loadouts at the shipped
 * spawns**, against the release wasm under Node: both anatomies on both sides,
 * every hand pairing in which both hands are full, five seeds and every policy
 * pairing that fights. 406 cells, of which:
 *
 * ```text
 * 10130 rows  ticks 3600  max/tick 16  brute,brute  sword,sword|sword,sword  windmill/windmill  seed 3
 *  9664 rows  ticks 3600  max/tick 16  brute,brute  sword,sword|sword,sword  attack-moves/windmill  seed 17
 *  9183 rows  ticks 3600  max/tick 16  fighter,fighter  sword,club|sword,club  windmill/windmill  seed 3
 *  8674 rows  ticks 3600  max/tick 13  brute,brute  shield,sword|sword,club  windmill/windmill  seed 3
 * busiest single tick: 20  (fighter on brute, sword,club|sword,club, windmill/windmill, seed 3)
 * the shipped arrangement, for scale:
 *  1491 rows  composed/composed   1743 rows  composed/windmill   2195 rows  learned/windmill
 * ```
 *
 * An empty hand can only lower the count, which is why the pairings with one are
 * not driven: the maximum is what a cap needs.
 *
 * The repository's rule for a capacity is the next power of two at least twice the
 * largest measurement, which takes 10,130 to 20,260 and rounds to **32,768** --
 * 4,194,304 bytes reserved in worker JavaScript against about 1.3 MB the busiest
 * reachable fight actually fills and 220 KB the shipped one does. The buffer is
 * allocated once per recording and sliced to its live length before transfer, so
 * what crosses is the fight and not the reservation.
 *
 * Nothing measured truncates at either value -- 10,130 fits under the old 16,384
 * too, so this move buys headroom and honest provenance rather than data a reader
 * was losing. `recordingTruncated` stays a guard rather than a path a reader will
 * meet, which is the honest state of it and not a reason to omit the flag.
 * `MAX_COMBAT_EVENTS` is 2,048 rows in a *single* publication, so a fight busy
 * enough to fill this is arithmetically possible.
 */
export const RECORDING_EVENT_ROW_CAP = 32_768;

/**
 * Ticks driven between yields. **The cancel window, and no longer the delivery
 * cadence** -- those two stopped being the same number when the drive started
 * streaming, and `ARENA_STREAM_CHUNK_TICKS` is the other one.
 *
 * Two costs pull against each other and neither is free. A window that is too
 * large is cancel latency -- nothing is serviced while the loop is on the stack --
 * and one that is too small pays a macrotask per window, which browsers clamp to
 * about 4 ms once the nesting level passes five. At the measured 9,000 to 10,000
 * ticks a second, 300 ticks is about 32 ms of work and twelve yields over a whole
 * fight: roughly 5% of the drive spent waiting, and a cancel that lands within a
 * frame or two of being pressed.
 *
 * **That rate is one pairing's, and it is not the one the picker opens on.** The
 * 9,000 to 10,000 was measured on `composed` against `windmill`. `composed` on
 * both sides -- what `populatePolicies` selects in both controls, and the slowest
 * of the four pairings measured -- runs at 3,816 to 5,349 ticks a second, so the
 * same 300 ticks is 56 to 79 ms of work there and "a frame or two" is three to
 * five. The yield count is unchanged, being ticks over ticks: still twelve for a
 * 3,600-tick fight, and still about 5% of a drive that is simply longer. The
 * four-pairing table is in `articulated-abi.md`, under "What recording costs".
 *
 * **A chunk is posted without waiting for this window and that is not a
 * contradiction.** `postMessage` enqueues onto the *main* thread's task queue, so
 * a worker holding its own stack for 300 ticks does not hold the page's: ten
 * chunks are drawn while this loop is between two yields. The window is what lets
 * a message reach *this* thread: cancellation, controlled input and chunk
 * acknowledgements all depend on that turn now.
 */
export const RECORDING_CHUNK_TICKS = 300;

/**
 * Eleven words a frame: the tick, then a start and a count for each of the five
 * variable-length publications.
 *
 * **The index is the point of the whole transfer.** `pose_len` is one per *live*
 * articulated body, so a fighter dying takes it from 2 to 1 -- the learned
 * fighter kills the Brute at tick 3,339 on seed 3 -- and a reader computing
 * `tick * 2 * POSE_STRIDE` silently misaligns from exactly the frame anybody
 * opened the page to look at. The region section is worse: it is read against
 * `pose_len` and a skipped body shifts every row after it.
 *
 * The tick is a word rather than the frame's own position for the same reason.
 * It happens to equal the index today, because the drive captures after every
 * step and stops the moment a step advances nothing -- and "happens to equal" is
 * precisely the kind of arithmetic this index exists to stop a reader doing.
 */
export const RECORDING_INDEX_STRIDE = 11;
export const ARENA_STREAM_LAYOUT_VERSION = 2;
export const INDEX_TICK = 0;
export const INDEX_POSE_START = 1;
export const INDEX_POSE_COUNT = 2;
export const INDEX_REGION_START = 3;
export const INDEX_REGION_COUNT = 4;
export const INDEX_PROJECTILE_START = 5;
export const INDEX_PROJECTILE_COUNT = 6;
export const INDEX_EVENT_START = 7;
export const INDEX_EVENT_COUNT = 8;
export const INDEX_STANCE_START = 9;
export const INDEX_STANCE_COUNT = 10;

export const EMBODIED_STANCE_LAYOUT_VERSION = 1;
export const EMBODIED_STANCE_STRIDE = 6;
export const EMBODIED_STANCE_CAPACITY = MAX_POSES;
/** Maximum exact controlled chunks posted but not yet acknowledged as adopted. */
export const ARENA_CONTROLLED_CHUNK_CREDITS = 3;

/**
 * `IMPACT_THRESHOLD` and `CONTACT_ENERGY_FLOOR`, mirrored.
 *
 * `crates/sim/src/rules.rs:457` is `Fx::from_ratio(6, 100)` and
 * `crates/sim/src/combat/resolution.rs:18` is a raw `144`, which
 * `contact-solver.md` also writes down. Neither is exported and both are drawn as
 * reference lines on the chart, so a live recording either carries them or the
 * chart loses the two numbers that closed v2-17. They are compared against the
 * trace's own copies by `a_live_fight_matches_the_traced_fight`, which is what
 * turns a hand-copied constant into a checked one.
 */
export const IMPACT_THRESHOLD_RAW = Math.trunc((6 * ONE_RAW) / 100);
export const CONTACT_ENERGY_FLOOR = 144;

/** The name lists the trace carries so a reader owns no copy of a `sim` enum. */
export const REGION_NAMES = ["head", "torso", "leftArm", "rightArm", "legs"] as const;
export const HINT_NAMES = ["idle", "chasing", "braced", "contact", "recoiling", "severed"] as const;
export const CONTACT_KINDS = [
  "weaponWeapon", "weaponShield", "weaponBody", "projectileBody",
] as const;

/** One tick of published ground truth, as the recorder consumes it. */
export interface ArenaPublication {
  readonly poseRows: number;
  readonly regionRows: number;
  readonly eventRows: number;
  readonly projectileRows: number;
  readonly posesDropped: number;
  readonly regionsDropped: number;
  readonly eventsDropped: number;
  readonly projectilesDropped: number;
  /** Live prefixes, freshly viewed. Valid only until the next wasm call. */
  readonly poses: Uint32Array;
  readonly regions: Uint32Array;
  readonly events: Uint32Array;
  readonly projectiles: Uint32Array;
  readonly stances: Uint32Array;
  /** Alive units per faction, `Faction::index` order. */
  readonly alive: readonly [number, number];
  /** Summed `UnitView::hp` raws over the alive units of each faction. */
  readonly health: readonly [number, number];
  /** Summed `UnitView::max_hp` raws over the alive units of each faction. */
  readonly maxHealth: readonly [number, number];
  /** `Scenario::arena`, raw. */
  readonly arena: readonly [number, number];
  readonly stancesDropped: number;
}

/** Everything the recorder asks of wasm, and nothing the legacy path needs. */
export interface ArenaWasmAdapter {
  /**
   * The allocating calls, taken once and deliberately together.
   *
   * `init` reserves 64 rows of contact vectors the module has not held before
   * and `load_checkpoint` builds the weight vector; both grow linear memory the
   * first time, and linear-memory growth detaches every typed array view. A
   * recording in flight is the worst possible moment for that, so these two run
   * before a single buffer is allocated and never again.
   *
   * Answers `load_checkpoint`'s packed word, or `0` when no checkpoint was given.
   */
  warmUp(seed: number, checkpoint: Uint8Array | null): number;
  /** The installed network's SHA-256, or null when none is installed. */
  checkpointDigest(): string | null;
  /** Writes the configuration over `arena_config_ptr()` through a fresh view. */
  writeConfig(bytes: Uint8Array): void;
  /** `arena_start`'s packed word. */
  start(seed: number): number;
  /** `arena_fingerprint_*` as `0x%016x`. */
  fingerprint(): string;
  /** `arena_policy(faction)`, so the fight running can be checked against the bytes sent. */
  policy(faction: number): number;
  /** `arena_control(faction)`, so the header names the driver the fight is running. */
  control(faction: number): number;
  tick(): number;
  /** Exactly one tick, because the event feed is cleared per call. */
  step(): void;
  /** Copy one whole 61-byte host command into wasm's staging buffer. */
  writeEmbodiedCommand(bytes: Uint8Array): void;
  /** `arena_stage_input`'s packed result. */
  stageInput(faction: number): number;
  read(): ArenaPublication;
}

type U32Export = () => number;
/** Every export the arena path calls, so `requiredFunctions` can name them. */
export interface ArenaExports {
  memory: WebAssembly.Memory;
  init(seed: number): void;
  arena_config_ptr: U32Export; arena_config_len: U32Export;
  arena_config_layout_version: U32Export;
  arena_start(seed: number): number;
  arena_fingerprint_lo: U32Export; arena_fingerprint_hi: U32Export;
  arena_policy(faction: number): number;
  arena_control(faction: number): number;
  arena_stage_input(faction: number): number;
  embodied_command_ptr: U32Export; embodied_command_len: U32Export;
  embodied_command_layout_version: U32Export;
  checkpoint_ptr: U32Export; checkpoint_capacity: U32Export; checkpoint_installed: U32Export;
  checkpoint_digest_ptr: U32Export; checkpoint_digest_len: U32Export;
  load_checkpoint(len: number): number;
  step(ticks: number): void;
  tick: U32Export;
  frame_ptr: U32Export; frame_len: U32Export;
  pose_ptr: U32Export; pose_len: U32Export; pose_stride: U32Export;
  pose_capacity: U32Export; poses_dropped: U32Export; pose_layout_version: U32Export;
  region_ptr: U32Export; region_len: U32Export; region_stride: U32Export;
  region_capacity: U32Export; regions_dropped: U32Export; region_layout_version: U32Export;
  articulated_projectile_ptr: U32Export; articulated_projectile_len: U32Export;
  articulated_projectile_stride: U32Export; articulated_projectile_capacity: U32Export;
  articulated_projectiles_dropped: U32Export; articulated_projectile_layout_version: U32Export;
  combat_event_ptr: U32Export; combat_event_len: U32Export; combat_event_stride: U32Export;
  combat_event_capacity: U32Export; combat_events_dropped: U32Export;
  combat_event_layout_version: U32Export;
  embodied_stance_ptr: U32Export; embodied_stance_len: U32Export;
  embodied_stance_stride: U32Export; embodied_stance_capacity: U32Export;
  embodied_stances_dropped: U32Export; embodied_stance_layout_version: U32Export;
}

/** The names above, for `sim.worker.ts`'s boot check and for `wasm_check.js`. */
export const ARENA_EXPORTS = [
  // Named here as well as in the worker's own list, because this list is what
  // the arena path *calls* rather than a set of distinct names: `warmUp` drives
  // `init`, and an export a caller has that no list mentions is the gap both
  // lists exist to close.
  "init",
  "arena_config_ptr", "arena_config_len", "arena_config_layout_version",
  "arena_start", "arena_fingerprint_lo", "arena_fingerprint_hi", "arena_policy",
  "arena_control",
  "arena_stage_input", "embodied_command_ptr", "embodied_command_len",
  "embodied_command_layout_version",
  "checkpoint_ptr", "checkpoint_capacity", "checkpoint_installed",
  "checkpoint_digest_ptr", "checkpoint_digest_len", "load_checkpoint",
  "pose_ptr", "pose_len", "pose_stride", "pose_capacity", "poses_dropped",
  "pose_layout_version",
  "region_ptr", "region_len", "region_stride", "region_capacity", "regions_dropped",
  "region_layout_version",
  "articulated_projectile_ptr", "articulated_projectile_len", "articulated_projectile_stride",
  "articulated_projectile_capacity", "articulated_projectiles_dropped",
  "articulated_projectile_layout_version",
  "combat_event_ptr", "combat_event_len", "combat_event_stride",
  "combat_event_capacity", "combat_events_dropped", "combat_event_layout_version",
  "embodied_stance_ptr", "embodied_stance_len", "embodied_stance_stride",
  "embodied_stance_capacity", "embodied_stances_dropped", "embodied_stance_layout_version",
] as const;

const HEX = "0123456789abcdef";

function hex64(hi: number, lo: number): string {
  const value = (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
  return `0x${value.toString(16).padStart(16, "0")}`;
}

/**
 * The faction aggregates, read off the legacy frame's own unit rows.
 *
 * **This is the one number in the recording that is assembled rather than
 * copied, and it is written down as such.** `World::health_fraction` is
 * `sum(hp) / sum(max_hp)` over a faction with `Fx`'s truncating division, and no
 * export answers it -- the frame publishes `UnitView::hp` and `max_hp` per row
 * instead, which are `health_of(i).max(0)` and `max_health_of(i)`, exactly the
 * two terms that function sums. Both are `Fx` raws under 2^24 and so cross as
 * `f32` without losing a bit, which is what makes `Math.round(row * ONE_RAW)`
 * the raw back rather than a rounding of it.
 *
 * The denominator is the one thing this cannot see: `health_fraction` totals the
 * maxima of *every* unit of a faction, alive or dead, and a dead body has no row.
 * So the recorder takes the totals from the first tick, when both are standing,
 * and the sum here is over the alive rows only.
 *
 * An export would remove this and should. It is a derivation, and the argument
 * against derivations in this repository -- that a viewer rebuilding a shoulder
 * would be a second answer to a question the simulation already answered --
 * applies to it. What holds it honest meanwhile is that
 * `a_live_fight_matches_the_traced_fight` compares this number against
 * `world.health_fraction`'s own output for every tick of two whole fights,
 * including the one where a body dies.
 */
function factionAggregates(frame: Float32Array): {
  alive: [number, number]; health: [number, number]; maxHealth: [number, number];
} {
  const alive: [number, number] = [0, 0];
  const health: [number, number] = [0, 0];
  const maxHealth: [number, number] = [0, 0];
  const count = frame[HEADER_UNIT_COUNT] ?? 0;
  for (let row = 0; row < count; row += 1) {
    const at = HEADER_LEN + row * UNIT_STRIDE;
    const faction = frame[at + UNIT_FACTION];
    if (faction !== 0 && faction !== 1) continue;
    alive[faction] += 1;
    health[faction] += Math.round((frame[at + UNIT_HP] ?? 0) * ONE_RAW);
    maxHealth[faction] += Math.round((frame[at + UNIT_MAX_HP] ?? 0) * ONE_RAW);
  }
  return { alive, health, maxHealth };
}

/** `Fx`'s division, which truncates toward zero after a 16-bit shift. */
export function healthFraction(current: number, total: number): number {
  if (total === 0) return 0;
  return Math.trunc((current * ONE_RAW) / total);
}

/**
 * Bind the arena facet to a live wasm instance.
 *
 * A free function over the exports rather than a method on the worker, so a Node
 * test can instantiate `web.wasm` and drive the identical adapter. The worker
 * adds nothing to it but the instantiation.
 */
export function createArenaAdapter(wasm: ArenaExports): ArenaWasmAdapter {
  const checkLayout = (): void => {
    if ((wasm.arena_config_layout_version() >>> 0) !== ARENA_CONFIG_LAYOUT_VERSION
      || (wasm.arena_config_len() >>> 0) !== ARENA_CONFIG_BYTES
      || (wasm.pose_layout_version() >>> 0) !== POSE_LAYOUT_VERSION
      || (wasm.pose_stride() >>> 0) !== POSE_STRIDE
      || (wasm.pose_capacity() >>> 0) !== MAX_POSES
      || (wasm.region_layout_version() >>> 0) !== REGION_LAYOUT_VERSION
      || (wasm.region_stride() >>> 0) !== REGION_STRIDE
      || (wasm.region_capacity() >>> 0) !== MAX_REGIONS
      || (wasm.articulated_projectile_layout_version() >>> 0) !== ARTICULATED_PROJECTILE_LAYOUT_VERSION
      || (wasm.articulated_projectile_stride() >>> 0) !== ARTICULATED_PROJECTILE_STRIDE
      || (wasm.articulated_projectile_capacity() >>> 0) !== MAX_ARTICULATED_PROJECTILES
      || (wasm.combat_event_layout_version() >>> 0) !== COMBAT_EVENT_LAYOUT_VERSION
      || (wasm.combat_event_stride() >>> 0) !== COMBAT_EVENT_STRIDE
      || (wasm.combat_event_capacity() >>> 0) !== MAX_COMBAT_EVENTS
      || (wasm.embodied_command_len() >>> 0) !== 61
      || (wasm.embodied_command_layout_version() >>> 0) !== 2
      || (wasm.embodied_stance_layout_version() >>> 0) !== EMBODIED_STANCE_LAYOUT_VERSION
      || (wasm.embodied_stance_stride() >>> 0) !== EMBODIED_STANCE_STRIDE
      || (wasm.embodied_stance_capacity() >>> 0) !== EMBODIED_STANCE_CAPACITY) {
      throw new RangeError("wasm arena layout disagrees with the generated ABI");
    }
  };
  return {
    warmUp(seed, checkpoint) {
      checkLayout();
      // The generated room and not the duel: it is the call that reserves the
      // contact vectors, and it is the one already in the memory proof's warm
      // set. `arena_start` then replaces the world without growing anything.
      wasm.init(seed);
      if (checkpoint === null) return 0;
      const capacity = wasm.checkpoint_capacity() >>> 0;
      if (checkpoint.length > capacity) {
        // Refused locally as well as by the module, which refuses it too and
        // reads nothing. Two refusals rather than one because the local one can
        // say the capacity.
        throw new RangeError(`checkpoint is ${checkpoint.length} bytes; the staging buffer holds ${capacity}`);
      }
      // A **fresh** view, written and dropped inside one statement. Pointers
      // here are stable for the module's life, but a view held across an
      // unrelated call that grew memory is a detached view.
      new Uint8Array(wasm.memory.buffer, wasm.checkpoint_ptr() >>> 0, capacity).set(checkpoint);
      return wasm.load_checkpoint(checkpoint.length) >>> 0;
    },
    checkpointDigest() {
      if ((wasm.checkpoint_installed() >>> 0) !== 1) return null;
      const bytes = new Uint8Array(
        wasm.memory.buffer, wasm.checkpoint_digest_ptr() >>> 0, wasm.checkpoint_digest_len() >>> 0,
      );
      let out = "";
      for (const byte of bytes) out += `${HEX[byte >> 4] ?? ""}${HEX[byte & 15] ?? ""}`;
      return out;
    },
    writeConfig(bytes) {
      if (bytes.length !== (wasm.arena_config_len() >>> 0)) {
        throw new RangeError(`arena configuration is ${bytes.length} bytes, not ${wasm.arena_config_len() >>> 0}`);
      }
      new Uint8Array(wasm.memory.buffer, wasm.arena_config_ptr() >>> 0, bytes.length).set(bytes);
    },
    start(seed) { return wasm.arena_start(seed) >>> 0; },
    fingerprint() { return hex64(wasm.arena_fingerprint_hi() >>> 0, wasm.arena_fingerprint_lo() >>> 0); },
    policy(faction) { return wasm.arena_policy(faction) >>> 0; },
    control(faction) { return wasm.arena_control(faction) >>> 0; },
    writeEmbodiedCommand(bytes) {
      const length = wasm.embodied_command_len() >>> 0;
      if (bytes.length !== length || (wasm.embodied_command_layout_version() >>> 0) !== 2) {
        throw new RangeError(`embodied command is ${bytes.length} bytes at an unknown layout`);
      }
      new Uint8Array(wasm.memory.buffer, wasm.embodied_command_ptr() >>> 0, length).set(bytes);
    },
    stageInput(faction) { return wasm.arena_stage_input(faction) >>> 0; },
    tick() { return wasm.tick() >>> 0; },
    step() { wasm.step(1); },
    read() {
      // Every wasm call precedes every view construction, exactly as
      // `readPublication` does it: nothing may re-enter wasm while these views
      // are alive, because a call that grew linear memory would detach them.
      const poseRows = wasm.pose_len() >>> 0;
      const regionRows = wasm.region_len() >>> 0;
      const eventRows = wasm.combat_event_len() >>> 0;
      const projectileRows = wasm.articulated_projectile_len() >>> 0;
      const posesDropped = wasm.poses_dropped() >>> 0;
      const regionsDropped = wasm.regions_dropped() >>> 0;
      const eventsDropped = wasm.combat_events_dropped() >>> 0;
      const projectilesDropped = wasm.articulated_projectiles_dropped() >>> 0;
      const posePointer = wasm.pose_ptr() >>> 0;
      const regionPointer = wasm.region_ptr() >>> 0;
      const eventPointer = wasm.combat_event_ptr() >>> 0;
      const projectilePointer = wasm.articulated_projectile_ptr() >>> 0;
      const framePointer = wasm.frame_ptr() >>> 0;
      const frameLength = wasm.frame_len() >>> 0;
      const stanceRows = wasm.embodied_stance_len() >>> 0;
      const stancePointer = wasm.embodied_stance_ptr() >>> 0;
      const stancesDropped = wasm.embodied_stances_dropped() >>> 0;
      const memory = wasm.memory.buffer;
      if (poseRows > MAX_POSES || eventRows > MAX_COMBAT_EVENTS
        || projectileRows > MAX_ARTICULATED_PROJECTILES
        || regionRows !== poseRows * REGIONS_PER_BODY) {
        // The length comparison is the reader's protection and not a nicety: a
        // body whose anatomy the host does not hold is skipped and the rows
        // after it shift, because the writer carries one cursor and the section
        // stays dense. A reader that skipped this indexes a shifted section.
        throw new RangeError("wasm arena publication shape exceeds the generated ABI");
      }
      const frame = new Float32Array(memory, framePointer, frameLength);
      const aggregates = factionAggregates(frame);
      if (stanceRows > EMBODIED_STANCE_CAPACITY) {
        throw new RangeError("wasm embodied stance length exceeds the generated ABI capacity");
      }
      return {
        poseRows, regionRows, projectileRows, eventRows,
        posesDropped, regionsDropped, projectilesDropped, eventsDropped,
        poses: new Uint32Array(memory, posePointer, poseRows * POSE_STRIDE),
        regions: new Uint32Array(memory, regionPointer, regionRows * REGION_STRIDE),
        projectiles: new Uint32Array(
          memory, projectilePointer, projectileRows * ARTICULATED_PROJECTILE_STRIDE,
        ),
        events: new Uint32Array(memory, eventPointer, eventRows * COMBAT_EVENT_STRIDE),
        stances: new Uint32Array(
          memory, stancePointer, stanceRows * EMBODIED_STANCE_STRIDE,
        ),
        alive: aggregates.alive,
        health: aggregates.health,
        maxHealth: aggregates.maxHealth,
        arena: [Math.round((frame[0] ?? 0) * ONE_RAW), Math.round((frame[1] ?? 0) * ONE_RAW)],
        stancesDropped,
      };
    },
  };
}

/** What the recorder answers once the fight stops, or the reason there is not one. */
export type RecordingResult =
  | { readonly ok: true; readonly finished: ArenaFinished }
  | { readonly ok: false; readonly reason: "invalidArenaConfig" | "checkpointRefused" | "cancelled" | "inputRefused";
      readonly packed: number; readonly detail: string };

export interface RecorderHooks {
  /**
   * Everything `arena_start` already decided, before the first tick is stepped.
   *
   * Called once and never again, which is what makes it the message a reader can
   * be shown a fight from: the configuration, the fingerprint, the layout the
   * chunks are packed with, and the anatomy every pose row is drawn against.
   */
  readonly onOpened: (opened: ArenaOpened) => void;
  /** One run of frames, transferred. Called every `ARENA_STREAM_CHUNK_TICKS`. */
  readonly onChunk: (chunk: ArenaChunk) => void;
  /** The yield between cancel windows. A macrotask, so the worker services messages. */
  readonly yieldToMessages: () => Promise<void>;
  readonly nextInput?: () => Promise<ArenaControlInput | null>;
  readonly onInputSettled?: (requestId: number, steppedTicks: number) => void;
  readonly beforeChunk?: () => Promise<void>;
}

export interface ArenaControlInput {
  readonly requestId: number;
  readonly faction: number;
  readonly ticksDue: number;
  readonly bytes: Uint8Array;
}

/** `Outcome`'s own definition, over published alive counts and health. */
function outcomeOf(
  alive: readonly [number, number], health: readonly [number, number],
): { outcome: string; timedOut: boolean } {
  // `World::outcome` is exactly this table over `alive_count`, and an arena's
  // alive set is what the frame's unit rows are. It answers `None` while both
  // sides stand, and the runner then scores the limit on points through
  // `World::timeout`, which compares the two health fractions and calls a tie a
  // `Draw`. `timed_out` is `world.outcome().is_none()`, which is the same
  // question as "is anybody left on both sides".
  if (alive[0] === 0 && alive[1] === 0) return { outcome: "MutualDestruction", timedOut: false };
  if (alive[0] === 0) return { outcome: "MonstersWin", timedOut: false };
  if (alive[1] === 0) return { outcome: "HeroesWin", timedOut: false };
  if (health[0] > health[1]) return { outcome: "Decision(Heroes)", timedOut: true };
  if (health[1] > health[0]) return { outcome: "Decision(Monsters)", timedOut: true };
  return { outcome: "Draw", timedOut: true };
}

function itemOf(carried: CarriedSlot | null): RecordedItem | null {
  if (carried === null) return null;
  const { hand } = carried;
  const common = {
    action: ACTION_NAMES[hand.code] ?? `action ${hand.code}`,
    binding: carried.binding, mass: hand.mass, balance: hand.balance,
  };
  // The geometry *kind* is derived from the action and not carried, which is why
  // the hand block is 22 bytes and not 23 -- so the same three dimension words
  // mean length/radius on a segment and half-width/half-height/thickness on a
  // shield, and this is the one place that decides which.
  return isGuardAction(hand.code)
    ? { ...common, geometry: "shield", halfWidth: hand.a, halfHeight: hand.b, thickness: hand.c }
    : { ...common, geometry: "segment", length: hand.a, radius: hand.b };
}

/**
 * The per-body header block.
 *
 * `kind` and `faction` are `AnatomyChoice::body`'s and `DuelConfigV1`'s own
 * rules -- a Fighter frame wears a Fighter's stat sheet, index 0 fights for the
 * Heroes -- so both are decided by the configuration rather than read back. The
 * shield's `thickness` is here and nowhere else: the pose row deliberately omits
 * it, and `shieldCorners()` needs it to place the face in front of its centre.
 */
function bodiesOf(config: ArenaConfig): readonly RecordedBody[] {
  return config.fighters.map((fighter, index) => {
    const anatomy = ANATOMIES[fighter.anatomy];
    if (anatomy === undefined) throw new RangeError(`anatomy code ${fighter.anatomy} has no shipped row`);
    return {
      index,
      kind: anatomy.kind,
      faction: index === 0 ? "Heroes" : "Monsters",
      anatomy: {
        standingHeight: anatomy.standingHeight, shoulderHeight: anatomy.shoulderHeight,
        shoulderHalfWidth: anatomy.shoulderHalfWidth, armLength: anatomy.armLength,
        handRadius: anatomy.handRadius,
      },
      carried: carriedOf(fighter).map(itemOf),
    };
  });
}

function driverName(fighter: ArenaConfig["fighters"][number]): string {
  const policy = ARENA_POLICY_NAMES[fighter.policy] ?? `policy ${fighter.policy}`;
  return fighter.control === ARENA_CONTROL_HUMAN ? `you + ${policy} off hand` : policy;
}

/**
 * Drive one configured duel, posting the fight as it is produced.
 *
 * **The staging buffers are still allocated whole before the first step, and the
 * chunks are copied out of them.** Two properties are worth more than the
 * allocation they cost. No tick of the drive can allocate, which is what the
 * per-tick view discipline above depends on. And `RECORDING_EVENT_ROW_CAP` stays
 * a **whole-fight** cap with a whole-fight corpus behind it: splitting it per
 * chunk would need a second measurement and a second constant to carry its
 * provenance, and `recordingTruncated` would stop meaning what it means today.
 * What crosses per chunk is that chunk's rows and nothing else, so the transport
 * is streamed even though the ledger it is copied out of is not.
 *
 * The pose and region extents are exact -- an arena is two fighters by
 * construction, which is what `ARENA_FIGHTERS` means -- and the event extent is
 * the measured cap above.
 */
export async function recordArenaFight(
  wasm: ArenaWasmAdapter, config: ArenaConfig, configBytes: Uint8Array,
  checkpoint: Uint8Array | null, hooks: RecorderHooks, cancelled: () => boolean,
): Promise<RecordingResult> {
  const loaded = wasm.warmUp(config.seed, checkpoint);
  if (checkpoint !== null && (loaded & 0xff) !== 1) {
    return { ok: false, reason: "checkpointRefused", packed: loaded, detail: "load_checkpoint refused the file" };
  }
  wasm.writeConfig(configBytes);
  const started = wasm.start(config.seed);
  if (!arenaStarted(started)) {
    return { ok: false, reason: "invalidArenaConfig", packed: started, detail: describeArenaRefusal(started) };
  }
  for (const [faction, fighter] of config.fighters.entries()) {
    if (wasm.policy(faction) !== fighter.policy) {
      // A read-back and not a formality. `arena_start` is the only thing that
      // installs a duel, and the byte it took is the byte this recording will be
      // labelled with; if the two disagreed the header would name a policy that
      // is not fighting.
      throw new RangeError(`arena_policy(${faction}) is not the code the configuration carried`);
    }
    if (wasm.control(faction) !== fighter.control) {
      // The same check on the byte beside it, and it is not redundant with the
      // refusal: `arena_start` refuses `ARENA_CONTROL_HUMAN` today, so anything
      // that got past it and read back as human would mean the refusal had
      // stopped working -- and once arena-05 deletes that refusal this is what
      // stops a recording being labelled with a driver it is not running.
      throw new RangeError(`arena_control(${faction}) is not the code the configuration carried`);
    }
  }

  const tickCap = Math.min(config.maxTicks, RECORDING_TICK_CAP);
  // One frame before the first step and one after every step, exactly as
  // `FightTrace::record` is called: frame `t` is the world as tick `t` left it,
  // and frame 0 is the fixture as it spawned.
  const frameCap = tickCap + 1;
  const poses = new Uint32Array(frameCap * ARENA_FIGHTERS * POSE_STRIDE);
  const regions = new Uint32Array(frameCap * ARENA_FIGHTERS * REGIONS_PER_BODY * REGION_STRIDE);
  const projectiles = new Uint32Array(
    frameCap * MAX_ARTICULATED_PROJECTILES * ARTICULATED_PROJECTILE_STRIDE,
  );
  const events = new Uint32Array(RECORDING_EVENT_ROW_CAP * COMBAT_EVENT_STRIDE);
  const stances = new Uint32Array(frameCap * ARENA_FIGHTERS * EMBODIED_STANCE_STRIDE);
  const index = new Uint32Array(frameCap * RECORDING_INDEX_STRIDE);
  const health = new Int32Array(frameCap * 2);

  let frames = 0;
  let poseRows = 0;
  let regionRows = 0;
  let projectileRows = 0;
  let eventRows = 0;
  let stanceRows = 0;
  let truncated = false;
  let posesDropped = 0;
  let regionsDropped = 0;
  let projectilesDropped = 0;
  let eventsDropped = 0;
  let stancesDropped = 0;
  let maxHealth: readonly [number, number] = [0, 0];
  let alive: readonly [number, number] = [0, 0];
  let lastHealth: readonly [number, number] = [0, 0];
  let arena: readonly [number, number] = [0, 0];

  /** Copies one publication in, or answers false when a cap stopped it. */
  const capture = (): boolean => {
    // Read before the views exist, not after they are populated: every wasm call
    // precedes every view construction here, which is the same discipline
    // `readPublication` states and the reason `read()` reads its own counters
    // first.
    const tick = wasm.tick();
    const published = wasm.read();
    if (frames >= frameCap
      || poseRows + published.poseRows > frameCap * ARENA_FIGHTERS
      || projectileRows + published.projectileRows > frameCap * MAX_ARTICULATED_PROJECTILES
      || stanceRows + published.stances.length / EMBODIED_STANCE_STRIDE > frameCap * ARENA_FIGHTERS
      || eventRows + published.eventRows > RECORDING_EVENT_ROW_CAP) {
      return false;
    }
    poses.set(published.poses, poseRows * POSE_STRIDE);
    regions.set(published.regions, regionRows * REGION_STRIDE);
    projectiles.set(published.projectiles, projectileRows * ARTICULATED_PROJECTILE_STRIDE);
    events.set(published.events, eventRows * COMBAT_EVENT_STRIDE);
    stances.set(published.stances, stanceRows * EMBODIED_STANCE_STRIDE);
    const at = frames * RECORDING_INDEX_STRIDE;
    index[at + INDEX_TICK] = tick;
    index[at + INDEX_POSE_START] = poseRows;
    index[at + INDEX_POSE_COUNT] = published.poseRows;
    index[at + INDEX_REGION_START] = regionRows;
    index[at + INDEX_REGION_COUNT] = published.regionRows;
    index[at + INDEX_PROJECTILE_START] = projectileRows;
    index[at + INDEX_PROJECTILE_COUNT] = published.projectileRows;
    index[at + INDEX_EVENT_START] = eventRows;
    index[at + INDEX_EVENT_COUNT] = published.eventRows;
    index[at + INDEX_STANCE_START] = stanceRows;
    index[at + INDEX_STANCE_COUNT] = published.stances.length / EMBODIED_STANCE_STRIDE;
    poseRows += published.poseRows;
    regionRows += published.regionRows;
    projectileRows += published.projectileRows;
    eventRows += published.eventRows;
    stanceRows += published.stances.length / EMBODIED_STANCE_STRIDE;
    // The maxima come from the first frame, where both bodies are standing.
    // `health_fraction`'s denominator counts a dead body's maximum and a dead
    // body has no published row, so a per-tick denominator would climb as the
    // fight went on and read a survivor as healthier than it is.
    if (frames === 0) maxHealth = published.maxHealth;
    lastHealth = [
      healthFraction(published.health[0], maxHealth[0]),
      healthFraction(published.health[1], maxHealth[1]),
    ];
    health[frames * 2] = lastHealth[0];
    health[frames * 2 + 1] = lastHealth[1];
    alive = published.alive;
    arena = published.arena;
    posesDropped += published.posesDropped;
    regionsDropped += published.regionsDropped;
    projectilesDropped += published.projectilesDropped;
    eventsDropped += published.eventsDropped;
    stancesDropped += published.stancesDropped;
    frames += 1;
    return true;
  };

  // Where the chunk being filled began, in each of the five ledgers it addresses.
  // These are what the index words are rebased against.
  let chunkFirstFrame = 0;
  let chunkPoseBase = 0;
  let chunkRegionBase = 0;
  let chunkProjectileBase = 0;
  let chunkEventBase = 0;
  let chunkStanceBase = 0;

  /**
   * Post everything captured since the last chunk, rebased onto its own buffers.
   *
   * **The rebase is the whole of what a chunk boundary means.** A start word is
   * an offset into the section it addresses, and the section a chunk carries
   * begins where the chunk does -- so a start left at its whole-fight value would
   * run off the end of a buffer holding thirty frames' rows. `subarray` clamps
   * rather than throwing, so the reader would draw `NaN` rather than refuse;
   * `FightChunk` therefore checks every extent against the chunk it arrived in,
   * and `a_chunk_whose_index_starts_are_not_chunk_relative_is_refused_at_adopt`
   * proves the check by handing it the offsets this loop subtracts.
   */
  const postChunk = async (): Promise<void> => {
    const span = frames - chunkFirstFrame;
    if (span === 0) return;
    await hooks.beforeChunk?.();
    const chunkIndex = new Uint32Array(span * RECORDING_INDEX_STRIDE);
    for (let frame = 0; frame < span; frame += 1) {
      const from = (chunkFirstFrame + frame) * RECORDING_INDEX_STRIDE;
      const to = frame * RECORDING_INDEX_STRIDE;
      chunkIndex[to + INDEX_TICK] = index[from + INDEX_TICK]!;
      chunkIndex[to + INDEX_POSE_START] = index[from + INDEX_POSE_START]! - chunkPoseBase;
      chunkIndex[to + INDEX_POSE_COUNT] = index[from + INDEX_POSE_COUNT]!;
      chunkIndex[to + INDEX_REGION_START] = index[from + INDEX_REGION_START]! - chunkRegionBase;
      chunkIndex[to + INDEX_REGION_COUNT] = index[from + INDEX_REGION_COUNT]!;
      chunkIndex[to + INDEX_PROJECTILE_START] =
        index[from + INDEX_PROJECTILE_START]! - chunkProjectileBase;
      chunkIndex[to + INDEX_PROJECTILE_COUNT] = index[from + INDEX_PROJECTILE_COUNT]!;
      chunkIndex[to + INDEX_EVENT_START] = index[from + INDEX_EVENT_START]! - chunkEventBase;
      chunkIndex[to + INDEX_EVENT_COUNT] = index[from + INDEX_EVENT_COUNT]!;
      chunkIndex[to + INDEX_STANCE_START] =
        index[from + INDEX_STANCE_START]! - chunkStanceBase;
      chunkIndex[to + INDEX_STANCE_COUNT] = index[from + INDEX_STANCE_COUNT]!;
    }
    hooks.onChunk({
      firstFrame: chunkFirstFrame,
      frameCount: span,
      poses: poses.buffer.slice(chunkPoseBase * POSE_STRIDE * 4, poseRows * POSE_STRIDE * 4),
      regions: regions.buffer.slice(
        chunkRegionBase * REGION_STRIDE * 4, regionRows * REGION_STRIDE * 4,
      ),
      projectiles: projectiles.buffer.slice(
        chunkProjectileBase * ARTICULATED_PROJECTILE_STRIDE * 4,
        projectileRows * ARTICULATED_PROJECTILE_STRIDE * 4,
      ),
      events: events.buffer.slice(
        chunkEventBase * COMBAT_EVENT_STRIDE * 4, eventRows * COMBAT_EVENT_STRIDE * 4,
      ),
      stances: stances.buffer.slice(
        chunkStanceBase * EMBODIED_STANCE_STRIDE * 4, stanceRows * EMBODIED_STANCE_STRIDE * 4,
      ),
      index: chunkIndex.buffer,
      health: health.buffer.slice(chunkFirstFrame * 2 * 4, frames * 2 * 4),
    });
    chunkFirstFrame = frames;
    chunkPoseBase = poseRows;
    chunkRegionBase = regionRows;
    chunkProjectileBase = projectileRows;
    chunkEventBase = eventRows;
    chunkStanceBase = stanceRows;
  };

  if (!capture()) truncated = true;
  // **After the first capture and before the first step.** `Scenario::arena` is
  // read off the published frame, so the opening message needs one publication to
  // exist -- and frame 0 is that publication, the fixture as it spawned.
  hooks.onOpened({
    spectator: true,
    one: ONE_RAW,
    scenario: "configured-duel-v1",
    mirrored: false,
    fingerprint: wasm.fingerprint(),
    seed: config.seed,
    heroes: driverName(config.fighters[0]),
    monsters: driverName(config.fighters[1]),
    checkpoint: wasm.checkpointDigest(),
    maxTicks: config.maxTicks,
    arena,
    arenaStreamLayoutVersion: ARENA_STREAM_LAYOUT_VERSION,
    recordingIndexStride: RECORDING_INDEX_STRIDE,
    poseLayoutVersion: POSE_LAYOUT_VERSION, poseStride: POSE_STRIDE,
    regionLayoutVersion: REGION_LAYOUT_VERSION, regionStride: REGION_STRIDE,
    regionsPerBody: REGIONS_PER_BODY,
    articulatedProjectileLayoutVersion: ARTICULATED_PROJECTILE_LAYOUT_VERSION,
    articulatedProjectileStride: ARTICULATED_PROJECTILE_STRIDE,
    combatEventLayoutVersion: COMBAT_EVENT_LAYOUT_VERSION,
    combatEventStride: COMBAT_EVENT_STRIDE,
    embodiedStanceLayoutVersion: EMBODIED_STANCE_LAYOUT_VERSION,
    embodiedStanceStride: EMBODIED_STANCE_STRIDE,
    embodiedStanceCapacity: EMBODIED_STANCE_CAPACITY,
    impactThreshold: IMPACT_THRESHOLD_RAW, contactEnergyFloor: CONTACT_ENERGY_FLOOR,
    // The event row widens `sim::NO_REGION` to a full word so a reader that lost
    // track of the column width cannot mistake it for a region index;
    // `BODY_SLOT` crosses as the sim's own byte. Both come off the generated ABI
    // rather than being written down again here.
    bodySlot: COMBAT_EVENT_BODY_SLOT, noRegion: COMBAT_EVENT_NO_BODY_PART,
    regionNames: REGION_NAMES, hintNames: HINT_NAMES, contactKinds: CONTACT_KINDS,
    bodies: bodiesOf(config),
  });

  let ticks = wasm.tick();
  let settled = false;
  if (hooks.nextInput !== undefined) {
    // Frame zero is needed to identify the opponent and seed the submitted yaw.
    await postChunk();
    while (!truncated && !settled) {
      const input = await hooks.nextInput();
      if (input === null || cancelled()) {
        return { ok: false, reason: "cancelled", packed: 0, detail: "the controlled fight was cancelled" };
      }
      wasm.writeEmbodiedCommand(input.bytes);
      const staged = wasm.stageInput(input.faction);
      if (!arenaStarted(staged)) {
        return { ok: false, reason: "inputRefused", packed: staged,
          detail: describeArenaInputRefusal(staged) };
      }
      let steppedTicks = 0;
      for (let due = 0; due < input.ticksDue; due += 1) {
        if (cancelled()) {
          hooks.onInputSettled?.(input.requestId, steppedTicks);
          return { ok: false, reason: "cancelled", packed: 0,
            detail: "the controlled fight was cancelled" };
        }
        const before = wasm.tick();
        wasm.step();
        const after = wasm.tick();
        if (after === before) { settled = true; break; }
        ticks = after;
        steppedTicks += 1;
        if (!capture()) { truncated = true; break; }
        // One publication per authoritative tick. No event row can be hidden in
        // a coalesced batch because `combat_event_len` clears on every step call.
        await postChunk();
      }
      hooks.onInputSettled?.(input.requestId, steppedTicks);
    }
  } else while (!truncated && !settled) {
    if (cancelled()) {
      // **The chunks already posted are not taken back**, which is what leaves a
      // reader with the part of the fight they watched rather than an empty page.
      // The *request* still settles as a refusal, by name, because a cancelled
      // fight has no outcome and an `arenaFinished` would have to invent one --
      // which is the thing this whole session is about not doing.
      return { ok: false, reason: "cancelled", packed: 0, detail: "the recording was cancelled" };
    }
    for (let step = 0; step < RECORDING_CHUNK_TICKS; step += 1) {
      const before = wasm.tick();
      wasm.step();
      const after = wasm.tick();
      // **The fight's own stop condition, read rather than predicted.**
      // `Sim::advance_arena` breaks on `World::outcome()` or on the
      // configuration's `max_ticks`, so a step that moves no tick is the fight
      // having ended -- and it is the only signal that covers both, since a kill
      // can land on any tick and a limit is not the only way to reach one.
      if (after === before) { settled = true; break; }
      ticks = after;
      if (!capture()) { truncated = true; break; }
      if (frames - chunkFirstFrame >= ARENA_STREAM_CHUNK_TICKS) await postChunk();
    }
    if (!settled && !truncated) await hooks.yieldToMessages();
  }
  // The tail, which is every chunk shorter than a whole one. A fight that ends
  // mid-chunk still owes the page the frames it produced.
  await postChunk();

  const decided = outcomeOf(alive, lastHealth);
  return {
    ok: true,
    finished: {
      // A truncated recording has not watched the fight end, so it must not
      // claim an outcome it did not see. The trace's own header makes the same
      // distinction with its `truncated` field, and the studio prints both.
      outcome: truncated ? "recording truncated before the fight ended" : decided.outcome,
      timedOut: truncated ? false : decided.timedOut,
      ticks,
      frameCount: frames,
      recordingTruncated: truncated,
      posesDropped, regionsDropped, articulatedProjectilesDropped: projectilesDropped,
      combatEventsDropped: eventsDropped, embodiedStancesDropped: stancesDropped,
    },
  };
}
