# Smart AI 66 -- retain the exact-wide geometry workspace

**Status:** stopped before implementation; no Smart66 production edit landed.
Smart65 proved that borrowed inputs and four caller-output translations alone merely
move the wasm trap. The attempted atomic design then reached a lower prerequisite:
`wide.rs` still passes its roughly 1032-byte `WideRational4096` through by-value
`checked_add_divisible`, multiply, divide, compare, negate and truncate primitives.
Changing only the contact wrappers cannot remove those copies. Smart67 owns that
standalone foundation; a later Smart68 may consume it in this retained geometry
workspace. Smart66 changed no geometry word, rejection, capacity, behavior pin, ABI,
hash grammar, policy or corpus.

## Deferred owned files and fixed storage

Edit `crates/sim/src/combat/contact.rs` and, only for the borrowed rational entry
points below, `crates/sim/src/combat/wide.rs`. Extend the existing retained
`ExactWideScratch`; do not add a second World field or put a large array inline in
`ContactCollectionScratch`. Add these exact heap-backed arenas, with named indexes
rather than pushes during a query:

```rust
const WIDE_WORK_POINTS: usize = 18;
const WIDE_WORK_VECTORS: usize = 16;
const WIDE_WORK_SCALARS: usize = 32;
const WIDE_WORK_CLOSEST: usize = 3;

work_points: Vec<WidePoint>,
work_vectors: Vec<[WideRational4096; 3]>,
work_scalars: Vec<WideRational4096>,
work_closest: Vec<WideSegmentClosest>,
```

`ExactWideScratch::try_reserve` reserves exactly those four bounds along with the
existing candidate/AABB bounds, then fills each work arena once with zero values.
No geometry call may change a capacity or length. Use named, half-open ranges:

```text
points  0..5   ingress origin/a0/a1/b0/b1
        5..9   four origin-relative points
        9..12  projected/face/restored result staging
       12..18  nested rectangle-edge helper points
vectors 0..8   outer u/v/w/side/up/normal/axis/delta
        8..16  nested helper vectors
scalars 0..16  outer dots/determinant/parameters/squares
       16..32  nested helper scalars
closest 0      helper candidate staging
        1      outer region/rectangle winner
        2      committed caller result
```

Construct `WideWorkView` values with `split_at_mut` over these disjoint ranges. An
outer phase must release its view before invoking a nested phase and reacquire it
afterward; nested helpers receive only `12..18`, `8..16`, `16..32` and closest slot
zero, never the whole scratch. This prevents aliasing and accidental re-entrancy
while the outer winner remains live. No helper may retain a reference across a
phase boundary. The conservative 18-point inventory avoids relying on overwriting an
original immediately after translation; three closest slots separately own helper
staging, the outer winner and atomic committed output.

Name indexes for origin/restored/projected points, `u`/`v`/`w`, rectangle
side/up/normal/axis/delta, the five dot products, determinant, parameters, squared
terms, candidate and committed result. A compile-time or focused test must prove the
largest segment, rectangle and body-region paths remain within all four declared
bounds and use only the view assigned to their phase. Widening a bound is a
capacity-contract change and stops this session.

The inventory deliberately covers both measured owners: segment-points' translated
points, `u`/`v`/`w`, dot/scalar and candidate work, and exact-contact's selected
candidate/result staging. It is not permission to store trajectories, owners, AABBs
or compatibility rows in these arenas.

## A -- deferred borrowed, caller-output helper family

The scalar layer is part of the repair, not an implementation detail to leave by
value. A `WideRational4096` is about 1032 bytes and the measured path crosses roughly
62 calls to `wide_add`, `wide_sub`, `wide_mul`, `wide_div` and `wide_cmp`. Convert
those five helpers to borrow both scalar inputs. Add borrowed, caller-output checked
entry points on `WideRational4096` where the old by-value methods would otherwise
reintroduce the same ABI copies: add/subtract/multiply/divide write a designated
`work_scalars` slot only on success, while compare writes a small `Ordering` output
only on success. `wide_sub` must retain the same checked-negation then divisible-add
path; compare must retain the same cross-product order and envelope refusal. The old
methods may remain only where callers outside this owned chain require them; the
exact-wide geometry path may not dereference a borrowed scalar merely to pass it by
value again.

Convert `wide_vector_sub`, `wide_vector_add`, `wide_cross`, `wide_dot`,
`wide_point_at`, `wide_segment_candidate`, `wide_segment_segment_points_from_origin`,
`wide_segment_segment_points`, `wide_rectangle_parameters`, and
`wide_segment_rectangle_points` to borrow wide inputs and fill a named retained slot
or small caller output. Every scalar intermediate they produce must occupy its
phase's existing `work_scalars` range; no additional scalar local or arena is
authorized. `wide_segment_body_at_time` and
`exact_contact_at_pose` borrow the workspace results rather than copying them through
nested `Result`/sret returns. Keep `WideRational4096` checked arithmetic, comparison
order, feature ordinals, candidate insertion order and origin restoration byte for
byte.

