# v2-16 — publish bounded articulated observations, poses, and events

**Goal:** let scripted agents and presentation read the fight through subject-scoped
observations and portable fixed-capacity streams, without enlarging the legacy frame.

**Depends on:** `v2-11` and `v2-15`. It does not depend on the visual/worker track.

**Golden expectation:** legacy hashes remain byte-identical; no articulated pin yet.

## Observation and host entry

Append one versioned articulated block in `crates/sim/src/obs.rs` and bump
`FEATURE_LAYOUT_VERSION`. Legacy observations fill neutral appended values and
existing policies ignore them. `ArticulatedObservation` contains the subject's full
identity/capabilities, both arm poses/velocities/fatigue, shield pose, blood/shock,
regional summaries, and only visible opponent geometry. Perception noise affects
measured position/velocity/timing; obvious severance remains categorical.

Now add the separate `ArticulatedPolicy` trait promised by `v2-11` beside `Policy` in
`crates/policy/src/lib.rs`. It accepts this complete subject-scoped observation and
emits `ArticulatedCommandV1`; it never receives `&World`. Legacy `Policy` stays
source-compatible and continues to emit legacy `Command`.

Add `init_articulated` and versioned submitted-command exports in
`crates/web/src/lib.rs`; existing `init` and legacy frame exports do not change.

## Pose and event buffers

Add fixed arrays beside the existing `thread_local!` frame buffers:

```rust
pub const POSE_LAYOUT_VERSION: u32 = 1;
pub const COMBAT_EVENT_LAYOUT_VERSION: u32 = 1;
pub const MAX_POSES: usize = 64;
pub const MAX_COMBAT_EVENTS: usize = 256;
```

Pose order is ascending full entity identity, one row per live articulated body.
Rows contain identity, body XYZ/yaw, both hand poses/velocities/fatigue, weapon
endpoints, shield center/normal/extents, regional/severed masks, and animation hints.
Event order is tick, time of impact, both full identities, limb slots, then kind.
Rows contain contact point/normal, kind, energy/deflection, region, and severance.

Overflow keeps the first rows in canonical order, drops the tail, and publishes
`poses_dropped`/`combat_events_dropped`; no priority class silently reorders facts.
`MAX_POSES` matches the existing authoritative cap. Before landing, run ignored test
`print_articulated_buffer_high_water_marks` for the scripted stress corpus; 256 must
be at least twice the measured event high-water mark or this plan is amended with the
measured power-of-two capacity and memory budget.

Export pointer/length/stride/capacity/drop-count/layout-version and expose the Rust
constants through `emit_abi` when that binary exists. The TypeScript copy is generated
when the tracks join in `v2-17`; this phase's direct consumer is
`tools/wasm_check.js`. Add canonical FNV-1a-64 native/wasm stream digests over every
tick, including empty ticks, lengths, dropped counts, and raw row words. State-hash
equality alone is not accepted.

## Memory and tests

At the existing `thread_local!`/frame-buffer tests in `crates/web/src/lib.rs`, add a
standalone memory-page stress through maximum pose/contact/event/reset paths. No
allocation after warm-up may grow wasm memory while the legacy page holds a view.

```text
articulated_features_have_one_documented_width
poor_perception_blurs_motion_without_inventing_severance
an_articulated_policy_cannot_read_hidden_world_state
pose_rows_use_full_identity_and_canonical_order
pose_and_event_overflow_drop_only_the_canonical_tail
both_limb_slots_and_regions_round_trip
native_and_wasm_pose_event_stream_digests_match
wasm_exports_match_layout_stride_capacity_and_drop_fields
published_views_survive_articulated_stress_without_memory_growth
```

```powershell
cargo test -p web -- --ignored --nocapture print_articulated_buffer_high_water_marks
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```
