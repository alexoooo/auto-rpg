# v2-15 — separate body specification from wound state

**Goal:** replace the temporary articulated body capsule with the regional volumes,
armor transfer, wounds, blood, impairment, severance, and one derived health query
specified by [`anatomy-health.md`](../reference/anatomy-health.md).

**Depends on:** `v2-14` and immutable specs from `v2-12`.

**Golden expectation:** every legacy hash remains byte-identical; no articulated pin.

## Landable implementation

Consume the already frozen `BodyAnatomySpec` and `EquipmentSpec` fields in
`crates/sim/src/combat/spec.rs`; do not append immutable schema bytes. Add
`crates/sim/src/anatomy.rs`. Use the exact
discriminants and field order in the reference:

```rust
pub use crate::combat::spec::AnatomyRegion as BodyPart;
pub struct PartWoundState { pub integrity: Fx, pub wound: Fx, pub severed: bool }
pub struct AnatomyState {
    pub parts: [PartWoundState; BodyPart::COUNT],
    pub blood: Fx,
    pub shock: Fx,
    pub last_attacker: EntityId,
}
```

Immutable dimensions, maxima, armor coverage/material, grip bindings, and fixture
definitions enter scenario fingerprints and replay construction in canonical field
order. Mutable anatomy enters only articulated state hashing, in entity identity and
`BodyPart` order. `ContactSolverState` remains separate.

Expand a weapon/body candidate to the five volumes in the reference. Resolve all
facts in a time group into deltas from one immutable anatomy snapshot, apply the
deltas together, then derive death and outcome. This is what preserves mutual kills.
Run bleed and shock decay once at the articulated tick's anatomy phase. Do not call
legacy regeneration in that branch.

Every consumer -- observation, frame/pose publication, timeout comparison, outcome,
and damage credit -- calls the reference health query. Do not add an articulated HP
cache. Legacy worlds continue to use `hp`, `max_hp`, `regen_left`, their existing
events, and their existing query byte-for-byte.

## Tests and verification

```text
immutable_armor_and_dimensions_cannot_drift_from_scenario_identity
body_part_discriminants_and_hash_order_are_stable
high_low_and_intermediate_contacts_choose_stable_regions
overlapping_regions_use_axis_distance_then_body_part_order
shallow_plate_deflects_more_than_a_square_hit_without_adding_energy
armor_transfer_conserves_the_incident_energy_budget_exactly
a_severed_right_arm_cannot_drive_its_weapon
a_severed_left_arm_cannot_hold_its_shield
leg_injury_reduces_acceleration_not_requested_direction
shock_scales_control_and_decays_by_the_documented_raw_amount
bleeding_can_end_a_fight_after_contact
bleeding_damage_is_credited_to_the_recorded_wound_source
simultaneous_fatal_contacts_kill_both_fighters
health_observation_frame_fitness_and_outcome_share_one_derivation
legacy_health_and_regeneration_are_byte_identical
every_mutable_anatomy_field_changes_only_articulated_hashing
last_attacker_identity_is_hashed_and_owns_later_bleed_credit
```

```powershell
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
