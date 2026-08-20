// A `FightSource` over the chunks the worker streams as it produces them.
//
// **The panels do not know which side of this file they are looking at**, which
// is what `v2-ui-01`'s seam was for: `frameAt(i)` and `frameCount()` are the only
// two questions the arena asks about time, and this answers them by decoding
// packed rows instead of indexing a parsed JSON array. The arena session added a
// third thing they do not know: whether the fight they are drawing has finished.
// `frameCount()` grows while it has not.
//
// **Decoded on demand and not up front.** A 3,600-tick fight is 7,200 pose rows
// and about two thousand contacts; materialising every `Frame` at adopt time is
// several megabytes of short-lived objects for a viewer that will look at a few
// hundred of them. The buffers *are* the recording, and a frame is a view of one
// slice of them.
//
// Measured, in Node on 2026-08-11: constructing this source over a transferred
// 3,600-tick recording and decoding frame 0 is **0.02 to 0.04 ms**, against 0.3
// to 0.4 s for the drive that produced it. Adopting is free because nothing is
// materialised. What is not free and is paid once per worker is the warm-up --
// `init` plus `load_checkpoint`, 4.4 to 17.2 ms. Neither figure
// covers worker startup, the `/web.wasm` fetch and instantiate, the checkpoint
// fetch or the `postMessage`; the page prints its own number so a reader gets
// the browser's rather than this one.
//
// **A chunk's index words are relative to that chunk's own buffers.** This is
// the one arithmetic trap the split introduced and it is worth its own
// paragraph: `INDEX_POSE_START` used to be an offset into a whole-fight section,
// and a chunk carrying one of those into its own short buffer would not throw.
// `TypedArray.prototype.subarray` clamps, so the result is a zero-length view
// whose every read answers `undefined` and a body drawn from `NaN` -- the one
// failure on this path a picture cannot diagnose. `FightChunk` checks every
// extent against the chunk it belongs to, once, at adopt.
//
// Four places this cannot match `TraceFightSource`, all of them a column the
// published rows do not carry, and every one of them visible in the UI rather
// than papered over:
//
//   - **Contact velocity and impulse.** `ContactResolution` carries `velocity_a/b`
//     and an impulse per side; the 32-word event row carries neither, so
//     `closureSpeed()` has no live equivalent and the readout says so. Growing
//     the row would move `COMBAT_EVENT_LAYOUT_VERSION` and
//     `ARTICULATED_STREAM_DIGEST`, which belongs to a session that wants it.
//   - **The group alpha.** Deliberately absent from the row -- it is a solver
//     search result -- and nothing on this page reads it.
//   - **A pose's attack target.** `POSE_INTENT` is the discriminant only, so a
//     live fight can say a body is attacking and not who. The trace carries the
//     `EntityId` because it writes the whole `Intent`.
//   - **A weapon's radius and a shield's thickness.** Neither is in the pose row
//     -- the first because the row publishes endpoints, the second because it is
//     a collision depth a renderer does not draw -- so both come off the header's
//     per-body carried block, which is the configuration the fight was built
//     from. That is the same number by construction and not a second answer:
//     `duel_from` copies the dimensions out of the same bytes.

