# Smart AI 82 -- reduce the remaining segment phases

**Status:** complete and reverted. The retained, field-atomic restore matched every
old point/refusal word, committed only after success, reused exactly two point slots,
and compiled to frame zero. Its declared word, atomicity, alias and aggregate-copy
mutations were red and restored. Together the independently frozen phases are all at
or below `3904`: translate helper `1040`/phase zero, solve plus candidate `2112`,
fused project `2080`, select `16`, restore zero and outer driver `48`. The test-only
prototype was fully reverted. No production geometry, scratch, behavior, rejection,
pin or corpus changed; Smart85 owns production integration.

## A -- reconstruct the proven state and convert one phase at a time

In `crates/sim/src/combat/contact.rs` under `#[cfg(test)]`, reconstruct Smart81's
heap-resident state architecture and its proven translate/solve/candidate methods.
Preserve caps arithmetic 8, persistent scalar 16, points 10, vectors 3, candidates 5,
and exact highs project 9 scalars, select 5 candidates, restore 2 points. Persistent
slot 13 remains `NEGATED_RHS` and cannot alias arithmetic work or live outputs.

Reconstruct Smart83's fused project and Smart84's borrowed select as equality and
frame controls. Then implement only `restore_origin`. Keep the winner as a small index
into retained candidate storage. Borrow its A and B coordinates and the retained
origin by field, use Smart75 `checked_add_divisible_into` through the disjoint
eight-slot arithmetic bank, and write each sum directly into the two retained restore
point slots measured by Smart78. Do not bind a coordinate pair, copy/dereference a
wide rational, construct a local `WidePoint`/candidate, or call a by-value point
helper.

After all six point fields succeed, copy the two retained points and remaining scalar
fields directly into the committed candidate row field-by-field. Commit `feature`
last, so any refusal leaves candidate count, selected index and the entire prior
committed row unchanged. The selected candidate, origin, arithmetic bank, two restore
points and committed row are disjoint for the whole call. No general production
output-helper layer, new slot/cap, unsafe code, allocation, changed candidate order,
or inlining to conceal frames is authorized.

## B -- exact phase equivalence and atomicity

Compare every persistent scalar, projected/restored point coordinate, candidate
distance limb, feature ordinal and selected index with the corresponding Smart78 old
phase on interior, four endpoints, parallel/degenerate, translated/equal-tie and all
exact refusal fixtures. Dirty every state slot and repeat. Rejection leaves candidate
count, selected index and committed row unchanged until each named commit boundary.

```rust
#[test] fn retained_endpoint_projection_matches_every_old_slot_word_and_refusal() {}
#[test] fn retained_candidate_selection_preserves_distance_point_feature_order() {}
#[test] fn retained_origin_restore_matches_every_old_point_word_and_refusal() {}
#[test] fn retained_origin_restore_commits_fields_atomically_with_dirty_reuse() {}
#[test] fn retained_origin_restore_uses_exactly_two_point_slots_without_growth() {}
#[test] fn remaining_segment_phases_stay_within_smart78_high_water_without_growth() {}
```

Mutation proof for restore: assemble/copy a local point or candidate (frame red), use
a by-value add or copied coordinate tuple (frame red), swap A/B or omit the origin on
one axis (word-equivalence red), write feature before restored B (atomic-refusal red),
and alias a restore point with the selected candidate or arithmetic bank
(dirty-reuse/ownership red). Restore each mutation. The already recorded Smart83/84
mutations remain controls rather than being repeated.

## C -- per-phase frame firewall and successor boundary

Print the restore artifact path, size and SHA-256, then parse restore, every nested
retained helper, the proven phase controls, complete driver, production segment-points
and exact-contact. Acceptance is:

- fused project remains `2080` with no nested candidate, from Smart83;
- select remains `16` with comparator zero, from Smart84;
- restore phase plus its maximum nested helper `<= 3904`, from `23840`;
- solve/candidate remain at most `0 + 1040`, translate remains zero, complete driver
  remains zero, and no hidden helper exceeds its owning phase budget;
