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
moved the paired unstepped articulated command probe from `0x584d711e492950e7` to
`0x010411d521a376d7` — predicted first, then measured natively onto that exact value,
which is the suffix-only proof the mirrors were waiting on. Both are updated. There is
no v17 `ARTICULATED_HASH` yet and this phase must not create it.

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

Checkpoint B corrected one rule in the reference rather than implementing it as
written. The local-to-global time map truncates; it does not round up. `fx`'s
conservative advance already returns the first raw step at which the truncated poses
touch, so rounding up a second time put the group pose one raw unit past the crossing
and made a momentum chain chatter. The reference records the argument in place. A
sim-private closed-form time of impact is not an alternative fix: the pinned
behavioral digest is reachable through `fx::swept_segment_segment`, and
`COMBAT_GEOMETRY_HASH` does not move.

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
global_time_mapping_does_not_commit_before_contact
the_last_raw_local_step_collapses_to_tick_end
an_oversized_simultaneous_group_caps_instead_of_truncating
a_bystander_outside_the_group_closure_stays_out_of_its_ledger
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

Checkpoint C closes the entry-clamp defect B recorded and could not fix.
`CONTACT_COMPONENT_SPEED_LIMIT` is `Fx::from_raw(151_348)`, the largest `L` with
`3*L^2 <= (4*ONE_RAW)^2`, so three clamped components stay inside the sweep envelope
that a componentwise 4 escaped. The reference records the measurement and why
clamping the magnitude instead is unsound. No pinned digest moves: nothing in any
fixture reaches 2.309, and the energy preflight keeps its `4.raw^2` headroom
deliberately.

Write one global `cap_hits:u32` after the complete allocated-slot actuator loop in
ArticulatedV1 hashing. Initialize it to zero; clone it; preserve it across slot reuse;
increment saturating once per exhausted tick. The browser reserves contact high-water
64 immediately after articulated construction and before returning any wasm pointer.
The Node memory test then retains views, fills to 64, runs the cap path, and proves
neither another tick nor reset grows memory or contact capacity.

### C is landing in stages — resume here

**Baseline at the resume point.** Commit `4f4859a` on `iso-world-view`, with no code
changes on top of it — everything below already green: `cargo test` 616 passed / 0 failed;
`cargo run --release -p lab -- hash` → `0xfe31370e141ef531` (unmoved);
`cargo run --release -p lab -- verify --seeds 200` → identical on re-run and exact on
replay; `node --test tools/wasm_check.js` → 19/19; `node --test
client/test/wasm-memory.test.mjs` → 2/2; `node tools/check_docs.js` → passed. If any
of those is red before the first edit, something else moved and this plan is not the
cause.

**Arrived.** The typed capacity/spawn APIs and the envelope preflight; the codec-V2
64-entity ceiling; the hashed `cap_hits` and its re-recorded probe; the web
reservation and its no-growth proof; tick-entry retention, the shifted body sweep, the
frozen phase order, the entry clamp, and collider construction.

**Still outstanding.** The coupled `ContactTrialProjector`, the `solve_contact_tick`
call and its mid-tick `Err` policy, the impulse commit and the arm inverse-map at
commit time, wall settlement, and the cap commit. So an articulated tick builds its
colliders and stops: `World::contact_resolutions()` is structurally always empty and
`cap_hits` is always zero.

Two things that phrasing has understated before, both worth being exact about. The
entry clamp does more than clamp velocity — when the clamp bites it rewrites
`bearing`, `height`, `reach` and `hand` through `actuator::inverse_hand` and
re-mirrors a two-handed pair, and those are hashed `ArticulatedV1` columns. A tick that
"resolves nothing" therefore already mutates authoritative *pose*, which is why the
clamp is not something to move or defer while wiring the solve. And the browser memory
test does not fill to 64 the way the paragraph above prescribes: the host builds no
articulated spec, so an articulated world refuses the whole legacy spawn path and every
row in that loop is a `0` the test asserts. Only the *reservation* is at the ceiling.
The loop bound is already `MAX_UNITS`, so it becomes a real fill the day an articulated
spawn reaches the boundary, and only the expected return value changes.

