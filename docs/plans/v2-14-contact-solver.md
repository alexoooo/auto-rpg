# v2-14 — resolve continuous contact in deterministic time groups

**Goal:** land the bounded contact solver in three independently green checkpoints.
The exact authority is [`contact-solver.md`](../reference/contact-solver.md#public-rows-and-ownership);
this plan contains ownership, source order, named proofs, and gates rather than a
second spelling of its equations.

**Depends on:** completed v2-13 actuator state. V2-13 supplies body-relative arm and
shield poses, not weapon colliders; checkpoint A below deliberately owns the missing
absolute equipment construction and continuous geometry.

**Golden expectation:** `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, and `BOW_HASH` remain byte-identical. The geometry API intentionally
moves `COMBAT_GEOMETRY_HASH` from `0x56fb8704002a1a61` to
`0x9d15344883cf6e9c` in native and wasm. Appending global zero `cap_hits` intentionally
moves the paired unstepped articulated command probe from `0x584d711e492950e7` to
predicted `0x010411d521a376d7`; measure it natively and update both mirrors only if the
complete fixture proves that exact suffix-only explanation. There is no v17
`ARTICULATED_HASH` yet and this phase must not create it.

## A — public equipment geometry

Fill the already-created inert `crates/sim/src/combat/geometry.rs` with world-owned
collider builders. Add the public no-allocation functions
`fx::swept_segment_segment`, `fx::closest_points_segment_rectangle`, and
`fx::swept_segment_rectangle` to
`crates/fx/src/geom3.rs` and re-export them from `crates/fx/src/lib.rs`. Their exact
conservative advance, finite-rectangle features, invalid-input behavior, and two
new digest rows are the
[`combat-geometry` contract](../reference/combat-geometry.md#continuous-equipment-sweeps).
Do not add a sim-private sweep.

The sim builder takes retained tick-entry and requested body/arm/shield rows and
emits previous/requested absolute weapon, shield, and temporary-body poses exactly as
specified by [`contact-solver`](../reference/contact-solver.md#tick-entry-poses-and-collider-construction).
`Both` emits one right-owned segment. Add no `World::step` call yet.

Required tests:

```text
moving_segments_use_the_shared_conservative_advance
a_moving_finite_rectangle_has_one_exact_feature_order
segment_rectangle_closest_points_publish_all_frozen_fractions
the_new_geometry_rows_extend_the_portable_digest
weapon_endpoints_add_body_origin_exactly_once
shield_front_corners_have_the_frozen_order_and_offset
both_equipment_emits_one_right_owned_collider
the_temporary_body_capsule_uses_one_regionless_volume
```

Checkpoint gate:

```powershell
cargo test -p fx
cargo test -p sim combat::geometry
cargo test -p web combat_geometry
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

## B — pure collector, resolver, and corpora

Fill `crates/sim/src/combat/contact.rs` and `resolution.rs` with the exact public rows,
generalized collider identity, candidate scan, scratch layout, group resolver,
widened energy/channel arithmetic, zero-time suppression, entity closure, and cap
algorithm in the reference. This checkpoint operates on explicit collider rows and
does not mutate `World`.

Add the hand-authored 591-byte serialization fixture and 3,548-byte behavioral fixture.
The latter must call the production collector/resolver, compare every literal byte,
then compare `0xfe6ce41ec023c1e5`; it may not serialize hand-written output facts.
Add release web exports `contact_behavior_corpus_len`,
`contact_behavior_corpus_byte`, `contact_behavior_digest_lo`, and
`contact_behavior_digest_hi` with the exact signatures in the reference. Whitelist them and independently
build/hash all expected bytes in `tools/wasm_check.js`.

Required tests:

```text
one_sweep_recomputes_after_two_sequential_contacts
a_true_simultaneous_group_uses_one_pre_group_state
contact_results_survive_entity_and_limb_index_permutations
contact_keys_include_generation_and_have_one_total_order
allies_and_self_geometry_do_not_enter_contact_groups
persistent_zero_time_contacts_do_not_livelock
an_initially_separating_overlap_receives_no_attracting_impulse
a_positive_time_exact_crossing_uses_relative_velocity_for_its_normal
cap_exhaustion_stops_at_the_last_safe_pose
shared_limb_group_energy_is_clamped_as_one_system
the_greedy_alpha_keeps_only_individually_valid_bits
group_energy_accumulation_never_saturates
contact_resolution_channels_do_not_narrow
global_time_ceil_does_not_commit_before_contact
the_last_raw_local_step_collapses_to_tick_end
a_stationary_edge_does_not_cut
running_onto_a_braced_point_records_positive_thrust
transverse_motion_records_cut_and_axial_motion_records_thrust
a_body_facing_shield_blocks_only_its_surface
a_low_shield_does_not_cover_a_high_contact
the_contact_corpus_has_a_documented_byte_order
the_behavioral_contact_corpus_has_literal_outcomes
contact_corpus_matches_on_eight_native_threads
```

Checkpoint gate:

```powershell
cargo test -p sim combat::contact
cargo test -p sim combat::resolution
cargo test -p web contact_behavior_corpus
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

## C — authoritative World integration

In `crates/sim/src/world.rs`, add `ContactSolverState`, retained scratch, completed
resolutions, the typed `try_new`/`try_spawn` preflight APIs, and compatibility wrappers.
In `crates/sim/src/codec.rs`, enforce `MAX_ARTICULATED_ENTITIES=64` for codec-V2
Articulated scenario encode/decode/play validation while preserving the exact Legacy
4,096 path and error precedence.
Capture tick-entry contact rows before articulated movement. Keep the existing
movement → planar separation → yaw → grip → arm → geometry order, then call contact,
then doors. Legacy executes no snapshot, allocation, branch, hash byte, or phase.

Implement the exact shifted body sweep, global-time interpolation, entity-coupled
impulse application, arm inverse map, right-owned `Both` mirror, one final wall
settlement, and cap commit from the reference. Do not run planar body separation
again. Publish the last tick's resolutions but mutate no HP.

Write one global `cap_hits:u32` after the complete allocated-slot actuator loop in
ArticulatedV1 hashing. Initialize it to zero; clone it; preserve it across slot reuse;
increment saturating once per exhausted tick. The browser reserves contact high-water
64 immediately after articulated construction and before returning any wasm pointer.
The Node memory test then retains views, fills to 64, runs the cap path, and proves
neither another tick nor reset grows memory or contact capacity.

Required tests:

```text
body_body_contact_remains_planar_and_single_sourced
crowded_separation_shifts_both_contact_endpoints_equally
contact_scratch_grows_only_with_allocated_high_water
invalid_dynamic_contact_capacity_fails_before_spawn_mutates
codec_v2_rejects_articulated_row_65_before_unit_allocation
legacy_codec_retains_its_4096_unit_ceiling
geometry_envelope_rejects_before_world_or_spawn_mutation
repeated_crowded_separation_clamps_before_energy_and_sweep
mixed_body_and_equipment_entry_clamps_translate_each_endpoint_once
wall_settlement_never_increases_entity_closure_energy
both_has_one_right_owned_collider_and_mirrors_after_contact
contact_cap_hashes_once_after_all_actuator_rows
contact_modified_pose_survives_replay_at_every_tick
dead_and_reused_slots_keep_contact_identity_and_hash_coverage
legacy_worlds_have_no_contact_state_or_schedule_phase
articulated_contact_runs_after_geometry_and_before_doors
the_browser_contact_warmup_does_not_grow_wasm_memory
```

Final gate:

```powershell
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Checkpoint C may re-record only the paired articulated command probe described at the
top. Any legacy hash movement, any different geometry digest, or a probe movement not
explained by the four appended zero bytes blocks the landing.
