# Smart AI 64 -- diagnose exact-finish wasm frame

**Status:** stopped on 2026-08-13. Native sizes are owner `720`, option `720`, the
64-row array `46080`, and `FixedExactOwners=46096`. Wasm frames are scan `118912`,
digest `352176`, advance `3568`, step `324976`, solve `183200`, finish `92192`,
`advance_exact=93344`, and `from_slice=46096`; the finish chain is about `1095552`
active bytes. The verified baseline artifact is `965788` bytes. Its full SHA-256 was
captured in the independent log but not included in this handoff and must be copied
from there, never inferred from the byte size.

A reverted complete-finish bypass artifact was `965243` bytes (use its captured full
SHA too). It still trapped earlier in `wide_vector_sub -> wide_segment_segment_points
-> wide_segment_body_at_time -> exact_contact_at_pose`. Thus removing at most one
`46096`-byte caller stage cannot supply the required 64 KiB headroom and only exposes
an independent recompute peak. No production change, pin, digest or corpus ran.
Smart65 owns exact-recompute frame diagnosis.

## Artifact authority

Do not trust `ARPG_WASM_PATH` until the checker prints and asserts the resolved path
and SHA-256 of the bytes it instantiated. Smart63's stale-artifact report is the
mutation proof for this rule. Use a tooling-only wrapper or copied diagnostic script
that takes an explicit path argument; do not edit simulation code or overwrite the
ordinary artifact. For every result record absolute path, byte length, SHA-256,
feature set, build command and build completion time.

Build one fresh default-stack feature artifact in `target/smart64-feature`, then run
only that verified file twice. Required first trap is the finish chain above; a scan
trap means the wrong bytes were loaded and stops the task.

## A -- current prologue and active-chain ledger

Disassemble the fresh wasm with the toolchain's `llvm-objdump`/`wasm-objdump` and map
function indices through the name section. Record stack-pointer decrements and any
sret/caller allocation for:

```text
compute_articulated_stream_digest / drive_stream_digest_script
Sim::advance
World::step and resolve_articulated_contacts
resolve_contacts_with / ExactKinematics::finish
advance_exact
FixedExactOwners::from_slice
FixedExactOwners::copy_into
```

Start from Smart63's measured `965788`, but recompute the whole active chain from the
fresh binary rather than adding source `size_of` estimates. Identify whether the
large return slot for `Result<FixedExactOwners, ExactTrajectoryReject>`, local
`FixedExactOwners`, `[Option<ExactOwnerTrajectory>; MAX_EXACT_OWNERS]`, or duplicated
caller/callee sret storage is dominant. Record the exact byte delta at the instruction
that crosses the shadow-stack boundary.

```rust
#[test] fn fixed_exact_owner_capacity_and_row_size_are_frozen_explanatory_controls() {}
```

A native cfg(test) control may record `size_of::<ExactOwnerTrajectory>()`,
`FixedExactOwners`, and its 64-row array, but it is explanatory only; wasm prologue
bytes are authoritative.

## B -- bounded call-shape experiments

Use temporary diagnostic branches, one at a time, rebuilt into distinct target dirs:

1. make `FixedExactOwners::from_slice` fill caller-provided storage and return `()`;
2. make `advance_exact` fill caller-provided storage instead of returning
   `FixedExactOwners`;
3. bypass only `ExactKinematics::finish` after scan (expected digest change, never a
   fix) to prove finish ownership.

For each, record verified artifact SHA, relevant prologues, trap/pass, memory pages,
and first frame. Revert every branch. The experiment that removes duplicated return
storage must reduce the active chain by its predicted exact bytes. Do not shrink
`MAX_EXACT_OWNERS`, heap-box per call, raise stack size, skip validation, or accept a
changed owner row.

If caller-provided storage still leaves less than 64 KiB headroom, continue prologue
inspection to the next largest live object in `finish/advance_exact`; do not declare
success from merely moving the trap.

## C -- behavior-neutral oracle and stop

In native cfg(test), compare old return-by-value `advance_exact` against a temporary
caller-storage oracle for owner counts `0`, `1`, `2`, and `MAX_EXACT_OWNERS`, including
every success row and every rejection kind reachable from duplicate identity,
descending time, arithmetic and capacity fixtures. Inputs remain unchanged on error.
Mutation proof: omit one held-row advance or validation and require complete-byte or
rejection equality to fail. Restore all temporary code.

Record the exact dominant object, old/experimental prologues, predicted and measured
headroom, repeated verified-artifact outcome, memory pages and mutation result in
Smart64 and durable research, then stop. A successor must predeclare any production
API/storage change and its reservation/lifetime rules. Smart64 updates no default
stream pin, creates no feature pin and runs no 7,560-case corpus.

The owner duplication remains a later risk: `from_slice`, return storage and
temporaries account for roughly 231 KiB across nested paths. A future repair may need
retained owner staging in `ContactTickScratch`, `advance_exact_into` with swap only on
success, and atomic owner/floor-reaction staging for by-value `apply_exact_group`.
World's inline 64-owner/192-trajectory entry backup contributes to step's `324976`
frame and solve retains a related pair in `183200`; because their rollback boundaries
differ, they cannot share one backup without a separate proof. Smart64 authorizes none
of these production changes.

```powershell
$env:CARGO_TARGET_DIR='target/smart64-feature'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
Remove-Item Env:CARGO_TARGET_DIR
cargo test -p sim fixed_exact_owner_capacity --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No server or browser is needed. Remove only explicitly named Smart64 diagnostic target
directories after evidence is recorded; ordinary artifacts remain untouched.