**Where the remaining work attaches.** `World::resolve_contact` in
`crates/sim/src/world.rs` (~L3493) is three lines — take the runtime, clamp, build.
The solve, commit, settlement, and cap all land inside it, and its doc comment carries
the same staged boundary as this paragraph. Nothing else in `World::step` moves; the
phase order is pinned by `articulated_contact_runs_after_geometry_and_before_doors`.

**Reuse, do not rebuild.** These exist and are already proven; re-creating any of them
is the most likely way to waste a session. In `crates/sim/src/world.rs`:
`ContactRuntime` (~L363) and its `reserve`, `body_sweep_from` (~L390) as the single
source of the shifted sweep rule, `clamp_contact_velocity` (~L396), `TickEntry`
(~L411), `try_reserve_contact_slots` (~L705), `contact_resolutions` (~L719),
`contact_cap_hits` (~L724), `retain_contact_entry` (~L3450),
`record_contact_locomotion` (~L3469), `clamp_contact_entry` (~L3509), `two_handed`
(~L3556), `build_contact_colliders` (~L3570), and the test-only `contact_body_sweep`
(~L3654). In `crates/sim/src/combat/actuator.rs`: `shoulder`, `hand_position`,
`inverse_hand`, `mirror_two_handed`. In `crates/sim/src/combat/geometry.rs`:
`segment_pose`, `held_segment_colliders`, `shield_face`, `held_shield_collider`,
`temporary_body_capsule`. In `crates/sim/src/combat/resolution.rs`:
`ContactTickScratch::capped_entities`, which exists precisely so the cap commit can
zero arm scalar speeds and mirror `Both` — a collider row cannot express either.

**Five dead-code warnings are load-bearing.** `cargo build -p sim` warns that
`collect_contacts`, `resolve_group`, `allocate_weighted`, `serialize_contact_corpus`,
and `capped_entities` are never used. Every one is either exercised by tests or is
surface the remaining work consumes. Do not delete them to quiet the build; they go
quiet on their own when the solve lands.

**The signatures to satisfy**, both already written and tested against
`IndependentPointProjector`:

```rust
pub trait ContactTrialProjector {
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError>;
}

pub fn solve_contact_tick<P: ContactTrialProjector>(
    colliders: &mut [ContactCollider],
    projector: &mut P,
    state: &mut ContactSolverState,
    resolutions: &mut Vec<ContactResolution>,
    scratch: &mut ContactTickScratch,
) -> Result<u8, ResolutionError> { /* the pure multi-group driver */ }
```

Four preconditions live in code comments and nowhere else. `out` must come back the
same length as `before`, row for row: the greedy alpha search calls it up to eighteen
times per group and treats the last call as authoritative, so a dropped row silently
re-indexes the closure — `resolve_group_into` returns `ResolutionError::Projector`
rather than trusting it, because World's implementation is the one that runs a joint
clamp that can fail. `solve_contact_tick` rejects duplicate `(EntityId, slot)` rows
with `DuplicateIdentity` **in release**, not merely in debug. `GeneralizedCollider`
carries `entity`, `slot`, `kind`, `mass` and `velocity` and **no pose**, so World's
projector has to map closure index back to its own row by `(entity, slot)` itself; the
driver's `closure_index` is private and is not the hook. And the projector needs
`&mut self` — `inverse_hand` and `mirror_two_handed` write `self.arms` — at the same
time as it holds `&mut` on the runtime's scratch, colliders, resolutions and state.
That is possible only because `resolve_contact` already does `self.contact.take()`;
design the projector around that, because discovering it after writing one is a rewrite.

