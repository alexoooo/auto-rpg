# Smart AI 109 -- skip exactly certified SegmentBody intervals

**Status:** stopped and fully reverted before stack, wasm, pins or competence. Smart108 proved that the canonical and
mirrored first-refusal intervals are separated by an exact synchronous swept axis at
the root node. Land that one-sided certificate only where the SegmentBody scanner
currently refuses an overlapping one-word interval. Do not infer contact, change a
tolerance or retune the selected strike.

## A -- retained production certificate

In [`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), move
Smart108's sound arithmetic into feature-only production helpers beside
[`wide_sweep_segment_body`](../../crates/sim/src/combat/contact.rs). Preserve exactly:

- eight synchronous multi-affine difference corners per dyadic node;
- axes in endpoint order: closest separation then nonzero segment cross at the node's
  start, followed by closest separation then nonzero segment cross at its end;
- exact sign normalization and exact-equality deduplication without reordering;
- all eight projections having one strict sign and
  `min_abs_projection^2 > radius^2 * dot(axis,axis)`;
- left-before-right bisection, maximum depth `16`, and maximum `131071` visited nodes;
- acceptance only when one axis certifies the node or both children certify.

Production returns `Separated` or `Unresolved`; arithmetic/capacity failures retain
their existing typed `ExactScanReject`. Equality, tangent, crossing, budget exhaustion
and no valid axis are `Unresolved`, never contact.

Do not carry Smart108's formatting, hashes, `Vec` axes or recursive by-value arrays
into production. Extend retained [`ExactWideScratch`](../../crates/sim/src/combat/contact.rs)
with a `SegmentBodySeparationWork` whose capacities are reserved by `try_reserve`:

```text
DFS dyadic nodes 17       # one pending sibling per depth plus current
endpoint points 8         # four segment endpoints at each node end
difference corners 8
axes 4
projection/arithmetic scalar slots 32
```

Use caller-output borrowed helpers and fixed indices into disjoint retained slots.
The DFS stack stores only dyadic `(lo,hi,depth,phase)` words; it does not own wide
points. Clear dirty lengths on every return. `Clone` must recreate the declared
capacities with empty stages, as the existing scratch clone/capacity contract does.
Assert high-water bounds, pointer/capacity stability across two calls, no allocation
after reserve, atomic failure and clean reuse. No `Box` or allocation per interval,
stack-size flag, tolerance, wider arithmetic envelope or changed visit bound is
authorized.

Add production-equivalence tests for every Smart108 fixture and control, including
the exact receipts before the test-only diagnostic is retired or reduced. Mutate the
strict inequality, last corner, axis order, both-child rule and bounds independently;
each named test must go red and be restored.

## B -- the only scanner branch change

Inside the `step == 0` branch of
[`wide_sweep_segment_body`](../../crates/sim/src/combat/contact.rs), preserve the
current ordering:

1. evaluate `time` and `time + 1` with the existing exact closest solver;
2. require both distances strictly greater than their radius squared;
3. run the existing one-word region swept-AABB test;
4. only when that AABB overlaps, call the retained separation certificate for exactly
   `[time,time + 1]`, the current weapon segment, current body-region medial segment
   and combined radius.

On `Separated`, set `time = time + 1` and continue the existing 96-visit loop. On
`Unresolved`, return the same `UnsupportedExactSweep` from the same phase and leave
the existing rejection diagnostic intact. An arithmetic, trajectory or capacity
error propagates its existing named cause. Do not call the certificate for a contact
endpoint, an AABB-disjoint interval, SegmentSegment, SegmentShield or compatibility
scan, and do not let its axis/receipt affect candidate time, region, medial ordering,
publication or suppression.

Add:

```rust
#[test] fn a_certified_segment_body_word_advances_to_the_adjacent_time() {}
#[test] fn an_unresolved_segment_body_word_keeps_exact_unsupported_sweep() {}
#[test] fn segment_body_separation_is_called_only_after_both_endpoint_and_aabb_gates() {}
#[test] fn retained_segment_body_separation_has_fixed_capacity_and_clean_reuse() {}
#[test] fn certified_separation_cannot_change_candidate_order_or_publication() {}
```

For the frozen canonical and mirrored Smart108 rows, require `time` advances from
`22139` to `22140` and `58016` to `58017` respectively. Mutating the certificate to
`Unresolved` must restore the exact Smart107 first rejection. A crossing/tangent
fixture must retain `UnsupportedExactSweep`; a shortcut that continues merely because
both endpoints are separated must make it red.

## C -- feature stack, wasm and regression gates

This path exists only with `cartesian-recoil`; default builds and every default pin
must remain byte-for-byte unchanged. First run:

```powershell
cargo test -p sim --features cartesian-recoil smart108_ -- --nocapture
cargo test -p sim --features cartesian-recoil synchronous_segment_body_axis -- --nocapture
cargo test -p sim --features cartesian-recoil segment_body_separation -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
```

The Smart106 provenance rerun must prove the old canonical pair `0/4` Legs interval
and mirrored pair `1/3` Torso interval no longer refuse, then name the first later
rejection, if any, with the same seed/mirror/tick/phase/cause/key/pair/primitive
grammar. The mutation-to-`Unresolved` control must reproduce the old rejection and
the frozen command/state receipts. Do not weaken the regression to a lower rejection
count.

Build a fresh feature wasm and use the repository parser to record frames for the
certificate leaf, `wide_sweep_segment_body`, exact solve, World step and feature
digest. Require at least 64 KiB headroom under the wasm stack boundary, no OOB, and
stable retained capacities. On two fresh wasm instances and native MSVC, run the
feature articulated digest twice; both targets and both runs must agree, and the
second call must not grow memory. This feature receipt is evidence, not a registered
pin.

```powershell
$env:CARGO_TARGET_DIR='target/smart109-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=Resolve-Path 'target/smart109-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js --show-prefix $wasm 'compute_articulated_stream_digest|step_with_arm_rates|solve_exact_contact_tick|wide_sweep_segment_body|segment_body_separation|advance_exact_into|apply_exact_group_into'
# Use a path-asserting temporary probe for two digest calls in each of two fresh
# instances; print lo/hi and memory pages before/after each call, then delete it.
Remove-Item Env:CARGO_TARGET_DIR
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
```

Stop and revert on an OOB, less than 64 KiB headroom, capacity growth, native/wasm
disagreement, unexplained later refusal or any default pin movement. No pin update is
authorized: `COMBAT_GEOMETRY_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
`ARTICULATED_STREAM_DIGEST`, command/legacy/learned pins, replay/hash grammar and all
ABI versions remain unchanged.

## D -- frozen competence boundary

Only after A-C are green, rerun exactly Smart103's already-declared gate once, in
full, without early stop or override:

```powershell
cargo run --release -p lab --features cartesian-recoil -- articulated --competence-gate
```

The pass remains at least `95/100` body decisions before tick `1800`, with zero
refused submissions and zero solver-rejected ticks. Record the complete stdout,
command receipts, wall time and retained log path/size/SHA when available. Do not
change the ordinal-3144 reach, timing, arc, anatomy, target choice, seeds, tick cap,
damage, threshold or policy after reading the result.

If the result is below `95/100`, or any refusal/rejection remains, record `revise` and
stop. Smart104's Arena promotion and Smart105 browser verification remain blocked.
Passing authorizes Smart104 exactly as already planned; it does not authorize another
mechanics search, a policy retune or new UI behavior.

```powershell
node tools/check_docs.js
git diff --check
```

## Stopped result

The production certificate made both original Smart106/107 intervals advance: the
canonical `210 -> 211` pair `0/4` Legs refusal and mirrored `110 -> 111` pair `1/3`
Torso refusal disappeared. Each orientation then reached a later failure outside the
existing pair diagnostic:

```text
canonical tick 240 -> 241  phase Scan  cause ExactScan  key None  pair None
          command receipt 1415213072758438895
          state receipt     191062832061666801
mirrored  tick 148 -> 149  phase Scan  cause ExactScan  key None  pair None
          command receipt 5049344267239224054
          state receipt   9535803509025357177
```

The prior provenance controls and Smart108 witness tests were green. No retained log,
artifact SHA-256 or exact focused-test count was reported. Because `ExactScan` folds
several internal refusals and `pair=None` proves the pair record did not name this one,
the session stopped before stack/wasm, pins, competence or UI. The production
certificate was fully reverted; no Smart109 geometry survives. Smart110 must recover
the internal pre-mapping cause before this repair can be reconsidered.
