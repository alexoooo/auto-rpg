# v2-11 — freeze the articulated submitted-command seam

**Status:** v2-11a complete (2026-08-09); equipment-binding compatibility remains the post-v2-12 v2-11b step.

**Goal:** define the one value crossing articulated policy, world, replay, wasm, and
worker boundaries, including independent body yaw and atomic fail-closed validation.

**Depends on:** `v2-10`. It does not depend on the visual/worker track.

**Golden expectation:** all six legacy state hashes remain byte-identical. Scenario
fingerprints retain the schema-1 values introduced in v2-10. No articulated golden
is pinned yet.

The normative type, wire, validation, and fallback rules are in
[Articulated command V1](../reference/articulated-command-v1.md#coordinate-and-scalar-rules).
The phase is not complete if Rust, replay, wasm, or the reference accepts a different
range or discriminant.

## Rust contract

Leave `Command`, `LimbCommand`, `Policy`, and legacy submission behavior unchanged.
At `crates/sim/src/command.rs` add:

```rust
pub const SUBMITTED_COMMAND_LAYOUT_VERSION: u16 = 1;

pub struct CombatHeight(Fx);
pub enum LimbSlot { LeftArm = 0, RightArm = 1 }
pub struct ArmTarget {
    pub bearing: Angle,
    pub height: CombatHeight,
    pub reach: Fx,
    pub effort: Fx,
}
pub enum GripRequest { Keep = 0, Release = 1, EquipSlot(u8) = 2 }
pub enum SubmittedCommand { Legacy(Command), Articulated(ArticulatedCommandV1) }
pub struct ArticulatedCommandV1 {
    pub move_dir: Vec2,
    pub body_yaw: Angle,
    pub intent: Intent,
    pub arms: [ArmTarget; 2],
    pub grips: [GripRequest; 2],
}
pub enum CommandReject {
    WrongModel,
    StaleEntity,
    MissingEquipment { arm: LimbSlot, slot: u8 },
    OutOfRange(CommandField),
    UnknownLayout(u16),
}
pub enum SubmitArticulatedOutcome {
    Stored {
        command: ArticulatedCommandV1,
        rejection: Option<CommandReject>,
    },
    NotStored(CommandReject),
}
```

`CombatHeight::try_from_raw` accepts exactly `0..=Fx::ONE.raw()`;
`LOW/MID/HIGH` are raw `16_384`, `32_768`, and `49_152`. `ArmTarget` remains a
plain inspectable value, so `World` revalidates its public `reach` and `effort` as
raw `0..=65_536`. A move request is valid when both components are within
`[-65_536, 65_536]` and its `i64`-staged raw squared magnitude is at most
`65_536 * 65_536`. Angles accept every `u16` bit pattern. Attack identities use
the existing total legacy semantics and may fail to resolve later; only the subject
identity is a submission precondition.

Add only `World::submit_articulated_v1(id, command) -> SubmitArticulatedOutcome` as
the typed Rust entry. Layout validation belongs at byte/wasm decode, before this
method can be called. Its behavior is atomic:

The wasm decoder's raw-range failure path uses the narrow
`submit_articulated_fallback_v1(id, field)` companion because an invalid raw height
cannot be represented as a typed `CombatHeight`. It stores only the canonical
neutral command after repeating model and liveness checks; ordinary Rust callers
still use the typed entry above.

1. wrong combat model or stale subject returns `NotStored` and mutates nothing;
2. validate both movement/arm ranges and both grip slot requests against the current
   two-slot loadout before writing any field;
3. `EquipSlot(0|1)` is structurally valid when that slot is populated; both arms may
   request the same slot because v2-12's immutable binding decides whether the item
   is two-handed; any other or empty slot is `MissingEquipment`;
4. on success store the submitted command unchanged and return `Stored` with no
   rejection;
5. on a range/equipment failure store one canonical neutral command and return it in
   `Stored { rejection: Some(..) }`.

The neutral command is zero translation, current authoritative facing as body yaw,
`Intent::Hold`, both arms at that same bearing with `CombatHeight::MID`, zero reach,
zero effort, and both grips `Keep`. Until v2-13 lands a distinct `BodyYawState`, the
existing facing column is the current authoritative yaw for this fallback only;
articulated stepping remains inert. If multiple fields are invalid, rejection
precedence is the ordered validation list in the reference, so entity or arm
iteration cannot choose the diagnostic.

Replay recorders consume the outcome rather than the caller's request:

```rust
match world.submit_articulated_v1(id, requested) {
    SubmitArticulatedOutcome::Stored { command, rejection } => {
        replay.record_submitted(tick, id, SubmittedCommand::Articulated(command));
        diagnostics.record_rejection(rejection); // optional and non-authoritative
    }
    SubmitArticulatedOutcome::NotStored(reason) => diagnostics.record_rejection(Some(reason)),
}
```

Thus a stale/wrong-model request produces no authoritative record, while an invalid
request that resolves a live articulated subject records exactly the fallback the
world stored. Diagnostics never enter replay playback or state hashing.

Preserve `Replay::entries: Vec<CommandRecord>` and `Replay::record` for legacy
source compatibility. Add a separate
`submitted_entries: Vec<SubmittedCommandRecord>` and `record_submitted`; a replay has
exactly one nonempty command vector selected by its scenario model. Codec schema 0
reads/writes `entries`, schema 1 reads/writes `submitted_entries`, and decode rejects
an envelope whose inactive vector is nonempty. Playback dispatches the selected
vector and records no policy or rejection diagnostics.

## Turning contract

This phase stores target yaw but does not integrate pose. `v2-13` consumes it using
the fixed convention: `Angle::ZERO` is +x and increasing angles are
counter-clockwise; shortest signed delta lies in `[-32_768, 32_767]`, and the exact
half turn is `-32_768` (clockwise). Translation and angular effort are independent.
Legacy commands retain movement-derived facing and cannot turn in place.

## Replay, hash, and wasm layout

Extend codec version 1 by accepting `command_schema = 1`; do not alter schema 0.
Schema 1 command records are the exact variable-width `SubmittedCommandV1` records
in `articulated-command-v1.md`: tag 0 has a 38-byte record and tag 1 has a 64-byte
record, including the common tick/entity prefix. For this phase, codec tuple
validation permits:

```text
Legacy scenario       command schema 0   LegacyV1 schema 1
Articulated scenario  command schema 1   ArticulatedV1 schema 1
```

An articulated envelope rejects a legacy submitted-command tag and vice versa.
Unknown tags, non-zero canonical padding bytes, out-of-range raw fields, missing
equipment slots, and tuple mismatches fail before constructing `Replay`.

The articulated state digest appends the complete stored command array in ascending
entity-slot order after the v2-10 prefix. Every variant tag and every payload field
is written, including currently unread grip requests. Legacy hashing never reads the
new command column.

Add the fixed 55-byte wasm scratch-buffer ABI specified in the reference:
`submitted_command_ptr`, `submitted_command_len`,
`submitted_command_layout_version`, and
`submit_articulated(entity_index, entity_generation) -> u32`. The buffer begins
layout `u16`, submitted tag `u8`, and one reserved zero byte, followed by the
articulated payload. Decode copies and validates all 55 bytes before calling `World`;
no live wasm-memory view survives the mutating submit call. The returned packed word
reports stored/original, stored/fallback, or not-stored plus its stable rejection
code and detail bytes. The TypeScript worker copy is deliberately generated when the
tracks join in v2-17; `tools/wasm_check.js` is the direct consumer now.

## Tests and verification

```text
legacy_policy_command_and_submission_shapes_remain_unchanged
combat_height_accepts_every_in_range_raw_value_without_quantizing
articulated_command_v1_matches_the_documented_55_byte_fixture
submitted_commands_round_trip_in_documented_field_order
schema_zero_bytes_retain_their_v2_10_meaning
unknown_layout_tag_padding_and_out_of_range_fields_fail_before_mutation
wrong_model_and_stale_subjects_are_not_stored_or_recorded
invalid_range_or_equipment_replaces_the_whole_command_atomically
two_invalid_fields_choose_the_documented_rejection_precedence
recording_uses_the_returned_fallback_not_the_rejected_request
a_stationary_articulated_body_can_store_a_turn_request
the_exact_half_turn_delta_is_clockwise
legacy_commands_still_cannot_turn_in_place
every_articulated_command_field_changes_only_the_articulated_hash_domain
replay_wasm_and_rust_command_layouts_are_equal
```

```powershell
cargo test -p sim
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
