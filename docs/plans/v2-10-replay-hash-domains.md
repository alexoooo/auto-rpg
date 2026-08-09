# v2-10 — make replay identity and hash domains explicit

**Status:** complete (2026-08-09). ScenarioV1, typed state domains, codec V1,
bounded validation, and mandatory envelope playback checks are implemented and green.

**Goal:** repair current scenario identity, add a durable fail-closed replay codec,
and establish separate legacy/articulated hash domains before articulated state.

**Depends on:** Track 1. It does not depend on the visual track.

**Golden expectation:** `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, and `BOW_HASH` remain byte-identical. Every scenario fingerprint moves
because the new stream is tagged and length-delimited; loadout-only edits now move it
for the first time. No state golden is re-pinned.

Read `docs/reference/determinism.md` before editing. The exact contracts introduced
by this session are:

- [Replay codec V1](../reference/replay-codec-v1.md#integer-and-size-rules) —
  persisted bytes, bounds, validation, and API;
- [Hash domains V1](../reference/hash-domains-v1.md#primitive-and-typed-comparison) —
  scenario and state digest byte streams.

Those references are implementation input, not prose to reconstruct after the code.

## Scenario identity

At `Scenario::fingerprint` in `crates/sim/src/scenario.rs`, add
`CombatModel { Legacy = 0, Articulated = 1 }` to `Scenario`; every existing
constructor explicitly writes `Legacy`. Replace the ambiguous current fingerprint
stream with `ScenarioV1` from `hash-domains-v1.md`: a tagged, length-delimited stream
covering combat model, UTF-8 name, complete dungeon bytes, maximum ticks, portal,
and units in vector order. Replay codec V1 and ScenarioV1 have no reserved scenario
tail. V2-12 introduces outer replay codec V2 and ScenarioV2 before articulated
combat specs become constructible.

Add `pub(crate) fn tiles(&self) -> &[u8]` beside `Dungeon::tile` in
`crates/sim/src/dungeon.rs`; the shared scenario codec/fingerprint writer uses this
read-only row-major view rather than reconstructing tiles through coordinate calls.

Each unit writes body, faction, five stats, spawn, and both loadout slots. A present
slot writes its `ActionKind` code and every construction-relevant `ActionSpec` field
in the exact order in the reference. Decode persists that definition and requires it
to equal the compiled action row before constructing `Scenario`; changing a registry
row therefore invalidates an old replay explicitly instead of silently changing its
meaning. Torches remain serialized for lossless `Scenario` round-trip but remain
outside scenario identity because they are presentation-only.

Future immutable anatomy/equipment/grip definitions implement one canonical
`fingerprint_into` before their types become constructible. They require a new outer
codec version and scenario fingerprint schema; appending undocumented bytes to
codec V1 or ScenarioV1 is forbidden.

## Persisted envelope

Add `crates/sim/src/codec.rs` and extend `crates/sim/src/replay.rs`:

```rust
pub const REPLAY_CODEC_VERSION: u16 = 1;
pub const LEGACY_COMMAND_SCHEMA: u16 = 0;
pub const ARTICULATED_COMMAND_SCHEMA_RESERVED: u16 = 1;

