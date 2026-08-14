# Smart AI 73 -- retain the complete wide geometry workspace

**Status:** blocked and subject to replanning after Smart71's local-workspace
disproof. This final checkpoint moves the
already-proven caller outputs out of nested wasm frames. It adds only storage consumed
in the same edit and owns the full default-stack headroom gate. Zero behavior, pin or
corpus may move. Its 32-scalar inventory is not accepted until Smart76 measures the
smallest subtraction work and a retained seam; a successor must place retained scalar
work before, not after, point/vector caller-output conversion.

## A -- exact retained bounds and consumption

Edit `crates/sim/src/combat/contact.rs`. Extend `ExactWideScratch::try_reserve` and
immediately consume fixed-length heap-backed arenas:

```text
points 18; vectors 16; scalars 32; closest 3
points 0..12 outer, 12..18 nested
vectors 0..8 outer, 8..16 nested
scalars 0..8 outer persistent, 8..16 outer Smart69 work,
        16..24 nested persistent, 24..32 nested Smart69 work
closest 0 helper stage, 1 outer winner, 2 committed result
```

Fill lengths once after exact reserve; geometry calls never push, grow or clone these
vectors. Build disjoint views with `split_at_mut`, release outer views across nested
calls, and convert the two scalar work slices to exact eight-slot arrays. Replace all
Smart72 local large outputs in `wide_segment_segment_points_from_origin`,
`wide_segment_rectangle_points`, `wide_segment_body_at_time` and
`exact_contact_at_pose` with these slots. Commit closest slot 2 only after success.

## B -- final equivalence/capacity gates

```rust
#[test] fn retained_wide_workspace_matches_the_smart72_oracle_for_every_primitive() {}
#[test] fn retained_wide_workspace_has_exact_bounds_and_no_second_call_growth() {}
#[test] fn retained_wide_workspace_uses_disjoint_outer_and_nested_views() {}
#[test] fn retained_wide_workspace_is_atomic_on_every_refusal() {}
```

Lower each bound by one at its maximum fixture, alias outer/nested scalar banks, omit
candidate clear, and precommit slot 2; each named test goes red, then restore.

## C -- release wasm and feature-digest firewall

Use the landed parser on a fresh release feature artifact. Acceptance is active total
at most `983040`, a reduction of at least `149424` from Smart65's `1132464`, leaving
at least 64 KiB headroom. Both segment-points (`139904` before) and exact-contact
(`88960` before) must shrink; a moved trap is failure.

Only after headroom and all focused tests pass, run the feature digest twice using
the diagnostic feature harness planned in Smart70. It must equal the freshly printed
native feature witness on both runs, show no second-call memory growth/OOB/stale state,
and leave every registered pin unchanged. Any disagreement or pin move reverts the
session. Record results and stop before full suite, owner staging or corpus.

```powershell
cargo test -p sim retained_wide_workspace --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
node --test tools/wasm_stack_frames.test.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=(Resolve-Path 'target/wasm32-unknown-unknown/release/web.wasm')
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'compute_articulated_stream_digest|step_with|solve|exact_contact_at_pose|wide_segment_body_at_time|wide_segment_segment_points'
cargo test -p web print_the_articulated_stream_digest --features cartesian-recoil -- --ignored --nocapture
node tools/wasm_feature_digest.js $wasm 0x2d323ac56c901e88
node tools/wasm_feature_digest.js $wasm 0x2d323ac56c901e88
cargo build --release --target wasm32-unknown-unknown -p web
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No Smart73 measurement authorizes a pin re-record or the 7,560-case corpus.
