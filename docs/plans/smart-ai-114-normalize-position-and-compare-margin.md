# Smart AI 114 -- canonicalize exact position and compare strict margins

**Status:** stopped at seed-0 provenance; the Smart112+114 production edits remain held for diagnosis. Keep Smart112's held momentum normalization
and SegmentBody certificate. Smart113 proved two independent representation/envelope
failures: a sign-opposed exact position after advance and a positive-rational
comparison whose cross-products exceed 4096 bits. Repair only those operations, add
the missing production tests, then rerun provenance and the unchanged competence gate.

## A -- rational-identity-preserving position normalization

In [`crates/sim/src/combat/trajectory.rs`](../../crates/sim/src/combat/trajectory.rs),
add:

```rust
fn normalize_position(
    position: ExactPosition,
    scale: i128,
) -> Result<ExactPosition, ExactTrajectoryReject>
```

With checked `i128` arithmetic require `scale > 0` and form
`denominator = scale * 65536`. Do **not** reconstruct
`denominator * position.raw + position.remainder`: `advance_affine` deliberately
avoids that product because valid shipped positions can exceed `i128`. Require
`abs(remainder) < denominator`, then canonicalize with the one-carry identity:

```text
raw > 0, remainder < 0  => raw' = raw - 1, remainder' = remainder + denominator
raw < 0, remainder > 0  => raw' = raw + 1, remainder' = remainder - denominator
otherwise               => unchanged
```

Use checked `i32` quotient and `i128` remainder operations. Return only when the bound
still holds and nonzero quotient/remainder signs no longer oppose. Do not use Euclidean
division, rounding, saturation, remainder zeroing or a wider representation. Prove
the identity algebraically as `denominator*delta_raw + delta_remainder == 0`; use
`WideInt4096` only in tests whose original full numerator does not fit `i128`.

In `advance_affine`, after the existing fractional/carry computation has written all
three proposed positions and before `validate_affine`, normalize each position with
the same scale. Momentum and group-time words remain unchanged. Build the complete
affine in a local and assign only after all axes normalize and validation succeeds, so
failure is atomic.

Add:

```rust
#[test] fn position_normalization_preserves_the_exact_numerator() {}
#[test] fn position_normalization_repairs_the_smart113_finish_word() {}
#[test] fn position_normalization_keeps_canonical_zero_and_mirrored_words_exact() {}
#[test] fn position_normalization_refuses_scale_denominator_and_i32_overflow_atomically() {}
#[test] fn advance_exact_into_canonicalizes_position_without_changing_momentum() {}
```

Freeze every Smart113 canonical literal, including Y/Z controls and group times.
Restore the unnormalized proposed X word as a mutation and require the Finish fixture
red; zeroing its remainder, reconstructing the overflowing full numerator, using
`scale` without the tick factor and normalizing momentum instead must each be red and
restored.

## B -- exact positive-rational comparison without cross-products

In [`crates/sim/src/combat/wide.rs`](../../crates/sim/src/combat/wide.rs), add a
borrowed/caller-output helper for **strictly positive canonical rationals**:

```rust
pub(crate) fn checked_cmp_positive_into(
    left: &WideRational4096,
    right: &WideRational4096,
    work: &mut PositiveRationalCmpWork,
    out: &mut Ordering,
) -> bool
```

`PositiveRationalCmpWork` owns retained 4096-bit numerator, denominator, quotient and
remainder slots for both sides. It never materializes `left.numerator *
right.denominator` or the opposite product. Compare continued fractions exactly:

Before editing the comparator, temporarily restore Smart113's first-wide-failure
capture on the frozen mirrored run and retain the complete left/right rational words
for the direct fixture. Require the same region `3`, time `49602`, root, axis `0` and
bit lengths, then remove the capture. Bit lengths alone are not a test oracle.

1. divide each positive numerator by its positive denominator;
2. if integer quotients differ, return their order, reversed when inversion parity is
   odd;
3. if both remainders are zero, return equal; if exactly one is zero, the integral
   side is smaller before inversion and larger after inversion;
4. replace each fraction by `denominator/remainder`, toggle inversion parity and
   continue.

Bound the Euclidean loop at `8192` iterations, twice the fixed bit width. Each
nonterminal iteration strictly reduces a positive remainder, so bound exhaustion is a
named false return and a test failure, not an approximate order. Reject zero/negative
or noncanonical inputs without changing `out`. Preserve generic `checked_cmp` and the
4096-bit arithmetic envelope unchanged.

Add the retained work to `SegmentBodySeparationWork`; reserve no heap and grow no
existing Vec. Use it only for the certificate's final strict comparison of the
already-positive `left = p*p` and `right = radius_sq*dot(axis,axis)`. Equality remains
not separated. All earlier adds/subtracts/multiplies/comparisons and certificate
bounds/order stay unchanged.

Tests:

```rust
#[test] fn positive_rational_compare_matches_cross_products_when_they_fit() {}
#[test] fn positive_rational_compare_orders_the_smart113_4201_bit_products() {}
#[test] fn positive_rational_compare_handles_integral_equal_and_inverted_steps() {}
#[test] fn positive_rational_compare_refuses_nonpositive_dirty_and_exhausted_inputs_atomically() {}
#[test] fn segment_body_certificate_keeps_strict_margin_without_cross_multiplication() {}
```

