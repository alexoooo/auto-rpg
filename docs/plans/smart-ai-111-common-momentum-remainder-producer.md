# Smart AI 111 -- find the first opposed common-momentum remainder

**Status:** complete by read-only producer proof; no runtime diagnostic was landed. Smart110 proved that the later scan fails
before its first pair because a common-response Y momentum has a quotient and
remainder with opposing signs. Trace the exact rational identity across every
authoritative producer boundary and name the first write. Do not normalize or accept
the malformed representation in this session.

## A -- frozen reproductions and invalidity predicate

Temporarily reapply Smart109's exact separation certificate solely to reproduce the
two seed-0 Tactical runs. Freeze Smart110's rows before adding provenance:

```text
canonical tick 240 owner0 axis Y: q=-4281 r=+522941925551308800
  scale=1283938665662054400, position=0/0
  command/state=1415213072758438895/191062832061666801
mirrored tick 148 owner1 axis Y: q=+13220 r=-27462693414
  scale=59914856794, position=0/0
  command/state=5049344267239224054/9535803509025357177
```

Run no other seed. Starting from tick zero, visit canonical ticks `0..=240` and
mirrored ticks `0..=148` in ordinary order. The target predicate is exactly:

```text
r.unsigned_abs() < scale
and ((q > 0 and r < 0) or (q < 0 and r > 0))
```

Record the first false-to-true transition per orientation. If either run begins dirty
or reaches Smart110 without one captured transition, stop and report the uncovered
gap rather than attributing a producer.

## B -- exact producer ledger

Add test/feature-only, caller-output capture at the authoritative seams in:

