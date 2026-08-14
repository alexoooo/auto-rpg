# Smart AI 113 -- name the current-patch Finish and pair failures

**Status:** complete; temporary diagnostics removed and the held Smart112 behavior remains. Keep Smart112's held normalization and
SegmentBody certificate byte-for-byte while recovering two different first causes:
canonical `Finish / ExactScan` at tick 273 and mirrored pair-local SegmentBody
`ArithmeticEnvelope` at tick 183. This session diagnoses only; it does not repair
either path.

## A -- frozen seed-0 reproductions

Run only Tactical versus Tactical seed `0`, canonical then mirrored, to the first
rejection. Before adding diagnostics require:

```text
canonical 273 -> 274, Finish/ExactScan, key/pair None,
  command/state 0x50eba156b8350eeb / 0x80acc66ed5168619
mirrored 183 -> 184, Scan/ExactScan, key None,
  pair 1/3 SegmentBody ArithmeticEnvelope, progress None,
  command/state 0xdd5576e91179dd8a / 0x3d8e384392310c22
```

Do not run another seed, full suite, wasm, competence or policy variant. Digest the
World around each ordinary diagnostic read and require identical public results and
receipts. If either frozen row moves, stop rather than tracing a different patch.

## B -- canonical Finish provenance

In [`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs),
capture the first internal error from `ExactKinematics::finish` before it maps every
`advance_exact_into` error to `ResolutionError::ExactScan`. Thread a test/feature-only
caller-output diagnostic through
[`advance_exact_into`](../../crates/sim/src/combat/trajectory.rs) without re-running
validation or arithmetic.

Use exactly these stages:

```text
FinishCapacity
FinishOwnerInputValidate
FinishCommonAdvancePosition
FinishCommonAdvanceValidate
FinishHeld0AdvancePosition
FinishHeld0AdvanceValidate
FinishHeld1AdvancePosition
FinishHeld1AdvanceValidate
FinishOwnerOutputValidate
FinishOwnerStagePush
FinishOwnerSwap
```

Record tick, group time, stage, exact `ExactTrajectoryReject`, owner ordinal/entity,
common versus held slot, axis, scale/mass, and the complete before/intermediate/after
`ExactPosition` and `ExactMomentum`. For an advance failure also record checked
`dt`, denominator, momentum numerator, fractional position numerator, carry, quotient
and remainder at the first failing axis. For capacity record required/actual len and
capacity. For validation name the exact failed law: mass divisibility, time, remainder
bound, quotient/remainder sign, body Z, held time, slot/spec or owner mass.

Capture the already-computed first failure once. The normal `advance_exact_into`
result, owner-stage atomicity and rollback remain unchanged. No diagnostic helper may
advance, validate or swap twice.

## C -- mirrored pair arithmetic provenance

In [`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), add a
separate test/feature-only first-wide-failure record. Set region and visit context on
entry to each existing SegmentBody region/96-visit iteration; set certificate context
only when the zero-step, adjacent-separated, AABB-overlap branch enters the retained
certificate. Copy the record into the existing pair rejection before returning, but
do not manufacture a segment-body progress row.

Use a closed phase enum:

```text
RegionAabb
RegionSpeed
ClosestCurrent
RadiusCurrent
SafeStep
ClosestAdjacent
RadiusAdjacent
IntervalAabb
CertificateClear
CertificateCapacity
CertificateRadiusSquare
CertificateNodePop
CertificateEndpointSegment
CertificateEndpointBody
CertificateDyadicTime
CertificateLerp
CertificateClosest
CertificateSeparation
CertificateDirection
CertificateCross
CertificateAxisNormalize
CertificateAxisCapacity
CertificateCorner
CertificateProjection
CertificateProjectionCompare
CertificateAbsolute
CertificateLeastCompare
CertificateProjectionSquare
CertificateAxisNorm
CertificateRadiusNorm
CertificateMarginCompare
CertificateChildCapacity
```

Record pair indices/key/owner identities, region, outer visit, current/adjacent raw
time, certificate node `(lo,hi,depth)`, endpoint/axis/corner/XYZ ordinal as applicable,
the exact wide helper/function name, operation (`new/add/sub/mul/div/cmp/neg/trunc`),
and complete input/output `WideRational4096` words or all-limb fingerprints when stdout
must be compact. Also record retained lengths/capacities and certificate high-water.
Fingerprints are receipts only; tests compare full words.

