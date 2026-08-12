// The 120-byte arena configuration, and the shipped numbers a picker edits.
//
// **This file is a mirror, and the thing it mirrors is a document rather than a
// header.** The layout is
// [`articulated-abi.md`](../../../docs/reference/articulated-abi.md#the-120-byte-configuration-buffer);
// the fixture rows are
// [`combat-specs.md`](../../../docs/reference/combat-specs.md#fixture-definitions),
// which is `crates/sim/src/combat/spec.rs` mirrored. Neither is generated, so
// both are copied by hand here -- the same arrangement `tools/wasm_check.js`
// has with the behavioural contact corpus, and for the same reason: a table
// derived from the thing it configures agrees with a drifted thing by
// construction.
//
// **What catches a drift is a comparison, not a compile error, and there are two
// of them.** These bytes build `configured-duel-v1`, and `DuelConfigV1::shipped()`'s
// own doc comment says that arrangement reproduces `articulated-duel-v1` row for
// row and id for id, differing in the scenario *name* alone. So the fight this
// file describes and the fight `lab trace` records are the same fixed-point
// simulation, and `a_live_fight_matches_the_traced_fight` compares them field for
// field.
//
// The **header** is the net that catches a wrong number here, and it catches it
// at once: every scalar below reaches both the 120 bytes and the recording's own
// per-body `carried` block through `carriedOf`, and that test compares the block
// against the trace's before it reads a single frame. This paragraph used to say
// instead that "one raw unit wrong in a mass here and the two fights diverge
// inside a hundred ticks", **and that was measured on 2026-08-11 and is wrong for
// the example it names.** Driving the shipped arrangement twice against the
// release wasm, `composed` on both sides at seed 3, with one scalar bumped by a
// single raw unit:
//
// ```text
// sword mass    +1   first differing pose word at frame  432, body position at 2402
// sword balance +1   first differing pose word at frame  483, body position at  483
// sword length  +1   first differing pose word at frame    0, body position at  423
// sword radius  +1   first differing pose word at frame  422, body position at  423
// ```
//
// A *dimension* is geometry the first publication already carries, so it moves on
// frame 0; a mass is a term in a solve nothing has run yet, so it takes seven
// seconds of fight to show and forty to move a body. The whole fight is the
// second net and the one worth having: it is what catches a wrong **rounding**
// rule, which the header comparison would agree with by construction if the
// products were written out instead of the ratios.
//
// Every dimension is `Fx::from_ratio`, which is `(n << 16) / d` truncated toward
// zero -- so the ratios are written as ratios and reduced here exactly as
// `crates/fx` reduces them. Writing the products instead would be a second
// rounding rule nobody could check against the document.

/** `Fx::from_ratio`, character for character: truncation toward zero. */
export function fx(numerator: number, denominator: number): number {
  return Math.trunc((numerator * 65536) / denominator);
}

/** Raw units in one world unit. Named rather than spelled 65536 in arithmetic. */
export const ONE_RAW = 1 << 16;

export const ARENA_CONFIG_BYTES = 120;
export const ARENA_CONFIG_LAYOUT_VERSION = 1;
/** `ARENA_FIGHTERS`. The buffer refuses any other count, and so does this file. */
export const ARENA_FIGHTERS = 2;
const FIGHTER_BLOCK_BYTES = 56;
const HAND_BLOCK_BYTES = 22;

/**
 * The tick limit every live fight is built with.
 *
 * `DuelConfigV1::shipped()`'s `60 * 60`, and not a number this file chose. It
 * has to be that one: it reaches `Scenario::fingerprint`, so a live fight at any
 * other limit is a different configuration from the one `lab trace` records and
 * the differential oracle would be comparing two fights.
 */
export const ARENA_MAX_TICKS = 60 * 60;

/**
 * `ArticulatedPolicyKind`, by code.
 *
 * The codes are the ABI's and the names are the tokens `lab trace` writes into a
 * trace header, which is what lets a recorded fight and a live one be described
 * by the same sentence. Index is the code, so the array position is load-bearing.
 */
export const ARENA_POLICY_NAMES = [
  "neutral", "composed", "windmill", "attack-moves", "learned",
] as const;
export type ArenaPolicyName = (typeof ARENA_POLICY_NAMES)[number];

/** The one code that needs a checkpoint installed before `arena_start` takes it. */
export const LEARNED_POLICY_CODE = 4;

