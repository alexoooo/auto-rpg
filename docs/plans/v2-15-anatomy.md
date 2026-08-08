# v2-15 — separate body specification from wound state

**Goal:** replace the temporary body capsule with deterministic regional volumes,
armor, wounds, blood, impairment, and severance without creating a second health
authority.

**Depends on:** `v2-14` and immutable specs from `v2-12`.

**Golden expectation:** legacy hashes remain byte-identical; no articulated pin yet.

## Immutable and mutable ownership

Extend `BodyAnatomySpec` and `EquipmentSpec` in `crates/sim/src/combat/spec.rs`; add
mutable state in `crates/sim/src/anatomy.rs`:

```rust
pub enum BodyPart { Head, Torso, LeftArm, RightArm, Legs }
pub struct PartWoundState { pub integrity: Fx, pub wound: Fx, pub severed: bool }
pub struct AnatomyState {
    pub parts: [PartWoundState; BodyPart::COUNT],
    pub blood: Fx,
    pub shock: Fx,
}
```

Armor/material/coverage, region maxima, body dimensions, blood maximum, and grip
bindings are immutable specs and part of scenario fingerprint/replay construction.
Only integrity, wound, severance, blood, and shock are mutable and hashed here;
solver cap state stays in `ContactSolverState`, not anatomy. Volumes derive from spec plus current pose: head
sphere, torso capsule, two shoulder-to-hand capsules, and one combined leg volume.

## Consequences and compatibility

Facts are assigned by earliest contact, squared distance, then `BodyPart` order.
Material, coverage, incidence, and the energy ledger decide absorption/deflection.
All simultaneous facts resolve before death/outcome, preserving mutual kills.

For articulated worlds:

- death is authoritative when head integrity, torso integrity, or blood reaches zero;
- regeneration is zero in the first slice, rather than silently using legacy HP;
- arm integrity scales that arm's effort; severance disables its grip/equipment;
- leg integrity scales linear and angular acceleration, not requested directions;
- shock scales control authority and decays by fixed-point rule;
- damage credit is the decrease in the documented health summary caused by the
  resolver and is accumulated in the existing metric column;
- displayed/observed health is query-derived: zero when dead, otherwise max health
  times the minimum of blood fraction and weighted regional integrity fraction,
  where torso has weight two and every other region weight one;
- max health is derived from immutable spec; timeout fitness and frame health use the
  same query and never a second mutable cache.

Legacy worlds retain existing HP, regeneration, death, damage, observations, fitness,
and frames exactly. Document both paths in `docs/reference/anatomy-health.md`.

## Tests and verification

```text
immutable_armor_and_dimensions_cannot_drift_from_scenario_identity
high_low_and_intermediate_contacts_choose_stable_regions
shallow_plate_deflects_more_than_a_square_hit_without_adding_energy
a_severed_right_arm_cannot_drive_its_weapon
a_severed_left_arm_cannot_hold_its_shield
leg_injury_reduces_acceleration_not_requested_direction
bleeding_can_end_a_fight_after_contact
simultaneous_fatal_contacts_kill_both_fighters
health_observation_frame_fitness_and_outcome_share_one_derivation
legacy_health_and_regeneration_are_byte_identical
every_mutable_anatomy_field_changes_only_articulated_hashing
```

```powershell
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```