The output contract is atomic: helpers may dirty designated work slots and candidate
scratch on failure, but copy to the caller-visible result slot only after every
checked operation succeeds. A rejection leaves trajectories, compatibility rows and
the prior committed result unchanged. Clear candidate lengths at the same logical
boundaries as today and before any later read; work-slot contents are never
authoritative and every slot read must have been written in that invocation.

Do not use `#[inline(never)]` as the repair, heap-allocate per call, clone the
workspace, narrow `WideRational4096`, change tolerances/root selection, skip a region,
grow a vector after initialization, raise wasm stack size, or alter the already
retained AABB buffers.

## B -- deferred exact equivalence, capacity and mutation proof

Freeze the pre-Smart66 implementations under `#[cfg(test)]` as the oracle. Compare
every word of success and the exact `ExactScanReject` for segment/segment,
segment/body across every anatomy region, and segment/shield across face, endpoint
and four edge winners. Include zero/parallel/degenerate geometry, equal-distance
feature ties, arithmetic-envelope refusal, unsupported-sweep refusal, reversed pair
order and the Smart56/Smart57 recompute fixture.

```rust
#[test] fn retained_wide_workspace_matches_every_exact_primitive_word_and_rejection() {}
#[test] fn retained_wide_workspace_preserves_candidate_order_and_feature_ties() {}
#[test] fn retained_wide_workspace_is_atomic_on_every_checked_failure() {}
#[test] fn retained_wide_workspace_has_fixed_lengths_capacities_and_no_second_call_growth() {}
#[test] fn every_wide_work_slot_is_written_before_read_and_within_its_bound() {}
#[test] fn nested_wide_geometry_uses_only_its_disjoint_work_view() {}
#[test] fn borrowed_wide_scalars_match_add_sub_mul_div_cmp_and_every_refusal() {}
```

Mutation proof is mandatory: swap one `u`/`v` slot, omit the pre-commit copy, omit a
rectangle candidate clear, replace divisible-add in subtraction with ordinary add,
reverse the compare cross-products, and lower each arena bound by one at its maximum
fixture. Each mutation must make its named test red, then be restored. The scalar
fixture includes equal/negative/zero-denominator-divisor, reducible denominators and
each arithmetic-envelope refusal, and asserts that caller outputs remain unchanged
on failure.

## C -- stop boundary inherited by Smart68

Build fresh default-stack feature wasm at an explicit path and print absolute path,
length, full SHA-256 and feature mode. Disassemble the same chain as Smart65. The
acceptance gate is all of:

- simultaneous active bytes are at most `983040`, a measured reduction of at least
  `149424` from `1132464` and therefore at least 64 KiB stack headroom;
- both `wide_segment_segment_points` (`139904` before) and
  `exact_contact_at_pose` (`88960` before) lose the predicted by-value/local work;
- the feature wasm probe completes twice without OOB, memory growth on the second
  call, stale-slot drift or target disagreement;
- native primitive/recompute results and rejection identities match the frozen
  oracle exactly.

Do not implement this plan as Smart66. Smart68 must first import Smart67's measured
borrowed scalar API, then revalidate every bound and command below before editing the
geometry family. If any threshold misses, the trap merely moves, a vector grows, an unpredicted pin
moves, or native and wasm disagree, revert and stop with the first boundary. Even on
pass, stop before owner staging, default stream re-recording, a full behavior suite,
Smart41's 7,560-case corpus, policy work or Arena work. Smart66 predicts zero pin
moves because it changes storage and call shape only.

```powershell
cargo test -p sim retained_wide_workspace --features cartesian-recoil -- --nocapture
cargo test -p sim every_wide_work_slot --features cartesian-recoil -- --nocapture
cargo test -p sim borrowed_wide_scalars --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=(Resolve-Path 'target/wasm32-unknown-unknown/release/web.wasm')
$wasm.Path
(Get-Item $wasm).Length
(Get-FileHash -Algorithm SHA256 $wasm).Hash
node --test tools/wasm_check.js
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

The checker reads exactly the ordinary target path printed above;
`ARPG_WASM_PATH` remains known to be ignored. The explicit feature build must happen
immediately before both probes. Restore the ordinary default artifact with its normal
non-feature build after the evidence is recorded; do not interpret that restoration
as another Smart66 measurement.
