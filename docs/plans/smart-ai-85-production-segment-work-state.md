# Smart AI 85 -- land the retained exact segment work state

**Status:** stopped and fully reverted. The retained geometry was behavior-neutral in
focused tests and removed the intended segment frames, but the actual feature wasm
still trapped in the owner-return chain. The additive active estimate `833776` was
misleading: it omitted wasm ABI return storage and caller rollback backups that remain
live together. No digest completed, no pin or corpus ran, and no Smart85 source or
tooling survived. Smart86 must remove the owner/outcome/rollback aggregates before
Smart87 may reapply this measured geometry design.

## A -- one retained production state and one atomic API

Edit `crates/sim/src/combat/contact.rs`. Under
`#[cfg(any(test, feature = "cartesian-recoil"))]`, add `SegmentWorkState` to
`ExactWideScratch`. Keep its storage heap-backed and initialize all lengths once in
`ExactWideScratch::try_reserve`; do not construct the wide arrays as a local, allocate
per call, use `Box::new` on a large temporary, grow after reserve, or raise the wasm
stack. Use the proven caps, with explicit constants and named indices:

```text
arithmetic WideRational4096       8
persistent/result rationals      16 (slot 13 is disjoint NEGATED_RHS)
points                            10 (inputs/relative/project/restore)
vectors                           3 (u/v/w)
candidates                        5 (interior then four endpoints)
committed closest                 1
candidate_count and winner       u8
```

These are retained `Vec` arenas inside the state so creating `ExactWideScratch`
itself remains small. Reserve exactly each bound, initialize length outside the scan,
and expose test-only length/capacity snapshots. The candidate arena replaces
`segment_candidates`; rectangle candidates and the two AABB buffers remain separate
and unchanged. `ContactCollectionScratch::try_reserve`, `Clone`, and capacity tests
must cover the new arenas. Allocation failure remains `ContactCapacityError::Allocation`
and leaves the scratch usable at its previous capacity.

Replace `wide_segment_segment_points` and its from-origin implementation with a small
caller-output/state API. It receives borrowed endpoints plus `&mut SegmentWorkState`,
runs the exact phases in this order, and returns only a small success/refusal tag:

```text
translate_inputs
solve_interior
project_endpoint_fused ordinal 1..=4
select_winner_borrowed
restore_origin_atomic
```

Transcribe the accepted Smart81 candidate, Smart83 fused projection, Smart84 borrowed
comparison and Smart82 field-atomic restore designs exactly. Preserve every old
arithmetic parenthesization, zero/parallel/degenerate branch, endpoint ordinal,
distance/A/B/feature tie-break and `ArithmeticEnvelope` refusal. The committed row,
candidate count and winner remain unchanged until all work and restored fields
succeed; feature is the last committed field. On success, downstream exact-contact
code borrows the committed row in the state rather than receiving a large aggregate
return. Scope that borrow before the scratch is reused and never keep it across a
second primitive call. This caller-output seam is required: retaining the phase work
while copying a `WideSegmentClosest` through the old ABI does not satisfy the active-
stack gate.

Do not convert rectangle, shield, AABB, conservative-advance policy, candidate order,
tolerance, bounds, rejection names, public ABI, hash grammar or default production
code in this session.

## B -- byte equivalence, capacity and mutation proof

Keep the old segment implementation as a `#[cfg(test)]` oracle until acceptance.
Compare new versus old on Smart48's literal reflected pair, interior, each of four
endpoint winners, parallel, degenerate, translated, exact tie and every arithmetic-
envelope refusal. Assert every numerator/denominator limb of A, B and distance,
feature, refusal and candidate visitation order. Dirty all arenas and run twice.

```rust
#[test] fn retained_segment_work_state_matches_every_old_word_and_refusal() {}
#[test] fn retained_segment_work_state_commits_only_a_complete_winner() {}
#[test] fn retained_segment_work_state_uses_declared_slots_without_growth() {}
#[test] fn contact_scratch_reserves_and_clones_the_complete_segment_state() {}
#[test] fn exact_contact_consumes_the_borrowed_committed_segment_row() {}
```

Capture capacities and wasm linear-memory pages before the first evaluated contact,
after it, and after an identical second call. The first call after successful reserve
and the second call must allocate/grow nothing. Lower each arena by one and require a
named capacity refusal before authoritative mutation. Mutation proof must make the
suite red when: one phase uses a wide local/by-value return; u/v or endpoint ordinals
are swapped; equal replaces less in selection; feature commits before restored B;
the committed row aliases work; or one reserve/length initialization is omitted.
Restore each mutation before proceeding.

Run focused and full feature/default sim tests. Default tests must remain byte-for-
byte green because the production path is feature-gated; the feature exact oracles
must prove the rewrite is behavior-neutral.

## C -- release wasm stack and repeatability firewall

