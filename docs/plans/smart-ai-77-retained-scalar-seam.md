# Smart AI 77 -- land one retained exact-wide scalar seam

**Status:** stopped and fully reverted. One retained eight-slot vector was consumed by
all seven origin/axis subtractions, but scalar storage alone made the owning
segment-points frame worse: `153376 -> 184480`, a `+31104` regression.
`exact_contact_at_pose` remained `107600`. The helper was inlined; caller-side point,
vector, output and reference staging retained and amplified the frame. No production
field, helper, test or other remnant survives, and no behavior, pin or corpus moved.

## A -- retained storage consumed in the same edit

Edit `crates/sim/src/combat/contact.rs` only. Extend `ExactWideScratch` with:

```rust
scalar_work: Vec<WideRational4096>, // declared length 8 after construction
```

`try_reserve` calls `try_reserve_exact(..., WIDE_RATIONAL_WORK_SLOTS)`, then fills
the length once with canonical zero. Capacity must be at least eight--`Vec` may round
an allocation above its requested minimum--and may never grow after construction.
Construction refuses capacity before a tick.
Every call checks length `8` and converts the slice to
`&mut [WideRational4096;8]`; geometry never pushes, resizes, clears or clones it.
This is feature/test exact-wide scratch, not a public field or hash word.

Immediately consume the field in `wide_segment_segment_points_from_origin`. Add
`wide_vector_sub_into` with borrowed `WidePoint` inputs, the retained eight-slot work,
and caller output. Each axis performs Smart75 checked negation/addition and maps
failure to `ArithmeticEnvelope`. Thread the existing `&mut ExactWideScratch` through
the seven origin/axis subtraction sites. Release the scalar borrow before accessing
candidate vectors or recursively calling a rectangle edge; reacquire it for the next
subtraction. The old `wide_vector_sub` remains for untouched families and as the
`#[cfg(test)]` oracle.

The output may be scratch-dirty after failure, but no candidate/winner or caller-
visible result commits until all three axes succeed. Preserve subtraction axis order,
canonical words, origin translation, candidate order and exact refusal. Do not add
point/vector/closest arenas, change Smart75, or migrate any second family.

## B -- exact behavior, capacity and mutation proof

```rust
#[test] fn retained_scalar_segment_subtractions_match_every_old_word_and_refusal() {}
#[test] fn retained_scalar_seam_has_exact_eight_capacity_and_no_second_call_growth() {}
#[test] fn retained_scalar_failure_commits_no_segment_candidate_or_winner() {}
```

Compare old/new segment closest words for interior, four endpoints, parallel and
degenerate segments, translation, equal feature ties, Smart48's frozen primitive,
canonical cancellation and exact arithmetic-envelope refusal. Call twice after
dirtying all eight slots and assert identical result, length, unchanged capacity and
allocation state.

Mutation proof: move the eight-slot array into `wide_vector_sub_into` (frame gate
red), use old by-value subtraction for one axis (word/frame test red), reduce reserve
to seven (capacity test red), and commit a candidate before a forced third-axis
failure (atomicity red). Restore each mutation.

## C -- production frame delta and stop

Compile the wasm lib-test artifact and print its absolute path, size and SHA-256.
Smart74's parser measures:

```text
wide_vector_sub_into
wide_segment_segment_points_from_origin if retained
wide_segment_segment_points
exact_contact_at_pose
```

Acceptance requires the new retained subtraction helper frame `0`,
`wide_segment_segment_points` strictly below Smart75's `153376`, and
`exact_contact_at_pose` no greater than Smart75's `107600`. If the from-origin helper
is still inlined, its retained caller owns the delta; do not stop merely for that
missing name. The untouched old `wide_vector_sub` may remain `9328`. Any geometry or
rejection difference, capacity growth, pin move or frame regression reverts Smart77.

```powershell
cargo test -p sim retained_scalar --features cartesian-recoil -- --nocapture
cargo test -p sim --lib --features cartesian-recoil
$env:CARGO_TARGET_DIR='target/smart77-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart77-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'wide_vector_sub_into|wide_segment_segment_points|exact_contact_at_pose'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Record exact frames and stop. A successor may migrate the next scalar family against
the already-consumed retained seam, one measured root at a time. Point/vector output
APIs and larger retained workspaces remain later; no release feature digest, pin or
7,560-case corpus is authorized.

## Stopped result

The scalar-seam architecture is refuted, not merely under its threshold:

```text
wide_segment_segment_points  153376 -> 184480  delta +31104
exact_contact_at_pose        107600 -> 107600   delta 0
retained scalar slots        8, consumed by 7 origin/axis subtractions
```

Smart78 must measure scalar, point, vector and closest/result staging as one
caller-output unit or prototype a heap-resident whole-segment state machine. It may
not land another scalar-only seam.
