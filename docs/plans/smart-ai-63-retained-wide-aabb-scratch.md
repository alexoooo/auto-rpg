# Smart AI 63 -- retain wide AABB scratch

**Status:** stopped at checkpoint D on 2026-08-13. Native focused equivalence and
capacity tests are green. A fresh feature wasm artifact now passes the exact scan,
proving the retained AABB move worked there, but later traps out of bounds along
`ExactKinematics::finish -> advance_exact -> FixedExactOwners::from_slice`. The
measured remaining active stack is `965,788` bytes, still too close to the default
shadow-stack boundary once the finish-frame allocation is added. The earlier report
of the same scan-chain OOB came from a stale artifact because `ARPG_WASM_PATH` was
ignored; it is superseded. No digest completed, no pin changed, and no full suite or
corpus ran. Smart64 owns current-artifact prologue accounting for finish/from_slice.

## A -- two retained buffers of exactly 20 points

In [`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), remove
the owning `WideSweptAabbPoints { points: [WidePoint;20], len, radius_raw }`. Add to
`ExactWideScratch`:

```rust
aabb_left: Vec<WidePoint>,
aabb_right: Vec<WidePoint>,
```

`ExactWideScratch::try_reserve` must call `try_reserve_exact` with
`AnatomyRegion::COUNT * 4` (`20`) for both, beside the existing candidate reserves.
No `Box`, per-call `Vec`, stack linker flag, global/static scratch, or lazy growth is
allowed. Extend capacity diagnostics to expose both buffers.

Replace the owning type with a borrowed view:

```rust
struct WideSweptAabbView<'a> {
    points: &'a [WidePoint],
    radius_raw: i32,
}
```

Add a fill helper that clears a supplied retained vector, pushes identical points in
identical order, refuses before a 21st point, and returns the radius:

```rust
fn fill_wide_swept_aabb_points(
    out: &mut Vec<WidePoint>, row: &ExactContactTrajectory,
    owner: &ExactOwnerTrajectory, start: u32, end: u32,
) -> Result<i32, ExactScanReject>
```

It must never reserve. Preserve segment order/count 4, shield order/count 8, body
region order/count at most 20, and the existing maximum-radius rule. After world
reservation capacity must be at least 20; guard `len()==20` before every push.

## B -- fill, borrow, compare, clear, reuse

Pass `&mut ExactWideScratch` through `wide_swept_aabbs_are_disjoint` and its `_during`
helper. Destructure the two vector fields, fill them independently, then compare
borrowed views:

```rust
let lr = fill_wide_swept_aabb_points(left, a, ao, start, end)?;
let rr = fill_wide_swept_aabb_points(right, b, bo, start, end)?;
wide_aabb_points_are_disjoint(
    WideSweptAabbView { points: left.as_slice(), radius_raw: lr },
    WideSweptAabbView { points: right.as_slice(), radius_raw: rr },
)
```

Update `scan_detector_into` to pass `&mut scratch.exact_wide`. Update
`wide_segment_body_region_aabbs_are_disjoint_during` to reuse the same pair: segment
in left, exactly four selected-region points in right, immediate borrowed comparison,
then clear/reuse for the next region. Never retain a slice across clear/fill, recurse,
or borrow the buffers for nested scans.

Keep comparison arithmetic, origin, order, radius sum and strict `Greater` tests
unchanged. This is storage relocation, not geometry.

## C -- equivalence, capacity and mutation gates

```rust
#[test] fn wide_aabb_scratch_reserves_two_exact_twenty_point_buffers() {}
#[test] fn wide_aabb_fill_uses_four_eight_and_twenty_points_in_frozen_order() {}
#[test] fn retained_aabb_scan_matches_the_pre_move_candidate_and_refusal_corpus() {}
#[test] fn repeated_pairs_and_regions_reuse_buffers_without_growth() {}
#[test] fn a_twenty_first_aabb_point_refuses_before_push() {}
#[test] fn contact_reservation_makes_first_and_second_scan_allocation_free() {}
```

Freeze complete pre-change candidate bytes and refusal outcomes for segment/segment,
segment/shield, five-region segment/body, far rejection and ordinal 1536. Record both
capacities after reservation, first scan and identical second scan; capacities must
remain unchanged and at least 20. Mutation proof: omit right reservation and require
the no-growth test to fail; swap body-region point order or omit clear and require the
frozen candidate/refusal corpus to fail. Restore production.

## D -- default-stack wasm proof

Build feature wasm normally, with no stack-size flag, into a separate target path.
Use Smart62's explicit feature-probe mode and transient unregistered native actuals:

```powershell
$env:CARGO_TARGET_DIR='target/smart63-feature'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_WASM_PATH=(Resolve-Path 'target/smart63-feature/wasm32-unknown-unknown/release/web.wasm')
$env:ARPG_WASM_FEATURE_PROBE='1'
$env:ARPG_NATIVE_FEATURE_COMMAND='0x5fcaba34556b2737'
$env:ARPG_NATIVE_FEATURE_STREAM='0x2d323ac56c901e88'
node --test tools/wasm_check.js
node --test tools/wasm_check.js
Remove-Item Env:ARPG_WASM_PATH,Env:ARPG_WASM_FEATURE_PROBE,Env:ARPG_NATIVE_FEATURE_COMMAND,Env:ARPG_NATIVE_FEATURE_STREAM,Env:CARGO_TARGET_DIR
```

Required evidence (not satisfied; this checkpoint stopped):

- no `scan_detector_into` OOB on two complete runs;
- command and stream equal transient native actuals both times;
- linear-memory pages after first completed stream equal pages after second;
- disassembly/prologue measurement shows removal of the inline pair and the full call
  chain below the default stack with at least 64 KiB headroom;
- default checker mode remains strict.

If headroom is below 64 KiB, second-call memory grows, candidate bytes change, or wasm
differs from native, stop. Do not raise stack, reserve over 20, or move publication
arrays.

## E -- zero pins and handoff

Smart63 permits zero pin moves. Keep every constant old, including the deferred
default stream pin; add no feature pin and do not run the 7,560-case corpus. Record
capacities, old/new scan prologue size, headroom, memory pages and repeated feature
actuals in Smart63 and durable research. A successor may resume Smart61 D atomically.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim wide_aabb_scratch --features cartesian-recoil -- --nocapture
cargo test -p sim wide_aabb_fill --features cartesian-recoil -- --nocapture
cargo test -p sim retained_aabb_scan --features cartesian-recoil -- --nocapture
cargo test -p sim repeated_pairs_and_regions --features cartesian-recoil -- --nocapture
cargo test -p sim contact_reservation_makes_first --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p web --features cartesian-recoil
cargo test
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No server or browser is needed. Remove only `target/smart63-feature` after recording
evidence; ordinary target artifacts remain untouched.