export function policyCodeOf(name: string): number | null {
  const code = ARENA_POLICY_NAMES.indexOf(name as ArenaPolicyName);
  return code < 0 ? null : code;
}

/** `AnatomyChoice`: the two shipped rows, and the code the buffer carries. */
export const ANATOMY_CODES = { fighter: 0, brute: 1 } as const;
export type AnatomyName = keyof typeof ANATOMY_CODES;

/**
 * `BodyAnatomySpec`'s five published scalars, per shipped row.
 *
 * **Carried here because no export answers them and the panels need two.**
 * `scene.ts` draws a hand at `anatomy.handRadius` and `arena.ts` divides the arm
 * capsule's length by `anatomy.armLength` to get the extension ratio; both come
 * off `BodyInfo.anatomy`, which `lab trace` writes out of the spec table. The
 * host holds the table privately (`Sim::anatomy`) and publishes none of it, so
 * a live fight either carries these five numbers or loses two readouts.
 *
 * The other twenty-odd fields of the row -- the regional capsules, the integrity
 * maxima, the blood maximum, the surface and the armour -- are deliberately
 * absent: nothing on this side reads them, `AnatomyChoice` does not let a picker
 * move them, and copying a calibration nobody displays is a mirror with no
 * consumer to notice it drifting.
 */
export const ANATOMIES = [
  {
    name: "fighter", kind: "Fighter",
    standingHeight: fx(9, 5), shoulderHeight: fx(7, 5), shoulderHalfWidth: fx(1, 4),
    armLength: fx(3, 4), handRadius: fx(1, 10),
  },
  {
    name: "brute", kind: "Brute",
    standingHeight: fx(2, 1), shoulderHeight: fx(3, 2), shoulderHalfWidth: fx(3, 10),
    armLength: fx(17, 20), handRadius: fx(3, 25),
  },
] as const;

/**
 * The three shipped equipment rows, as a hand item.
 *
 * `HandItemV1::shipped` in TypeScript: the action, the mass, the balance and the
 * geometry, and nothing else. The surface is deliberately absent on both sides
 * of the wall -- `restitution`, `friction`, `edge_factor` and `point_factor` are
 * a measured material rather than a dimension, the buffer has no room for them,
 * and `duel_from` copies them off the shipped row for the item's action. A
 * picker that could type in an edge factor could make a club cut.
 *
 * `code` is `ActionKind::code`. `a`, `b` and `c` are the buffer's three
 * dimension words, which mean length/radius/zero for a segment and
 * half-width/half-height/thickness for a shield -- the *kind* is derived from
 * the action on the far side, which is why the block is 22 bytes and not 23.
 */
