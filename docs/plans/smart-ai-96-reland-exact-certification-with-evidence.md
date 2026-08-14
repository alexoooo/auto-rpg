# Smart AI 96 -- reland exact certification with reserved parallel evidence

**Status:** stopped and reverted. The Smart94+reserve+parallel-evidence reland did not
reach the expected lifted refusal: the frozen replay exposed public `ExactScan` where
the fixture expected `ExactSolver`. Production was fully reverted. After revert the
replay again reports `ResolutionCount`, which is the already-recorded Smart90 baseline
and not new drift from Smart96. No internal reland phase/key/cause was captured, so no
repair is authorized. No registered pin moved, no corpus ran and Smart87 geometry
remains absent. Smart97 reconstructs the reland only under diagnostic hooks.

## A -- reserve the complete two-stage scan before any behavior case

Reapply Smart94's feature-only exact certification in
`crates/sim/src/combat/contact.rs` and `crates/sim/src/combat/resolution.rs`:

1. compatibility scanning enumerates complete deduplicated WW/WS/WB keys only;
2. every enumerated pair is exact-swept from the current accepted group boundary;
3. all `CertifiedSelection { time_raw, key, region, medial }` rows are staged before
   `(time,key)` ordering; and
4. canonical `exact_contact_at_pose` facts are staged atomically at the chosen time
   before suppression, closure or drivers.

Compatibility TOI/point/feature/distance never seeds exact search. Primitive feature
remains diagnostic-only. Canonical `None`, key mismatch or WB region mismatch keeps
Smart94's named ExactScan detail and whole-group rollback. Preserve existing 96-visit
bounds, AABB early-outs, WB time/medial/region tie law and key ordering.

Before any direct scan, reserve compatibility candidates, certified selections,
canonical fact staging, parallel evidence and existing wide scratch from the declared
`ContactBounds.candidate_bound`. Production World already owns this reservation;
direct zero-response fixtures must explicitly call `try_reserve(64)` before scanning.
An unreserved call refuses by name and changes nothing. Do not hide the precondition
inside a per-scan allocation or special-case behavior cases.

```rust
#[test] fn exact_certification_reserves_selection_fact_and_evidence_before_scan() {}
#[test] fn all_zero_response_behavior_cases_scan_after_the_declared_reservation() {}
#[test] fn unreserved_exact_certification_refuses_atomically_without_allocating() {}
#[test] fn cloned_high_water_certification_scratch_rereserves_empty_stages() {}
```

Mutation proof: remove the reserve and require the exhaustive `0..=6` inventory red;
reserve one row short; omit one Vec from clone re-reservation; allocate lazily inside
scan. Each test must fail under mutation and pass after restore.

## B -- carry primitive evidence beside, never inside, selection

Add retained feature-only staging:

```rust
struct CertifiedProvenance {
    key: ContactKey,
    time_raw: u32,
    wide_toi: ExactWideToiDiagnostic,
}
```

Each certified selection has exactly one evidence row paired by `(key,time_raw)`.
Evidence is excluded from sort keys, group membership, canonical equality,
suppression, facts, hashes and state. Certify all rows successfully before projecting
the selected same-time evidence into existing `ExactContactGroupDiagnostic.wide_toi`.
Projection is one-to-one with `mapped_member_keys`; cardinality, key or time mismatch
is a named diagnostic/invariant refusal and clears both arrays atomically.

Separated/refusing pairs publish no group evidence. Canonical staging refusal leaves
no partial row. After an accepted group, clear compatibility enumeration, selection,
facts and provenance together, then rescan/re-certify every enumerated candidate from
the new boundary. Poison evidence accepted root/feature/visits/comparison and require
only diagnostic bytes to move.

```rust
#[test] fn certified_provenance_projects_one_to_one_by_key_and_time() {}
#[test] fn provenance_poison_moves_only_the_unhashed_group_diagnostic() {}
#[test] fn none_stale_or_mismatched_provenance_clears_projection_atomically() {}
#[test] fn accepted_group_clears_all_four_staging_domains_before_rescan() {}
```

Mutation proof: put `wide_toi` inside selection; order by evidence; copy primitive
feature into fact; accept `None`; retain stale evidence after rescan. Each named test
must go red and be restored.

## C -- frozen replay and focused integration gates

Run the motivating replay first. It must certify WB time `905`, publish canonical
point `[814289,6901,58982]` and feature `4`, keep primitive point Y `6900`/feature `0`
diagnostic-only, and eliminate `EmptyDriverSet`. Reintroducing compatibility time must
make the shortcut mutation red.

Next run the two former blockers:

- `zero_response_exact_scan_is_byte_equal_to_every_behavior_case` with explicit
  retained reserve and byte equality for cases `0..=6`;
- `group_provenance_counts_the_production_rows_at_each_boundary`, requiring the
  selected group to carry one `mapped_member_key` and one parallel `wide_toi` row.

Then run the Smart95 inventory/provenance filters and all 91 resolution tests. Any
grammar, evidence, canonical publication, suppression or allocation failure stops and
requires full revert; do not update expectations except a fixture that omitted the
now-explicit reserve precondition.

```powershell
cargo test -p sim exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_exact_scan_is_byte_equal_to_every_behavior_case --features cartesian-recoil -- --nocapture
cargo test -p sim group_provenance_counts_the_production_rows_at_each_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim every_zero_response_behavior_case_has_a_complete_exact_grammar_inventory --features cartesian-recoil -- --nocapture
cargo test -p sim certified_wide_toi_provenance_is_parallel_to_not_inside_selection --features cartesian-recoil -- --nocapture
cargo test -p sim provenance_poison_cannot_change_time_key_fact_or_suppression --features cartesian-recoil -- --nocapture
cargo test -p sim refusal_or_rescan_cannot_publish_stale_or_partial_wide_toi --features cartesian-recoil -- --nocapture
cargo test -p sim combat::resolution::tests --features cartesian-recoil
```

## D -- full feature firewall and stop boundary

Only after checkpoint C is green run the complete feature suite. Classify every red
by exact test and first cause. Smart96 may repair only stale reserve/provenance
fixtures directly created by this authority split. Solver, geometry, energy, anatomy,
World or wasm stack failure stops without expanding scope.

If the complete feature suite is green, run default sim/workspace and wasm equality
controls. The feature digest may be observed twice native/wasm only as an unregistered
portability witness; no registered pin is updated. Smart87 retained geometry remains
a later separately planned landing. The full mechanics audit and Smart41 7,560-case
corpus remain forbidden until both Smart96 and that later geometry session are green.

```powershell
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Expected registered pin moves: zero. A pin move, native/wasm disagreement, unpredicted
feature failure or allocation growth stops and requires reverting Smart96 production.

## Stopped result

The temporary reland failed its first frozen replay boundary: public rejection was
`ResolutionError::ExactScan`, not the expected `ResolutionError::ExactSolver`. The run
did not preserve the exact feature-only rejection phase, ContactKey or internal
`ExactScanReject`, so Smart95's reserve and provenance diagnoses cannot be assumed to
explain this new reland refusal. Smart96 stopped before zero-response, provenance,
91-resolution, full-feature, pin or corpus gates and fully reverted production.

On the restored tree the same replay reports public `ResolutionCount`. That value is
the known pre-reland Smart90 baseline caused by the compatibility `902` member
recomputing to zero facts; it is evidence that the revert restored baseline, not a
Smart96 regression or a second new cause. Smart97 must reproduce only the temporary
reland under cfg(test), record the first `ExactScan` phase/key/internal cause, and
revert its hooks before any successor production plan.