import {
  ARTICULATED_PROJECTILE_GENERATION, ARTICULATED_PROJECTILE_OWNER_GENERATION,
  ARTICULATED_PROJECTILE_OWNER_INDEX,
  ARTICULATED_PROJECTILE_POSITION_X, ARTICULATED_PROJECTILE_RADIUS,
  ARTICULATED_PROJECTILE_REMAINING_RANGE, ARTICULATED_PROJECTILE_SLOT,
  ARTICULATED_PROJECTILE_VELOCITY_X,
  COMBAT_EVENT_A_GENERATION, COMBAT_EVENT_A_INDEX, COMBAT_EVENT_A_SLOT,
  COMBAT_EVENT_B_GENERATION, COMBAT_EVENT_B_INDEX, COMBAT_EVENT_B_SLOT,
  COMBAT_EVENT_BODY_PART, COMBAT_EVENT_CUT_LO, COMBAT_EVENT_DEFLECTED_LO,
  COMBAT_EVENT_ENERGY_AFTER_LO, COMBAT_EVENT_ENERGY_BEFORE_LO,
  COMBAT_EVENT_ENERGY_DISSIPATED_LO, COMBAT_EVENT_GROUP_ORDINAL, COMBAT_EVENT_KIND,
  COMBAT_EVENT_NORMAL_X, COMBAT_EVENT_POINT_X, COMBAT_EVENT_PRESSURE_LO,
  COMBAT_EVENT_SEVERED, COMBAT_EVENT_THRUST_LO, COMBAT_EVENT_TOI_RAW,
  POSE_BLOOD_FRACTION, POSE_BODY_PART_COUNT, POSE_BODY_VX, POSE_BODY_X,
  POSE_BODY_YAW_RAW, POSE_ENTITY_GENERATION, POSE_ENTITY_INDEX, POSE_EQUIPMENT_MASK,
  POSE_INTEGRITY_FIRST, POSE_INTENT, POSE_LEFT_FATIGUE, POSE_LEFT_HAND_VX,
  POSE_LEFT_HAND_X, POSE_LEFT_HINT, POSE_LEFT_TARGET_X, POSE_LEFT_WEAPON_HILT_X,
  POSE_RIGHT_FATIGUE, POSE_RIGHT_HAND_VX, POSE_RIGHT_HAND_X, POSE_RIGHT_HINT,
  POSE_RIGHT_TARGET_X, POSE_RIGHT_WEAPON_HILT_X, POSE_SEVERED_MASK, POSE_SHIELD_CENTER_X,
  POSE_SHIELD_HALF_HEIGHT, POSE_SHIELD_HALF_WIDTH, POSE_SHIELD_NORMAL_X, POSE_SHOCK,
  POSE_WOUND_FIRST, REGION_LOWER_X, REGION_PRESENT, REGION_RADIUS, REGION_UPPER_X,
} from "../protocol/abi.generated.js";
import type { ArenaChunk, ArenaFinished, ArenaOpened } from "../protocol/messages.js";
import {
  INDEX_EVENT_COUNT, INDEX_EVENT_START, INDEX_POSE_COUNT, INDEX_POSE_START,
  INDEX_PROJECTILE_COUNT, INDEX_PROJECTILE_START,
  INDEX_REGION_COUNT, INDEX_REGION_START, INDEX_STANCE_COUNT, INDEX_STANCE_START,
  INDEX_TICK, ARENA_STREAM_LAYOUT_VERSION, EMBODIED_STANCE_CAPACITY,
  EMBODIED_STANCE_LAYOUT_VERSION,
  EMBODIED_STANCE_STRIDE, RECORDING_INDEX_STRIDE,
} from "../runtime/arena-recorder.js";
import type { EmbodiedStance, FightFrame, FightHeader, FightSource } from "./source.js";
import type {
  Arm, Contact, EntityKey, Pose, Projectile, Region, Segment, ShieldFace, V3,
} from "./trace.js";

/** `Intent`'s discriminants, in `intent_code`'s order. */
const INTENTS = ["hold", "attack", "flee"] as const;

/** `POSE_EQUIPMENT_MASK`: left weapon, right weapon, shield, bits 0 to 2. */
const EQUIPMENT_LEFT_WEAPON = 1;
const EQUIPMENT_RIGHT_WEAPON = 2;
const EQUIPMENT_SHIELD = 4;

/**
 * One `u64` published as a low and a high word.
 *
 * The same double a `JSON.parse` of the trace's decimal produces, and exact on
 * both paths below 2^53 -- which every energy in this ledger is by a wide
 * margin, since the raws are 16.16 products of world-unit velocities.
 */
function u64(words: Uint32Array, at: number): number {
  return words[at]! + words[at + 1]! * 4_294_967_296;
}

/** A signed 16.16 raw, reinterpreted out of its `u32` word. */
function raw(words: Uint32Array, at: number): number {
  return words[at]! | 0;
}

