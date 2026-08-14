# Smart AI 112 -- normalize wall-reconciled common momentum

**Status:** stopped at first-provenance gate C; the normalization and separation edits remain held for diagnosis. Smart111 proved that wall reconciliation
adds an integral velocity delta to the common-momentum quotient while retaining its
old remainder. Canonicalize that exact rational pair at the write, then combine it
with Smart109's already-proven separation certificate and rerun the frozen gate. Do
not relax preflight, change an impulse or retune the policy.

## A -- one exact normalization authority

In [`crates/sim/src/combat/trajectory.rs`](../../crates/sim/src/combat/trajectory.rs),
add a crate-private helper with this contract:

```rust
pub(crate) fn normalize_momentum(
    momentum: ExactMomentum,
    scale: i128,
) -> Result<ExactMomentum, ExactTrajectoryReject>
```

Require `scale > 0`. Compute with checked `i128` arithmetic only:

```text
numerator = scale * momentum.velocity_raw + momentum.remainder
q         = numerator / scale
r         = numerator % scale
```

Convert `q` to `i32`, retain `r` as `i128`, and return
`ExactMomentum { velocity_raw: q, remainder: r }` only after the ordinary canonical
coordinate rules pass: `abs(r) < scale` and nonzero `q/r` signs do not oppose. This is
Rust's truncation-toward-zero `/` and matching `%`; do not use Euclidean division,
rounding, clamping or remainder zeroing. Assert the exact identity
`scale*q + r == numerator` in tests. Arithmetic, scale and quotient failures use the
existing `ExactTrajectoryReject` variants and leave the caller's word unchanged.

Use the helper only in the clipped-axis loop of
[`World::commit_exact_contact`](../../crates/sim/src/world.rs), replacing the direct
assignment with a checked quotient addition in a local `ExactMomentum`, followed by
`normalize_momentum(local, owner.common_scale)` and one assignment of the successful
result. Keep the existing position-remainder clearing, wall settlement, held
reconciliation, recoil settlement, order and atomic staged-owner commit unchanged. An
unclipped axis must not call it.

Add direct tests beside the helper:

```rust
#[test] fn momentum_normalization_preserves_the_exact_numerator() {}
#[test] fn momentum_normalization_canonicalizes_both_opposed_signs() {}
#[test] fn momentum_normalization_keeps_canonical_and_zero_words_exact() {}
#[test] fn momentum_normalization_refuses_bad_scale_overflow_and_i32_quotient() {}
```

Freeze Smart110's two malformed `(q,r,scale)` rows directly and require the result
retain the same exact numerator with a non-opposed quotient/remainder. Include
positive-to-negative, negative-to-positive, exact zero, nonzero remainder, maximum
legal remainder and mirror-negated controls. Make tests red by restoring the
quotient-only write, zeroing `r`, using Euclidean division, swapping `/` and `%`
signs and mutating the overflow return; restore every mutation.

In [`crates/sim/src/world.rs`](../../crates/sim/src/world.rs), add:

```rust
#[test] fn clipped_wall_common_momentum_is_canonical_and_rationally_exact() {}
#[test] fn unclipped_wall_commit_keeps_every_exact_momentum_word() {}
#[test] fn clipped_wall_commit_maps_under_reflection() {}
```

The production mutation restoring quotient-only addition must make the first test red.

```powershell
cargo test -p sim --features cartesian-recoil momentum_normalization -- --nocapture
cargo test -p sim --features cartesian-recoil clipped_wall_common_momentum -- --nocapture
cargo test -p sim --features cartesian-recoil clipped_wall_commit -- --nocapture
cargo test -p sim --features cartesian-recoil
```

## B -- reapply only the proven separation certificate

After A is green, reapply Smart109 in
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs) without
changing its grammar: retained workspace, eight synchronous corners, deterministic
endpoint closest-separation/cross axes, strict projection inequality, left-first
depth `16`/node `131071`, and both children required. Invoke it only for SegmentBody
when step is zero, current and adjacent poses are separated, and the one-word AABBs
overlap. `Separated` advances to `time + 1`; unresolved keeps
`UnsupportedExactSweep`.

Require all Smart108/109 tests and mutations, retained capacity/pointer stability and
the original two intervals advancing. The normalization helper and separation
certificate are independent: a test must exercise each with the other disabled and
prove only their named failure changes.

