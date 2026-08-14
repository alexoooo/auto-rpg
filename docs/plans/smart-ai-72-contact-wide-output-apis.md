# Smart AI 72 -- caller-output contact geometry values

**Status:** superseded before implementation by Smart71's local-workspace disproof.
It removes large
point/vector/candidate returns while keeping work in caller locals; it adds no
retained field or unused storage. Zero behavior, rejection, ABI, hash, pin or corpus
may move. Do not implement it until Smart76 establishes a retained scalar seam and a
new successor rewrites the dependency order; local caller outputs cannot assume
local scalar work is viable.

## A -- exact output API boundary

Edit `crates/sim/src/combat/contact.rs`. Convert these helpers to borrowed inputs and
caller outputs, in dependency order:

```text
wide_vector_sub_into, wide_vector_add_into, wide_cross_into, wide_dot_into
wide_point_at_into, wide_segment_candidate_into, wide_candidate_cmp_into
wide_rectangle_parameters_into
wide_segment_segment_points_from_origin_into
wide_segment_segment_points_into
wide_segment_rectangle_points_into
```

Each accepts Smart71's one eight-slot scalar work array. Points, three-word vectors,
scalars and `WideSegmentClosest` are written only after all checked operations
succeed. Callers may hold local output values in Smart72; retained placement belongs
only to Smart73. Keep old functions under `#[cfg(test)]`, migrate every production
caller, and delete no oracle before equivalence passes.

Nested rectangle-edge calls receive distinct local outputs from the outer winner;
candidate vector order, feature ordinals, origin restoration and compare order remain
exact. No tuple/array/point/closest return by value may remain on a production edge
among the named helpers.

## B -- equivalence, atomicity and mutations

```rust
#[test] fn caller_output_wide_values_match_every_old_primitive_word_and_refusal() {}
#[test] fn caller_output_wide_values_preserve_candidates_features_and_region_order() {}
#[test] fn caller_output_wide_values_are_atomic_on_every_failure() {}
```

Cover segment/segment interior and four endpoints, rectangle face/two endpoints/four
edges, every body region, parallel/degenerate shapes, equal ties and all exact
refusals. Mutate one vector return back by value, swap a point output, and write the
closest output before a forced refusal; frame/equality/atomicity gates go red.

## C -- named frame delta and stop

Use the parser on inline-never drivers and production functions. Relative to the
recorded Smart71 artifact, every new `_into` driver must have frame `0`,
`wide_vector_sub` must be strictly below its Smart65 `7248`, and
`wide_segment_segment_points` must be strictly below its Smart71 value. Record exact
old/new/delta rows. Outer active-chain headroom is still not claimed.

```powershell
cargo test -p sim caller_output_wide_values --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart72-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart72-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'wide_(vector_sub|point_at|segment_candidate).*into|wide_segment_segment_points|wide_segment_rectangle_points'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
git diff --check
```

Stop without retained workspace, release digest, pins or corpus.