Generate deterministic small rational matrices and compare against ordinary
cross-products where they fit. Freeze Smart113 operand words in full, not only bit
lengths, in the implementation session before deleting diagnostics. Mutation proof:
restore generic `wide_cmp`, drop inversion reversal, reverse the one-zero rule, accept
equality, lower the iteration bound beneath a constructed continued fraction, or
overwrite `out` on refusal; each named test must go red and be restored.

## C -- missing production and retained-stack tests

Smart112 landed helper-level normalization controls but did not land the planned World
or production-certificate tests. Add them now in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs) and
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs):

```rust
#[test] fn clipped_wall_common_momentum_is_canonical_and_rationally_exact() {}
#[test] fn unclipped_wall_commit_keeps_every_exact_momentum_word() {}
#[test] fn clipped_wall_commit_maps_under_reflection() {}
#[test] fn a_certified_segment_body_word_advances_to_the_adjacent_time() {}
#[test] fn an_unresolved_segment_body_word_keeps_exact_unsupported_sweep() {}
#[test] fn segment_body_certificate_is_called_only_after_endpoint_and_aabb_gates() {}
#[test] fn retained_segment_body_certificate_has_fixed_capacity_clone_and_clean_reuse() {}
```

The certificate tests exercise the production helper, not Smart108's copy. Assert
capacities `17/8/8/4/32`, positive-comparator work addresses stable across two calls,
no allocation/growth, dirty-stage cleanup, clone reinitialization, atomic refusal and
the exact canonical/mirrored Smart108 root certificates. Mutations forcing unresolved,
omitting the eighth corner, changing strictness and restoring quotient-only wall
momentum must independently fail.

Because retained wide aggregates have repeatedly inflated wasm frames, require
borrowed inputs and caller-output slots through the comparator. Add a `#[inline(never)]`
test driver compiled to wasm and use the repository parser before/after. The comparator
and certificate driver may add no by-value `WideRational4096` return frame; production
active-stack headroom remains at least 64 KiB.

```powershell
cargo test -p sim --features cartesian-recoil position_normalization -- --nocapture
cargo test -p sim --features cartesian-recoil positive_rational_compare -- --nocapture
cargo test -p sim --features cartesian-recoil clipped_wall -- --nocapture
cargo test -p sim --features cartesian-recoil segment_body_certificate -- --nocapture
cargo test -p sim --features cartesian-recoil
```

## D -- seed-0 provenance, targets and pins

Rerun only seed 0 canonical and mirrored first-rejection provenance. Smart114 must
eliminate canonical tick 273 Finish and mirrored tick 183 pair arithmetic, while the
prior Smart106 and Smart110 rows remain eliminated. Record the first later exact
failure with full internal provenance, or explicitly none through tick 1800. Any
refusal, solver-rejected tick, capacity growth or unexplained receipt move stops before
competence.

Then build a fresh feature wasm, record path/size/SHA, comparator/certificate and full
active frames, and require at least 64 KiB headroom. Run the feature digest twice in
each of two fresh wasm instances and twice native; all agree and second calls do not
grow memory. The feature receipt is expected at risk and remains unregistered.

Default registered pins have zero budget and must remain unchanged:
`COMBAT_GEOMETRY_HASH`, `CONTACT_BEHAVIOR_DIGEST`, `ARTICULATED_STREAM_DIGEST`,
command, legacy and learned pins. No ABI, replay or hash-grammar change.

```powershell
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
$env:CARGO_TARGET_DIR='target/smart114-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=Resolve-Path 'target/smart114-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js --show-prefix $wasm 'compute_articulated_stream_digest|step_with_arm_rates|solve_exact_contact_tick|wide_sweep_segment_body|segment_body_separation|checked_cmp_positive|normalize_position|normalize_momentum'
# Use the path-asserting two-instance/two-call feature digest probe; print lo/hi
# and pages before/after, then remove it.
Remove-Item Env:CARGO_TARGET_DIR
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
```

## E -- unchanged competence boundary

Only after A-D are wholly green, run once without override or early stop:

```powershell
cargo run --release -p lab --features cartesian-recoil -- articulated --competence-gate
```

The pass remains at least `95/100` body decisions before tick 1800, zero command
refusals and zero solver-rejected ticks. Record complete stdout, outcomes, contact
kinds, worst decision tick, receipts, wall time and log path/size/SHA if retained.
Below threshold or any rejection is `revise` and stops.

Do not change ordinal 3144, reach, timing, arc, target, seeds, cap, damage or threshold.
No retune, new mechanics search or Arena/UI work is authorized until the unchanged
gate passes; only then do Smart104/105 unblock.

```powershell
node tools/check_docs.js
git diff --check
```

## Stopped result

The four focused position-normalization tests and four focused positive continued-
fraction comparison tests passed. Mirrored Tactical seed 0 then completed through
tick 1800 with no rejection. Canonical reached one later first failure:

```text
tick 299 -> 300
phase SolveGroup
cause ExactSolver
key hero entity 0 slot 1 -> monster entity 1 BODY_SLOT, WeaponBody
pair None
command receipt 0x667109859aa387b3
state receipt   0x987128c826a69090
```

The group ordinal, selected time, region, facts, driver/lifted rows and internal lifted
solver variant were not captured. No mutation, feature build, full suite, wasm,
competence, retained log or SHA-256 evidence was reported. Smart112+114 edits remain
held in `trajectory.rs`, `wide.rs`, `contact.rs` and `world.rs`; they are not accepted
complete. Smart115 must name this SolveGroup refusal and separately audit the gate's
zero-refusal rule before any further production decision or Arena work.
