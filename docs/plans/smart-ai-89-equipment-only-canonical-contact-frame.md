# Smart AI 89 -- define the equipment-only canonical contact frame

**Status:** bounded fallback complete; overall feature investigation stopped. The
nine direct frame/grammar tests and all 91 resolution tests are green after the final
exact-one correction. The post-correction full feature run is
`647 passed; 25 failed; 3 ignored`, improving the prior 28 failures and removing the
resolution-side recompute blocker. One capacity/rollback fixture was correctly
reserved before comparing capacities now that Smart89 reaches the group. Source
review found and corrected a missing required guard: the no-Body branch now
requires `owned_rows == 1`, and a ninth direct test supplies an ordinary second
well-formed held row and requires `CompatibilityIdentity`. No repin, corpus,
or shared production fix for the remaining 25 is authorized; Smart90 owns the first
replay/World diagnosis.

## A -- exact frame-selection law

Edit only `crates/sim/src/combat/contact.rs` for production. Refactor
`wide_owner_motor_frame` into the following ordered rule:

1. Validate owner identity in both directions over the complete trajectory slice:
   every row with `canonical_a.owner_index` must have `canonical_a.entity`, and every
   row with `canonical_a.entity` must have `canonical_a.owner_index`. A second entity
   sharing the owner index or the same entity using a second owner index is
   `CompatibilityIdentity`, independent of row order.
2. Validate the canonical `(entity, slot, owner_index)` tuple occurs exactly once.
   That row must be present `GeneralizedKind::Equipment`, have
   `held_index == Some(slot as usize)` with `slot < 2`, carry
   `Some(equipment_spec)`, and have `MotorShape::Segment`. This exact rule serves
   WeaponWeapon, WeaponShield and WeaponBody, whose canonical key.a is the segment.
   A duplicate tuple or a row matching only some identity fields refuses.
3. Count every owned `MotorShape::Body` row before choosing a branch. Exactly one is
   valid only when it is present, `GeneralizedKind::Body`, `slot == BODY_SLOT`, with
   no held index or equipment spec. It returns `origin.at_tick_start_raw`. Zero
   proceeds to fallback; two Bodies, or a Body motor with any malformed tag/kind/
   slot/presence, refuses regardless of order. A valid Body may coexist with ordinary
   well-formed held Segment/Shield rows; those do not disable Body preference.
   Audit every other owned row before returning: it must be
   `GeneralizedKind::Equipment`, have `held_index == Some(slot as usize)` with
   `slot < 2`, carry an equipment spec, and use Segment or Shield motor grammar. Its
   presence may reflect ordinary lifecycle state; only the selected canonical row and
   Body are required present. A Body kind with equipment motor, Equipment kind with
   Body motor, or partially tagged row refuses even when a separate valid Body exists.
4. Only with zero Body rows may fallback occur, and then the owned-row set must contain
   exactly the one validated canonical segment. Return its hilt's
   `at_tick_start_raw`. A Shield, second held row, or partial body-like owner grammar
   does not silently fall back.

The fallback frame is integral and derived from key.a's immutable tick-start motor,
never its current exact point, compatibility collider, response, key.b or iteration
order. It therefore obeys translation equivariance: adding integral vector `T` to all
motor points changes the frame and published point by `T`, leaving normal, distance,
velocity and tie order unchanged. Under planar reflection with constant `C`, frame X
maps as `C - frame.x`, Y maps by sign, Z is unchanged, and double reflection restores
every word. Production World continues the Body branch even if key.a hilt differs
from body origin; fallback must never replace a present valid body. Key.b belongs to
a different owner and cannot affect key.a's frame: equipment-only WeaponShield with
key.b Shield and WeaponBody with key.b Body are explicit controls.

Do not repair this by fabricating body trajectories in `zero_response_compatibility`:
that would change scan grammar, row counts/identities and owner mass provenance merely
to satisfy a publication helper.

## B -- direct grammar and reflection tests

```rust
#[test] fn equipment_only_weapon_pair_uses_canonical_a_tick_start_hilt_frame() {}
#[test] fn equipment_only_weapon_shield_uses_segment_a_not_shield_b_frame() {}
#[test] fn equipment_only_weapon_body_uses_segment_a_not_body_b_frame() {}
#[test] fn equipment_only_frame_translates_and_reflects_every_published_word() {}
#[test] fn world_weapon_pair_prefers_the_canonical_owner_body_frame() {}
#[test] fn world_body_frame_allows_well_formed_additional_held_rows() {}
#[test] fn malformed_or_ambiguous_owner_grammar_never_takes_the_fallback() {}
#[test] fn body_row_order_cannot_change_the_selected_contact_frame() {}
#[test] fn equipment_only_second_held_row_refuses_the_fallback() {}
```

Freeze Smart88's `t=0`, `0:1/1:1` pair. Require a successful fact with point zero,
positive-X normal and velocities `+16384/-16384`, and exact equality with the rounded
behavior row. Translate and reflect both equipment-only trajectories and assert the
law above, including double reflection. Add equipment-only WeaponShield and
WeaponBody fixtures whose key.b is respectively another owner's Shield and Body;
require key.a's segment fallback and unchanged pair kind/publication. Add a World-
shaped fixture whose body origin and segment hilt deliberately differ, plus ordinary
well-formed held Segment/Shield rows; assert the body origin wins and every published
word matches the pre-Smart89 body-frame route.

