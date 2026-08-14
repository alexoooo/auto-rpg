# Smart AI 81 -- remove the interior candidate aggregate frame

**Status:** complete and reverted after a green diagnostic. Smart80
made solve `1072` but found its nested candidate helper at `8288`; the active solve
chain therefore remains `9360`. Smart81 is diagnostic/test-only and removes exactly
the local negated rationals and final `WideSegmentClosest` aggregate assembly. The
candidate helper must be at most `2832`, making the chain at most `3904`. No
production geometry, scratch, behavior, rejection, pin or corpus changes.

## A -- direct retained distance and field commit

Recreate only Smart80's test-only `ResidualSolveState`, green decomposed solve, and
interior candidate helper in `crates/sim/src/combat/contact.rs`. Preserve all slot
indexes, arithmetic order and fixture inputs.

Replace `interior_candidate_into` with a method that:

1. receives retained point-slot indexes `a` and `b`, a retained scalar distance slot,
   candidate slot index and feature byte;
2. reserves existing persistent scalar slot `13` as `NEGATED_RHS`, calls Smart75
   `checked_neg_into` with the eight-slot arithmetic bank and writes its output to
   slot 13, then calls `checked_add_divisible_into` with slot 13 as borrowed RHS and
   writes directly into a separate retained difference scalar slot;
3. multiplies that retained difference by itself and accumulates directly into the
   final retained distance slot;
4. after all axes succeed, copies point coordinates field-by-field into the retained
   candidate slot, copies the retained distance fields into `distance_sq`, and writes
   `feature` last as the commit marker.

There is no local `WideRational4096`, three-word difference vector, `WidePoint`, or
`WideSegmentClosest`; the method returns only `Result<(), ExactScanReject>`.
`NEGATED_RHS=13` is inside Smart80's existing persistent-scalar cap of 16 and is
disjoint from the eight arithmetic work slots, distance accumulator and difference
slot. It is phase-temporary and may be overwritten only after the corresponding add
returns. This adds no slot or cap. Keeping the RHS inside arithmetic work is forbidden
because `checked_add_divisible_into` may clobber it while operating. Candidate fields
before the feature commit are scratch-only; candidate count is incremented only
afterward.

Keep point A/B and distance word order exact. Do not call the old by-value
`wide_vector_sub`, `wide_dot` or `wide_segment_candidate`, add storage, inline the
helper to hide its frame, alter candidate order, or integrate production.

## B -- word equality, atomicity and mutations

Compare every candidate point coordinate, distance numerator/denominator limb and
feature byte with Smart80's oracle for interior success, zero distance, canonical
cancellation, translation, equal tie and exact envelope refusal. Dirty candidate and
all arithmetic/persistent scalar slots including slot 13 and run twice. Assert slot 13
never aliases a live difference or accumulator, and its last write precedes the add
which consumes it. On any axis failure, feature/count and the committed candidate
snapshot remain unchanged.

```rust
#[test] fn retained_interior_candidate_matches_every_old_field_and_refusal() {}
#[test] fn retained_interior_candidate_commits_only_after_all_distance_axes() {}
#[test] fn retained_interior_candidate_reuses_existing_work_without_growth() {}
#[test] fn retained_candidate_negated_rhs_owns_disjoint_persistent_slot_thirteen() {}
```

Mutation proof: restore one local negated rational (frame gate red), assemble a local
candidate then copy it (frame red), reverse one subtraction (word red), write feature
before axis 2 (atomicity red), alias slot 13 with arithmetic work, and alias the
distance accumulator with arithmetic work (ownership/dirty-reuse red). Restore each.

## C -- exact 2,832-byte candidate gate

Compile one wasm lib-test artifact, print path, size and SHA-256, and parse candidate,
solve and its lower helpers. Acceptance requires:

- `interior_candidate_into <= 2832`;
- `segment_state_solve_interior <= 1072` and their sum `<= 3904`;
- point-at/determinant/parameter remain zero and dot remains at most `1040`;
- complete driver remains at most `16`;
- exact fields/refusals, atomic dirty reuse and every mutation pass.

If candidate remains above `2832`, use `--show-prefix` to name the largest remaining
local/ABI edge and stop; do not proceed to endpoint/select/restore or production. If
green, record and stop. A successor may apply the same direct-field rule to endpoint
candidates before production integration.

```powershell
cargo test -p sim retained_interior_candidate --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart81-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart81-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'interior_candidate_into|segment_state_solve_interior|dot_accumulate_into|determinant_into|parameter_into|point_at_axes_into|complete_segment_state_driver|wide_segment_segment_points|exact_contact_at_pose'
node tools/wasm_stack_frames.js --show-prefix $wasm 'interior_candidate_into|segment_state_solve_interior'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No production state, release digest, pin, full suite or 7,560-case corpus is
authorized.

## Completed result

All candidate field/refusal, atomic dirty-reuse and slot-ownership tests passed; the
local aggregate/early commit/alias mutations were red and restored. Persistent scalar
slot `13` exclusively held `NEGATED_RHS`, remained disjoint from arithmetic work
`0..8`, the difference and distance accumulator, and was overwritten only after its
borrowed add returned. No cap grew. The test-only prototype was then fully reverted.

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart81-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 30005691
sha256 C39C8C14A19AA965BD1C354F1739C1ACCB993D11C3B9766ADB00AFA9BB437683
interior_candidate_into       1040
segment_state_solve_interior     0
complete_segment_state_driver    0
production segment-points   153376
exact_contact_at_pose       107600
```

The solve chain is now `1040`, comfortably below `3904`. Smart82 owns equivalent
retained-output conversions for project/select/restore before any production state
integration.
