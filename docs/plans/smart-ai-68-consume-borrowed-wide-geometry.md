# Smart AI 68 -- consume borrowed exact-wide geometry

**Status:** stopped before implementation; no Smart68 edit landed. Smart67's focused
equivalence was not sufficient acceptance: `checked_div_into` copies
`work[7].numerator` and `.denominator` (roughly 516 bytes each) into by-value locals
before multiplication, violating the no-copy prerequisite. Smart68 deliberately owns
no `wide.rs` correction. Smart69 must repair and measure the full primitive family;
only then may this exact workspace plan be resumed. No behavior, pin or corpus moved.

## Deferred owned files and exact retained bounds

Edit `crates/sim/src/combat/contact.rs`. Smart67's
`crates/sim/src/combat/wide.rs` API is an input, not a new arithmetic tuning surface.
Add `tools/wasm_stack_frames.js` and `tools/wasm_stack_frames.test.js` only for the
dependency-free frame measurement below.

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

Use named, disjoint views:

```text
points   0..5  ingress origin/a0/a1/b0/b1
         5..9  four origin-relative points
        9..12  projection/face/restored-result stage
       12..18  nested rectangle-edge helper
vectors  0..8  outer u/v/w/side/up/normal/axis/delta
        8..16  nested helper vectors
scalars  0..8  outer persistent dots/determinant/parameters (phase-reused)
        8..16  outer Smart67 arithmetic work array
       16..24  nested persistent scalar values (phase-reused)
       24..32  nested Smart67 arithmetic work array
closest     0  helper candidate stage
            1  outer region/rectangle winner
            2  committed caller result
```

Convert scalar work slices with checked `try_into()` to Smart67's exact
`&mut [WideRational4096; 8]`; a conversion failure is a capacity error before a tick,
never an arithmetic rejection. Build views with `split_at_mut`. Release an outer view
before a nested call, pass only the nested ranges, then reacquire it. No helper keeps
a reference across a phase. Eighteen points avoid overwrite-dependent liveness, and
three closest slots keep helper staging, outer winner and atomic output distinct.

## A -- deferred consumption of the full borrowed helper family

Convert `wide_add`, `wide_sub`, `wide_mul`, `wide_div` and `wide_cmp` to borrow inputs,
use the assigned Smart67 work array, and write a named output slot. Subtraction keeps
checked negation followed by divisible addition; comparison keeps left then right
cross-products. Do not dereference an input merely to call the old by-value API.

Then convert `wide_vector_sub`, `wide_vector_add`, `wide_cross`, `wide_dot`,
`wide_point_at`, `wide_segment_candidate`, `wide_segment_segment_points_from_origin`,
`wide_segment_segment_points`, `wide_rectangle_parameters`,
`wide_segment_rectangle_points`, `wide_segment_body_at_time`, and
`exact_contact_at_pose` to borrowed inputs and retained caller outputs. Preserve limb
operation order, candidate insertion/tie order, feature ordinal, origin restoration,
region order and every `ExactScanReject` exactly.

Scratch may be dirty on refusal, but slot 2 and all authoritative/contact publication
state commit only after success. Clear candidate vectors before their next read at
the same logical boundaries as today. No unsafe code, per-call `Box`/`Vec`, cloning
the workspace, wider bound, tolerance/root change, skipped region, stack-size change
or hash/pin edit is authorized.

## B -- deferred equivalence, bounds and mutation proof

Keep the pre-Smart68 geometry under `#[cfg(test)]` as oracle. Compare every output
word and rejection for segment/segment; segment/body in every anatomy region; and
segment/shield face, endpoint and four edge winners. Cover parallel, zero and
degenerate primitives, equal-distance feature ties, reversed keys, arithmetic
envelope and unsupported-sweep refusal, plus the Smart56/57 recompute fixture.

```rust
#[test] fn retained_borrowed_wide_geometry_matches_every_primitive_word_and_refusal() {}
#[test] fn retained_borrowed_wide_geometry_preserves_order_regions_and_feature_ties() {}
#[test] fn retained_borrowed_wide_geometry_is_atomic_on_checked_failure() {}
#[test] fn retained_borrowed_wide_geometry_has_fixed_capacity_and_no_second_call_growth() {}
#[test] fn retained_borrowed_wide_geometry_stays_inside_each_disjoint_phase_view() {}
```

Mutate one outer call back to by-value, swap `u`/`v`, reverse compare operands, omit
candidate clear, commit closest slot 2 before a forced refusal, and reduce each bound
by one at its maximum fixture. Each mutation must make a named test or wasm frame gate
red, then be restored.

## C -- frame gate now prerequisite Smart69 evidence

Do not implement this plan until Smart69 has made the following parser and primitive
gate green. Because Smart67 found no `llvm-objdump`, add a small Node parser rather than a package.
`tools/wasm_stack_frames.js` reads the wasm binary directly: decode unsigned/signed
LEB128, type/import/function/code sections and the custom `name` function subsection;
map function indexes to code bodies; skip local declarations; and recognize the
initial `global.get`, signed `i32.const`, `i32.sub`, `global.set` stack-pointer
prologue. It prints sorted `name<TAB>frame_bytes` rows and refuses truncated LEBs,
section overruns, missing/duplicate names, unmatched requested names and ambiguous
prologues. It does not execute wasm or infer frames from artifact size.

The parser test constructs minimal byte fixtures in memory for zero, one-byte and
multi-byte signed frame constants including `7248`, `88960`, `139904`, `183200` and
`352176`, plus malformed/truncated/ambiguous cases. It must go red if signed LEB is
decoded as unsigned or the code/function index offset ignores imports. No npm package
or repository dependency is added.

Build a fresh ordinary-path release feature artifact, print absolute path, length and
full SHA-256, and parse at least `compute_articulated_stream_digest`, `step_with`,
`solve`, `exact_contact_at_pose`, `wide_segment_body_at_time`,
`wide_segment_segment_points` and the scalar/vector helpers. Acceptance requires:

- active total at most `983040`, at least `149424` below Smart65's `1132464`;
- at least 64 KiB computed headroom on the default stack;
- both former dominant frames, segment-points `139904` and exact-contact `88960`, lose
  the predicted by-value/local fanout rather than merely moving the trap;
- two feature wasm checker runs complete without OOB, second-run memory growth,
  stale-slot drift or native/wasm disagreement;
- every focused equivalence, refusal, atomicity, bound and mutation test is green.

If the parser cannot identify a frame, the threshold misses, the trap moves, capacity
grows, any golden moves, or targets disagree, revert Smart68 and stop. On pass, record
the measurements and stop: default stream pin ownership remains deferred and no full
corpus or policy/Arena work begins.

```powershell
cargo test -p sim retained_borrowed_wide_geometry --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
node --test tools/wasm_stack_frames.test.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=(Resolve-Path 'target/wasm32-unknown-unknown/release/web.wasm')
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'compute_articulated_stream_digest|step_with|solve|exact_contact_at_pose|wide_segment_body_at_time|wide_segment_segment_points|wide_vector_sub|wide_add|wide_mul'
node --test tools/wasm_check.js
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

`wasm_check.js` reads the ordinary artifact path and ignores `ARPG_WASM_PATH`, which
is why the feature build and printed path immediately precede both probes. The final
non-feature build restores the ordinary artifact and is not Smart68 measurement.