Refusal fixtures cover duplicate canonical tuple; same owner index with another
entity; same entity with another owner index; wrong slot; absent canonical row;
non-Equipment/non-Segment canonical row; `held_index != slot`, slot `>=2`, missing
spec or missing presence; Shield-only owner; two no-Body equipment rows; duplicate
Body in both orders; and Body motor with wrong kind, slot, presence, held/spec tag or
cross-owner identity. Mutation proof: validate only one direction of entity/index
consistency (paired direction fixture red), stop at the first Body (order fixture red),
choose hilt despite a valid Body (World preference red), reject a valid Body because
a normal held row exists (World-held control red), use current/requested hilt
(translation/time red), use key.b (WeaponShield/WeaponBody controls red), permit a
second no-Body equipment row (ambiguity red), and fabricate a zero-response Body row
(row-grammar red). Restore every mutation.

## C -- feature regression and behavior boundary

Run the previously blocked tests first:

```text
a_solved_group_grows_no_retained_scratch
exact_feature_resolution_no_longer_calls_the_proposal_alpha_ray
zero_response_exact_scan_is_byte_equal_to_every_behavior_case
```

Then run the complete feature suite and account for every failure by exact name. This
repair should remove equipment-only `Recompute/CompatibilityIdentity` refusals; it
must not change World Body-frame facts. A new arithmetic/refusal mismatch stops rather
than widening the fallback. Smart87 geometry remains absent in this session, so any
remaining known stack-path reds are reported separately and do not authorize geometry
reapplication inside Smart89.

This path is feature/test-only, so no registered default pin is predicted to move.
Record the native feature digest twice only if the full feature suite reaches it; a
changed value is expected only if the pure equipment-only fixture contributes to that
unregistered witness, and must be explained rather than pinned. Default geometry,
contact behavior and articulated stream pins must remain unchanged.

## D -- gates and successor

```powershell
cargo test -p sim equipment_only_weapon_pair --features cartesian-recoil -- --nocapture
cargo test -p sim equipment_only_weapon_shield --features cartesian-recoil -- --nocapture
cargo test -p sim equipment_only_weapon_body --features cartesian-recoil -- --nocapture
cargo test -p sim equipment_only_frame_translates --features cartesian-recoil -- --nocapture
cargo test -p sim world_weapon_pair_prefers --features cartesian-recoil -- --nocapture
cargo test -p sim world_body_frame_allows --features cartesian-recoil -- --nocapture
cargo test -p sim malformed_or_ambiguous_owner --features cartesian-recoil -- --nocapture
cargo test -p sim a_solved_group_grows_no_retained_scratch --features cartesian-recoil -- --nocapture
cargo test -p sim exact_feature_resolution_no_longer --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_exact_scan --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Show each new test red under its named mutation and green after restoration. If all
gates pass, retain only the bounded frame fallback and stop. Smart90 may then reapply
the already measured Smart87 geometry and run the feature wasm stream. Smart89 runs
no pin update, full mechanics audit or 7,560-case corpus.

## Current isolated result and stop

The eight direct tests for WeaponWeapon, WeaponShield, WeaponBody, reflection,
Body preference, additional held rows, malformed grammar and row order are green.
Every one of the 91 `combat::resolution` tests is green, including
`a_solved_group_grows_no_retained_scratch`,
`exact_feature_resolution_no_longer_calls_the_proposal_alpha_ray`, and
`zero_response_exact_scan_is_byte_equal_to_every_behavior_case`. The rollback
capacity fixture now reserves the production trial width before taking its capacity
snapshot because Smart89 reaches the group that the old publication refusal skipped;
this is a test precondition repair, not a mechanics change.

The final post-correction full feature command recorded in
`target/smart89-feature-final.log` reports:

```text
647 passed; 25 failed; 3 ignored; 0 measured; 0 filtered out
```

The failures are one replay test and 24 World tests. Their assertions are not one
measured cause: examples include `ResolutionCount` versus `ExactSolver`, inactive
two-handed response, zero versus frozen impulse/time/recoil words, different search
evaluation counts, and retained-allocation witnesses. They are the surviving subset
of the already-red feature baseline, not evidence that one production fix is owed.
No Smart90/repin/corpus plan follows from this log.

Source audit found that the no-Body fallback rejected only
`owned_rows == 0`; it could therefore admit two distinct well-formed equipment rows,
contrary to checkpoint A's exact-one grammar. Production now refuses
`owned_rows != 1`, and `equipment_only_second_held_row_refuses_the_fallback` freezes
the missing ordinary second-row case. All nine direct tests and all 91 resolution
tests passed after that correction. The full feature rerun then recorded
`647/25/3`; Smart89 is complete within its bounded grammar repair, but the feature
suite remains red. The 25 surviving failures receive no shared production plan
without a measured first common cause; Smart90 begins with the replay tick-79 drop.
