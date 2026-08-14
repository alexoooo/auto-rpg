# Smart AI 99 -- land the complete exact domain with dual provenance

**Status:** complete. The frozen replay, response-created second-group control and all
97 resolution tests are green. Two retained-reservation fixtures were updated to the
declared candidate bound, and eight World fixtures were refreshed from Smart51's
stale captured directional-strike literals; these were test-only repairs and did not
weaken their assertions. The complete feature and default suites are green. No
registered pin was measured or updated, no corpus ran and Smart87 geometry remains
absent.

## A -- exact trajectory pairs, not compatibility membership, define the domain

In `crates/sim/src/combat/contact.rs`, keep explicit
`DetectorInput::ZeroResponseCompatibility` and non-feature scanning byte-identical.
For feature `DetectorInput::Exact`, preflight the full trajectory/owner/collider
identity map, then enumerate every pair of present hostile exact rows. Admit exactly
the historical supported primitives:

- Segment/Segment (`WeaponWeapon`), canonicalized by key;
- Segment/Shield in either operand order (`WeaponShield`); and
- Segment/Body in either operand order (`WeaponBody`).

Body/Body, Body/Shield and Shield/Shield remain inert. Same entity/faction and absent
rows remain skipped. Compatibility scanning may run once into retained evidence
scratch, but its key set cannot filter, seed, bound or order exact pairs. This is
load-bearing after an accepted group: response can create a later exact contact that
rounded compatibility geometry does not enumerate.

Certify every supported exact pair from the current accepted group boundary with the
existing wide sweep, 96-visit bounds, AABB early-outs and named refusals. Complete all
certification before `(time,key)` ordering. After accepted apply/lifecycle, clear all
staging and repeat the complete exact-pair traversal from the new boundary.

```rust
#[test] fn exact_domain_contains_every_supported_hostile_pair_not_only_compatibility_members() {}
#[test] fn response_created_second_group_is_found_without_a_compatibility_candidate() {}
#[test] fn unsupported_and_friendly_exact_pairs_remain_inert() {}
#[test] fn accepted_group_rescans_the_complete_exact_domain_from_the_new_boundary() {}
```

Mutation proof: filter exact pairs through compatibility keys and require the
response-created second group red; include an unsupported primitive; reuse the
pre-response set; stop traversal after the first exact candidate. Restore each.

## B -- mandatory exact evidence, optional compatibility witness

Retain Smart95's parallel exact evidence:

```rust
struct CertifiedProvenance {
    key: ContactKey,
    time_raw: u32,
    wide_toi: ExactWideToiDiagnostic,
}
```

Every `CertifiedSelection` and mapped group key has exactly one matching `wide_toi`
by `(key,time_raw)`. Its primitive is exact (`SegmentSegment`, `SegmentShield` or
`SegmentBodyRegion`), never `CompatibilityFallback`; its accepted root equals the
certified time. Missing, duplicate, stale or mismatched exact evidence refuses and
clears the projection atomically.

Separately retain Smart47's `ExactCompatibilitySweepDiagnostic` by `ContactKey` when
the compatibility evidence scan emitted that key. Project it into
`ExactContactGroupDiagnostic.compatibility_sweep` only for a mapped exact key with a
matching witness. Its accepted compatibility TOI may differ from exact certified time
-- the frozen WB witness may say `902` while mandatory `wide_toi` says `905`. It is
diagnostic history, not a pairing failure. A response-created exact-only key has
`compatibility_sweep=None`; do not fabricate a row or require count equality.

Correct group-diagnostic assertions are:

```text
count(wide_toi) == count(mapped_member_keys)
every wide_toi key/root == mapped key/certified time
count(compatibility_sweep) <= count(mapped_member_keys)
every present compatibility_sweep key is a mapped key and an enumerated witness
absence is valid for a response-created exact key
```

```rust
#[test] fn every_mapped_exact_key_has_one_wide_toi_row() {}
#[test] fn compatibility_sweep_is_optional_per_mapped_exact_key() {}
#[test] fn first_group_can_carry_compatibility_902_beside_exact_905_without_authority() {}
#[test] fn response_created_second_group_has_wide_toi_and_no_fabricated_compatibility_sweep() {}
```

Poison compatibility accepted TOI/endpoints/radii and require only its diagnostic
bytes to move. Poison exact root/key and require atomic refusal. Order by either
evidence payload and require deterministic selection tests red. Restore all.

## C -- canonical facts precede suppression and provenance projection is atomic

Retain selection as `(time,key,region,medial)` only. At the earliest certified time,
stage canonical `exact_contact_at_pose` facts for every same-time selection before
suppression, closure or drivers. Canonical facts exclusively own point, normal,
velocities, feature and published region. `None`, key mismatch or WB region mismatch
refuses the complete group; neither exact sweep publication nor compatibility witness
may substitute.

