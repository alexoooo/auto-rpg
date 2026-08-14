# Smart AI 70 -- retain borrowed exact-wide geometry

**Status:** stopped before implementation; no Smart70 edit landed. The actual exact
geometry graph has 179 wide-helper invocations, while `ExactWideScratch` currently
retains only candidate and AABB vectors. Converting the whole graph, all output APIs
and all retained storage atomically is too large to review or prove by mutation as
one landable change. Smart71--73 split scalar wrappers, point/vector/candidate output
APIs, and final retained storage in that order. No unused storage, behavior, pin or
corpus change landed here.

## Owned files and exact retained bounds

Edit `crates/sim/src/combat/contact.rs` for production and focused tests. Add the
diagnostic-only `tools/wasm_feature_digest.js` described below; it changes no shipped
artifact. Smart69's `crates/sim/src/combat/wide.rs` and parser are immutable inputs unless a
measurement proves a defect; such a defect stops Smart70 rather than widening scope.

Extend `ExactWideScratch` with heap-backed vectors initialized once by
`try_reserve`; no geometry call may grow or change their lengths:

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

Use these disjoint views:

```text
points   0..5  ingress origin/a0/a1/b0/b1
         5..9  four origin-relative points
        9..12  projection/face/restored-result stage
       12..18  nested rectangle-edge helper
vectors  0..8  outer u/v/w/side/up/normal/axis/delta
        8..16  nested helper vectors
scalars  0..8  outer persistent dots/determinant/parameters, phase-reused
        8..16  outer Smart69 arithmetic work array
       16..24  nested persistent scalars, phase-reused
       24..32  nested Smart69 arithmetic work array
closest     0  helper candidate stage
            1  outer region/rectangle winner
            2  committed caller result
```

Convert scalar work slices with checked `try_into()` to Smart69's exact eight-slot
array. Failure is a construction capacity error before a tick, never an arithmetic
rejection. Build all views with `split_at_mut`; release an outer view before a nested
call and pass only nested ranges. No reference survives a phase. The conservative
18/16/32/3 bounds do not depend on overwriting live inputs or winners.

## A -- consume the borrowed helper family

Convert `wide_add`, `wide_sub`, `wide_mul`, `wide_div` and `wide_cmp` to borrow inputs,
use their assigned Smart69 work array, and write a named retained slot. Subtraction
keeps checked negation followed by divisible addition; comparison keeps left then
right cross-products. No input may be dereferenced merely to invoke an old by-value
method.

Then convert `wide_vector_sub`, `wide_vector_add`, `wide_cross`, `wide_dot`,
`wide_point_at`, `wide_segment_candidate`, `wide_segment_segment_points_from_origin`,
`wide_segment_segment_points`, `wide_rectangle_parameters`,
`wide_segment_rectangle_points`, `wide_segment_body_at_time`, and
`exact_contact_at_pose` to borrowed inputs and retained caller outputs. Preserve limb
operation order, candidate insertion/tie order, feature ordinal, origin restoration,
region order and every `ExactScanReject` exactly.

Scratch may be dirty after refusal, but closest slot 2 and all authoritative/contact
publication state commit only after success. Clear candidate vectors before their
next read at today's logical boundaries. No unsafe code, per-call `Box`/`Vec`, scratch
clone, larger bound, tolerance/root change, skipped region, stack-size change or
hash/pin edit is authorized.

## B -- equivalence, bounds and mutation proof

Freeze the pre-Smart70 geometry under `#[cfg(test)]` as oracle. Compare every output
word and exact rejection for segment/segment; segment/body in every anatomy region;
and segment/shield face, endpoint and four edge winners. Cover parallel, zero and
degenerate primitives, equal-distance feature ties, reversed keys, arithmetic
envelope and unsupported-sweep refusal, plus the Smart56/57 recompute fixture.

