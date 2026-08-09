# v2-12 — add inert deterministic combat geometry and immutable specs

**Status:** complete — v2-12a deterministic `fx` geometry and v2-12b immutable
simulation specs, codec V2, binding validation, and cross-target hook are implemented.

**Goal:** land the complete XYZ numeric vocabulary and scenario-owned immutable
combat definitions without connecting articulated contact or damage to `World::step`.

**Depends on:** `v2-10` and the value/codec half of `v2-11`. The equipment-aware
validation half of `World::submit_articulated_v1` deliberately waits for this session;
see [Combat specs](../reference/combat-specs.md#ownership-and-implementation-order).

**Golden expectation:** all six legacy state hashes remain byte-identical. Scenario
fingerprints for newly articulated fixtures are new values, not goldens. No
articulated state hash is pinned.

Read [Determinism](../reference/determinism.md#contract),
[Combat geometry](../reference/combat-geometry.md), and
[Combat specs](../reference/combat-specs.md) before editing.

## 1. XYZ values

Add `crates/fx/src/vec3.rs`, export `Vec3` from `crates/fx/src/lib.rs`, and implement
the exact public shape, widened arithmetic, bounds, and zero normalization in
[Combat geometry](../reference/combat-geometry.md#coordinates-and-bounds).
Do not reuse saturated `Vec3` subtraction inside closest-point comparisons: the
reference requires `i128` raw deltas so opposite extreme endpoints remain total.

Add these sentence-named tests beside the type:

```text
vec3_arithmetic_saturates_in_every_direction
vec3_dot_and_length_square_stage_before_saturating
normalized_or_zero_is_zero_only_for_the_zero_vector
```

The tests use every sign combination of `Fx::MIN`, `Fx::MAX`, zero, and epsilon.
Reachable construction bounds must also assert that no intermediate saturates.

## 2. Closest points and planes

Add `crates/fx/src/geom3.rs`, export its four functions and three public values,
and implement the rational candidate and tie-break rules under
[Segment closest points](../reference/combat-geometry.md#segment-closest-points).
Then implement `segment_plane` exactly as specified. Keep rational parameters in
`i128` until final point construction; do not compare rounded `Fx` distances.

Tests:

```text
crossed_segments_choose_the_crossing
parallel_and_coincident_segments_choose_the_documented_pair
zero_length_segments_are_points
closest_pair_ties_break_lexicographically
segment_plane_handles_endpoints_coincidence_and_a_zero_normal
segment_plane_reversal_complements_the_time
```

Each named frozen vector in the reference is a literal assertion, not an
approximate visual check.

## 3. Conservative sweeps

Implement `swept_segment_sphere` and `swept_segment_vertical_capsule` with the
96-step conservative-advancement contract. Return early at initial overlap and
at a stationary separation. Validate that the shipped construction envelope is
inside the cap; out-of-contract inputs remain total and conservatively fail to
time zero.

Tests:

```text
a_swept_segment_cannot_tunnel_through_a_sphere_or_capsule
tangent_and_zero_length_sweeps_have_stable_answers
stationary_separated_sweeps_have_no_contact
conservative_sweeps_finish_inside_the_iteration_cap
out_of_contract_sweeps_fail_conservatively_to_zero
```

The no-tunnelling test includes a segment crossing a diameter in one tick and a
point moving the maximum accepted four units. Assert the returned time is no
later than the analytic first contact and at most one raw time unit early.

## 4. Immutable construction

Create `crates/sim/src/combat/mod.rs` and `crates/sim/src/combat/spec.rs`. Add the
exact types, discriminants, limits, fixture values, validation, and canonical
`fingerprint_into` writer in [Combat specs](../reference/combat-specs.md).
Add `combat_specs` to `Scenario` and `articulated` to `UnitSpec`; update every
literal under `crates/sim`, `crates/policy`, and `crates/web` explicitly with
`None` for legacy construction. Do not hide the migration behind `Default`.

Implement [Replay codec V2](../reference/replay-codec-v2-combat-specs.md#compatibility-rule)
in `crates/sim/src/codec.rs`; codec V1 is frozen and receives no appended bytes.
Decode all tables into bounded temporary values, validate count/order/IDs/dimensions
and loadout agreement, then construct `Scenario`; no global lookup is allowed. Call
the same `fingerprint_into` writer from scenario identity and articulated state
construction so the two byte orders cannot drift.

Tests:

```text
immutable_specs_change_scenario_fingerprints
spec_ids_are_keys_and_not_registry_indexes
unknown_duplicate_missing_and_mismatched_specs_fail_closed
sword_right_shield_left_and_club_right_are_the_only_v1_fixtures
left_and_right_limb_slots_have_stable_discriminants
combat_specs_round_trip_in_documented_field_order
legacy_scenarios_carry_no_articulated_specs
codec_v1_legacy_replays_remain_readable_after_codec_v2_lands
codec_v1_articulated_replays_fail_with_missing_combat_specs
codec_v2_rejects_a_model_command_domain_or_presence_mismatch
```

After these tests pass, strengthen v2-11 equipment and grip checks against the
scenario-owned bindings. Retain the stable `MissingEquipment` result and exact
stored-fallback outcome; only the validation source changes.

## 5. Inert module boundary and cross-target digest

Create empty ownership modules `crates/sim/src/combat/{actuator.rs,geometry.rs,
contact.rs,resolution.rs}` and expose only `spec` from `combat/mod.rs` in this
session. Do not extract legacy `world.rs` code and do not call any new geometry
from `World::step`.

Add a native geometry digest fixture and test-purpose-only wasm exports
`combat_geometry_digest_lo/hi` as specified in
[Frozen test vectors](../reference/combat-geometry.md#frozen-test-vectors).
Mirror them in `tools/wasm_check.js`. The digest includes every `Option` tag and
every raw output field from the frozen and boundary corpora.

Test:

```text
geometry_results_match_across_threads_native_and_wasm
hand_built_geometry_outputs_have_the_documented_digest
```

The Rust half computes both the frozen corpus and the separate unpinned boundary
corpus on at least four scoped threads. The wasm checker compares the release
artifact's frozen digest to the same committed native value. The boundary digest
is compared between native threads and is never recorded as a second golden.
Rebuild wasm after any `fx` or `sim` edit before trusting the check.

## Verification

```powershell
cargo test -p fx
cargo test -p sim
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Pass means every named test is green, codec decode is bounded and fail-closed,
the geometry digest agrees native/thread/wasm, and all legacy hashes remain the
values in `docs/reference/hashes.md`. Do not record an articulated golden.
