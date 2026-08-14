# Smart AI 100 -- reapply retained exact segment geometry

**Status:** complete. The proven retained segment state machine is landed on Smart99.
All five focused tests, the complete feature/default suites, release wasm runtime,
native/wasm feature digest, memory reuse and the ordinal-1536 mirror trace are green.
No registered pin was updated and the Smart41 corpus did not run. The default paired
pin audit and the unchanged 7,560-case corpus belong to Smart101.

## A -- reapply the frozen Smart87 geometry only

Edit `crates/sim/src/combat/contact.rs` at `ExactWideScratch` and the
`wide_segment_segment_points` family. Restore Smart87's heap-backed
`SegmentWorkState` with these exact retained bounds:

```text
arithmetic rationals       8
persistent rationals      16 (slot 13 is NEGATED_RHS and is disjoint)
points                    10
vectors                    3
candidates                 5
committed closest rows     1
```

`ExactWideScratch::try_reserve` initializes every arena once; clear and reuse lengths
without growth. The segment computation is a caller-output state machine with the
proven phase design: borrowed translation, retained solve and interior candidate,
fused endpoint projection/direct candidate commit for ordinals `1..=4`, borrowed
distance/A/B/feature selection, then field-atomic origin restoration with feature
committed last. Preserve Smart87's accepted fusion -- do not restore its rejected
nested project/candidate ABI.

Keep arithmetic parenthesization, zero/parallel/degenerate refusal, endpoint ordinal,
distance then A/B/feature tie order and visit order word-identical. Rectangle/shield
geometry, exact-pair enumeration, the 96-visit bound, AABB pruning, tolerances,
selection, suppression, response, hash grammar and default geometry do not change.
Keep the old segment implementation as a test-only oracle until all gates complete.

## B -- equivalence, capacity and mutation gates

Reapply the five Smart87 tests beside `contact.rs` and cover the Smart48 reflected
literal, interior and four endpoint winners, parallel and degenerate inputs,
translated/equal ties, dirty reuse and every arithmetic-envelope refusal:

```rust
#[test] fn retained_segment_work_state_matches_every_old_word_and_refusal() {}
#[test] fn retained_segment_work_state_commits_only_a_complete_winner() {}
#[test] fn retained_segment_work_state_uses_declared_slots_without_growth() {}
#[test] fn exact_contact_borrows_the_retained_segment_winner_without_copy() {}
#[test] fn cloned_contact_scratch_rereserves_empty_segment_work() {}
```

Compare every limb of A, B and distance plus feature, refusal and visitation order.
The clone test clears the retained Vecs, clones their owner, reserves the declared
high water and evaluates twice with stable pointers, lengths and capacities. Make
each named test red in turn by restoring a by-value closest return, the nested
project/candidate call, swapping u/v or an endpoint ordinal, accepting `Less|Equal`,
committing feature early, aliasing work and omitting one reserve/initial length; then
restore each mutation.

## C -- semantic gates before wasm measurement

Run the frozen Smart99 replay and response-created second-group tests first, followed
by all 97 resolution tests. Then run the complete feature suite and complete default
suite. Any changed certified time/key/region/medial, canonical fact, dual provenance,
suppression, driver, response, capacity or refusal stops and fully reverts Smart100;
do not repair a red by changing a fixture, tolerance or expected fact. The prior
Smart87 inherited `a_solved_group_grows_no_retained_scratch` blocker must remain green
under Smart99.

```powershell
cargo test -p sim retained_segment_work_state --features cartesian-recoil -- --nocapture
cargo test -p sim exact_contact_borrows_the_retained --features cartesian-recoil -- --nocapture
cargo test -p sim cloned_contact_scratch_rereserves --features cartesian-recoil -- --nocapture
cargo test -p sim exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint --features cartesian-recoil -- --nocapture
cargo test -p sim response_created_second_group_is_found_without_a_compatibility_candidate --features cartesian-recoil -- --nocapture
cargo test -p sim combat::resolution::tests --features cartesian-recoil
cargo test -p sim --features cartesian-recoil
cargo test -p sim
```

Acceptance is the Smart99 controls or stronger: resolution `97/97`, feature zero
failures and default zero failures. Record exact counts, ignored counts, durations and
logs rather than copying these pre-change witnesses.

## D -- release stack, runtime and target agreement

