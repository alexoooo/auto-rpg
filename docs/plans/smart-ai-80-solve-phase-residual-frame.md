# Smart AI 80 -- remove the segment solve residual frame

**Status:** stopped and fully reverted after isolating the candidate bottleneck. Smart79
reduced solve from `59056` to `9360`, but the full active estimate remains `5456`
bytes above the 64-KiB-headroom target. Smart80 is diagnostic/test-only and targets
that exact solve residual. It changes no production geometry, scratch, behavior,
rejection, pin or corpus.

## A -- attribute every remaining solve byte

Recreate only Smart79's test-only heap `SegmentPhaseState`, translated input fixture,
and solve phase in `crates/sim/src/combat/contact.rs`. Do not recreate endpoint,
select or restore phases. Keep Smart79's exact slot high-water and arithmetic order.

Split solve into inline-never retained operations and measure them independently:

```text
dot_accumulate_into -- three multiply/add axes into one persistent scalar slot
determinant_into    -- aa*cc - bb*bb
parameter_into      -- numerator products/subtraction then retained division
point_at_axes_into  -- three retained mul/add axes into an existing point slot
interior_candidate_into -- retained point pair, distance dot and candidate slot
```

Every large operand/result is named by an index into heap state. Methods accept
`&mut SegmentPhaseState` plus small slot indexes and return only a small tag. They may
not construct/return a wide aggregate, declare a local rational/point/vector, or pass
an aggregate by value. `point_at_axes_into` replaces Smart79's `point_at_into=4144`;
its axes write directly to the final retained point rather than staging a point.
`dot_accumulate_into` replaces `dot_into=2080` and accumulates directly in the final
persistent scalar slot, using separate eight-slot Smart75 work.

Use `--show-prefix` and a test-only slot-access trace to attribute the residual
`9360` among locals, output references and nested helper frames. No inlining directive
may be used merely to hide a frame; inline-never measurements remain the authority.

## B -- exact semantics and mutations

Compare every intermediate `aa/bb/cc/dd/ee`, determinant, `s/t`, interior points,
distance and optional candidate to the Smart79 solve oracle on the full Smart78
fixture set. Dirty state and repeat. Failure leaves candidate count and committed row
unchanged.

```rust
#[test] fn decomposed_segment_solve_matches_every_old_slot_word_and_refusal() {}
#[test] fn decomposed_segment_solve_is_atomic_with_dirty_retained_slots() {}
#[test] fn decomposed_segment_solve_uses_no_large_local_or_by_value_edge() {}
```

Mutate one dot accumulator and one point axis back to a local aggregate (frame red),
swap determinant operands (word red), alias arithmetic work with persistent result
(dirty-reuse red), and commit the interior candidate before a forced division refusal
(atomicity red). Restore each.

## C -- exact 5,456-byte gate

Compile one wasm lib-test artifact, print absolute path, size and full SHA-256, and
parse solve plus every decomposed method. Acceptance is strict:

- solve frame at most `3904`, a reduction of at least `5456` from Smart79's `9360`;
- every lower method frame zero or a fully explained scalar-only frame, and none may
  exceed solve;
- `point_at_axes_into` strictly below `4144` and `dot_accumulate_into` strictly below
  `2080`;
- exact intermediate/final semantics, refusal, atomicity and mutations pass.

If solve remains above `3904`, stop and name the exact largest remaining ABI/local;
do not continue to other phases or integrate production. If green, record and stop;
the next plan may apply the same retained method rules to project/select/restore and
then own the atomic production state integration/headroom gate.

```powershell
cargo test -p sim decomposed_segment_solve --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart80-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart80-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'segment_state_solve_interior|dot_accumulate_into|determinant_into|parameter_into|point_at_axes_into|interior_candidate_into|complete_segment_state_driver|wide_segment_segment_points|exact_contact_at_pose'
node tools/wasm_stack_frames.js --show-prefix $wasm 'segment_state_solve_interior|dot_accumulate_into|determinant_into|parameter_into|point_at_axes_into|interior_candidate_into'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No production state, release digest, pin, full suite or 7,560-case corpus is
authorized.

## Stopped result

The solve method itself reached `1072`, below its `3904` target. Its decomposed frames
were point-at `0`, dot `1040`, determinant `0`, parameter `0`, and outer driver `16`.
However, `interior_candidate_into=8288`; because it is called while solve's `1072`
frame is live, the chain remains `9360`. Source audit found one local negated rational
per distance axis plus final candidate aggregate assembly/copy. Per the stop rule,
the prototype was fully reverted and no other phase ran.

```text
target/smart80-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-401f47b6d6a19617.wasm
bytes 30038464
sha256 D2EED91F71520100CEA4E712F34EF8222A5A86FEA440723709568B27541D8F3B
```

Smart81 must reduce the candidate helper to at most `2832`, because
`1072 + 2832 = 3904`; reducing only the already-green outer solve cannot pay the
remaining chain.
