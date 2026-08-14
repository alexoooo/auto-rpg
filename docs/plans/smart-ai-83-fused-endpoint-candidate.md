# Smart AI 83 -- fuse endpoint projection and candidate commit

**Status:** complete and reverted after a green diagnostic. Smart82
made endpoint projection `2080`, but calling its `2080` candidate helper leaves an
active chain of `4160`, only `256` above the `3904` ceiling. Smart83 is diagnostic/
test-only and removes that nested boundary by writing the endpoint candidate fields
inside the project phase. No production geometry, scratch, behavior, rejection, pin
or corpus changes.

## A -- one fused retained project method

Recreate Smart82's test-only heap state and only its endpoint project checkpoint in
`crates/sim/src/combat/contact.rs`. Replace the project→candidate call with one
inline-never `segment_state_project_endpoint_fused` method which:

1. computes retained difference/dot/height or clamp parameter and projected point in
   the same slot order as Smart82;
2. uses persistent scalar slot 13 exclusively as `NEGATED_RHS`, disjoint from the
   eight arithmetic slots, live parameter, difference and distance accumulator;
3. computes candidate distance axis-by-axis directly into the final retained distance
   slot, with no nested candidate call, local rational or difference vector;
4. copies endpoint/projected point coordinates and distance fields directly into the
   retained candidate row, and writes feature/count last as the atomic commit;
5. returns only `Result<(), ExactScanReject>`.

The old Smart82 project and candidate methods remain `#[cfg(test)]` oracles only. The
fused method processes exactly one supplied endpoint ordinal; its driver invokes
ordinals 1 through 4 in the old order. Do not force-inline a helper to hide the frame,
add slots/capacity, change projection/clamp arithmetic, swap candidate endpoints, or
integrate production.

## B -- exact fusion equivalence and mutations

Compare every project scalar, projected point coordinate, candidate A/B coordinate,
distance limb and feature/count word to Smart82's two-method oracle on all four
endpoint winners, parallel/degenerate, translated/equal-tie, canonical cancellation
and every exact refusal. Dirty all state and repeat. Any failure before feature/count
commit leaves the committed row and count unchanged.

```rust
#[test] fn fused_endpoint_candidate_matches_every_two_phase_word_and_refusal() {}
#[test] fn fused_endpoint_candidate_commits_only_after_distance_and_point_fields() {}
#[test] fn fused_endpoint_candidate_preserves_all_four_endpoint_ordinals() {}
```

Mutation proof: restore the nested candidate call (frame gate red), create a local
candidate aggregate (frame red), alias slot 13 with the projection parameter
(dirty-reuse red), swap candidate endpoints (word red), and write count before the
third distance axis (atomicity red). Restore each.

## C -- strict fused frame gate

Compile one wasm lib-test artifact, print path, size and SHA-256, and parse the fused
method, driver, any retained lower helper, production segment-points and exact-contact.
Acceptance requires:

- the fused project chain `<= 3904`;
- no nested candidate frame remains active beneath it;
- complete state driver remains frame zero;
- every exact word/refusal, dirty reuse, ordinal and mutation passes.

The expected direct target is the prior project frame `2080`; any value through
`3904` is acceptable if `--show-prefix` accounts for it and no hidden nested frame
exists. If above `3904`, stop and name the remaining local/ABI edge. If green, record
and revert; Smart82 may then resume at select followed by restore using the fused
project as its control.

```powershell
cargo test -p sim fused_endpoint_candidate --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart83-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart83-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'segment_state_project_endpoint_fused|complete_segment_state_driver|interior_candidate_into|wide_segment_segment_points|exact_contact_at_pose'
node tools/wasm_stack_frames.js --show-prefix $wasm 'segment_state_project_endpoint_fused'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No production state, release digest, pin, full suite or 7,560-case corpus is
authorized.

## Completed result

All three named fused endpoint tests passed: exact two-phase word/refusal equality,
field-atomic commit, and all four endpoint ordinals. Restoring the nested candidate
call made the frame gate red; the local aggregate, slot-alias, endpoint-swap and early
count mutations made their named frame/dirty-reuse/word/atomicity tests red. Every
mutation was restored, then the test-only prototype was fully reverted.

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart83-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 30085553
sha256 EC710419C1DF77AD5C9719C76D0CAA1CF8E5EF25369F538F2927D707A980D4C8
segment_state_project_endpoint_fused   2080
complete_segment_state_driver             0
production segment-points            153376
exact_contact_at_pose                 107600
```

No nested candidate frame remained. Smart82 may resume with fused project `2080` as
its control and diagnose select, then restore.