function v3(words: Uint32Array, at: number): V3 {
  return [raw(words, at), raw(words, at + 1), raw(words, at + 2)];
}

function fractions(words: Uint32Array, at: number): number[] {
  const out = new Array<number>(POSE_BODY_PART_COUNT);
  for (let part = 0; part < POSE_BODY_PART_COUNT; part += 1) out[part] = raw(words, at + part);
  return out;
}

/** What the header knows about a body that the pose row does not publish. */
interface Fittings {
  /** Segment radius per limb, from the carried block. Null when that hand holds none. */
  readonly radius: readonly [number | null, number | null];
  /** `ShieldPose::thickness`, deliberately absent from the pose row. */
  readonly thickness: number | null;
}

function fittingsOf(header: FightHeader): readonly Fittings[] {
  return header.bodies.map((body) => {
    const radius: [number | null, number | null] = [null, null];
    let thickness: number | null = null;
    for (const item of body.carried) {
      if (item === null) continue;
      if (item.geometry === "shield") {
        thickness = item.thickness ?? null;
        continue;
      }
      // A `Both` binding fills the **right** weapon slot only, which is the
      // sim's ownership rule for a two-handed item and matches the single
      // right-owned collider the contact phase builds for it.
      if (item.binding === "Left") radius[0] = item.radius ?? null;
      if (item.binding === "Right" || item.binding === "Both") radius[1] = item.radius ?? null;
    }
    return { radius, thickness };
  });
}

/** The strides and counts every chunk of one fight is packed with. */
interface Layout {
  readonly poseStride: number;
  readonly regionStride: number;
  readonly regionsPerBody: number;
  readonly eventStride: number;
  readonly projectileStride: number;
  readonly stanceStride: number;
}

/**
 * One transferred chunk, with every extent checked once, at adopt.
 *
 * **The row decoder lives here and nowhere else.** A whole finished fight is one
 * chunk's worth of the same words, so a second decoder for the finished case
 * would be a second answer to what a pose row means -- and the two would agree
 * right up to the day a column moved.
 */
class FightChunk {
  readonly firstFrame: number;
  readonly frameCount: number;
  readonly #poses: Uint32Array;
  readonly #regions: Uint32Array;
  readonly #events: Uint32Array;
  readonly #projectiles: Uint32Array;
  readonly #stances: Uint32Array;
  readonly #index: Uint32Array;
  readonly #health: Int32Array;
  readonly #layout: Layout;
  readonly #fittings: readonly Fittings[];

