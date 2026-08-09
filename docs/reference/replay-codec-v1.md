# Replay codec version 1

**Purpose:** Define the exact persisted replay envelope accepted by v2-10 and later command-schema extensions.
**Status:** current
**Canonical source:** [`crates/sim/src/codec.rs`](../../crates/sim/src/codec.rs) and this byte grammar.
**Update when:** A replay envelope byte, bound, validation rule, or persisted command schema changes.

<!-- DOC_CONTRACT: replay-codec-v1 -->
## Integer and size rules

All integers are little-endian and tightly packed; there is no Rust padding. `i32`
stores the two's-complement raw value, including raw 16.16 `Fx`. Counts precede
their records. Checked `usize` addition and multiplication must prove every extent
before allocation or slicing.

The decoder rejects an input longer than `MAX_REPLAY_ENVELOPE_BYTES` before reading
its header. These are codec limits, not simulation population promises:

| Constant | Value |
|---|---:|
| `MAX_REPLAY_ENVELOPE_BYTES` | 16,777,216 |
| `MAX_SCENARIO_RECORD_BYTES` | 1,048,576 |
| `MAX_SCENARIO_NAME_BYTES` | 1,024 |
| `MAX_DUNGEON_TILES` | 65,536 |
| `MAX_SCENARIO_UNITS` | 4,096 |
| `MAX_SCENARIO_TORCHES` | 8,192 |
| `MAX_COMMAND_RECORDS` | 262,144 |
| `MAX_ORDER_RECORDS` | 65,536 |
| `MAX_OBJECTIVE_RECORDS` | 65,536 |

An encoder applies the same limits. Empty names, zero dungeon dimensions, a zero
tick limit, and an empty unit roster are representable because current Rust types
represent them. Their gameplay usefulness is not a codec concern.

The public error vocabulary is:

```rust
pub enum ReplayLimit {
    EnvelopeBytes,
    ScenarioRecordBytes,
    ScenarioNameBytes,
    DungeonTiles,
    ScenarioUnits,
    ScenarioTorches,
    CommandRecords,
    OrderRecords,
    ObjectiveRecords,
}

pub enum ReplayStream { Commands, Orders, Objectives }

pub enum ReplayField {
    Seed,
    TickLimit,
    ScenarioFingerprint,
    CombatModel,
    ScenarioName,
    DungeonDimensions,
    DungeonTileCount,
    DungeonTile,
    PortalPresence,
    PortalPosition,
    UnitBody,
    UnitFaction,
    UnitSpawn,
    PrimaryAction,
    SecondaryPresence,
    SecondaryAction,
    ActionRole,
    TorchPosition,
    TorchFace,
    CommandSubject,
    CommandIntent,
    CommandIntentTarget,
    CommandStrike,
    OrderFaction,
    OrderKind,
    OrderPayload,
    ObjectiveFaction,
    ObjectiveKind,
}

pub enum ReplayValidationError {
    EnvelopeReplayMismatch(ReplayField),
    LimitExceeded(ReplayLimit),
    InvalidField(ReplayField),
    NonCanonicalField(ReplayField),
    NonMonotonic { stream: ReplayStream, at: u32 },
    RecordAfterTickLimit { stream: ReplayStream, tick: u32 },
    CommandModelMismatch,
    ScenarioFingerprintMismatch { stored: u64, computed: u64 },
}

pub enum ReplayDecodeError {
    TooShort,
    BadMagic,
    UnknownCodecVersion(u16),
    UnknownCommandSchema(u16),
    UnknownHashDomain(u8),
    UnknownHashSchema { domain: HashDomain, schema: u16 },
    ReservedHeaderBits,
    PayloadLength,
    LimitExceeded(ReplayLimit),
    InvalidUtf8,
    UnknownDiscriminant { field: ReplayField, value: u32 },
    InvalidField(ReplayField),
    NonCanonicalField(ReplayField),
    NonMonotonic { stream: ReplayStream, at: u32 },
    RecordAfterTickLimit { stream: ReplayStream, tick: u32 },
    CommandModelMismatch,
    RegistryDefinitionMismatch { action: u8 },
    ScenarioFingerprintMismatch { stored: u64, computed: u64 },
    TrailingBytes,
}

pub enum ReplayEncodeError {
    SizeOverflow,
    Invalid(ReplayValidationError),
}

pub enum ReplayPlayError {
    Invalid(ReplayValidationError),
}
```

Every enum derives `Clone`, `Copy`, `PartialEq`, `Eq`, and `Debug`. Encode and play
call one shared, non-mutating validation function and wrap its first failure in
their respective `Invalid` variant. `SizeOverflow` is reserved for checked byte-size
arithmetic before allocation; an ordinary exceeded documented cap is
`LimitExceeded`.

## Forty-byte envelope header

