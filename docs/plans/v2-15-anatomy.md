# v2-15 — separate body specification from wound state

**Status: complete (2026-08-09).** Green on `cargo test`, `lab verify --seeds 200`,
`node --test tools/wasm_check.js`, and `node tools/check_docs.js`.

**Goal:** replace the temporary articulated body capsule with the regional volumes,
armor transfer, wounds, blood, impairment, severance, and one derived health query
specified by [`anatomy-health.md`](../reference/anatomy-health.md).

**Depends on:** `v2-14` and immutable specs from `v2-12`.

**Golden expectation:** every legacy hash remains byte-identical; no articulated pin.
Held: `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, and
`BOW_HASH` are all unchanged, and no `ARTICULATED_HASH` was created. Two mechanics
pins moved as predicted and are re-recorded in both owners plus the
[golden registry](../reference/hashes.md#golden-registry):

- `ARTICULATED_COMMAND_HASH` `0x010411d521a376d7` → `0x6e61a92ec96ac3a6`, because the
  ArticulatedV1 digest now appends one 61-byte anatomy row per allocated slot.
- `CONTACT_BEHAVIOR_DIGEST` `0xfe6ce41ec023c1e5` → `0x587b0259e877105a`, by exactly one
  byte: corpus case 6's body is now five coincident regional volumes, so its fact
  names the region the tie-break chose and the region byte went `0xff` → `0`.

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

### What landed, and where it differs from the sketch above

- `World::wounds: Vec<AnatomyState>` is the mutable column, empty in every Legacy
  world. `World::anatomy_spec/health_of/max_health_of/health_fraction_of` are the one
  routing seam; `legacy_hp_frac` is what `set_stats` still rescales through.
- The articulated tick gained two phases: `anatomy` (bleed, shock decay, impairment
  factors, released grips) after `contact`, and `reap` after `doors`.
- Wounds land **inside** the solver, through a new
  `ContactTrialProjector::after_group` hook, because a severance has to leave the
  geometry in the tick that made it. The default implementation does nothing, so the
  pure fixtures still drive the pure driver.
- `ContactShape::Body` now carries `previous_origin`, `requested_origin`, and five
  `RegionSweep`s; `ContactCollider` gained `present`, which a severance clears.
- All five volumes sweep through `fx::swept_segment_segment` rather than the vertical
  capsule form: two of them are arms and point wherever the actuator left them, and
  the two primitives agree exactly on a vertical target.
- The reference left one sentence ambiguous -- "preserve cut/thrust ratio ... thrust
  receives the final rounding remainder". It is now written out: integrity takes the
  whole loss, the **wound** is the cut share of it, and thrust is the remainder so the
  two are exactly the loss. That is the only reading under which the rounding sentence
  does any work, and it makes a pure thrust start no bleed clock.
- The reference's credit rule was tightened rather than transcribed. "Credited from
  that fact's applied loss ... clamped to the actual decrease of the health query"
  mixes two units: the torso is worth two sixths of the weighted fraction, so the same
  integrity taken there moves health twice as far as it does on a limb, and crediting
  the loss directly pays two attackers differently for the same damage -- while the
  *bleed* credit already reports the query's own decrease. Credit is now the decrease,
  split between the group's facts in `ContactKey` order in proportion to what each
  applied, with the last contributor taking the remainder. The words still hold; the
  units now agree with the bleed path.

### Corrections from adversarial review

Two adversarial passes ran after the first green result. The first read the diff
against the contract; the second built a mutation-testing copy of the workspace and
ran ~15 targeted mutations of the production code against the suite, which is what
found the coverage holes rather than the logic ones.

Four defects from the first pass, all fixed and all now covered:

1. **A severed non-arm region came back at the tick boundary.** The collider builder
   hardcoded `present: true` for head, torso and legs and read the anatomy only for
   the two arms. Death is head, torso, or blood, so a body fights on with its legs
   destroyed -- and the rebuilt legs then soaked every low strike and wounded nothing.
   `body_region_volumes` now takes presence for all five.
   (`a_severed_region_stays_absent_on_the_next_tick`.)
2. **`ContactResolution::severed` was stamped on facts that applied nothing**,
   including a fact whose region another member of the same group had finished off.
   It is now set only on a fact with a positive applied loss.
3. **Credit was in integrity units while the bleed credit was in health units** -- see
   above.
4. **The browser no-growth probe did not enumerate the four new scratch vectors**, so
   a reservation regression in any of them would have been invisible.
   `contact_capacities()` now lists them.

And from the second pass, one more defect and four holes where a mutation of the
production code left the suite green:

5. **A two-handed weapon outlived the arm it needed for one tick.** The mid-tick
   equipment drop keyed off the collider's own slot, and a `Both` item is owned by
   the right arm -- so severing the *left* arm left the weapon swinging until
   `release_severed_grips` dropped both hands at tick end. The two rules now agree.
   (`a_two_handed_weapon_leaves_the_tick_when_either_arm_does`.)
6. `after_group`'s third pass could be replaced by `continue` with the suite still
   green, and its equipment branch never executed at all -- every severance fixture
   wrote the flag *before* the tick, so the grip was masked and no equipment row ever
   existed. (`a_severance_leaves_the_tick_it_happened_in` arms the target's struck
   limb and severs it mid-tick.)
7. `severed` could be stamped on every row, or hardcoded true, unnoticed: every
   fixture scaled its target to one raw unit, so every landed blow severed.
   (`a_blow_that_does_not_empty_a_region_wounds_without_severing` and
   `a_blow_that_penetrated_nothing_reports_no_severance`, the latter using a blade
   with both surface factors zeroed -- the only way to build a fact that reaches a
   body and applies nothing.)
8. The credit split could be made equal, or lose its remainder rule, unnoticed: the
   only two-fact fixture had two identical blows and an even decrease.
   (`credit_for_one_group_is_split_between_its_blows_and_sums_to_the_loss` gives the
   two attackers a sword and a club.)
9. The per-region armour lookup could read `armor[Head]` for every region unnoticed,
   because the plate fixture wore a uniform suit. It now plates one region and checks
   that the same plate worn elsewhere does nothing.

One over-claim was also withdrawn rather than fixed:
`the_widened_transfer_order_is_not_interchangeable` claimed to catch permuting the
factors *within* the deflection chain. It does not, and at no values tried can it --
fixed-point multiplication commutes and the intermediate floor lands in the same
place. The test is now `absorption_is_billed_on_what_deflection_leaves`, which claims
only the stage order it does catch; the exact triple is what pins the rest.

Both passes confirmed no determinism hazard, no legacy contamination, and that the
`core::mem::take` of the wound column cannot be observed empty or leak on the error
path. Every fix above was re-verified by mutating the production code and watching
the named test fail.

### Two measurements worth carrying into v2-17

Both are recorded in
[`anatomy-health.md`](../reference/anatomy-health.md#measured-limits-this-session-found).

1. **Emergent wounds are near-nil at the shipped roster's scale.** An equipment
   collider carries one generalized point velocity -- body plus *hand* -- so a swing's
   tip speed is not represented, and the dissipated energy that reaches `channels` is
   routinely under the raw-144 floor and lands entirely in pressure. Every wound test
   scales the target's regional maxima down, exactly as the mechanical gate's
   severance case already specifies. `v2-17` cannot assume a stat-driven fight wounds
   anybody.
2. **A mirrored pair of blows cannot both close at a tick-start overlap**, because the
   `toi.raw==0` normal is world `+X` unconditionally and the two closing terms are
   exact negations. A genuinely simultaneous two-blow mutual kill needs positive-time
   contacts. Death is unaffected: it is derived once after the whole tick.

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

All seventeen exist. Fifteen more were added where one name could not carry the claim
on its own:

```text
an_unwounded_body_answers_its_immutable_maximum
health_is_the_lesser_of_blood_and_the_weighted_regional_fraction
a_cut_opens_the_wound_a_thrust_only_crushes
bleeding_drains_wounds_and_severances_at_the_documented_rates
absorption_is_billed_on_what_deflection_leaves
the_five_region_volumes_are_a_sphere_two_columns_and_two_arms
a_severed_region_has_no_volume_left_to_hit
a_wounding_contact_records_its_region_shock_and_source
a_blow_that_does_not_empty_a_region_wounds_without_severing
a_blow_that_penetrated_nothing_reports_no_severance
worn_plate_turns_a_blow_the_bare_body_takes
two_blows_in_one_group_are_both_measured_against_the_pre_group_body
credit_for_one_group_is_split_between_its_blows_and_sums_to_the_loss
a_severance_leaves_the_tick_it_happened_in
a_two_handed_weapon_leaves_the_tick_when_either_arm_does
a_severed_region_stays_absent_on_the_next_tick
```

`a_wounding_contact_records_its_region_shock_and_source` is the one that proves a
*real* contact severs the region it names, which is what lets the two severed-limb
tests write the severance and stay about consequences -- with this roster two braced
weapons meet hand to hand, so a blow aimed at the arm that holds a weapon reaches the
guard arm across the body instead. `worn_plate_turns_a_blow_the_bare_body_takes` is
the only test that drives the outward region normal, the squareness of the approach,
and the widened transfer from a real contact; without it that whole block could be
replaced by `penetrating = incoming` unnoticed, because every shipped fixture wears
no plate. `two_blows_in_one_group_are_both_measured_against_the_pre_group_body` is
the only fixture that puts two facts on one body in one group, which is the rule the
plan calls "what preserves mutual kills".

```powershell
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