export interface ConfiguredHand {
  /** `ActionKind::code`, or `EMPTY_HAND_CODE`. */
  readonly code: number;
  readonly mass: number;
  readonly balance: number;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

export const HAND_NAMES = ["empty", "sword", "shield", "club"] as const;
export type HandName = (typeof HAND_NAMES)[number];

/** `ActionKind::code` for an empty hand. Not a code: the absence of one. */
export const EMPTY_HAND_CODE = 255;
export const SHIELD_ACTION_CODE = 4;

/** The three actions `duel_from` has a row to copy, by `ActionKind::code`. */
export const ACTION_NAMES: Readonly<Record<number, string>> = {
  2: "Sword", 3: "Club", 4: "Shield",
};

/**
 * Whether an action is a `Role::Guard`, which decides carrying-slot order.
 *
 * True of `Shield` and of nothing else `duel_from` accepts. Written as a code
 * comparison rather than a role table because three actions have equipment rows
 * and the other five are refused with `UnknownAction`: a role table here would
 * be five rows of vocabulary nothing can reach.
 */
export function isGuardAction(code: number): boolean {
  return code === SHIELD_ACTION_CODE;
}

export const HAND_ITEMS: Readonly<Record<HandName, ConfiguredHand>> = {
  empty: { code: EMPTY_HAND_CODE, mass: 0, balance: 0, a: 0, b: 0, c: 0 },
  sword: { code: 2, mass: fx(31, 25), balance: fx(11, 20), a: fx(19, 20), b: fx(1, 25), c: 0 },
  shield: { code: 4, mass: fx(9, 10), balance: fx(7, 20), a: fx(1, 4), b: fx(1, 4), c: fx(1, 20) },
  club: { code: 3, mass: fx(223, 100), balance: fx(61, 100), a: fx(29, 20), b: fx(3, 50), c: 0 },
};

/**
 * Where each side stands, from `DuelConfigV1::shipped()`.
 *
 * `Vec2::from_ints(7, 6)` and `(17, 10)`. Not a placement this file invented:
 * the spawn reaches the fingerprint like every other field, so moving it would
 * make the live fight a different fight from the recorded one.
 */
export const SHIPPED_SPAWNS = [
  { x: 7 * ONE_RAW, y: 6 * ONE_RAW },
  { x: 17 * ONE_RAW, y: 10 * ONE_RAW },
] as const;

export interface ArenaFighterConfig {
  /** An `ANATOMY_CODES` value, which indexes `ANATOMIES`. */
  readonly anatomy: number;
  /** Hand 0 is `LimbSlot::LeftArm`, hand 1 is `RightArm`. The index sets the binding. */
  readonly hands: readonly [ConfiguredHand, ConfiguredHand];
  readonly policy: number;
  readonly spawn: { readonly x: number; readonly y: number };
}

export interface ArenaConfig {
  readonly fighters: readonly [ArenaFighterConfig, ArenaFighterConfig];
  readonly maxTicks: number;
  readonly seed: number;
}

function writeHand(view: DataView, at: number, hand: ConfiguredHand): void {
  view.setUint8(at, hand.code);
  if (hand.code === EMPTY_HAND_CODE) {
    // Every word of an empty hand must be zero. "Noncanonical ignored payloads
    // are rejected" is the submitted command's rule applied to this buffer, so a
    // leftover dimension is a refusal and not a value nobody reads -- which is
    // why the five words are skipped rather than written from the item.
    return;
  }
  view.setInt32(at + 2, hand.mass, true);
  view.setInt32(at + 6, hand.balance, true);
  view.setInt32(at + 10, hand.a, true);
  view.setInt32(at + 14, hand.b, true);
  view.setInt32(at + 18, hand.c, true);
}

function readHand(view: DataView, at: number): ConfiguredHand {
  const code = view.getUint8(at);
  if (code === EMPTY_HAND_CODE) return HAND_ITEMS.empty;
  return {
    code,
    mass: view.getInt32(at + 2, true),
    balance: view.getInt32(at + 6, true),
    a: view.getInt32(at + 10, true),
    b: view.getInt32(at + 14, true),
    c: view.getInt32(at + 18, true),
  };
}

/**
 * The 120 bytes, little-endian, ready to be written over `arena_config_ptr()`.
 *
 * Returns a fresh array every call. The buffer on the far side is a fixed
 * `[u8; 120]` that never moves, and the handshake is write-then-drop-the-view:
 * a view held across a call that grew linear memory is a detached view, so the
 * bytes are assembled here and copied there in one statement.
 */
export function encodeArenaConfig(config: ArenaConfig): Uint8Array {
  const bytes = new Uint8Array(ARENA_CONFIG_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, ARENA_CONFIG_LAYOUT_VERSION, true);
  view.setUint8(2, ARENA_FIGHTERS);
  // Byte 3 is the reserved zero, and every reserved byte below stays zero
  // because the array arrived zeroed. Written nowhere rather than written as a
  // literal zero: a `setUint8(3, 0)` reads as though it could be something else.
  view.setUint32(4, config.maxTicks, true);
  config.fighters.forEach((fighter, index) => {
    const base = 8 + index * FIGHTER_BLOCK_BYTES;
    view.setUint8(base, fighter.anatomy);
    view.setUint8(base + 1, fighter.policy);
    view.setInt32(base + 4, fighter.spawn.x, true);
    view.setInt32(base + 8, fighter.spawn.y, true);
    writeHand(view, base + 12, fighter.hands[0]);
    writeHand(view, base + 12 + HAND_BLOCK_BYTES, fighter.hands[1]);
  });
  return bytes;
}

/**
 * The same 120 bytes, read back.
 *
 * **The worker decodes rather than being told**, so the header it writes into a
 * recording describes the bytes wasm was actually handed. A structured copy
 * travelling beside the buffer would be a second description of the same fight,
 * and the two would part company the first time a picker moved a dimension
 * without the copy following.
 *
 * Answers `null` for a length or a layout field this build does not know. Every
 * other rule -- the reserved bytes, the anatomy, the policy, the item codes, the
 * cross-field loadout rules -- is deliberately *not* re-judged here: the module
 * is the one consumer that judges the whole of it and answers a named refusal,
 * and a second opinion on this side would be a second thing to disagree with.
 */
export function decodeArenaConfig(bytes: Uint8Array, seed: number): ArenaConfig | null {
  if (bytes.length !== ARENA_CONFIG_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== ARENA_CONFIG_LAYOUT_VERSION) return null;
  if (view.getUint8(2) !== ARENA_FIGHTERS) return null;
  const fighter = (index: number): ArenaFighterConfig => {
    const base = 8 + index * FIGHTER_BLOCK_BYTES;
    return {
      anatomy: view.getUint8(base),
      policy: view.getUint8(base + 1),
      spawn: { x: view.getInt32(base + 4, true), y: view.getInt32(base + 8, true) },
      hands: [readHand(view, base + 12), readHand(view, base + 12 + HAND_BLOCK_BYTES)],
    };
  };
  return {
    fighters: [fighter(0), fighter(1)],
    maxTicks: view.getUint32(4, true),
    seed,
  };
}

/** One carrying slot: the hand item and the `GripBinding` its hand index sets. */
export interface CarriedSlot {
  readonly hand: ConfiguredHand;
  readonly binding: "Left" | "Right";
}

/**
 * What a fighter is carrying, in carrying-slot order.
 *
 * **Slot order is not hand order**, and that is the order `lab trace` writes and
 * therefore the order the two sources have to agree in. `carrying_order` gives
 * slot zero to anything that is not a guard -- slot zero is `Loadout::primary`,
 * what a fighter walks in holding -- and otherwise the left hand first. A
 * sword-and-board fighter therefore carries `[sword, shield]` and not
 * `[shield, sword]`, which is the shipped fixture's own arrangement.
 */
export function carriedOf(fighter: ArenaFighterConfig): readonly (CarriedSlot | null)[] {
  const held: readonly (CarriedSlot | null)[] = [
    fighter.hands[0].code === EMPTY_HAND_CODE ? null : { hand: fighter.hands[0], binding: "Left" },
    fighter.hands[1].code === EMPTY_HAND_CODE ? null : { hand: fighter.hands[1], binding: "Right" },
  ];
  const [left, right] = held;
  const ordered: readonly CarriedSlot[] =
    left != null && right != null
      ? (isGuardAction(left.hand.code) && !isGuardAction(right.hand.code) ? [right, left] : [left, right])
      : left != null ? [left] : right != null ? [right] : [];
  return [ordered[0] ?? null, ordered[1] ?? null];
}

/**
 * Every `arena_start` refusal, by reason byte.
 *
 * The complete table from
 * [`articulated-abi.md`](../../../docs/reference/articulated-abi.md#refusing-by-name),
 * written out because that section's whole argument is that one opaque zero
 * would make a studio say "invalid" for a typo, for an impossibility and for a
 * session that has not landed yet. Twelve are reachable from these controls and
 * the rest are not; they keep distinct sentences anyway, on that section's own
 * argument about the day one of them does happen.
 */
export const ARENA_REFUSALS: Readonly<Record<number, string>> = {
  0: "no refusal",
  1: "the module does not know this configuration layout",
  2: "the configuration does not carry exactly two fighters",
  3: "a reserved byte or an empty hand's dimension word was not zero",
  4: "unknown anatomy code",
  5: "unknown item code",
  6: "unknown policy code",
  7: "that policy is not built into this module",
  8: "the world refused the construction -- a spawn is probably outside the arena",
  9: "the world refused its contact reservation",
  10: "the scenario name is too long",
  11: "the spec table is missing",
  12: "a spec table was supplied where none belongs",
  13: "a unit is present twice or not at all",
  14: "too many anatomies",
  15: "too many equipment rows",
  16: "the spec ids are not strictly ascending",
  17: "unknown spec schema",
  18: "a dimension is negative or over its maximum",
  19: "a fraction is outside zero to one",
  20: "a maximum is not positive, or is over sixty-four",
  21: "an equipment reference names no row",
  22: "the loadout and the articulated row disagree about a slot",
  23: "the two grips conflict",
  24: "a fighter carries nothing at all",
  25: "that action has no equipment row to copy",
  26: "no checkpoint is installed, so the learned policy has no weights",
};

/** `ARENA_NO_CHECKPOINT`, the one refusal a picker offering `learned` can reach. */
export const ARENA_NO_CHECKPOINT = 26;
/** `ARENA_POLICY_UNAVAILABLE`, unreachable since v2-ui-08 and decoded anyway. */
export const ARENA_POLICY_UNAVAILABLE = 7;
/** `ARENA_WHOLE_CONFIG`: the refusal is about the configuration, not a slot. */
const ARENA_WHOLE_CONFIG = 255;

export interface ArenaRefusal {
  readonly reason: number;
  readonly sentence: string;
  /** Which fighter the refusal is about, or null for the whole configuration. */
  readonly fighter: number | null;
  /** Which hand, or null -- including when byte 24..31 is carrying a policy code. */
  readonly hand: number | null;
  /** The policy code, for the two reasons that put one in byte 24..31. */
  readonly policy: number | null;
}

/**
 * `arena_start`'s packed word, decoded.
 *
 * **Bits 24..31 are read against the reason and never against the byte**, which
 * is the instruction `articulated-abi.md` gives in as many words. `4` is a
 * perfectly good hand index and a perfectly good policy code, and the two
 * refusals that put a *code* there are `7` (policy unavailable, now unreachable)
 * and `26` (no checkpoint installed, which is the one `learned` gets today). A
 * client decoding by the older table -- which named only `7` -- reads `255` where
 * a `4` belongs, and then reports a hand that does not exist.
 */
export function decodeArenaRefusal(packed: number): ArenaRefusal {
  const word = packed >>> 0;
  const reason = (word >>> 8) & 0xff;
  const fighterByte = (word >>> 16) & 0xff;
  const lastByte = (word >>> 24) & 0xff;
  const aboutAPolicy = reason === ARENA_POLICY_UNAVAILABLE || reason === ARENA_NO_CHECKPOINT;
  return {
    reason,
    sentence: ARENA_REFUSALS[reason] ?? `refusal ${reason}, which this build does not name`,
    fighter: fighterByte === ARENA_WHOLE_CONFIG ? null : fighterByte,
    hand: aboutAPolicy || lastByte === ARENA_WHOLE_CONFIG ? null : lastByte,
    policy: aboutAPolicy && lastByte !== ARENA_WHOLE_CONFIG ? lastByte : null,
  };
}

/** Whether `arena_start`'s packed word says a fight was installed. */
export function arenaStarted(packed: number): boolean {
  return ((packed >>> 0) & 0xff) === 1;
}

/** One sentence a reader can act on, from the packed word alone. */
export function describeArenaRefusal(packed: number): string {
  const refusal = decodeArenaRefusal(packed);
  const where = refusal.fighter === null
    ? ""
    : ` (fighter ${refusal.fighter}${refusal.hand === null ? "" : `, hand ${refusal.hand}`}` +
      `${refusal.policy === null ? "" : `, policy code ${refusal.policy}`})`;
  return `arena_start refused: ${refusal.sentence}${where}`;
}

/** `load_checkpoint`'s packed word: installed, the reason, and its detail. */
export const CHECKPOINT_REFUSALS: Readonly<Record<number, string>> = {
  0: "no refusal",
  1: "the file is longer than the staging buffer",
  2: "the file is truncated",
  3: "the file does not carry the checkpoint magic",
  4: "unknown checkpoint framing version",
  5: "the file was trained against a different feature layout",
  6: "the file was trained against a different action layout",
  7: "the file's model shape is not this build's",
  8: "the file's weight count disagrees with its shape",
  9: "the file's own digest does not match its bytes",
  10: "a weight is not finite",
  11: "a training record is not finite",
  12: "the file carries trailing bytes",
};

export function describeCheckpointRefusal(packed: number): string {
  const word = packed >>> 0;
  const reason = (word >>> 8) & 0xff;
  const detail = word >>> 16;
  const sentence = CHECKPOINT_REFUSALS[reason] ?? `refusal ${reason}, which this build does not name`;
  // `0xffff` is "no detail", because zero is a perfectly good weight index and a
  // perfectly good framing version.
  return `the checkpoint was refused: ${sentence}${detail === 0xffff ? "" : ` (detail ${detail})`}`;
}

export function checkpointInstalled(packed: number): boolean {
  return ((packed >>> 0) & 0xff) === 1;
}
