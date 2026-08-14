# Smart AI 78 -- diagnose a heap-resident segment state machine

**Status:** complete and reverted after diagnostic measurement.
The original two-prototype plan could not start: its caller-output prototype depended
on Smart72's helper layer, which never landed, then required a second independent
solver beside a state-machine duplicate--more than 500 lines before measuring the
question. Smart78 now builds only one test-only heap-resident whole-segment state
machine. It changes no production geometry, scratch layout, behavior, rejection, pin
or corpus.

## A -- one bounded state-machine prototype

Use `#[cfg(test)]` code in `crates/sim/src/combat/contact.rs` and Smart75's immutable
borrowed rational primitives. Freeze the Smart48 segment pair plus interior, four
endpoint, parallel, degenerate, translated, equal-tie and envelope-refusal rows.

Define one test-only `SegmentWorkState` with these predeclared upper bounds:

```text
8 WideRational4096 arithmetic slots used only by Smart75 operations
16 WideRational4096 persistent/result slots for aa/bb/cc/dd/ee,
   determinant, s/t, projection parameter/square/dot and distance staging
10 WidePoint slots: four inputs, four origin-relative, projection and restoration
3 [WideRational4096;3] vector slots: u/v/w
5 WideSegmentClosest candidate slots: interior plus four endpoints
1 WideSegmentClosest committed output
candidate_count: u8
```

Allocate one `Box<SegmentWorkState>` in the test harness before entering the measured
inline-never driver. The driver receives only `&mut SegmentWorkState`, borrowed input
points and a small result tag. It never allocates, constructs the state locally, or
returns a large aggregate.

Implement the exact segment calculation directly as state methods:

```text
translate_inputs  -- origin subtraction and u/v/w
solve_interior    -- five dots, determinant, s/t and optional candidate 0
project_endpoint -- one of four endpoint candidates, called in ordinal order
select_winner     -- existing distance/point/feature comparison order
restore_origin    -- selected a/b only, then atomic committed-output write
```

Each method takes `&mut self` and returns only `Result<(), ExactScanReject>` or a
small index/bool. It calls Smart75's borrowed rational methods directly using the
state's eight arithmetic slots; it does not depend on or create a general caller-
output helper layer. Large intermediate results always land in named state slots.
Use `split_at_mut` or scoped borrows to keep simultaneous aliases disjoint.

Phase instrumentation reports each group's actual high-water index. An unused tail
is diagnostic allowance, not a production bound. Do not add the state to production
scratch, change an upper bound after measurement begins, omit a candidate, specialize
the algorithm to frozen values, use unsafe code, or alter arithmetic/comparison order.

## B -- exact semantics, atomicity and liveness

Compare the state driver with production `wide_segment_segment_points` for every
point word, distance numerator/denominator word, feature ordinal and exact refusal.
Dirty all slots and run twice. On refusal, the committed output and prior candidate
count remain unchanged; uncommitted work may be dirty.

```rust
#[test] fn segment_state_machine_matches_every_old_word_and_refusal() {}
#[test] fn segment_state_machine_commits_atomically_with_dirty_reuse() {}
#[test] fn segment_state_machine_records_every_large_value_within_high_water() {}
```

Record maximum simultaneously live named slots for translation, interior solve,
each endpoint projection, selection and restoration. Lower each group below its
measured high-water and require a named capacity failure before commit. Mutate one
large result back to a by-value local and move the whole state inside the driver; the
frame gate goes red. Swap `u/v`, skip endpoint ordinal 3, and precommit the winner;
word/feature/atomicity tests go red. Restore every mutation.

## C -- wasm frames and decision

Compile one wasm lib-test artifact containing production, the state driver and
inline-never phase methods. Print absolute path, size and SHA-256. Smart74's parser
records exact frames and signed deltas from production `153376`:

```text
production wide_segment_segment_points
complete_segment_state_driver
segment_state_translate_inputs
segment_state_solve_interior
segment_state_project_endpoint
segment_state_select_winner
segment_state_restore_origin
exact_contact_at_pose (control, baseline 107600)
```

Use `--show-prefix` for every nonzero prototype frame. Acceptance for a production
successor requires the complete state driver strictly below `153376`, every phase
method frame zero or a fully explained small scalar-only frame, exact semantics,
atomic dirty reuse, and a named inventory whose future bound equals measured
high-water rather than the prototype cap. If the driver does not shrink, stop and
inspect lower dot/div arithmetic; do not revive the unlanded caller-output prototype
or add production scratch.

```powershell
cargo test -p sim segment_state_machine --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart78-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart78-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'wide_segment_segment_points|complete_segment_state_driver|segment_state_(translate_inputs|solve_interior|project_endpoint|select_winner|restore_origin)|exact_contact_at_pose'
node tools/wasm_stack_frames.js --show-prefix $wasm 'complete_segment_state_driver|segment_state_(translate_inputs|solve_interior|project_endpoint|select_winner|restore_origin)'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Record the state-machine result and stop. No production workspace, release digest,
pin, full suite or 7,560-case corpus is authorized.

## Completed artifact and frame result

All state-machine semantic, refusal, atomic dirty-reuse and bound tests passed; the
declared mutations were red and restored. The test-only prototype was then fully
reverted. Its artifact was:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart78-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 30141582
sha256 8527DC754B93918AE5F3917502B26F6E06877CE677AE108281BDB97BA5FCA5BC
```

Frames were:

```text
complete_segment_state_driver       48
segment_state_translate_inputs   15536
segment_state_solve_interior     59056
segment_state_project_endpoint   61120
segment_state_select_winner      14528
segment_state_restore_origin     23840
production segment-points       153376
exact_contact_at_pose control   107600
```

Measured phase high-water was exact:

```text
translate  8 point slots
solve      8 persistent scalar slots
project    9 persistent scalar slots
select     5 candidate slots
restore    2 point slots
```

The prototype caps were arithmetic `8`, persistent scalar `16`, point `10`, vector
`3`, and candidate `5`. A successor may retain those caps while diagnosing phase ABI,
but production bounds must ultimately follow the measured phase highs plus proven
simultaneously live cross-phase values, not diagnostic slack.

The heap state works at the outer boundary, but its phase methods still pass/stage
large arithmetic and output values. Replacing `153376` by driver `48` plus the maximum
phase `61120` saves only `92208`: the active estimate remains `1040256`, above the
`983040` target by `57216`. Smart79 must reduce phase frames before any production
state integration; the outer `48` alone is not a stack fix.