  constructor(chunk: ArenaChunk, layout: Layout, fittings: readonly Fittings[]) {
    this.firstFrame = chunk.firstFrame;
    this.frameCount = chunk.frameCount;
    this.#layout = layout;
    this.#fittings = fittings;
    this.#poses = new Uint32Array(chunk.poses);
    this.#regions = new Uint32Array(chunk.regions);
    this.#events = new Uint32Array(chunk.events);
    this.#projectiles = new Uint32Array(chunk.projectiles);
    this.#stances = new Uint32Array(chunk.stances);
    this.#index = new Uint32Array(chunk.index);
    this.#health = new Int32Array(chunk.health);
    if (!Number.isInteger(this.frameCount) || this.frameCount <= 0
      || !Number.isInteger(this.firstFrame) || this.firstFrame < 0) {
      throw new RangeError(`a chunk claims ${this.frameCount} frames from ${this.firstFrame}`);
    }
    // The index is the width check, and it is the one that matters: every other
    // length is read *through* the index, so an index the wrong width would
    // silently read a start word as a count and hand a panel a plausible frame
    // from the wrong tick.
    if (this.#index.length !== this.frameCount * RECORDING_INDEX_STRIDE
      || this.#health.length !== this.frameCount * 2) {
      throw new RangeError("a chunk's index does not describe its own frame count");
    }
    // **And every extent is checked against the buffer it addresses, once,
    // here.** `subarray` clamps rather than throwing, so a start past the end of
    // a buffer is not an exception a reader would see -- it is a zero-length view
    // whose every `!` answers `undefined` and a body drawn from `NaN`
    // coordinates. That is the one failure mode on this path a picture cannot
    // diagnose, which is why it is refused at adopt time rather than discovered
    // at a scrub position somebody happened to drag to. **A chunk whose starts
    // were left whole-fight rather than chunk-relative fails exactly here**,
    // which is what makes the rebase a checked claim rather than an intention.
    const rows = (words: Uint32Array, stride: number, what: string): number => {
      if (!Number.isInteger(stride) || stride <= 0 || words.length % stride !== 0) {
        throw new RangeError(`a chunk's ${what} section is not a whole number of rows`);
      }
      return words.length / stride;
    };
    const poseRows = rows(this.#poses, layout.poseStride, "pose");
    const regionRows = rows(this.#regions, layout.regionStride, "region");
    const eventRows = rows(this.#events, layout.eventStride, "combat-event");
    const projectileRows = rows(this.#projectiles, layout.projectileStride, "projectile");
    const stanceRows = rows(this.#stances, layout.stanceStride, "stance");
    if (!Number.isInteger(layout.regionsPerBody) || layout.regionsPerBody <= 0) {
      throw new RangeError("a fight publishes no regions per body");
    }
    for (let frame = 0; frame < this.frameCount; frame += 1) {
      const at = frame * RECORDING_INDEX_STRIDE;
      const extents: readonly (readonly [number, number, number, string])[] = [
        [this.#index[at + INDEX_POSE_START]!, this.#index[at + INDEX_POSE_COUNT]!, poseRows, "pose"],
        [this.#index[at + INDEX_REGION_START]!, this.#index[at + INDEX_REGION_COUNT]!, regionRows, "region"],
        [this.#index[at + INDEX_PROJECTILE_START]!, this.#index[at + INDEX_PROJECTILE_COUNT]!,
          projectileRows, "projectile"],
        [this.#index[at + INDEX_EVENT_START]!, this.#index[at + INDEX_EVENT_COUNT]!, eventRows, "combat-event"],
        [this.#index[at + INDEX_STANCE_START]!, this.#index[at + INDEX_STANCE_COUNT]!,
          stanceRows, "stance"],
      ];
      for (const [start, count, available, what] of extents) {
        if (start + count > available) {
          throw new RangeError(`frame ${this.firstFrame + frame} addresses ${what} rows ${start} to `
            + `${start + count} of a chunk section holding ${available}`);
        }
      }
      const poseStart = this.#index[at + INDEX_POSE_START]!;
      const poseCount = this.#index[at + INDEX_POSE_COUNT]!;
      const stanceStart = this.#index[at + INDEX_STANCE_START]!;
      const stanceCount = this.#index[at + INDEX_STANCE_COUNT]!;
      const identities = new Set<string>();
      for (let row = 0; row < poseCount; row += 1) {
        const poseAt = (poseStart + row) * layout.poseStride;
        identities.add(`${this.#poses[poseAt + POSE_ENTITY_INDEX]}:${this.#poses[poseAt + POSE_ENTITY_GENERATION]}`);
      }
      for (let row = 0; row < stanceCount; row += 1) {
        const stanceAt = (stanceStart + row) * layout.stanceStride;
        const key = `${this.#stances[stanceAt]}:${this.#stances[stanceAt + 1]}`;
        if (!identities.has(key)) {
          throw new RangeError(`frame ${this.firstFrame + frame} publishes stance ${key} without its pose`);
        }
      }
    }
  }

  /** The frame at `local`, which is `index - firstFrame`. */
  frameAt(local: number): FightFrame {
    const at = local * RECORDING_INDEX_STRIDE;
    const poseStart = this.#index[at + INDEX_POSE_START]!;
    const poseCount = this.#index[at + INDEX_POSE_COUNT]!;
    const regionStart = this.#index[at + INDEX_REGION_START]!;
    const regionCount = this.#index[at + INDEX_REGION_COUNT]!;
    const eventStart = this.#index[at + INDEX_EVENT_START]!;
    const eventCount = this.#index[at + INDEX_EVENT_COUNT]!;
    const projectileStart = this.#index[at + INDEX_PROJECTILE_START]!;
    const projectileCount = this.#index[at + INDEX_PROJECTILE_COUNT]!;
    const stanceStart = this.#index[at + INDEX_STANCE_START]!;
    const stanceCount = this.#index[at + INDEX_STANCE_COUNT]!;
    // Read against the pose count and not assumed, which is the contract
    // `articulated-abi.md` states for the region section: a body the host has no
    // anatomy for is skipped and the rows after it shift, so the comparison is
    // the reader's protection rather than a nicety.
    if (regionCount !== poseCount * this.#layout.regionsPerBody) {
      throw new RangeError(`frame ${this.firstFrame + local} publishes ${regionCount} region rows `
        + `for ${poseCount} bodies`);
    }
    const poses: Pose[] = [];
    for (let row = 0; row < poseCount; row += 1) {
      poses.push(this.#poseAt(poseStart + row, regionStart + row * this.#layout.regionsPerBody));
    }
    const contacts: Contact[] = [];
    for (let row = 0; row < eventCount; row += 1) contacts.push(this.#contactAt(eventStart + row));
    const projectiles: Projectile[] = [];
    for (let row = 0; row < projectileCount; row += 1) {
      projectiles.push(this.#projectileAt(projectileStart + row));
    }
    const byIdentity = new Map<string, EmbodiedStance>();
    for (let row = 0; row < stanceCount; row += 1) {
      const stance = this.#stanceAt(stanceStart + row);
      const key = `${stance.id[0]}:${stance.id[1]}`;
      if (byIdentity.has(key)) throw new RangeError(`frame ${this.firstFrame + local} repeats stance ${key}`);
      byIdentity.set(key, stance);
    }
    const poseKeys = new Set(poses.map((pose) => `${pose.id[0]}:${pose.id[1]}`));
    for (const key of byIdentity.keys()) {
      if (!poseKeys.has(key)) throw new RangeError(`frame ${this.firstFrame + local} publishes stance ${key} without its pose`);
    }
    return {
      t: this.#index[at + INDEX_TICK]!,
      poses,
      projectiles,
      contacts,
      health: [this.#health[local * 2]!, this.#health[local * 2 + 1]!],
      stances: poses.map((pose) => byIdentity.get(`${pose.id[0]}:${pose.id[1]}`) ?? null),
    };
  }

  #stanceAt(row: number): EmbodiedStance {
    const at = row * this.#layout.stanceStride;
    return {
      id: [this.#stances[at]!, this.#stances[at + 1]!],
      hipYaw: this.#stances[at + 2]!, pelvis: raw(this.#stances, at + 3),
      twist: raw(this.#stances, at + 4), stepLeft: this.#stances[at + 5]!,
    };
  }

  #projectileAt(row: number): Projectile {
    const at = row * this.#layout.projectileStride;
    const words = this.#projectiles;
    return {
      id: [words[at + ARTICULATED_PROJECTILE_SLOT]!,
        words[at + ARTICULATED_PROJECTILE_GENERATION]!] as EntityKey,
      owner: [words[at + ARTICULATED_PROJECTILE_OWNER_INDEX]!,
        words[at + ARTICULATED_PROJECTILE_OWNER_GENERATION]!] as EntityKey,
      position: v3(words, at + ARTICULATED_PROJECTILE_POSITION_X),
      velocity: v3(words, at + ARTICULATED_PROJECTILE_VELOCITY_X),
      radius: raw(words, at + ARTICULATED_PROJECTILE_RADIUS),
      remainingRange: raw(words, at + ARTICULATED_PROJECTILE_REMAINING_RANGE),
    };
  }

  #poseAt(row: number, regionRow: number): Pose {
    const stride = this.#layout.poseStride;
    const words = this.#poses.subarray(row * stride, (row + 1) * stride);
    const body = words[POSE_ENTITY_INDEX]!;
    const fittings = this.#fittings[body];
    const mask = words[POSE_EQUIPMENT_MASK]!;
    const arm = (hand: number, velocity: number, target: number, fatigue: number): Arm => ({
      hand: v3(words, hand), vel: v3(words, velocity), target: v3(words, target),
      fatigue: raw(words, fatigue),
    });
    const weapon = (present: boolean, hilt: number, limb: 0 | 1): Segment | null => {
      if (!present) return null;
      return {
        hilt: v3(words, hilt), tip: v3(words, hilt + 3),
        // Zero rather than a guess when the header has no row for this hand.
        // The panels draw a segment from its two endpoints and use the radius
        // for thickness alone, so a missing fitting draws a hairline rather
        // than a blade of somebody else's width.
        radius: fittings?.radius[limb] ?? 0,
      };
    };
    const shield: ShieldFace | null = (mask & EQUIPMENT_SHIELD) === 0 ? null : {
      centre: v3(words, POSE_SHIELD_CENTER_X),
      normal: v3(words, POSE_SHIELD_NORMAL_X),
      halfWidth: raw(words, POSE_SHIELD_HALF_WIDTH),
      halfHeight: raw(words, POSE_SHIELD_HALF_HEIGHT),
      thickness: fittings?.thickness ?? 0,
    };
    const regions: Region[] = [];
    for (let part = 0; part < this.#layout.regionsPerBody; part += 1) {
      const at = (regionRow + part) * this.#layout.regionStride;
      regions.push({
        lower: v3(this.#regions, at + REGION_LOWER_X),
        upper: v3(this.#regions, at + REGION_UPPER_X),
        radius: raw(this.#regions, at + REGION_RADIUS),
        present: this.#regions[at + REGION_PRESENT] !== 0,
      });
    }
    return {
      id: [body, words[POSE_ENTITY_GENERATION]!] as EntityKey,
      body: v3(words, POSE_BODY_X),
      // The yaw is a binary angle widened into its word, so it is read unsigned
      // rather than through `raw`: 65,536 to the turn, and no sign to extend.
      yaw: words[POSE_BODY_YAW_RAW]!,
      vel: v3(words, POSE_BODY_VX),
      arms: [
        arm(POSE_LEFT_HAND_X, POSE_LEFT_HAND_VX, POSE_LEFT_TARGET_X, POSE_LEFT_FATIGUE),
        arm(POSE_RIGHT_HAND_X, POSE_RIGHT_HAND_VX, POSE_RIGHT_TARGET_X, POSE_RIGHT_FATIGUE),
      ],
      weapons: [
        weapon((mask & EQUIPMENT_LEFT_WEAPON) !== 0, POSE_LEFT_WEAPON_HILT_X, 0),
        weapon((mask & EQUIPMENT_RIGHT_WEAPON) !== 0, POSE_RIGHT_WEAPON_HILT_X, 1),
      ],
      shield,
      regions,
      integrity: fractions(words, POSE_INTEGRITY_FIRST),
      wound: fractions(words, POSE_WOUND_FIRST),
      blood: raw(words, POSE_BLOOD_FRACTION),
      shock: raw(words, POSE_SHOCK),
      severed: words[POSE_SEVERED_MASK]!,
      equipmentMask: mask,
      intent: INTENTS[words[POSE_INTENT]!] ?? "hold",
      // Published as a discriminant and not as an `Intent`, so a live fight can
      // say a body is attacking and not who it picked.
      target: null,
      hints: [words[POSE_LEFT_HINT]!, words[POSE_RIGHT_HINT]!],
    };
  }

  #contactAt(row: number): Contact {
    const at = row * this.#layout.eventStride;
    const words = this.#events;
    return {
      a: [words[at + COMBAT_EVENT_A_INDEX]!, words[at + COMBAT_EVENT_A_GENERATION]!],
      aSlot: words[at + COMBAT_EVENT_A_SLOT]!,
      b: [words[at + COMBAT_EVENT_B_INDEX]!, words[at + COMBAT_EVENT_B_GENERATION]!],
      bSlot: words[at + COMBAT_EVENT_B_SLOT]!,
      kind: words[at + COMBAT_EVENT_KIND]!,
      // The absent-region sentinel crosses as a whole word rather than as the
      // sim's `0xff`, so a reader that lost track of the column width cannot
      // mistake it for a region index. `header.noRegion` carries the same word.
      region: words[at + COMBAT_EVENT_BODY_PART]!,
      point: v3(words, at + COMBAT_EVENT_POINT_X),
      normal: v3(words, at + COMBAT_EVENT_NORMAL_X),
      velocityA: null, velocityB: null, impulseA: null, impulseB: null,
      toi: words[at + COMBAT_EVENT_TOI_RAW]!,
      group: words[at + COMBAT_EVENT_GROUP_ORDINAL]!,
      alpha: null,
      groupBefore: u64(words, at + COMBAT_EVENT_ENERGY_BEFORE_LO),
      groupAfter: u64(words, at + COMBAT_EVENT_ENERGY_AFTER_LO),
      groupDissipated: u64(words, at + COMBAT_EVENT_ENERGY_DISSIPATED_LO),
      cut: u64(words, at + COMBAT_EVENT_CUT_LO),
      thrust: u64(words, at + COMBAT_EVENT_THRUST_LO),
      pressure: u64(words, at + COMBAT_EVENT_PRESSURE_LO),
      deflected: u64(words, at + COMBAT_EVENT_DEFLECTED_LO),
      severed: words[at + COMBAT_EVENT_SEVERED] !== 0,
    };
  }
}

/** A header whose end-of-fight fields are filled in when the fight supplies them. */
type GrowingHeader = { -readonly [K in keyof FightHeader]: FightHeader[K] };

/**
 * A `FightSource` over a fight that may still be being produced.
 *
 * **A finished recording is this with one chunk in it**, which is why there is no
 * second class for the finished case: the difference between a fight in progress
 * and a fight that is over is a `finish` call, not a different reader. That is
 * what `LiveFightSource` -- which this replaces -- could not be, because its
 * constructor took a message that could only be built once the last tick existed.
 */
export class StreamingFightSource implements FightSource {
  readonly #header: GrowingHeader;
  readonly #layout: Layout;
  readonly #fittings: readonly Fittings[];
  readonly #chunks: FightChunk[] = [];
  #frames = 0;
  #finished = false;

  constructor(opened: ArenaOpened) {
    // **The exemption is checked and not merely declared.** The arena publishes
    // unfiltered ground truth -- both fighters are the subject, there is no fog,
    // and `SnapshotFilterState` never sees these words -- which is correct here
    // and a leak the moment this path is copied into the game path. A field that
    // nothing reads would be a comment with a type on it, so the consumer of the
    // stream is where the refusal goes: a producer that does not *say* it is a
    // spectator stream does not get rendered as one.
    if (opened.spectator !== true) {
      throw new RangeError("a stream that does not declare itself a spectator stream is not "
        + "renderable here: these pose rows crossed no visibility filter");
    }
    if (opened.arenaStreamLayoutVersion !== ARENA_STREAM_LAYOUT_VERSION
      || opened.recordingIndexStride !== RECORDING_INDEX_STRIDE) {
      throw new RangeError(`arena stream layout ${opened.arenaStreamLayoutVersion} with index stride `
        + `${opened.recordingIndexStride} is not layout ${ARENA_STREAM_LAYOUT_VERSION} `
        + `with stride ${RECORDING_INDEX_STRIDE}`);
    }
    if (opened.embodiedStanceLayoutVersion !== EMBODIED_STANCE_LAYOUT_VERSION
      || opened.embodiedStanceStride !== EMBODIED_STANCE_STRIDE
      || opened.embodiedStanceCapacity !== EMBODIED_STANCE_CAPACITY) {
      throw new RangeError(`embodied stance layout ${opened.embodiedStanceLayoutVersion} `
        + `with stride ${opened.embodiedStanceStride} is not supported`);
    }
    this.#header = {
      one: opened.one,
      scenario: opened.scenario,
      mirrored: opened.mirrored,
      fingerprint: opened.fingerprint,
      seed: opened.seed,
      heroes: opened.heroes,
      monsters: opened.monsters,
      checkpoint: opened.checkpoint,
      // Null and not a default string: nobody knows yet, and this is the field
      // that says so rather than the field that guesses.
      outcome: null,
      timedOut: false,
      ticks: 0,
      maxTicks: opened.maxTicks,
      arena: opened.arena,
      frameCount: 0,
      truncated: false,
      impactThreshold: opened.impactThreshold,
      contactEnergyFloor: opened.contactEnergyFloor,
      regionNames: opened.regionNames,
      hintNames: opened.hintNames,
      contactKinds: opened.contactKinds,
      bodySlot: opened.bodySlot,
      noRegion: opened.noRegion,
      bodies: opened.bodies,
    };
    this.#layout = {
      poseStride: opened.poseStride,
      regionStride: opened.regionStride,
      regionsPerBody: opened.regionsPerBody,
      eventStride: opened.combatEventStride,
      projectileStride: opened.articulatedProjectileStride,
      stanceStride: opened.embodiedStanceStride,
    };
    this.#fittings = fittingsOf(this.#header);
  }

  get header(): FightHeader {
    return this.#header;
  }

  /** Whether the producer has said the fight stopped. */
  get finished(): boolean {
    return this.#finished;
  }

  /**
   * Take one chunk, checking it against the fight it claims to continue.
   *
   * **Contiguity is checked and not assumed.** A chunk that does not start where
   * the last one ended is either a message that arrived out of order or a
   * producer that lost count, and both draw a fight with a hole in it that
   * nothing else would notice: `frameAt` would answer the wrong tick's rows, and
   * the tick word inside them would be the only evidence.
   */
  adopt(chunk: ArenaChunk): void {
    if (this.#finished) throw new RangeError("a finished fight cannot take another chunk");
    if (chunk.firstFrame !== this.#frames) {
      throw new RangeError(`a chunk starting at frame ${chunk.firstFrame} does not continue a fight `
        + `holding ${this.#frames}`);
    }
    const adopted = new FightChunk(chunk, this.#layout, this.#fittings);
    this.#chunks.push(adopted);
    this.#frames += adopted.frameCount;
    this.#header.frameCount = this.#frames;
    // What the fight has got to, read off the last frame's own tick word rather
    // than derived from the frame count: the two coincide for a drive that keeps
    // every tick, and "happens to equal" is exactly the arithmetic the index
    // exists to stop a reader doing.
    this.#header.ticks = adopted.frameAt(adopted.frameCount - 1).t;
  }

  /** The producer stopped. Everything that could not be known until now. */
  finish(tail: ArenaFinished): void {
    if (tail.frameCount !== this.#frames) {
      throw new RangeError(`a fight that delivered ${this.#frames} frames finished claiming `
        + `${tail.frameCount}`);
    }
    this.#header.outcome = tail.outcome;
    this.#header.timedOut = tail.timedOut;
    this.#header.ticks = tail.ticks;
    this.#header.truncated = tail.recordingTruncated;
    this.#finished = true;
  }

  frameCount(): number {
    return this.#frames;
  }

  frameAt(index: number): FightFrame {
    if (!Number.isInteger(index) || index < 0 || index >= this.#frames) {
      throw new Error(`recorded frame ${index} is out of range`);
    }
    // Binary search over the chunks rather than a scan. A 3,600-tick fight is
    // 121 chunks at `ARENA_STREAM_CHUNK_TICKS`, and `buildSeries` alone calls
    // `frameAt` four times a frame.
    let low = 0;
    let high = this.#chunks.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.#chunks[middle]!.firstFrame <= index) low = middle;
      else high = middle - 1;
    }
    const chunk = this.#chunks[low]!;
    return chunk.frameAt(index - chunk.firstFrame);
  }
}
