# Smart AI 36 -- exact lifted trajectory authority

**Status:** checkpoints A, B, and C implemented feature/test-only; checkpoint D is
next. Nothing yet selects a new response, enables a feature by default, runs Lab, or
authorizes an existing hash move.

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
and remainder use Rust's toward-zero division and have matching signs. Scalar
trajectory integration and energy remain checked `i128`. Contact predicates may use
one reviewed, inline 4,096-bit word whose fixed ceiling belongs to the expression
envelope: safe Rust, 128 little-endian `u32` limbs, no allocation, and identical
native/wasm operations. This is not permission for arbitrary precision. No float,
GCD reduction loop, heap-backed bigint, saturation, or host-dependent wide operation
is allowed.

Body common Z is constrained to the floor. An attempted body-Z impulse leaves common
Z exactly zero and emits a named `FloorReaction` containing the rejected momentum and
the signed exact rational energy change of cancelling its hypothetical response
(`-J^2/2M` from canonical zero common Z). Held-relative Z remains legal. Silently dropping body Z
or putting it into a held remainder is a rejection-path bug.

## Checkpoint A -- pure trajectory grammar

Add crate-private pure types in `crates/sim/src/combat/trajectory.rs`, below both the
detector and resolver so those two consumers cannot own competing evaluators:

```rust
struct ExactAffine3 {
    mass_raw: i32,
    at_group: [ExactPosition; 3],
    momentum: [ExactMomentum; 3],
    group_time_raw: u32,
}

enum MotorShape {
    Body { origin: ExactMotorPoint, parts: [ExactMotorBounds; BodyPart::COUNT] },
    Segment { hilt: ExactMotorPoint, tip: ExactMotorPoint, radius_raw: i32 },
    Shield { corners: [ExactMotorPoint; 4] },
}

struct ExactOwnerTrajectory {
    entity: EntityId,
    body_mass_raw: i32,
    common_response: ExactAffine3,
    held_response: [Option<ExactHeldResponse>; 2],
}

struct ExactHeldResponse {
    slot: u8,
    spec_id: EquipmentSpecId,
    affine: ExactAffine3,
}

struct ExactContactTrajectory {
    entity: EntityId,
    slot: u8,
    kind: GeneralizedKind,
    mass_raw: i32,
    motor: MotorShape,
    owner_index: usize,
    held_index: Option<usize>,
    equipment_spec: Option<EquipmentSpecId>,
}

struct ExactImpulseOutcome {
    owners: FixedExactOwners,
    floor_reactions: FixedFloorReactions,
}
```

The original sketch put mass only on a collider row even though common response is
owner state, and required a spec-identity refusal without carrying a spec tag. The
implemented correction above makes those validations possible without searching
unrelated rows. Denominators are derived rather than stored: momentum uses
`mass_raw`, and position uses checked `mass_raw*65_536`, so denominator mismatch is
unrepresentable. Common mass must equal checked body plus active held masses. Motor
points retain both independently commanded endpoint coefficients; response state
contains translation only. Full identity is owner `EntityId` (including its
generation), limb slot, kind, and carried `EquipmentSpecId`. The transient row repeats
the spec only as provenance to validate against the owner-held tag. Equipment specs
are immutable table IDs and have no generation of their own; do not invent an
equipment-generation word. Group time belongs to each affine response, and every
active response of an owner must name the same breakpoint.

Implement:

```rust
fn evaluate_exact(row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
                  global_time_raw: u32)
    -> Result<EvaluatedContactShape, ExactTrajectoryReject>;
fn advance_exact(owners: &[ExactOwnerTrajectory], next_group_raw: u32)
    -> Result<FixedExactOwners, ExactTrajectoryReject>;
fn apply_exact_impulse(rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
                       fact: ContactFact, impulse_on_a: [i64; 3])
    -> Result<ExactImpulseOutcome, ExactTrajectoryReject>;
```

Common response exists once per owner, never copied into each collider row. A body and
both held rows reference that one word set; a duplicate copy would let two rows apply
or integrate the same body impulse differently. `FixedExactOwners` and
`FixedFloorReactions` are inline arrays bounded by `MAX_ARTICULATED_ENTITIES`; they
perform no allocation and return only after the complete transition validates.
Returning a complete outcome keeps floor reaction and state atomic.

All rows and both fact identities are validated before mutation. Refuse duplicate
identity, wrong generation/slot/kind/spec, descending time, time past one tick,
pre-existing nonzero body-common Z, inactive nonzero held state, more than two
distinct held rows for one owner, mass inconsistency, negative radius, absent contact
geometry, friendly/self pair, contact-kind/shape/orientation mismatch, invalid or
absent body region, and arithmetic overflow. A
new body-Z impulse is not refused: it succeeds atomically as the named external
`FloorReaction` required by the model and test above, while common Z remains exactly
zero. Its energy word is the signed change made by the cancelling floor reaction,
not the positive energy the rejected response would have gained. The former wording
that also required body-Z impulse refusal contradicted that contract and would have
made `floor_reactions` unreachable.

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