Only after all canonical facts succeed may group diagnostics project mandatory exact
and optional compatibility evidence. A canonical or evidence failure publishes no
partial keys, `wide_toi` or `compatibility_sweep`. Clear facts and both evidence
domains together on refusal and before every rescan. Retained capacity covers the
complete exact-pair bound and optional compatibility witnesses with no post-reserve
allocation; clone/default re-reserve all stages.

```rust
#[test] fn canonical_group_staging_precedes_suppression_and_dual_provenance_projection() {}
#[test] fn canonical_or_exact_evidence_failure_clears_both_diagnostic_arrays() {}
#[test] fn optional_compatibility_evidence_cannot_make_an_exact_group_refuse() {}
#[test] fn dual_provenance_capacity_is_stable_across_second_group_rescan_and_clone() {}
```

## D -- focused gates and stop boundary

First run the frozen replay. Its first WB group must report exact root `905`,
`SegmentBodyRegion`, visits greater than zero, recomputed `1`, canonical point Y
`6901` and feature `4`. If compatibility enumerated the key, its optional witness may
remain root `902`; poisoning/removing that witness cannot change the group.

Then run the response-created second-group fixture: it must be discovered by complete
exact traversal, carry mandatory `wide_toi`, and allow `compatibility_sweep=None`.
Run explicit compatibility byte controls, Smart95 provenance poison/stale tests and
all 91 resolution tests. Only then run the complete feature suite and classify every
red. Any new authority, solver, geometry, energy, World, capacity or wasm failure
stops; no test may be weakened to require blanket compatibility presence or absence.

```powershell
cargo test -p sim exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint --features cartesian-recoil -- --nocapture
cargo test -p sim exact_domain_contains_every_supported_hostile_pair_not_only_compatibility_members --features cartesian-recoil -- --nocapture
cargo test -p sim response_created_second_group_is_found_without_a_compatibility_candidate --features cartesian-recoil -- --nocapture
cargo test -p sim every_mapped_exact_key_has_one_wide_toi_row --features cartesian-recoil -- --nocapture
cargo test -p sim compatibility_sweep_is_optional_per_mapped_exact_key --features cartesian-recoil -- --nocapture
cargo test -p sim response_created_second_group_has_wide_toi_and_no_fabricated_compatibility_sweep --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_exact_scan_is_byte_equal_to_every_behavior_case --features cartesian-recoil -- --nocapture
cargo test -p sim group_provenance_counts_the_production_rows_at_each_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim combat::resolution::tests --features cartesian-recoil
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

The zero-response byte-equality command above remains only for the explicit
compatibility/default contract; feature exact semantics use the domain/canonical-fact
tests. Expected registered pin moves: zero. No feature digest re-record, Smart87
geometry, full mechanics audit or Smart41 7,560-case corpus is authorized until the
complete suite is green.

## Completed result

The timed full feature command in `target/smart99-feature-final.log` compiled in
`57.64s` and ran 683 tests. It reported ten failures before the long-running tail
completed:

- two contact fixtures with stale retained-reservation preconditions:
  `non_candidate_pairs_stay_ignored_but_invalid_exact_identity_refuses_atomically`
  and
  `sixty_four_body_high_water_skips_distant_wide_pairs_and_keeps_the_literal_hit`;
- eight World fixtures whose expected inputs/outputs remain Smart51's captured
  directional-strike literals:
  `projected_group_finalizer_maps_commits_and_reconciles_one_following_tick`,
  `retained_anatomy_requires_the_actual_after_group_hook`,
  `retained_production_seed_is_entry_derived_and_repeats_exactly`,
  `retained_full_domain_normal_root_reports_its_first_exact_bracket`,
  `retained_residual_trust_region_refuses_the_alternate_mapper_seed`,
  `retained_single_fact_flows_through_allocation_and_after_group`,
  `retained_static_search_rejects_the_imported_normal_bracket_before_selection`, and
  `retained_world_commit_preserves_the_direct_swords_exact_recoil_and_next_tick_reconciles`.

The failures were classified as stale test-only reservation/literal ownership, not a
new exact-domain, canonical publication, dual-provenance or solver defect. Both
reservation fixtures now reserve `contact_bounds(...).candidate_bound`; the eight
captured-strike fixtures were updated to Smart99's certified/canonical words while
preserving their original assertions and mutation power.

The final evidence is:

```text
target/smart99-resolution.log
97 passed; 0 failed; 10 filtered out; 0.58s

target/smart99-feature-final.log
680 passed; 0 failed; 3 ignored; 274.72s
determinism: 10 passed; 0 failed; 0.15s

target/smart99-default-final.log
537 passed; 0 failed; 1 ignored; 1.13s
determinism: 10 passed; 0 failed; 0.17s
```

The default build in the final log took `49.10s`; the already-warm feature build took
`0.01s`. No doc tests failed. Smart99 is accepted at this boundary. It does not
authorize a registered-pin move, the Smart41 corpus or an implicit geometry change;
Smart100 separately owns reapplying the previously proven retained segment geometry.
