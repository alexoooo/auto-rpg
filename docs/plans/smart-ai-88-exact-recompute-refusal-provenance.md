# Smart AI 88 -- isolate the inherited exact recompute refusal

**Status:** complete and reverted. For `behavior_case(4)` at time zero, endpoint
evaluation, closest points, radius square and contact comparison all succeed. The
first failure is candidate publication: `wide_owner_motor_frame` returns
`CompatibilityIdentity` because the frozen pure-resolver grammar contains only two
equipment segment trajectories and no canonical owner body row. The historical
absolute/rounded publication succeeds with point zero, positive-X normal and
velocities `+16384/-16384`. Four diagnostics passed, every declared mutation was red
and restored, and all cfg(test) provenance was reverted. No behavior, pin or corpus
changed; Smart89 owns the bounded equipment-only frame rule.

## A -- freeze the baseline pair before adding diagnostics

Work only in `#[cfg(test)]` code in `crates/sim/src/combat/contact.rs` and
`crates/sim/src/combat/resolution.rs`. Recreate the failing `behavior_case(4)` through
`zero_response_compatibility`, run the real scan, and freeze:

```text
selected group time
WeaponWeapon ContactKey 0:1 / 1:1
both ExactContactTrajectory rows and owner indexes
both owners at recompute entry
four exact segment endpoints/radii at that time
published compatibility colliders
scan fact words and selected feature
```

Assert Smart87 code is absent and reproduce the same
`ExactContactFailure { cause: ExactScan, phase: Recompute, key }` before measuring a
subcause. The diagnostic fixture must call the same `exact_contact_at_pose` branch as
the driver, not restage a nearby hand-authored pair.

## B -- bounded, non-authoritative cause provenance

Add a cfg(test)-only direct wrapper around the existing recompute calculation. It
returns a small diagnostic enum and copied scalar metadata only to the test:

```rust
enum RecomputeCause {
    Trajectory(ExactTrajectoryReject),
    SegmentAtTime { side: u8, stage: SegmentStage },
    Closest(ClosestStage),
    RadiusAdd,
    RadiusSquare,
    DistanceCompare,
    CandidatePublication(PublicationStage),
    UnexpectedNone,
}
```

Split existing `ExactScanReject` without altering its production mapping: preserve
`ArithmeticEnvelope`, trajectory subtype, compatibility identity, unsupported sweep
and budget. Within the successful WeaponWeapon branch, identify the first failing
operation among endpoint evaluation, origin translation, u/v/w and dot/determinant,
interior or endpoint candidate, selection, radius addition/square, distance compare,
and `make_wide_candidate` point/normal/velocity publication. Record the failing axis,
candidate ordinal and rational numerator/denominator limb where applicable. Bound the
trace to this one pair and one recompute call; no live World diagnostic, public row,
hash field, allocation or raw remainder export is authorized.

```rust
#[test] fn solved_group_recompute_names_the_first_exact_pair_and_cause() {}
#[test] fn recompute_provenance_does_not_evaluate_or_mutate_a_second_pair() {}
```

Mutation proof: map every internal cause back to generic `ArithmeticEnvelope` and
require the cause test red; move provenance after one later operation and require the
first-boundary assertion red; swap the key or evaluate a second pair and require the
boundedness test red. Restore every mutation.

## C -- direct old/current oracle and historical boundary

For the frozen pair, compare three direct, non-authoritative routes at the same exact
time:

1. current wide recompute on Smart86;
2. the pre-Smart51/53 publication/relative-frame formula reconstructed in cfg(test)
   from frozen inputs, without reverting production;
3. the legacy rounded `contact_at_pose` row as a compatibility witness only.

This is not a vote among authorities. Current exact trajectory inputs own selection;
the older formula distinguishes whether the inherited refusal was exposed by the
Smart51/53 reflection/publication repairs or was already present in exact geometry.
Compare stage-by-stage endpoint rationals, closest A/B/distance, radius square,
comparison, and every successfully constructed fact word. Stop at the first unequal
or refusing stage. Do not widen `WideRational4096`, relax an envelope, change a
quotient/frame, accept rounded compatibility as exact, or propose a fix in Smart88.

```rust
#[test] fn frozen_recompute_pair_locates_first_old_current_boundary() {}
#[test] fn rounded_compatibility_is_evidence_not_the_exact_oracle() {}
```

Mutate the diagnosed formula back to the other route and require the boundary test
red, then restore it. Record all exact literals and whether pre-Smart51/53 also
refuses. If source history is unavailable, reconstruct only from the already durable
Smart51--57 formulas; do not browse or reset the worktree.

## D -- stop and successor decision

Run only focused diagnostics plus default/feature compile controls. A result is
complete when it names the exact pair, first cause/stage/axis/ordinal, exact operands,
current versus old behavior, and mutation proof. Then revert every cfg(test)
diagnostic and record the evidence. Only that result may choose between a narrow
arithmetic/publication repair or a fixture/grammar correction plan. Smart88 itself
lands no fix, production diagnostic, Smart87 geometry, pin, full audit or corpus.

```powershell
cargo test -p sim solved_group_recompute_names --features cartesian-recoil -- --nocapture
cargo test -p sim recompute_provenance_does_not --features cartesian-recoil -- --nocapture
cargo test -p sim frozen_recompute_pair --features cartesian-recoil -- --nocapture
cargo test -p sim rounded_compatibility_is_evidence --features cartesian-recoil -- --nocapture
cargo test -p sim a_solved_group_grows_no_retained_scratch --features cartesian-recoil -- --nocapture
cargo test -p sim --no-run --features cartesian-recoil
cargo test -p sim --no-run
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

## Completed diagnosis

The frozen pair is WeaponWeapon `0:1/1:1` at `t=0`. Both segment endpoints, closest
A/B and distance, summed radius and squared radius, and the `distance <= radius^2`
comparison complete successfully. Candidate publication then calls
`wide_owner_motor_frame(trajectories, key.a)` and refuses
`CompatibilityIdentity`: both owners have only their equipment segment trajectory,
so the body-row lookup has no match. This is grammar identity, not arithmetic,
selection, tolerance or retained geometry.

The reconstructed pre-Smart53 absolute/rounded route completes and publishes contact
point zero, a positive-X normal, and velocities `+16384/-16384`. That route is
evidence for the missing frame only; it is not restored as production authority.
All four focused tests passed. Collapsing the cause, moving provenance past the first
failure, changing the key/evaluating a second pair, and substituting the historical
formula each made its named assertion red; every mutation and the complete diagnostic
prototype were reverted.