The first wording of this checkpoint required the current CCD equations to become
rational predicates, preserve the complete zero-response corpus byte for byte, and
use no compatibility arithmetic. Those three requirements cannot all be true. Even
an affine rational point against a sphere generally crosses at an irrational root;
two independently moving segments add changing closest features and more than one
enter/exit interval. There is no rational TOI and no globally monotone contact
predicate to cross-multiply. The current sweep is a different, observable algorithm:
it conservatively advances over rounded `Fx::lerp` poses with floored square roots,
a minimum one-raw step, and a 96-advance cap. Replacing those operations with exact
rational distance changes some zero-response answers even when both implementations
are internally correct. Recording that contradiction here is part of the result; a
future implementation must not restore the impossible promise in quieter words.

Keep one pair traversal and one candidate list, but make its two arithmetic kernels
explicit:

- A pair whose owners have canonical all-zero common and held response uses the
  **compatibility kernel**. It reproduces the existing `Fx` interpolation, distance,
  conservative-advance, cap, contact-point, normal, feature, and regional tie rules
  exactly. This is how the default build and the existing corpus remain byte equal.
  It is not permitted for a pair with any nonzero response word.
- A pair with any nonzero response uses the **exact refusing kernel** below. The
  dispatch occurs inside the one pair scan; it is not a second candidate scan and it
  never constructs a rounded `ContactCollider` as fallback. A mixed pair is exact.

The exact kernel defines contact at an integer raw tick word using rational geometry.
At a frozen word enumerate the complete active-feature set rather than trusting a
rounded closest-point routine. Segment/segment includes the interior/interior solve,
four endpoint/segment boundaries, point degeneracies, and their closed interval
boundaries. Segment/shield includes the face and all four edge segment pairs. Compare
squared distances and parameters by checked `i128` cross-products; then apply the
existing feature, region, and `ContactKey` tie tails. Only after a winner and raw TOI
are chosen may its point and normal be projected to the existing `ContactFact` words.
That publication rounding is not a collision predicate.

Do not claim the distance is monotone. From a separated frozen pose with exact
squared distance `q`, combined radius `R`, and a rational relative-speed upper bound
`L`, derive a certified no-contact interval instead. Let `D` be the L1 norm of the
chosen closest delta, so `D >= sqrt(q)`, and use

```text
safe_dt = (q - R^2) / ((D + R) * L).
```

`L` is the maximum L1 relative velocity over all endpoint pairs, or over segment
endpoints and shield corners. Convex interpolation makes that a Hausdorff-speed
bound for the complete shapes. If `floor(safe_dt)` is at least one raw word, advance
by that many words and evaluate again; no earlier raw word can contact. If it is less
than one, evaluate the adjacent raw word. Contact there is the earliest representable
word. Separation there is `UnsupportedExactSweep`, because a contact which enters
and exits between the two words cannot be excluded without changing the collision
contract. Zero `L` proves a separated remainder. The exact kernel retains the
existing 96-advance budget and refuses on exhaustion; it never enumerates all 65,537
times, solves an irrational root approximately, or substitutes a rounded endpoint.

A shield is supported only while its four affine corner paths describe the same
nondegenerate rectangle throughout the interval. Validate the constant, linear, and
quadratic coefficients of the parallelogram and orthogonality identities, its frozen
orientation, and the existing point/edge bounds. A valid rectangle at both endpoints
is not sufficient: arbitrary affine corner paths can fold or cease to be rectangular
between them. Refuse such a path as `UnsupportedExactSweep` before scanning it.

Every denominator is positive and every comparison product is checked. Before
clearing or appending candidate scratch, make one structural and numeric-envelope
preflight over the rows and pair bounds. It may validate identities, maintained
shield coefficients, denominator products, coordinate/radius limits, L1 speed bounds,
and the worst cross-products the selected primitive can form; it may not choose a
candidate. This is what makes a late pair's overflow or unsupported geometry atomic.
No assertion that positions fit inside 256 units is enough by itself: independently
mass-derived denominators can overflow `i128` when squared or cross-multiplied. Reject
that pair envelope by name rather than using saturation, a GCD loop, a bigint, or a
different comparison. The accepted envelope and every maximum product need a
two-sided boundary test.

Checkpoint D measured one important correction to that envelope. The retained real
World clinch produces an irreducible squared-distance denominator of
`100_437_541_639_380_625`, so the earlier `2^46` leaf-rational bound rejected valid
geometry before a comparison was attempted. The accepted denominator bound is
`2^64`; the numerator bound remains `2^94`, and every add, multiply and comparison
still performs its own checked-`i128` operation and refuses overflow. Division of
two dot products with the same denominator cancels that common square scale by
identity. It does not run Euclid or otherwise reduce arbitrary rationals.

Provide a compatibility adapter that creates zero-response exact trajectories from
the current `ContactCollider`. Production uses the refactored pair traversal through
this adapter in both default and feature builds. The adapter is input provenance,
not permission to reconstruct a nonzero response from published endpoints.

Required tests:

```rust
#[test] fn zero_response_exact_scan_is_byte_equal_to_the_contact_corpus() {}
#[test] fn one_raw_remainder_changes_toi_only_when_the_exact_boundary_crosses() {}
#[test] fn rotating_segment_contact_uses_both_endpoint_motor_coefficients() {}
#[test] fn exact_frozen_features_match_a_tiny_exhaustive_rational_oracle() {}
#[test] fn an_irrational_crossing_returns_the_first_certified_raw_word() {}
#[test] fn a_subraw_enter_and_exit_is_refused_instead_of_rounded_away() {}
#[test] fn a_shield_must_remain_a_rectangle_between_its_endpoints() {}
#[test] fn group_recomputation_and_commit_evaluate_the_identical_breakpoint_geometry() {}
#[test] fn unsupported_exact_sweep_refuses_before_candidate_or_scratch_mutation() {}
#[test] fn exact_sweep_envelope_accepts_and_refuses_both_sides_of_every_bound() {}
#[test] fn exact_scan_grows_no_retained_capacity_after_reservation() {}
```

Stage this checkpoint so each arithmetic claim can be broken before the scan owns it:

1. Land rational scalar/vector comparison and numeric-envelope rejection tests.
2. Land frozen segment/segment active-feature predicates against a tiny exhaustive
   rational oracle. Mutate each feature and tie tail and see a named case fail.
3. Land the shield face/edge predicate and maintained-rectangle validation. A path
   whose endpoints are valid but whose middle folds must refuse.
4. Land certified exclusion, including a quadratic irrational crossing, a separated
   stationary pair, a multi-interval path, subraw enter/exit refusal, and budget
   exhaustion. Replacing `D` or `L` with an underestimate must make a gate red.
5. Put both kernels behind the one pair traversal and pin the complete existing
   contact-format and behavioral corpora byte-for-byte. Mutate zero-response dispatch
   to the rational kernel and require a corpus case to fail.
6. Route scan, group recomputation, and commit through `evaluate_exact`; prove atomic
   refusal and unchanged retained capacity. Mutate a nonzero-response pair back to
   compatibility interpolation and require the remainder-boundary fixture to fail,
   while zeroing that response keeps the corpus control green.

**Hard stop:** if any shape needs a second scan, brute-force time enumeration, or a
rounded endpoint fallback for nonzero response, close `revise`. Also stop if the
retained strike is outside the declared rational envelope, its shield does not satisfy
the maintained-rectangle proof, or the exact kernel cannot certify its next contact
without a subraw/budget refusal. Those are model results, not reasons to widen a bound
after seeing the fixture.

## Checkpoint C -- World state and hash land together

Only after A and B pass, add a fixed
`Vec<Option<ExactOwnerTrajectory>>` column to `World` under `cartesian-recoil`. The
`Option` is not a second authority: it is how an inactive slot is represented without
inventing a positive-mass sentinel or a fake entity identity. In the same change,
append its fixed grammar to the authoritative state hash. There is no intermediate
commit in which World owns an unhashed exact remainder.

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

The column, real one-handed and right-owned two-handed construction tags and masses,
death/reuse canonicalization, fixed-width hash grammar, and atomic zero-response grip
and severance transitions have landed. A transition with any nonzero response refuses
as `LifecycleNonzeroResponse` before grip, recoil, or exact state mutates; checkpoint D
replaces that hard boundary with the required exact external-energy ledger. Contact
solving still uses checkpoint B's compatibility ownership and does not read or write
the World column.

Checkpoint C introduces one new feature-only digest, `EXACT_TRAJECTORY_STATE_DIGEST`,
after native/wasm agreement. It may not move an existing registered pin.

## Checkpoint D -- contact, finalization, commit, and lifecycle

**Construction-bound sub-slice implemented:** every configured loadout now enumerates
the same canonical legal final grip pairs used by runtime validation (`Both` is one
right-owned mass), computes the common lattice as their checked LCM, and proves the
largest common-plus-held endpoint denominator is at most 96 bits before World
allocation or spawn reservation. The typed `ExactLatticeEnvelope` refusal distinguishes
arithmetic failure from a 97-bit endpoint. Shipped Fighter and Brute witnesses are
respectively scale/endpoint-bits `1_283_938_665_662_054_400 / 92` and
`59_914_856_794 / 69`. The Euclidean loop used only for this finite construction LCM
supersedes the earlier blanket no-gcd wording: it never runs in tick arithmetic, its
input is at most the nine pairs over two immutable carried slots, and the 96-bit test
bounds its complete output. Detector-wide arithmetic remains deferred to the bounded
wide predicate work; this construction proof does not authorize raising an `i128`
scan envelope.

The companion fixed-lattice lifecycle slice preserves common position and momentum
quotient/remainder words and `common_scale` while active mass and held tags change.
An unchanged held identity keeps its relative row; a newly acquired identity starts
at exact zero at the owner's current group time; `Both` remains one right-owned row.
Direct transition tests cover unequal-mass release/reacquire, `A -> B -> A` byte
identity modulo that shared time, and scale/active-mass hash ownership without
entering the detector. Energy, cap, wall, and anatomy accounting are still deferred.

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
