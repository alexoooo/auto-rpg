# Smart AI 65 -- diagnose exact recompute wasm frame

**Status:** stopped after the bounded experiments; no Smart65 production repair
survives. Smart64's reverted finish bypass still traps
in `wide_vector_sub -> wide_segment_segment_points -> wide_segment_body_at_time ->
exact_contact_at_pose`. Smart65 changes no production code, behavior, pin, ABI,
layout, corpus, policy, damage, or Arena UI.

## Artifact authority and current chain

Build fresh default-stack feature wasm into `target/smart65-baseline`. The runner must
print and assert absolute path, length, full SHA-256 and feature mode before
instantiation. Do not rely on ignored `ARPG_WASM_PATH`, copy over the ordinary
artifact, raise the stack, or reuse the bypass. Required first trap is the recompute
chain above; scan/finish means wrong bytes.

Disassemble and record stack-pointer decrements, sret slots and inlined callees for:

```text
ExactKinematics::recompute / exact_contact_at_pose
wide_segment_body_at_time / wide_body_region_at_time
wide_segment_segment_points / wide_segment_segment_at_pose
wide_vector_sub, wide_dot, wide_div, wide_point_at
WideRational4096 checked arithmetic
```

The fresh finish-bypass artifact measured these simultaneously active wasm prologues:

```text
digest                         352176
advance                          3568
step_with                       324976
step                                16
solve                           183200
exact_contact_at_pose            88960
wide_segment_body_at_time        32416
wide_segment_segment_points     139904
wide_vector_sub                   7248
total                          1132464
geometry tail                   268528
```

Thus the active chain exceeds a roughly 1 MiB stack by about `83888` bytes. Merely
removing 64 KiB cannot pass with 64 KiB spare: bringing `1132464` down to `983040`
or less requires a measured reduction of at least `149424` bytes. The prologues show
by-value ABI and local fanout across a helper family, not one removable array.
`wide_segment_segment_points` (`139904`) and `exact_contact_at_pose` (`88960`) are
both owned targets; a `#[inline(never)]` experiment or changing only the top points
return cannot satisfy the acceptance threshold.

Name the instruction crossing the stack boundary. Native `size_of` controls for
`WideRational4096`, `WidePoint`, `WideSegmentClosest`, `ExactPoint`, arrays and
Result/sret types are explanatory only; wasm prologues are authoritative.

## A -- bounded call-shape experiments

Build separate temporary artifacts, one change each:

1. borrow `WidePoint` inputs to `wide_vector_sub` and fill caller-provided three-word
   output;
2. make `wide_segment_segment_points` fill caller-provided `WideSegmentClosest`
   instead of returning it by sret;
3. move the bounded translated points, `u`/`v`/`w`, scalar intermediates, candidate
   and result work slots used by both `wide_segment_segment_points` and
   `exact_contact_at_pose` into already-retained `ExactWideScratch`, cleared and
   borrowed for one recompute;
4. bypass the already-selected body region diagnostically, which must change the fact
   and is never a fix, to prove region-loop ownership.

For each record full SHA, relevant prologues, predicted removed bytes, actual first
trap/pass and memory pages. Revert each. Causality requires prologue reduction equal
to predicted live storage and the trap moving past that call. Artifact-size or
inlining changes alone are not evidence.

Do not narrow the 4096-bit envelope, change comparison/root selection, skip regions,
heap-box per call, reserve unbounded storage, or raise stack.

## B -- equivalence and atomicity controls

For each caller-output or retained-scratch candidate, compare complete results and
rejections with current functions for the Smart56 recompute, every weapon/body
region, weapon/weapon, weapon/shield, zero distance, envelope refusal and capacity
refusal. Inputs and output scratch remain unchanged on error unless a temporary stage
commits only after success.

```rust
#[test] fn borrowed_wide_vector_arithmetic_matches_every_frozen_word_and_rejection() {}
#[test] fn caller_filled_closest_matches_returned_closest_atomically() {}
#[test] fn recompute_scratch_reuses_capacity_without_growth_or_stale_region_words() {}
```

Mutation proof: alias input/output or omit a coordinate and require equality to fail;
omit scratch clear between regions and require the second-call test to fail. Restore
all temporary changes.

## C -- stop and successor boundary

The borrowed-input-only experiment produced a `965906`-byte artifact (recorded
SHA-256 prefix/suffix `e0df...03d225`) and still trapped in
`wide_vector_sub_borrowed`. Borrowing the inputs plus caller-output conversion for
all four origin translations produced a `965803`-byte artifact (recorded SHA-256
prefix/suffix `08ba...187b0`) and moved the trap only to
`wide_segment_segment_points`. Both branches were reverted. The measurements refute
an isolated signature repair: the full retained work-slot helper family is required.

Smart65 therefore stops. A production successor may combine only a borrowed helper
family plus caller-output/retained-work-slot changes that measure at least `149424`
bytes of reduction, leaving at least 64 KiB headroom. A no-inline change or isolated
top-level caller-output conversion is insufficient even if it moves the first trap.

Owner staging remains separate. If repaired recompute later reaches finish and traps,
a successor may design retained `Vec<ExactOwnerTrajectory>` staging,
`advance_exact_into` with success-only swap, and atomically staged floor reactions.
World entry backups and solve backups have different rollback boundaries and cannot
be conflated without measurement.

Smart65 updates no default stream pin, creates no feature pin and runs no full suite
or 7,560-case corpus.

```powershell
$env:CARGO_TARGET_DIR='target/smart65-baseline'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
Remove-Item Env:CARGO_TARGET_DIR
cargo test -p sim borrowed_wide_vector --features cartesian-recoil -- --nocapture
cargo test -p sim caller_filled_closest --features cartesian-recoil -- --nocapture
cargo test -p sim recompute_scratch_reuses --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No server or browser is needed. Remove only named Smart65 diagnostic target
directories after evidence is recorded; ordinary artifacts remain untouched.
