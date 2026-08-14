# Smart AI 79 -- remove hidden segment phase frames

**Status:** stopped and fully reverted after the solve checkpoint. Smart78
proved a heap-resident segment state gives an outer frame of `48`, but its endpoint
phase still costs `61120`. Replacing production segment-points with driver plus that
phase leaves active stack `1040256`; reaching the `983040` target requires at least
`57216` more reduction. Smart79 is test-only foundation work: make every state phase
operate directly on retained slots and measure whether maximum phase falls to `3904`
or less. It changes no production geometry, scratch, behavior, rejection, pin or
corpus.

## A -- phase-local borrowed/output primitives

Recreate the Smart78 test-only `SegmentWorkState` in
`crates/sim/src/combat/contact.rs` with diagnostic caps arithmetic `8`, persistent
scalar `16`, point `10`, vector `3`, and candidate `5`. Preserve and assert the exact
phase highs: translate 8 points, solve 8 scalars, project 9 scalars, select 5
candidates, and restore 2 points. Add private
state methods that never return or locally construct a `WideRational4096`,
`WidePoint`, three-word vector or `WideSegmentClosest`:

```text
scalar_add/sub/mul/div/cmp_into
vector_sub_into, dot_into, point_at_into
candidate_into, candidate_cmp_small
```

Every method receives slot indexes, borrows disjoint state ranges, invokes Smart75's
eight-slot arithmetic work, and returns only `Result<(), ExactScanReject>`, `bool`,
`Ordering`, or a small candidate index. Scalar outputs go to persistent scalar slots;
point/vector/closest outputs go to their retained slots. A method may reuse a slot
only after instrumentation proves its last read. No general production helper layer
is added.

Convert one state phase at a time in dependency order, measuring after each:

1. `translate_inputs` uses only `vector_sub_into` retained outputs;
2. `solve_interior` uses retained dot/scalar/point/candidate outputs;
3. `project_endpoint` uses retained subtraction, dot, division, clamp, point and
   candidate outputs;
4. `select_winner` compares retained rows and returns a small index;
5. `restore_origin` writes retained points then atomically copies the committed row.

After each phase conversion, its semantics tests and wasm parser row must be green
before proceeding. Keep an old test-only phase oracle for word/refusal comparison.
Do not integrate the state into production, enlarge a bound, inline all phases to hide
their cost, change arithmetic/candidate order, or allocate inside a measured driver.

## B -- exact semantics, liveness and mutations

Reuse Smart78's frozen corpus and assert every phase's complete retained slots plus
final row against its old phase. Dirty state and repeat. A phase rejection may dirty
work but cannot change committed output or candidate count before its commit point.

```rust
#[test] fn borrowed_segment_phases_match_every_old_slot_word_and_refusal() {}
#[test] fn borrowed_segment_phases_preserve_candidate_order_and_atomic_commit() {}
#[test] fn borrowed_segment_phase_slots_match_measured_high_water_without_growth() {}
```

Mutation proof: return one scalar and one point by value, declare one local candidate,
swap dot operands, reuse a still-live scalar slot, and precommit restore output. The
frame, word, liveness and atomicity gates go red respectively; restore each.

## C -- cumulative frame budget and successor boundary

Compile and identify one wasm lib-test artifact after each phase checkpoint; record
path, size, SHA-256, all five phase frames, driver `48`, production `153376`, and
exact-contact `107600`. The final artifact acceptance is:

- complete driver remains at most `48`;
- every phase strictly decreases from Smart78's corresponding baseline;
- maximum phase is at most `3904`, so `153376 - (48 + max_phase)` is at least
  `149424` and the active estimate is at most `983040`;
- no lower helper has a hidden large frame, verified with `--show-prefix`;
- exact phase/final semantics, refusal, dirty reuse and mutations pass.

If maximum phase remains above `3904`, stop and name the largest retained ABI edge;
do not integrate production or claim headroom. If green, stop and author a production
successor that lands the measured state/high-water bounds and phase helpers atomically,
then reruns release-wasm headroom and feature digest twice.

```powershell
cargo test -p sim borrowed_segment_phases --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart79-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart79-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'complete_segment_state_driver|segment_state_(translate_inputs|solve_interior|project_endpoint|select_winner|restore_origin)|scalar_.*_into|vector_sub_into|dot_into|point_at_into|candidate_.*|wide_segment_segment_points|exact_contact_at_pose'
node tools/wasm_stack_frames.js --show-prefix $wasm 'segment_state_(translate_inputs|solve_interior|project_endpoint|select_winner|restore_origin)'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No production state, release digest, pin, full suite or 7,560-case corpus is
authorized.

## Stopped result

Translation was viable: its phase fell from `15536` to `0`, with retained
`vector_sub_into=1040`. Solve fell from `59056` to `9360` (`-49696`) but missed the
required `3904`; its retained driver was `16`, `dot_into=2080`, and
`point_at_into=4144`, already larger than the whole-phase target by itself. Per the
plan, project/select/restore were not attempted and every prototype was reverted.
Semantic/refusal/atomic checks for the attempted phases were green.

Using the measured maximum `9360`, the heap-state replacement saves
`153376 - (48 + 9360) = 143968`. Smart65's `1132464` active chain therefore estimates
to `988496`, which is `5456` above the `983040` target and leaves roughly `60080`
bytes--`5456` short of 64 KiB headroom. Smart80 must reduce solve by at least `5456`,
to `3904` or less, before project/select/restore or production integration resumes.

The two checkpoint artifacts were distinct and are recorded separately:

```text
translation
target/smart79-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-401f47b6d6a19617.wasm
bytes 30005584
sha256 B8A2B18DE840E6031A319B4A99798BDA0AD85750B0DF5D17C9946673276C67EA

solve
target/smart79-solve-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-401f47b6d6a19617.wasm
bytes 30058816
sha256 F0875CB344914844624BF68ADB5A97DE4A38E8798E6E2734DDCA45E3033EB8A0
```