pub struct ReplayEnvelope {
    pub command_schema: u16,
    pub hash_domain: HashDomain,
    pub hash_schema: u16,
    pub scenario_fingerprint: u64,
    pub seed: u64,
    pub tick_limit: u32,
    pub replay: Replay,
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
pub enum ReplayEncodeError { SizeOverflow, Invalid(ReplayValidationError) }
pub enum ReplayPlayError { Invalid(ReplayValidationError) }
```

Expose only bounded all-or-nothing entry points:

```rust
impl ReplayEnvelope {
    pub fn encode(&self) -> Result<Vec<u8>, ReplayEncodeError>;
    pub fn decode(bytes: &[u8]) -> Result<Self, ReplayDecodeError>;
    pub fn play(&self) -> Result<World, ReplayPlayError>;
}
```

`decode` checks the outer byte limit before allocating, performs checked arithmetic
for every extent, validates the complete value, recomputes scenario identity, and
only then constructs `Replay`. `play` repeats the model/domain/schema/fingerprint
checks before constructing `World`; callers cannot accidentally turn `is_intact`
into an optional precondition. Existing in-memory `Replay` remains available for
tests and transient recordings, but persisted callers use the envelope.

Because the existing public `Replay` repeats seed, stopping tick, and fingerprint,
shared encode/play validation requires equality with the envelope copies and requires
the replay fingerprint to equal its scenario's recomputed fingerprint, in the exact
order in the codec reference. Both paths reject the first mismatch; neither repairs
one public field from another. Refactor the v2-10a scenario writer into the shared
little-endian byte sink required by the reference, so ScenarioV1 fingerprinting and
codec encoding cannot drift in their common field or item order.

`LEGACY_COMMAND_SCHEMA = 0` accepts only the exact legacy command record in the
codec reference. It is paired only with `CombatModel::Legacy`, `LegacyV1`, and hash
schema 1. No articulated tag is reserved inside schema 0. `v2-11` adds command
schema 1 as a new dispatch arm, so it does not broaden or reinterpret the set of
bytes accepted as schema 0. `ARTICULATED_COMMAND_SCHEMA_RESERVED` is written in the
un-pinned ArticulatedV1 prefix but is not an accepted replay schema until v2-11.

## Hash domains

Add `crates/sim/src/hash_domain.rs`:

```rust
#[repr(u8)]
pub enum HashDomain { LegacyV1 = 0, ArticulatedV1 = 1 }

pub struct StateDigest {
    pub domain: HashDomain,
    pub schema: u16,
    pub value: u64,
}

pub enum DigestCompareError {
    DomainMismatch { left: HashDomain, right: HashDomain },
    SchemaMismatch { left: u16, right: u16 },
}

impl StateDigest {
    pub fn compare(self, other: Self) -> Result<bool, DigestCompareError>;
}
```

`World::state_hash()` remains the exact existing byte writer. For a legacy world,
`World::state_digest()` returns `{ LegacyV1, 1, state_hash() }`; no tag, model byte,
or neutral articulated field enters that legacy FNV stream. For an articulated
world in this inert phase, `state_digest()` uses the tagged `ArticulatedV1` prefix
and the legacy-core digest specified in `hash-domains-v1.md`. Each later phase
appends its complete authoritative block to the articulated writer before making
that state constructible. No articulated value is pinned until v2-17.

The replay codec validates model, command schema, hash domain, and hash schema as one
tuple. `StateDigest::compare` rejects a domain/schema mismatch; tests and wasm checks
must not compare bare `u64` values across domains.

## Tests and verification

Add these exact tests:

```text
scenario_v1_is_length_delimited_and_distinguishes_loadouts
scenario_v1_covers_every_action_spec_field
legacy_state_hash_bytes_are_unchanged
state_digest_rejects_cross_domain_and_cross_schema_comparisons
replay_codec_v1_matches_the_documented_offset_fixture
replay_codec_round_trips_every_legacy_variant
replay_decoder_checks_outer_bounds_before_allocating
replay_decoder_rejects_bad_lengths_counts_utf8_and_trailing_data
replay_decoder_rejects_unknown_and_noncanonical_discriminants
replay_decoder_rejects_nonmonotonic_streams_and_records_after_the_limit
replay_decoder_rejects_a_stop_after_the_scenario_cutoff
replay_decoder_rejects_entity_handles_outside_the_initial_roster
replay_decoder_rejects_a_model_schema_domain_mismatch
replay_decoder_rejects_a_changed_action_registry_definition
replay_play_rechecks_identity_before_constructing_a_world
encode_and_play_reject_each_duplicate_envelope_field_mismatch
scenario_fingerprint_and_codec_share_one_canonical_byte_sink
```

The offset fixture is the byte table in `replay-codec-v1.md`, encoded once by hand
in the test; an encoder and decoder agreeing with each other is not layout proof.

```powershell
cargo test -p sim
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