**Two deliberate temporaries in the code.** First, `clamp_contact_entry` stores
`linear_velocity = clamped - clamped_body`, which is the contract's arithmetic form at
*entry*. The *commit* rule is different — every contacted arm writes
`linear_velocity = final_relative_hand - previous_hand` — and the two agree only when
the joint clamp does not bite. The arithmetic form is authoritative solely because no
commit exists yet, and
`mixed_body_and_equipment_entry_clamps_translate_each_endpoint_once` asserts it, so
that test must be revisited when the commit lands. Second, `TickEntry::yaw` and
`TickEntry::grips` carry `#[allow(dead_code)]`; they are captured because the commit
stage reads them, and the allows come off then.

**What the green tests do not yet prove.** Two of the twelve present proofs are
currently vacuous in the half that names contact, and a fresh session should not read
them as coverage already banked.
`body_body_contact_remains_planar_and_single_sourced` scans
`world.contact_resolutions()` for a body-to-body key, and that slice is structurally
always empty; what it genuinely proves today is planar separation and zero Z.
`contact_cap_hashes_once_after_all_actuator_rows` is a real digest-unwind proof, but it
reaches its value by hand-setting `state.cap_hits = 1` because no production path
produces one. Both become live the moment the solve does.

**The named proofs still owed** are exactly the five absent from the required list
below: `repeated_crowded_separation_clamps_before_energy_and_sweep`,
`wall_settlement_never_increases_entity_closure_energy`,
`both_has_one_right_owned_collider_and_mirrors_after_contact`,
`contact_modified_pose_survives_replay_at_every_tick`, and
`dead_and_reused_slots_keep_contact_identity_and_hash_coverage`. The browser memory
test's cap fixture is blocked on the same solve and is marked in place at
`client/test/wasm-memory.test.mjs` (~L239), with its reasoning: a stubbed cap hit would
only prove the stub.

**What the five owed proofs will need.** Two already have exact fixtures in the
reference's required-proofs list and can be written straight from it:
`contact_modified_pose_survives_replay_at_every_tick` and
`dead_and_reused_slots_keep_contact_identity_and_hash_coverage`. The other three —
`repeated_crowded_separation_clamps_before_energy_and_sweep`,
`wall_settlement_never_increases_entity_closure_energy`, and
`both_has_one_right_owned_collider_and_mirrors_after_contact` — have one-line mentions
only, so their fixtures are still to be designed. Three practical notes that are not
written anywhere else. The replay proof cannot reuse `Scenario::articulated_duel()`:
that fixture spawns `(7,6)` and `(17,10)` and its fingerprint is pinned, while the
contract asks for seed 1000, Fighter `(10,8)`, Brute `(23/2,8)` — a new scenario is
required. Its template is `articulated_replays_reproduce_every_pose` in
`crates/sim/src/replay.rs` (~L284), and the per-tick pose comparison goes through
`World::articulated_pose_test_view` (~L1015). The reuse proof needs the private `free`
list (`World::free`, ~L190), which is where a dead slot has to be pushed for the
respawn to land on generation 1.

**Two decisions C still owns.** The first is deferred explicitly by the contract, in
[`contact-solver.md`](../reference/contact-solver.md#impulses-and-exact-energy-rule): a
mid-tick `Err` from the driver leaves collider rows partly advanced. That is harmless
while the rows are the caller's own scratch, which is all checkpoint B had, but C hands
`World` columns to the driver, where a partial advance is a half-written world. Decide
between advancing a copy and swapping on success, or treating any `ResolutionError` as
fatal — and record the choice there, not only here.

The second is a genuine ambiguity nothing has resolved yet. The contract says to commit
each changed body endpoint "through the existing wall-settlement path exactly once",
but never names it, and there are two candidates: `World::settle`
(`crates/sim/src/world.rs` ~L4122), which clamps to the arena, zeroes only the clipped
axis, and resolves tiles; and its caller `World::move_body` (~L4088), which settles in
up to four swept sub-steps. They are not interchangeable, and "exactly once" means
different things for each. Pick one, say why in place, and make
`wall_settlement_never_increases_entity_closure_energy` the proof that the choice holds.

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