Build a fresh feature release web artifact in a dedicated target directory. Print its
absolute path, byte length and SHA-256. Use `tools/wasm_stack_frames.js` on the actual
release artifact for the full active chain and all retained phases:

```text
compute_articulated_stream_digest
advance / step_with / step / solve
exact_contact_at_pose
wide_segment_body_at_time
wide_segment_segment_points_into (or the retained production name)
segment_work_* phases
```

Record names/offsets and use `--show-prefix` for every unexpected nonzero frame. The
historical failing active chain was `1132464`. Acceptance requires both a measured
reduction of at least `149424` and a summed active chain no greater than `983040`,
which leaves at least 64 KiB below the approximately 1 MiB wasm stack. Do not infer
release success from the debug prototype's `153376`; the release chain itself owns
this gate. The retained phase maximum must be no greater than the proven `2112`, the
driver no greater than `48`, and no removed by-value frame may reappear in
exact-contact.

Instantiate the feature wasm and call the exported articulated stream digest twice in
one instance. Both calls must complete without OOB, return the same unpinned value,
and leave linear-memory pages unchanged across the second call. Repeat in a fresh
instance and require the same digest. Run the native feature digest twice and require
native/wasm agreement. This session records the value only as behavior-neutral
portability evidence; it does not create or update a pin. The default artifact and
all three registered geometry/contact/stream constants remain unchanged.

Add dependency-free `tools/feature_wasm_digest_probe.js` rather than relying on the
default-pin assumptions in `wasm_check.js`. It accepts exactly one artifact path,
instantiates using the same imports/memory construction as `wasm_check.js`, calls
`articulated_stream_digest_lo/hi` twice, records `memory.buffer.byteLength / 65536`
before/after each call, repeats in a fresh instance, and exits nonzero on a trap,
digest disagreement or second-call/fresh-instance growth. Its JSON output contains
artifact path, both instance digests and page counts. Add
`tools/feature_wasm_digest_probe.test.js` with a minimal fixture module proving
same-instance mismatch, fresh-instance mismatch, growth and trap each fail; mutate
one comparison and observe its fixture go red, then restore it.

Stop and revert the production rewrite if exact words/refusals differ, capacity grows,
native and wasm disagree, any registered pin moves, reduction is below `149424`, the
active chain exceeds `983040`, headroom is below 64 KiB, or either wasm call traps.
Only a completely green Smart85 may authorize the already predeclared Smart41 corpus
in a later session.

```powershell
cargo test -p sim retained_segment_work_state --features cartesian-recoil -- --nocapture
cargo test -p sim exact_contact_consumes_the_borrowed --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p web native_and_wasm_pose_event_stream_digests_match --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart85-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=Resolve-Path 'target/smart85-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'compute_articulated_stream_digest|advance|step_with|solve|exact_contact_at_pose|wide_segment_body_at_time|wide_segment_segment_points|segment_work'
node tools/wasm_stack_frames.js --show-prefix $wasm 'exact_contact_at_pose|wide_segment_segment_points|segment_work'
node --test tools/feature_wasm_digest_probe.test.js
node tools/feature_wasm_digest_probe.js $wasm
Remove-Item Env:CARGO_TARGET_DIR
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

## Stopped measurement

Focused exact equivalence and capacity reuse passed `2/2`; the retained segment
rewrite was then fully reverted. The pre-fuse artifact was `976962` bytes with known
SHA-256 prefix `D7576D` (the full digest was not retained and must not be invented).
Its frames were exact-contact `76512`, segment-body `25152`, retained driver `16`,
project `1568`, candidate `1040` and select `16`; project plus nested candidate was
`2624`, disproving the planned `2112` chain.

Fusing candidate commit produced this exact artifact:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart85-feature-wasm\wasm32-unknown-unknown\release\web.wasm
bytes 977834
sha256 11BF31BE3E591BF7D1CAE2A9B267DDEE53779581DEA0219E9469AA51F2D45BA4
```

Its retained driver was `16`, fused project `1568`, select `16`, interior candidate
`1040`, and maximum phase `1568`. Exact-contact was `76512`, segment-body `25152`,
wide-sweep-segments `61520`, advance-exact `93344`, step-with-arm-rates `325104`, and
compute-digest `352240`. Summing named frames suggested `833776`, but the runtime
still OOB-trapped in:

```text
FixedExactOwners::from_slice
advance_exact
ExactKinematics::finish
solve_exact_contact_tick
World::step_with_arm_rates
compute_articulated_stream_digest
```

The discrepancy is evidence that named-prologue addition omitted simultaneously live
return ABI and caller backup storage. Geometry integration succeeded as a reusable
design measurement, not as a wasm repair. Smart87 may reproduce it only after
Smart86 lands and runtime-validates retained owner/outcome staging.