- [`apply_exact_group_into`](../../crates/sim/src/combat/trajectory.rs) and its caller
  in [`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs);
- [`advance_exact_into`](../../crates/sim/src/combat/trajectory.rs);
- [`wide_rebase_owner_tick`](../../crates/sim/src/combat/contact.rs);
- [`World::commit_contact`](../../crates/sim/src/world.rs) and
  `World::commit_contact_row`, including the final exact-owner replacement.

Use exactly these stage labels in execution order:

```text
ApplyInput
ApplyAxis
ApplyStaged
ApplySwap
AdvanceInput
AdvanceStaged
AdvanceSwap
RebaseInput
RebaseOutput
CommitInput
CommitRow
CommitOwnerStore
```

For every owner and XYZ axis at each reached stage, capture:

```text
tick; group index/time; stage; entity/owner index; axis
common_scale; mass_raw; velocity_raw q; remainder r
checked exact numerator N = common_scale*q + r
reduced rational N/common_scale
incoming impulse and its exact scaled numerator delta, for ApplyAxis only
source/staged/destination owner identities and common group times
opposed-before; opposed-after
```

`i128` is sufficient only when both checked multiplies/adds succeed. Otherwise retain
the complete `WideInt4096` numerator and compact all-limb receipt using Smart108's
diagnostic grammar; hashes remain receipts, never equality or arithmetic authority.

At each boundary assert rational conservation or the declared impulse:

```text
ApplyAxis: N_after = N_before + impulse_raw * TICK_RAW * impulse_scale
Advance:   N_after = N_before
Rebase:    N_after = N_before
Commit:    N_destination = N_staged_source
```

Also compute the unique truncation-canonical representation for evidence only:
`q0 = N / scale`, `r0 = N % scale`, and record whether stored `(q,r)` equals
`(q0,r0)`. This names a representation defect without changing it. Do not substitute
Euclidean division, round-to-nearest or a sign clamp.

Capture values already computed by production. Do not apply an impulse twice, call
advance/rebase twice, clone a World, or make diagnostics affect a return. Do not retain
the whole run: `ProducerLedger` owns exactly six current owner/axis snapshots, twelve
stage counters and one optional first-transition record. Check each rational identity
online, replace the six snapshots only after a successful boundary, and preserve the
first false-to-true record without overwrite. This fixed record allocates nothing.
Continue the ordinary run after capture to require the frozen Smart110 rejection and
receipts.

## C -- direct identity and mutation tests

Add:

```rust
#[test] fn smart110_canonical_names_the_first_opposed_common_momentum_producer() {}
#[test] fn smart110_mirrored_names_the_first_opposed_common_momentum_producer() {}
#[test] fn common_momentum_ledger_proves_apply_advance_rebase_and_commit_identities() {}
#[test] fn common_momentum_ledger_is_bounded_atomic_and_observational() {}
#[test] fn common_momentum_ledger_distinguishes_rational_value_from_representation() {}
```

The first two freeze stage, tick/group, owner/entity, axis, all input/output words,
exact numerator identity and first-producer status. The identity test uses small
positive, negative, exact-cancellation and nonzero-remainder controls for every seam.
The representation test gives two equal rational values with different quotient/
remainder words and requires only the truncation-canonical one pass the predicate.

Make tests red independently by omitting each stage, swapping source/destination at
commit, dropping the impulse-scale factor, using mass instead of common scale,
changing truncating `/` or `%`, erasing the sign predicate, overwriting the first row
with a later producer and performing a second authoritative operation for capture.
Restore every mutation.

```powershell
cargo test -p sim --features cartesian-recoil smart110_canonical_names -- --nocapture
cargo test -p sim --features cartesian-recoil smart110_mirrored_names -- --nocapture
cargo test -p sim --features cartesian-recoil common_momentum_ledger -- --nocapture
cargo test -p sim --features cartesian-recoil smart108_ -- --nocapture
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
```

Retain exact stdout or a log path, size and SHA-256. Do not reconstruct a missing
numerator or mutation result after cleanup.

## D -- stop and restore

Stop after naming the first producer in both orientations and the exact rational
identity it violated or preserved. Do not fix division/canonicalization, relax
`validate_coordinate`, change impulses, retune ordinal 3144, run competence or touch
Arena. The correction belongs to a later pre-code plan informed by this evidence.

Fully revert the temporary Smart109 certificate and all runtime provenance. Test-only
frozen controls may remain only if unreachable from normal feature/default artifacts.
Require the original Smart106 refusal rows and receipts after cleanup.

Expected pin moves are zero. No geometry, contact, stream, command, legacy or learned
pin, replay/hash grammar or ABI version may move. Run no wasm pin measurement, corpus,
competence gate or browser verification.

```powershell
cargo test -p sim --features cartesian-recoil smart106_ -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
node tools/check_docs.js
git diff --check
```

## Completed read-only proof

The first producer is the wall-reconciliation path in
[`World::commit_exact_contact`](../../crates/sim/src/world.rs). A clipped body axis
computes an integral `Fx` delta and adds `delta.raw()` directly to
`owner.common_response.momentum[axis].velocity_raw`, while retaining that momentum's
existing exact remainder. If the integral delta carries the quotient through zero,
the retained remainder can oppose the new quotient exactly as Smart110 measured.
The same block clears the **position** remainder, not the common-momentum remainder;
the held-momentum reconciliation already writes quotient plus remainder `0` together.

The upstream producers are sound. `apply_impulse_axis` reconstructs
`N = scale*q + r`, adds the exact scaled impulse, then derives both `q = N/scale` and
`r = N%scale` together before validation. `advance_exact_into` changes position/time
but not momentum. `wide_rebase_owner_tick` changes position/group origin but preserves
momentum. Staging and commit copy the same words until the clipped-axis quotient-only
write. Thus preflight is detecting a representation introduced after the exact solver,
not rejecting solver output or a changed rational value from advance/rebase.

No combined Smart110 numerator, dynamic producer tick, new test count, log or SHA-256
was supplied, so none is inferred. No diagnostic or behavior edit was made. Smart112
owns a rational-identity-preserving normalization at this one write and must prove it
without weakening `validate_coordinate`.