```rust
#[test] fn retained_borrowed_wide_geometry_matches_every_primitive_word_and_refusal() {}
#[test] fn retained_borrowed_wide_geometry_preserves_order_regions_and_feature_ties() {}
#[test] fn retained_borrowed_wide_geometry_is_atomic_on_checked_failure() {}
#[test] fn retained_borrowed_wide_geometry_has_fixed_capacity_and_no_second_call_growth() {}
#[test] fn retained_borrowed_wide_geometry_stays_inside_each_disjoint_phase_view() {}
```

Mutate one scalar call back to by-value, swap `u`/`v`, reverse compare operands, omit
candidate clear, commit slot 2 before a forced refusal, and reduce each bound by one
at its maximum fixture. Each mutation must make a named test or frame gate red, then
be restored.

## C -- release-wasm headroom and feature probe

Build a fresh ordinary-path release feature artifact; print its absolute path, size
and full SHA-256. Use the already-landed dependency-free parser on at least
`compute_articulated_stream_digest`, `step_with`, `solve`,
`exact_contact_at_pose`, `wide_segment_body_at_time`,
`wide_segment_segment_points`, `wide_vector_sub`, `wide_add`, `wide_mul` and the
reachable Smart69 helpers. Record exact frame rows and sum only the simultaneously
active chain.

`tools/wasm_check.js` hard-codes the default stream pin and therefore is not the
feature probe. The new dependency-free `tools/wasm_feature_digest.js` accepts the
artifact path and native feature witness, instantiates the module, reads
`articulated_stream_digest_lo/hi`, records exported-memory pages before/after the
first and second calls, and asserts: both calls equal each other, the second call
does not grow memory, and the result equals the native witness. It prints path,
digest and all three page counts. Its Node test uses a minimal wasm fixture whose
first call grows once and whose second is cached, then mutations force second-call
growth and a target mismatch red. The current unregistered native feature witness is
`0x2d323ac56c901e88`; remeasure it with the feature web test before invoking the wasm
script and stop if it differs.

Acceptance requires all of:

- active total at most `983040`, at least `149424` below Smart65's `1132464` and thus
  at least 64 KiB headroom on the default stack;
- segment-points (`139904` before) and exact-contact (`88960` before) both lose their
  predicted by-value/local fanout rather than merely moving the trap;
- the feature wasm digest/checker completes twice on the same fresh artifact, with
  identical digest, no OOB, second-run memory growth or stale-slot drift;
- native and wasm feature digests agree, and all geometry equivalence/refusal/
  atomicity/capacity tests pass;
- every registered pin remains byte-for-byte unchanged. The feature digest is an
  unregistered measurement and must not be written into the registry.

If the parser misses a name, the reduction is under `149424`, headroom is under
64 KiB, the trap only moves, capacity grows, any result/pin changes or targets
disagree, revert Smart70 and stop. Even on green, record the two feature digest runs
and stop before default pin work, owner staging, full behavior suites, policy/Arena
work or the 7,560-case corpus.

```powershell
cargo test -p sim retained_borrowed_wide_geometry --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p web native_and_wasm_pose_event_stream_digests_match --features cartesian-recoil -- --nocapture
cargo test -p web print_the_articulated_stream_digest --features cartesian-recoil -- --ignored --nocapture
node --test tools/wasm_stack_frames.test.js
node --test tools/wasm_feature_digest.test.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=(Resolve-Path 'target/wasm32-unknown-unknown/release/web.wasm')
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'compute_articulated_stream_digest|step_with|solve|exact_contact_at_pose|wide_segment_body_at_time|wide_segment_segment_points|wide_vector_sub|wide_add|wide_mul|multiply_rational_parts_into'
node tools/wasm_feature_digest.js $wasm 0x2d323ac56c901e88
node tools/wasm_feature_digest.js $wasm 0x2d323ac56c901e88
cargo build --release --target wasm32-unknown-unknown -p web
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

The feature script receives the printed absolute path directly; it does not use the
ignored `ARPG_WASM_PATH`. The feature build and identity immediately precede both
probes. The final
non-feature build restores the ordinary artifact and is not Smart70 measurement.