Replace each relevant `?` only with a same-order match that records its returned
`ArithmeticEnvelope` once and propagates it. Do not call the failed helper again. The
required result is the earliest exact function/operation and its operands, not merely
the broad certificate phase.

## D -- controls, mutations and stop

Add:

```rust
#[test] fn smart112_canonical_finish_names_owner_axis_stage_and_exact_reject() {}
#[test] fn smart112_mirrored_pair_names_region_visit_certificate_phase_and_function() {}
#[test] fn finish_and_pair_internal_records_precede_public_exactscan_mapping() {}
#[test] fn finish_and_pair_internal_records_are_first_only_atomic_and_observational() {}
#[test] fn finish_and_pair_internal_records_name_capacity_validation_and_wide_controls() {}
```

Freeze all supplied tick/receipt words plus the new exact records. Direct controls
force every Finish stage family and representative pre-certificate/certificate wide
operations. Make tests red by erasing the record, moving it after public mapping,
changing owner or axis, changing region or visit, relabeling the exact function,
overwriting the first error, and calling advance or a wide helper twice. Restore every
mutation.

```powershell
cargo test -p sim --features cartesian-recoil smart112_canonical_finish -- --nocapture
cargo test -p sim --features cartesian-recoil smart112_mirrored_pair -- --nocapture
cargo test -p sim --features cartesian-recoil finish_and_pair_internal_records -- --nocapture
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
```

Retain exact stdout or a log path, size and SHA-256. Remove all runtime diagnostics and
prints after freezing the evidence. Keep the held Smart112 behavior patch unchanged;
do not declare it complete or run broader gates.

Stop after naming canonical Finish stage/owner/axis/subtype and mirrored exact
function/operation/region/visit/certificate phase. Do not normalize another field,
expand the wide envelope, change certificate bounds, fix either failure, retune policy
or touch Arena. A correction requires a later pre-code plan.

Expected pin moves are zero because diagnostics are removed and the held behavior is
not repinned. Run no default-pin update, wasm measurement, corpus, competence or
browser verification.

```powershell
node tools/check_docs.js
git diff --check
```

## Completed evidence

Canonical still publicly rejects at tick `273 -> 274`, `Finish / ExactScan`. The
first internal failure is `advance_exact_into`, owner `0`, common-response axis X,
advancing group time `64246 -> 65536` (`dt=1290`) at scale
`1283938665662054400`:

```text
input position       q=-8127 r=-55557784876107556454400
input momentum       q=78533 r=433395280414310400
proposed position    q=-6582 r=+14911755380925766041600
result               validate_affine / NonCanonical
axis Y proposed      q=366779 r=+52708810892367416524800 (canonical)
axis Z               zero
```

The X position quotient crossed while the retained exact remainder became positive;
the rational value exists, but the quotient/remainder representation violates the
same-sign canonical law. Public receipts remain
`0x50eba156b8350eeb / 0x80acc66ed5168619`.

Mirrored still rejects at tick `183 -> 184`, `Scan / ExactScan`, pair `1/3`
SegmentBody with `ArithmeticEnvelope`. The first failure is inside the retained
separation certificate at root node, region `3`, time `49602`, axis `0`, during the
final strict margin comparison. Certificate capacities are exactly
nodes/points/corners/axes/scalars `17/8/8/4/32`. The positive left rational has
numerator/denominator bit lengths `2207/2151`; the positive right has `2050/1994`.
Both operands fit the 4096-bit envelope, but ordinary rational comparison attempts
cross-products of `4201` bits, so it returns `ArithmeticEnvelope` before deciding the
strict order. Public receipts remain
`0xdd5576e91179dd8a / 0x3d8e384392310c22`.

No Smart113 test count, mutation result, retained log or SHA-256 was reported. The
temporary prints/diagnostics were cleaned and the feature check was green. This
evidence authorizes neither a wider rational nor a relaxed comparison: Smart114 owns
value-preserving position normalization and an exact overflow-safe comparison of the
already-valid positive operands.