| Offset | Width | Field | Required value |
|---:|---:|---|---|
| 0 | 4 | magic | ASCII `ARPG` |
| 4 | 2 | codec version | `1` |
| 6 | 2 | command schema | `0` for v2-10 legacy records; `1` from v2-11 |
| 8 | 1 | hash domain | `0` LegacyV1; `1` ArticulatedV1 |
| 9 | 1 | flags | `0`; every bit is reserved |
| 10 | 2 | hash schema | `1` |
| 12 | 4 | payload length | exact bytes following this header |
| 16 | 8 | scenario fingerprint | recomputed after scenario decode |
| 24 | 8 | world seed | any `u64` |
| 32 | 4 | tick limit | replay stopping tick |
| 36 | 4 | scenario record length | leading bytes of payload |

The total input length must equal `40 + payload_length`; the scenario length must be
at most both the payload length and `MAX_SCENARIO_RECORD_BYTES`. There is no checksum:
scenario identity, command-stream evidence digests, and final state digests have
separate jobs and must not be relabeled as transport corruption detection.

The tuple accepted in v2-10 is exactly:

```text
command schema 0, LegacyV1 (0), hash schema 1, CombatModel::Legacy (0)
```

v2-11 adds exactly the payload owned by
[Articulated command V1](articulated-command-v1.md#coordinate-and-scalar-rules):

```text
command schema 1, ArticulatedV1 (1), hash schema 1, CombatModel::Articulated (1)
```

Every other tuple is `CommandModelMismatch`, even when each number is independently
known.

## Scenario record

The scenario record is tightly packed in this order:

| Width | Field |
|---:|---|
| 1 | combat model: Legacy `0`, Articulated `1` |
| 2 + N | UTF-8 name byte length `u16`, then N bytes |
| 2, 2, 4 | dungeon columns, rows, and tile count |
| tile count | row-major tile bytes: open `0`, wall `1`, shut door `2` |
| 4 | `max_ticks` |
| 1 | portal presence: absent `0`, present `1` |
| 0 or 8 | present portal raw x and y as `i32` |
| 4 | unit count |
| variable | unit records in vector order |
| 4 | torch count |
| 5 each | torch `tx u16`, `ty u16`, face discriminant `u8` |

`tile_count` must equal checked `cols * rows`. Unknown tile bytes are rejected rather
than treated as generic solid tiles. A portal must lie within the closed raw extent
`[0, cols << 16] x [0, rows << 16]`. Torch coordinates must lie within the grid;
face discriminants are NegX `0`, PosX `1`, NegY `2`, and PosY `3`. Although current
generation emits only positive faces, the codec round-trips every Rust `Torch`.
The envelope replay stopping tick must be at most this scenario's `max_ticks`;
exceeding the scenario-owned cutoff is `InvalidField(TickLimit)`.

Codec V1 ends after the torch records and has no reserved scenario-extension byte
or tail. V2-12 adds combat specs only by introducing outer codec V2 and ScenarioV2;
it never reinterprets a V1 byte.

Encoding and fingerprinting share one little-endian byte-sink implementation for
the ScenarioV1 fields from combat model through unit records. The fingerprint writes
its ASCII domain and schema first; the codec writes the same shared fields and then
the presentation-only torch rows. Item definitions use the same sink. A second
hand-maintained field-order match in `codec.rs` is not accepted, even if its tests
currently agree. The sink streams into `Hash64` or an already-sized `Vec<u8>` and
does not allocate a second complete scenario buffer.

Each unit record is:

| Width | Field |
|---:|---|
| 1 | body: Fighter `0`, Rogue `1`, Brute `2`, Skitterer `3` |
| 1 | faction: Heroes `0`, Monsters `1` |
| 5 | power, agility, intellect, perception, vitality bytes |
| 4, 4 | spawn raw x and y |
| 26 | required primary item definition |
| 1 | secondary presence: absent `0`, present `1` |
| 0 or 26 | secondary item definition |

Spawn must be within the same closed raw extent as a portal. The codec does not
invent collision clearance; `World` remains responsible for its total construction
semantics.

An item definition is exactly 26 bytes:

| Offset | Width | Field |
|---:|---:|---|
| 0 | 1 | `ActionKind` code `0..=7` |
| 1 | 1 | role: Strike `0`, Guard `1`, Move `2`, Shoot `3` |
| 2 | 4 | length raw `Fx` |
| 6 | 4 | mass raw `Fx` |
| 10 | 4 | balance raw `Fx` |
| 14 | 2 | arc raw `Angle` |
| 16 | 2 | windup ticks |
| 18 | 2 | recovery ticks |
| 20 | 2 | ready ticks |
| 22 | 4 | move bonus raw `Fx` |

The definition must byte-equal the compiled `ACTIONS[code]` row after canonical
encoding. It is an integrity echo until scenario-owned immutable definitions land;
the decoder never silently substitutes a changed registry row.

## Payload streams

Immediately after the scenario record are three independent streams:

```text
u32 command_count, command records
u32 order_count, order records
u32 objective_count, objective records
```

Each stream's ticks are nondecreasing; equal-tick records retain encoded order.
Commands require `tick < tick_limit`. Orders and objectives permit
`tick <= tick_limit` because current playback applies them before its terminal tick
check. No bytes may remain after the last objective.

### Legacy command schema 0

Every command record is exactly 37 bytes:

| Offset | Width | Field |
|---:|---:|---|
| 0 | 4 | tick |
| 4 | 4 | subject entity index |
| 8 | 4 | subject entity generation |
| 12 | 4, 4 | move raw x, y |
| 20 | 1 | intent: Hold `0`, Attack `1`, Flee `2` |
| 21 | 4, 4 | intent target index, generation |
| 29 | 2 | limb angle raw |
| 31 | 4 | limb reach raw |
| 35 | 1 | strike: None `0`, Nearest `1`, Widdershins `2`, Sunwise `3` |
| 36 | 1 | requested loadout slot |

Hold/Flee require both target words to be zero. Attack requires an initial-roster
index and generation zero. Subject identity also requires an initial-roster index
and generation zero. The codec contains no spawn records, so accepting another
generation would promise a replay history the format cannot express. Move and limb
reach retain legacy total semantics and are not range-rejected.

### Orders and objectives

An order record is 14 bytes: tick `u32`, faction `u8`, order tag `u8`, then an
8-byte payload. Tags are Hold `0`, Advance `1`, Regroup `2`, Focus `3`, Goto `4`.
Advance/Goto encode raw x/y `i32`; Focus encodes entity index/generation `u32`;
Hold/Regroup require eight zero bytes. Focus requires an initial-roster identity with
generation zero.

An objective record is 6 bytes: tick `u32`, faction `u8`, objective tag `u8`.
Tags are None `0`, Order `1`, Hunt `2`.

## Validation and construction order

The decoder validates in this order so corrupt inputs produce one stable error:

1. outer byte cap, 40-byte availability, magic, codec version;
2. command/domain/schema tuple and zero flags;
3. exact total and scenario extents using checked arithmetic;
4. scenario scalar discriminants, bounds, UTF-8, counts, and item definitions;
5. recomputed scenario fingerprint;
6. stream count bounds, record extents, discriminants, canonical zero fields,
   identities, tick ordering, and tick limits;
7. exact end of input.

Only after step 7 may decode allocate final record vectors and construct `Replay`.
A bounded scratch scenario may be built after step 5, but `World` is never
constructed by decode. `ReplayEnvelope::play` repeats tuple and fingerprint checks
before it calls `World::new`.

`ReplayEnvelope` and its public `Replay` intentionally repeat three values for source
compatibility with the existing in-memory replay API. They never form two
authorities. Shared encode/play validation checks, in this exact order:

1. `envelope.seed == replay.seed`, else `EnvelopeReplayMismatch(Seed)`;
2. `envelope.tick_limit == replay.ticks`, else
   `EnvelopeReplayMismatch(TickLimit)`;
3. `envelope.scenario_fingerprint == replay.scenario_fingerprint`, else
   `EnvelopeReplayMismatch(ScenarioFingerprint)`;
4. require the exact command-schema/hash-domain/hash-schema/combat-model tuple,
   else `CommandModelMismatch`;
5. compute `replay.scenario.try_fingerprint()` (mapping an overlong name to
   `LimitExceeded(ScenarioNameBytes)`), then require equality with
   `replay.scenario_fingerprint`; otherwise return `ScenarioFingerprintMismatch`
   with the replay value as `stored`.

Decode has only one encoded copy of each value. It constructs both public copies
from the header after all bytes validate, so a successfully decoded value satisfies
these equalities by construction. Encode never silently overwrites one copy with the
other. Play runs the same complete validation used by encode -- including limits,
record order/ticks, model tuple, and scenario bounds -- so mutation of a public
`Replay` after decode cannot bypass the persisted contract.

## Required offset fixture

The layout test hand-builds a minimal legacy envelope with name `x`, a 1x1 open
dungeon, scenario `max_ticks=1`, no portal, no units, no torches, world seed zero,
replay stopping tick zero, and no input records. Its ScenarioV1 fingerprint is the
independently hand-computed `0x22c54dc8462a1204`. Its scenario record is 26 bytes and
its payload is 38 bytes (the record plus three zero counts). The header therefore
contains payload length `38` at offset 12, the fingerprint's little-endian bytes
`04 12 2a 46 c8 4d c5 22` at offset 16, and scenario length `26` at offset 36;
total file length is `78`. The test contains the complete 78-byte literal and compares
every byte with the encoder; it does not call `Scenario::fingerprint` to obtain the
expected value.
