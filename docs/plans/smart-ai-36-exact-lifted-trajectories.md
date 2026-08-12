# Smart AI 36 -- exact lifted trajectory authority

**Status:** planned feature/test-only successor to session 35's trajectory hard stop.
It does not select a new response, enable a feature by default, run Lab, or authorize
an existing hash move.

Session 34 proved the scalar and XYZ remainder arithmetic. Session 35 then reached
the representation boundary: one body translation plus one held translation cannot
replace the current articulated sweep. A sword's hilt and tip, and a shield's four
corners, follow independently rotating motor trajectories inside the tick. Treating
the lifted coordinate as their whole position either erases that rotation or rebuilds
it from rounded endpoints after every contact. Both answers lose the remainder the
new state exists to preserve.

This session makes that distinction explicit. The scalar actuator continues to own
the commanded **motor trajectory**. Contact owns a piecewise-affine **response
translation** shared by all endpoints of one rigid row. Their sum is the only contact
geometry evaluator, and both collision scan and commit call it. There is no parallel
fractional detector and no reconstruction of exact state from a published `Vec3`.

Read the [determinism contract](../reference/determinism.md#contract) before editing
`sim`. Every checkpoint below lands green by itself. A named refusal is a result;
rounding a remainder away to make the next checkpoint run is not.

## Exact model and invariants

For each live collider row and Cartesian endpoint `k`, define on one contact interval
`[g, 65_536]`:

```text
endpoint_k(t) = motor_k(t) + common_response(t) + held_response(t)
```

`held_response` is zero for a body. `motor_k(t)` is the existing actuator geometry:
body region bounds share the body motor translation; segment hilt and tip retain
their independently commanded paths; shield corners retain theirs. The response
terms are exact lifted coordinates. A body fact changes common momentum. A held-row
fact changes held-relative momentum. Response changes translate every endpoint of
that row equally, so this point-mass contact model introduces no unrecorded angular
impulse.

At a group time, integrate the old response to the breakpoint, apply the exact
impulse, and start the next affine interval from that exact position. Never integrate
the new momentum over time before the fact. For the retained strike the first
breakpoint remains `55_704`, with `9_832` raw tick units remaining.

Use checked signed rational words. Denominators are positive and canonical; quotient
and remainder use Rust's toward-zero division and have matching signs. Comparisons,
energy, and collision predicates cross-multiply in checked `i128`. No float, gcd loop,
heap-backed bigint, saturation, or host-dependent wide operation is allowed.

Body common Z is constrained to the floor. An attempted body-Z impulse leaves common
Z exactly zero and emits a named `FloorReaction` containing the rejected momentum and
exact rational energy change. Held-relative Z remains legal. Silently dropping body Z
or putting it into a held remainder is a rejection-path bug.

## Checkpoint A -- pure trajectory grammar

Add crate-private pure types beside the lifted arithmetic in
`crates/sim/src/combat/resolution.rs`:

```rust
struct ExactAffine3 { at_group: [ExactPosition; 3], momentum: [ExactMomentum; 3] }

enum MotorShape {
    Body { origin: ExactMotorPoint, parts: [ExactMotorBounds; BodyPart::COUNT] },
    Segment { hilt: ExactMotorPoint, tip: ExactMotorPoint, radius_raw: i32 },
    Shield { corners: [ExactMotorPoint; 4] },
}

struct ExactOwnerTrajectory {
    entity: EntityId,
    common_response: ExactAffine3,
    held_response: [Option<ExactAffine3>; 2],
}

struct ExactContactTrajectory {
    entity: EntityId,
    slot: u8,
    kind: GeneralizedKind,
    mass_raw: i32,
    motor: MotorShape,
    owner_index: usize,
    held_index: Option<usize>,
    group_time_raw: u32,
}

struct ExactImpulseOutcome {
    owners: FixedExactOwners,
    floor_reactions: FixedFloorReactions,
}
```

The names may follow surrounding code, but the fields and ownership may not be
collapsed. Motor points retain both independently commanded endpoint coefficients;
response state contains translation only. Full identity is owner `EntityId`
(including its generation), limb slot, kind, and carried `EquipmentSpecId`. Equipment
specs are immutable table IDs and have no generation of their own; do not invent an
equipment-generation word.

Implement:

```rust
fn evaluate_exact(row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
                  global_time_raw: u32)
    -> Result<EvaluatedContactShape, ExactTrajectoryReject>;
fn advance_exact(owners: &[ExactOwnerTrajectory], next_group_raw: u32,
                 out: &mut FixedExactOwners) -> Result<(), ExactTrajectoryReject>;
fn apply_exact_impulse(rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
                       fact: ContactFact, impulse_on_a: [i64; 3])
    -> Result<ExactImpulseOutcome, ExactTrajectoryReject>;
```

Common response exists once per owner, never copied into each collider row. A body and
both held rows reference that one word set; a duplicate copy would let two rows apply
or integrate the same body impulse differently. `FixedExactOwners` and
`FixedFloorReactions` are caller-owned arrays bounded by the existing closure and
fact maxima. Returning a complete outcome keeps floor reaction and state atomic.

All rows and both fact identities are validated before mutation. Refuse duplicate
identity, wrong generation/slot/kind/spec, descending time, time past one tick,
body-Z impulse, inactive nonzero held state, more than two distinct held rows for one
owner, denominator mismatch, and arithmetic overflow.

Required tests:

```rust
#[test] fn exact_motor_rotation_and_response_translation_are_independent() {}
#[test] fn two_breakpoints_integrate_each_momentum_over_only_its_own_interval() {}
#[test] fn retained_toi_55704_leaves_exactly_9832_response_units() {}
#[test] fn body_floor_z_is_a_named_external_reaction_and_held_z_is_retained() {}
#[test] fn exact_trajectory_validation_is_atomic_under_identity_time_and_overflow_errors() {}
#[test] fn sign_mirror_and_xy_permutation_map_every_endpoint_and_remainder() {}
```

The rotating-segment fixture must have unequal hilt/tip motor slopes and a nondividing
XYZ response translation. Mutating the evaluator to translate the tip twice, derive
the tip from the hilt, apply post-impact momentum before the breakpoint, use an
equipment generation, or discard a negative remainder must make a named test red.

Checkpoint A adds no World field and therefore no hash word.

## Checkpoint B -- one evaluator inside the existing detector

Refactor the existing contact primitives in `crates/sim/src/combat/contact.rs` to read
an `ExactContactTrajectory` through `evaluate_exact`. Do not add a second candidate
scan. `scan_candidates_into`, group recomputation, suppression, and canonical
`ContactKey` ordering remain the sole detector and retain their fixed scratch.

The current CCD equations become checked rational predicates over the affine endpoint
coefficients. They still return the earliest representable `TimeOfImpact` raw word.
Candidate verification evaluates exact geometry at that word and its adjacent raw
word where one exists; this pins the lower-bound/tie rule without sampling all 65,537
times. A predicate whose checked coefficients cannot establish the same monotone
bracket is rejected as `UnsupportedExactSweep`, not handed to the old rounded row.

Provide a compatibility adapter that creates zero-response exact trajectories from
the current `ContactCollider`. Production uses the refactored detector through this
adapter in both default and feature builds. The adapter is temporary input provenance,
not an alternate detector and not permission to reconstruct a nonzero response.

Required tests:

```rust
#[test] fn zero_response_exact_scan_is_byte_equal_to_the_contact_corpus() {}
#[test] fn one_raw_remainder_changes_toi_only_when_the_exact_boundary_crosses() {}
#[test] fn rotating_segment_contact_uses_both_endpoint_motor_coefficients() {}
#[test] fn group_recomputation_and_commit_evaluate_the_identical_breakpoint_geometry() {}
#[test] fn unsupported_exact_sweep_refuses_before_candidate_or_scratch_mutation() {}
#[test] fn exact_scan_grows_no_retained_capacity_after_reservation() {}
```

Pin the complete existing contact-format and behavioral corpora byte-for-byte. Mutate
the detector back to rounded endpoint interpolation and require the remainder-boundary
fixture to fail; zero only the response in the same mutation and require the corpus
control to remain green. This distinguishes new evidence from accidental behavior
drift.

**Hard stop:** if any shape needs a second scan, brute-force time enumeration, or a
rounded endpoint fallback for nonzero response, close `revise`.

## Checkpoint C -- World state and hash land together

Only after A and B pass, add a fixed `ExactOwnerTrajectory` column to `World` under
`cartesian-recoil`. In the same change, append its fixed grammar to the authoritative
state hash. There is no intermediate commit in which World owns an unhashed exact
remainder.

Reserve one entry per allocated slot with the existing high-water columns. Each entry
contains body common response plus two limb-owned held responses and exact carried
spec tags. Inactive entries are all-zero. A new/reused entity generation starts
canonical; ordinary actuator motion updates motor coefficients without disturbing
response remainders; grip identity transitions go through the lifecycle checkpoint,
never through row reconstruction.

Hash in entity order, then common XYZ, then left/right held tag and XYZ. For every
coordinate write velocity quotient, momentum remainder, position quotient, position
remainder in that order. Hash owner generation once with the entity's existing
identity grammar and write only the immutable equipment spec ID in the held tag.
Mutation tests cover every tag and word, inactive poison, limb ordering, sign mirror,
and slot reuse.

Required tests:

```rust
#[test] fn first_authoritative_exact_field_and_its_hash_land_in_the_same_transition() {}
#[test] fn ordinary_actuation_changes_motor_coefficients_without_erasing_response() {}
#[test] fn inactive_and_reused_slots_are_canonical_before_their_first_scan() {}
#[test] fn every_exact_trajectory_hash_word_is_load_bearing_in_fixed_entity_limb_xyz_order() {}
```

Checkpoint C introduces one new feature-only digest, `EXACT_TRAJECTORY_STATE_DIGEST`,
after native/wasm agreement. It may not move an existing registered pin.

## Checkpoint D -- contact, finalization, commit, and lifecycle

Teach the existing `solve_contact_tick` path to operate on the World trajectory column
under the feature. The same scan finds the group, the same response-independent
finalizer allocates its exact dissipated energy, and the same `after_group` applies
anatomy. The selected test impulse is frozen input; this session still does not choose
a response law.

Before each group snapshot the exact closure. Advance to the breakpoint, apply the
frozen impulse, recompute the next scan from the same trajectories, and finish at one
tick. `commit_contact_row` reads `evaluate_exact(..., 65_536)` for body origin, segment
hilt/tip, or shield corners. It must not call `inverse_hand`, read a rounded
`GeneralizedCollider` back into exact state, or integrate the remaining interval a
second time. Public hand and whole-tick `linear_velocity` are quotients of the exact
committed endpoints; the exact remainder remains in World.

Replace the feature path's floored closure-energy decision with checked rational
energy from the exact owner state, but reuse `finalize_projected_group`'s attribution,
weighting, channels, resolution ordering, and anatomy hook. Extend its caller-owned
scratch rather than allocating per group. Positive exact loss with zero physical
weight is refused before mutation.

Lifecycle transitions reuse session 25's measured reasons but operate on exact state:
release, replacement, severance, cap, wall, `Both`, and reuse snapshot before state,
compute complete after state and exact rational external ledger, validate, then commit
atomically. A wall replaces only constrained body-normal momentum, preserves tangent
and held-relative Z, and records the floor/wall external reaction once. Rejected grip
transactions and body-only contacts are byte identity.

Required tests:

```rust
#[test] fn retained_exact_strike_scans_finalizes_damages_and_commits_one_trajectory() {}
#[test] fn a_second_group_reads_the_first_groups_exact_endpoint_without_double_integration() {}
#[test] fn exact_commit_and_next_tick_preserve_nonzero_position_and_momentum_remainders() {}
#[test] fn exact_allocation_uses_rational_loss_and_grows_no_group_scratch() {}
#[test] fn release_replacement_severance_cap_wall_and_reuse_ledger_exact_state_once() {}
#[test] fn rejected_transaction_body_only_contact_and_resolution_error_are_atomic() {}
```

Independently assert fact identity, TOI, endpoint words, rational energy, allocation
shares, channel words, target region/all-other-region equality, committed hand/body,
and next-tick state. A test that calls allocation or anatomy manually is composition
evidence, not this gate.

## Checkpoint E -- replay and native/wasm equality

Drive an ordinary recorded-command fixture twice live and once through replay. It must
create nonzero momentum and position remainders without direct state poisoning, cross
two contact breakpoints, then exercise release and one wall or cap reaction. Compare
at every tick: digest, exact trajectory column, contact resolutions, anatomy, grips,
and exact external ledger. Require every claimed state and clear reason to occur.

Pass `cartesian-recoil` through `crates/web` and export the feature-only
`EXACT_TRAJECTORY_STATE_DIGEST`. Build native and wasm with the identical feature set
and require equality. Default web and sim artifacts remain byte-identical.

Required tests:

```rust
#[test] fn exact_trajectory_live_rerun_matches_every_tick_and_breakpoint() {}
#[test] fn exact_trajectory_replay_matches_state_resolution_anatomy_and_ledger() {}
#[test] fn native_and_wasm_hash_the_same_exact_trajectory_grammar() {}
```

## Authority and pin budget

Passing A--E proves trajectory and lifecycle authority only. It does not validate a
normal/friction solve, promote the feature, or establish tactical competence. A
successor must predeclare the exact lifted response law and corpus before default
promotion.

**Existing registered pin movement budget: zero.** `LAB_HASH`, `ROOM_HASH`,
`ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`, contact-format pins,
`ARTICULATED_STREAM_DIGEST`, combat fingerprints, legacy pins, and
`LEARNED_INFERENCE_DIGEST` remain byte-identical. Checkpoint C may add exactly one new
feature-only `EXACT_TRAJECTORY_STATE_DIGEST`; after its first native/wasm agreement it
is not re-recorded in this session. Any default move stops the session.

## Verification

```powershell
cargo test -p sim exact_motor_rotation -- --nocapture
cargo test -p sim exact_scan -- --nocapture
cargo test -p sim --features cartesian-recoil exact_trajectory -- --nocapture
cargo test -p sim --features cartesian-recoil retained_exact_strike -- --nocapture
cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Do not run Lab calibration, a tactical corpus, a default pin generator, or any hash
re-record command.