```powershell
cargo test -p sim --features cartesian-recoil smart108_ -- --nocapture
cargo test -p sim --features cartesian-recoil synchronous_segment_body_axis -- --nocapture
cargo test -p sim --features cartesian-recoil segment_body_separation -- --nocapture
```

## C -- first-provenance and portability gates

Rerun only seed `0` canonical and mirrored first-rejection provenance before the
competence gate. The normalization must eliminate Smart110's preflight rows at
canonical tick 240 and mirrored tick 148; the certificate must eliminate Smart106's
tick 210/110 SegmentBody rows. Capture the first later rejection with full
tick/phase/internal cause/key/pair/primitive, or explicitly record none through tick
1800. Any `NonCanonical`, unexplained refusal, capacity growth or solver rejection
stops before competence.

```powershell
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
cargo test -p sim --features cartesian-recoil
```

Then build a fresh feature wasm, record path/size/SHA and parser frames for
`normalize_momentum`, the retained separation driver,
`wide_sweep_segment_body`, exact solve, World step and feature digest. Require at
least 64 KiB stack headroom. Call the feature articulated digest twice in each of two
fresh wasm instances and twice native; all four values must agree, and second calls
must not grow memory.

The feature-only receipt is expected to be at risk because both the clipped common
momentum and later exact contact path can change feature simulation values. It is
unregistered evidence, not permission to edit a pin. Every **default** registered pin
must remain unchanged: `COMBAT_GEOMETRY_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
`ARTICULATED_STREAM_DIGEST`, command, legacy and learned pins. No ABI, replay or hash
grammar changes.

```powershell
$env:CARGO_TARGET_DIR='target/smart112-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=Resolve-Path 'target/smart112-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js --show-prefix $wasm 'compute_articulated_stream_digest|step_with_arm_rates|solve_exact_contact_tick|wide_sweep_segment_body|segment_body_separation|normalize_momentum'
# Use a path-asserting temporary probe for two calls in each of two fresh instances;
# print lo/hi and memory pages before/after, then remove the probe.
Remove-Item Env:CARGO_TARGET_DIR
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
```

Stop before competence on target disagreement, OOB, less than 64 KiB headroom,
second-call growth, default-pin movement or any remaining rejection.

## D -- unchanged 100-trial competence gate

Only after A-C are wholly green, run Smart103's frozen command once with no early stop
or override:

```powershell
cargo run --release -p lab --features cartesian-recoil -- articulated --competence-gate
```

The pass remains at least `95/100` body decisions before tick `1800`, with zero
refused submissions and zero solver-rejected ticks. Record complete stdout, outcome
and contact totals, worst body-decision tick, command receipts, wall time and retained
log path/size/SHA if available. Do not change ordinal 3144, reach, timing, arc,
anatomy, target, seeds, cap, damage or threshold after measurement.

Below `95/100` or any rejection is `revise`: record and stop. Only an unchanged pass
unblocks Smart104's existing Arena-default plan and Smart105 browser verification.
No policy retune, new mechanics search or UI work is authorized in Smart112.

```powershell
node tools/check_docs.js
git diff --check
```

## Stopped result

The four focused momentum-normalization tests passed, the Smart108 focused certificate
controls passed, and the feature build compiled. The combined patch eliminated the
previous Smart106 and Smart110 first failures, then exposed these current-patch rows:

```text
canonical tick 273 -> 274
  phase Finish, cause ExactScan, key None, pair None
  command receipt 0x50eba156b8350eeb
  state receipt   0x80acc66ed5168619

mirrored tick 183 -> 184
  phase Scan, cause ExactScan, key None
  pair indices 1/3, primitive SegmentBody, reject ArithmeticEnvelope
  segment-body progress None
  command receipt 0xdd5576e91179dd8a
  state receipt   0x3d8e384392310c22
```

The canonical Finish subtype was not captured. The mirror record does not name the
arithmetic function, region, visit or separation-certificate phase. No full feature
suite, wasm/runtime gate, competence run, retained log or artifact SHA-256 was run or
reported. Smart112 therefore stopped before pins and competence. Its production edits
remain in the working patch only so Smart113 can diagnose these exact later failures;
they are not accepted as complete and do not authorize UI work.