Build a fresh feature release artifact under `target/smart100-feature-wasm`; record
absolute path, byte length and SHA-256. Use `tools/wasm_stack_frames.js` with
`--show-prefix` to measure the real active chain:

```text
compute_articulated_stream_digest
World::step_with_arm_rates
solve_exact_contact_tick
exact_contact_at_pose
wide_sweep_segments / wide_segment_body_at_time
retained segment driver and each phase
advance_exact_into / apply_exact_group_into
ExactKinematics finish/apply
```

The proven Smart87 geometry ceilings are driver `16`, fused project `1568`, interior
candidate `1040` and select/comparator `16`. Smart86 controls are advance `<=1872`,
apply `<=304`, solve `<=480` and exact finish/apply zero; its observed World frame was
`96384`. Record current values and the deepest reachable active sum. Require total
active stack `<=983040`, leaving at least 64 KiB below the approximately 1 MiB shadow
stack. A missing/inlined named frame must be explained from parser output, not treated
as zero.

Call the exported feature articulated-stream digest twice in one wasm instance and
twice in a fresh instance. Both instances must complete without OOB, agree with two
native feature calls, and keep memory unchanged on the second call. The prior witness
was `0x2d323ac56c901e88` with pages `24 -> 74 -> 74`; it is a comparison witness, not
a pin or permission to accept movement. A different digest, target disagreement,
second-call growth or frame/headroom miss stops and reverts.

```powershell
$env:CARGO_TARGET_DIR='target/smart100-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=Resolve-Path 'target/smart100-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js --show-prefix $wasm 'compute_articulated_stream_digest|step_with_arm_rates|solve_exact_contact_tick|exact_contact_at_pose|wide_sweep_segments|wide_segment_body_at_time|segment_work|advance_exact_into|apply_exact_group_into|ExactKinematics'
# Use a path-asserting temporary probe for two calls in each of two fresh instances;
# print lo/hi and memory pages before/after each call, then delete the probe.
Remove-Item Env:CARGO_TARGET_DIR
```

## E -- mirror trace, then stop before pins or corpus

Only after A--D are wholly green, run the frozen Smart41 ordinal `1536` mirror trace.
It must report `ticks=49 phase=none`; any first unequal authoritative word, rejection
phase or target disagreement stops for a new diagnostic plan. Smart100 does not tune
the trace and does not run the 7,560-case corpus.

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Expected registered pin moves are zero. Run the default native/wasm pin controls only
after the feature/default suites, runtime and mirror trace are green; any move stops
without re-recording. A fully green Smart100 merely makes the retained geometry
landable and permits a separately declared corpus session. It does not itself update
a pin, run the corpus or select mechanics by damage.

## Completed result

The five focused retained-geometry tests account for the increase from Smart99's
suite counts. Exact final logs are:

```text
target/smart100-feature-final.log
685 passed; 0 failed; 3 ignored; 288.53s
determinism: 10 passed; 0 failed; 0.15s

target/smart100-default-final.log
542 passed; 0 failed; 1 ignored; 1.09s
determinism: 10 passed; 0 failed; 0.16s
```

The fresh feature artifact was:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart100-feature-wasm\wasm32-unknown-unknown\release\web.wasm
bytes 1016491
sha256 91680879C030A904C707B95B8367728369FB2A9C89F24878A78B72E1D9BAEB0B
```

The dependency-free parser measured stream digest `352352`, World step `96448`,
solve `464`, exact contact `76512`, wide segment sweep `62544`, retained segment work
`1056`, segment/body `25152`, exact advance `1872`, exact group apply `304`, and exact
finish/apply zero. The explicit deepest named scan chain sums to `589376`, leaving
`459200` bytes below a 1 MiB stack. The implementation handoff also retained its
separate conservative active estimate `555104`, or `493472` bytes of headroom; that
estimate is not substituted for the parser sum.

The temporary native assertion returned decimal `11998528829140632018`, exactly
`0xa6835666303601d2`, and was removed. Two wasm calls returned the same value with
memory pages `24 -> 75 -> 75`; there was no target disagreement or second-call
growth. The frozen mirror command returned exactly:

```text
ticks=49 phase=none
```

Smart100 therefore passes its stop boundary. The feature value remains an unpinned
witness. Smart101 alone may audit and update the separately registered default stream
pin before running the unchanged corpus.