- all exact semantics, refusal, dirty reuse, high-water and mutations pass.

If restore passes, every phase passes and the maximum segment phase is `<=3904`; with driver zero this
releases at least `153376 - 3904 = 149472`, exceeding the required `149424` by 48.
Record and revert the prototype, then author an atomic production integration plan.
If any phase fails, record/revert and diagnose its largest remaining ABI edge instead.

```powershell
cargo test -p sim retained_endpoint_projection --features cartesian-recoil -- --nocapture
cargo test -p sim fused_endpoint_candidate --features cartesian-recoil -- --nocapture
cargo test -p sim retained_origin_restore --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart82-restore-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart82-restore-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'segment_state_(project_endpoint|select_winner|restore_origin|solve_interior|translate_inputs)|interior_candidate_into|complete_segment_state_driver|wide_segment_segment_points|exact_contact_at_pose'
node tools/wasm_stack_frames.js --show-prefix $wasm 'segment_state_restore_origin|checked_add_divisible_into'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No production state, release digest, pin, full suite or 7,560-case corpus is
authorized.

## Completed restore result

All three restore-focused exact/refusal, feature-last atomic commit, dirty reuse and
two-point high-water tests passed. Local point/candidate construction, by-value or
tuple arithmetic, A/B or origin corruption, early feature commit and slot aliasing
each made its named test red; every mutation was restored. The restore method and its
borrowed divisible-add helper both measured frame zero. The artifact was:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart82-restore-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 30024565
sha256 32341523CF1571F25B8D5259B921C1048731B9BC67E8E303E6106F4CCD01FB1D
segment_state_restore_origin       0
checked_add_divisible_into         0
production segment-points     153376
exact_contact_at_pose         107600
```

The production successor must consume the complete independently proven bound, not
reinterpret the historical stopped checkpoints: translate helper `1040`/phase zero,
solve plus candidate `2112`, fused project `2080`, select `16`, restore zero, driver
`48`. The maximum is therefore `2112`, below the predeclared `3904` firewall.

## Stopped select result

Select matched every old distance/point/feature ordering word, high-water and refusal,
and its declared semantic mutations were red/restored. Its comparator was inlined,
but `segment_state_select_winner=4144`, `240` above the `3904` ceiling. Source audit
identified the likely residual: constructing a copied `(a, b)` `WideRational4096`
tuple for each point axis before comparison. Per the sequential gate, restore did not
run. The select prototype was fully reverted.

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart82-select-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 30018343
sha256 0E5315A89AACF8EA91B7BF00DB74C69C0F5B8AD8B4F8264EB0578CCCBE23F10D
segment_state_select_winner   4144
production segment-points   153376
exact_contact_at_pose       107600
```

Smart84 subsequently proved the borrowed comparator at frame zero and the complete
select phase at `16`; its exact artifact is recorded in the Smart84 plan. Smart82 is
therefore reopened for restore only.

## Stopped project result

Endpoint projection matched every old slot word/refusal and passed atomic dirty-reuse
and high-water mutations. Its phase frame fell from `61120` to `2080`, but its nested
candidate helper was also `2080`, so the active project chain was `4160`: `256` above
the `3904` ceiling. The complete driver was frame zero. Per the sequential firewall,
select and restore were not attempted, and all test-only prototype code was reverted.

Smart83 subsequently eliminated this nested boundary with a fused `2080` phase. This
section remains the superseded stopped measurement; resumed select/restore work uses
Smart83's fused control. No production code, pin or corpus survived.

```text
target/smart82-project-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-401f47b6d6a19617.wasm
bytes 30010736
sha256 75FBBD4C733BFF4E1520C36CDD09DBC109F8FCFF5970FE195B1DE70D995B0BBA
```
