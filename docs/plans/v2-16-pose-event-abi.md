# v2-16 — publish bounded articulated observations, poses, and events

**Goal:** land the subject-scoped observation, policy seam, submitted-command host
entry, and fixed pose/event streams specified by
[`articulated-abi.md`](../reference/articulated-abi.md).

**Depends on:** `v2-11` and `v2-15`. It does not depend on the presentation track.

**Golden expectation:** every legacy hash and the legacy frame ABI remain unchanged;
no articulated pin yet.

## Observation and policy

Add `World::observe_articulated(EntityId) -> ArticulatedObservation` and store one
neutral `ArticulatedObservation` block at the end of `Observation`. Bump
`FEATURE_LAYOUT_VERSION` and append exactly the feature block and width in the ABI
reference; never move an existing feature. Legacy observations fill the block with
zero and existing policy behavior must remain byte-identical.

Add beside `Policy`:

```rust
pub trait ArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1;
    fn reset(&mut self) {}
}
```

The runner asks the world for the subject-scoped observation and wraps the result in
`SubmittedCommand::Articulated`. No policy API accepts `&World`. Add a compile-fail
doctest showing that hidden world state is unavailable rather than claiming runtime
privacy from a unit test.

## Host buffers and exports

In `crates/web/src/lib.rs`, add the fixed `[u32; capacity * stride]` pose and combat
event arrays beside `FRAME`; reuse v2-11's exact `[u8; 55]` submitted-command
scratch and packed result word rather than adding a second codec. Implement
every export named in the ABI reference, including `init_articulated`. Existing
`init`, legacy frame pointer/length/stride/version, and Canvas behavior do not change.
`COMBAT_EVENT_STRIDE` is 32: energy and each cut/thrust/pressure/deflected channel
are low/high word pairs. No host mirror may narrow a v2-14 `u64` resolution channel.

Populate pose rows from the end-of-call state in ascending full identity. Accumulate
combat events across every tick in one `step(ticks)` call in
tick/TOI/group-ordinal/key order, as
the legacy feed already does. Overflow retains the canonical prefix and saturating
drop count. Raw authoritative streams remain inside the trusted worker boundary;
the renderer receives only the visibility-filtered copy required by the worker
protocol.

Extend `crates/web/src/bin/emit_abi.rs` with the constants and offsets. The generated
TypeScript consumer still lands in v2-17, but `tools/wasm_check.js` consumes these
exports now. Add native/wasm FNV digests using the exact stream encoding in the
reference; state-hash equality is not a substitute.

Run the ignored high-water fixture before accepting `MAX_COMBAT_EVENTS = 256`. Its
measured maximum must be at most 128. Otherwise amend the reference to the next
power-of-two at least twice the maximum and record its byte budget before code lands.
The fixture, seed, 64 positions, paired commands, and single `step(8)` host batch are
literal values in the ABI reference; do not replace them with random scenarios or
eight separate publications.

Memory growth is a Node wasm test, not a native Rust assertion: hold legacy frame,
pose, and event typed-array views, warm all paths, record `memory.buffer.byteLength`,
exercise maximum spawn/contact/event/reset paths, and require unchanged byte length
and still-attached original views.

## Tests and verification

```text
articulated_features_have_one_documented_width
legacy_feature_prefix_and_policy_decisions_are_byte_identical
poor_perception_blurs_motion_without_inventing_severance
an_articulated_policy_has_no_world_parameter
pose_rows_use_full_identity_and_canonical_order
pose_and_event_overflow_drop_only_the_canonical_tail
both_limb_slots_and_regions_round_trip
target_hands_and_contact_group_ordinals_round_trip
empty_ticks_enter_both_stream_digests
native_and_wasm_pose_event_stream_digests_match
wasm_exports_match_layout_stride_capacity_and_drop_fields
published_views_survive_articulated_stress_without_memory_growth
```

```powershell
cargo test -p web -- --ignored --nocapture print_articulated_buffer_high_water_marks
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
