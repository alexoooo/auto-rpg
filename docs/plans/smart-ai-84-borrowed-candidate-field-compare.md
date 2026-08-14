# Smart AI 84 -- borrow candidate fields during selection

**Status:** complete and reverted. Smart82 made select `4144`, only `240` above its
`3904` ceiling. Smart84 compared retained fields by reference without any wide
tuple/local: the comparator compiled to frame zero and the complete select phase to
`16`. Exact order, refusal, first-equal, dirty reuse and candidate immutability tests
passed; every declared mutation was red and restored. The test-only prototype was
fully reverted. Smart82 may resume at restore. No production geometry, scratch,
behavior, rejection, pin or corpus changed.

## A -- small-index retained comparator

Recreate only Smart82's test-only `SelectPhaseState`, five retained candidates and
selection phase in `crates/sim/src/combat/contact.rs`. Replace the comparator body
with:

```rust
fn candidate_field_cmp(
    &mut self, left_index: u8, right_index: u8, out: &mut Ordering,
) -> Result<(), ExactScanReject>;
```

The method uses indexes to borrow candidates from disjoint immutable candidate
storage while mutably borrowing only the separate eight-slot arithmetic bank. It
compares, in exact old order:

```text
distance_sq
a.x, a.y, a.z
b.x, b.y, b.z
feature byte
```

For each wide field pass `&left.field` and `&right.field` directly to Smart75
`checked_cmp_into`; write only a small `Ordering`. Do not bind `(left, right)` field
tuples, dereference/copy a rational, copy a point/candidate, return an aggregate, or
call old by-value `wide_cmp`. If Rust borrowing requires it, split candidate storage
at the higher index and choose references from disjoint halves; do not clone.

`segment_state_select_winner` keeps only `winner: u8`, invokes the borrowed comparator
for candidates 1..count in ordinal order, and updates the small index on `Less`.
Equal retains the earlier candidate exactly. Candidate storage and count never mutate.

## B -- exact order and mutation proof

Compare every `Ordering` decision and final winner index to Smart82 on distance-only,
A-point, B-point and feature-only differences, full equality, all five candidates,
negative rationals, shared denominators and exact comparison-envelope refusal. Dirty
arithmetic work and repeat; candidate bytes remain unchanged on success/refusal.

```rust
#[test] fn borrowed_candidate_field_compare_matches_every_old_order_and_refusal() {}
#[test] fn borrowed_candidate_selection_preserves_first_equal_and_candidate_bytes() {}
#[test] fn borrowed_candidate_compare_reuses_disjoint_work_without_growth() {}
```

Mutation proof: restore one tuple copy (frame red), compare B before A and reverse one
axis (ordering red), replace `Less` with `Less|Equal` (first-equal red), alias candidate
storage as mutable arithmetic work (ownership/dirty test red). Restore each.

## C -- strict select gate

Compile one wasm lib-test artifact, print path, size and SHA-256, and parse select plus
the comparator if retained as a name. Acceptance requires the complete select chain
`<=3904`, no hidden nested helper that raises the active chain above `3904`, exact
ordering/refusal/candidate immutability, and all mutations green-after-restore.

The intended target is below Smart82's `4144`; no particular inlining outcome is
assumed. If above `3904`, use `--show-prefix` to identify the exact remaining copy and
stop. If green, record and revert; Smart82 may resume only restore, using this select
shape and Smart83's fused project as controls.

```powershell
cargo test -p sim borrowed_candidate --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart84-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart84-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'candidate_field_cmp|segment_state_select_winner|wide_segment_segment_points|exact_contact_at_pose'
node tools/wasm_stack_frames.js --show-prefix $wasm 'candidate_field_cmp|segment_state_select_winner'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No production state, restore prototype, release digest, pin, full suite or 7,560-case
corpus is authorized.

## Completed result

The three focused tests passed:

```text
borrowed_candidate_field_compare_matches_every_old_order_and_refusal
borrowed_candidate_selection_preserves_first_equal_and_candidate_bytes
borrowed_candidate_compare_reuses_disjoint_work_without_growth
```

Restoring a copied tuple, comparing B before A/reversing an axis, accepting
`Less|Equal`, and aliasing candidate storage with arithmetic work each made its named
test red; every mutation was restored. The parser measured the borrowed comparator at
frame zero and the full retained select at `16`, well below the `3904` ceiling.
Production controls remained `153376` for segment-points and `107600` for
exact-contact. The test-only code was then reverted.

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart84-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 30039898
sha256 74E3A431567CA4981226694975D9AFFAB9E432135613E304C3A23FF4D992AD4A
candidate_field_cmp                 0
segment_state_select_winner        16
wide_segment_segment_points    153376
exact_contact_at_pose          107600
```
