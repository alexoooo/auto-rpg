# Smart AI 94 -- land exact-certified group membership

**Status:** stopped and reverted. The frozen replay passed with exact time `905` and
canonical point `[814289,6901,58982]`; restoring the compatibility shortcut made its
mutation red. The wider gates exposed two independent blockers: the zero-response
exact behavior corpus refused `CompatibilityIdentity`, and group provenance lost its
primitive `wide_toi` row (`0` recorded versus `1` expected). Production was fully
reverted; all 91 resolution tests then passed. No behavior, pin or corpus changed.
Smart95 diagnoses those grammar and evidence-carry seams separately before Smart94
can be reconsidered. Smart87 retained geometry remains absent.

## A -- certify every supported pair before group ordering

Edit production in `crates/sim/src/combat/contact.rs` and
`crates/sim/src/combat/resolution.rs`; update feature exports in
`crates/sim/src/lib.rs` only if an already-public diagnostic type needs an additive
field. Do not touch default contact behavior, `fx`, policy, lab or web.

In the feature `ExactKinematics::scan` path, stop using compatibility swept TOI as
group authority. Run the compatibility scanner only to enumerate its complete,
deduplicated hostile candidate keys and primitive identities. For every resulting
WeaponWeapon, WeaponShield or WeaponBody candidate, resolve unique exact rows and run
the existing wide sweep from the current accepted group
boundary (`owner.common_response.group_time_raw`) through `65_536`:

- WW: `wide_sweep_segments` / segment-segment exact predicate;
- WS: `wide_sweep_segment_shield`; and
- WB: `wide_sweep_segment_body`, all anatomy regions.

Keep the existing 96-visit bound for each sweep and per WB region, swept-AABB
early-outs, wide arithmetic envelope and named sub-raw refusal. Compatibility time,
point, feature and distance are discarded before certification; they neither seed
nor bound exact search. Unsupported pair kinds remain inert exactly as today. A supported pair returns one of certified
selection, proved separated through tick end, or the existing `ExactScanReject`;
there is no compatibility fallback after exact preflight succeeds.

Stage only:

```rust
struct CertifiedSelection {
    time_raw: u32,
    key: ContactKey,
    region: u8,
    medial: WideRational4096,
}
```

WW/WS use `NO_REGION` and a canonical zero medial word. Primitive closest feature may
be copied to the existing feature-only wide diagnostic for provenance, but it is not
stored in `CertifiedSelection`, not compared, and never copied into a fact. Sweep
closest A/B, point, normal, distance publication and velocities are likewise absent.
Assert this structurally in a test beside the type.

Certify all enumerated candidates into retained staging before choosing any. Sort/dedup by
`(time_raw, key)` only. WB selects its region by earliest time, then exact smaller
medial, then lower `AnatomyRegion` ordinal before emitting the pair row. Pair input
permutation must not affect staging. Only after all certification succeeds may
`earliest_group_time` and `count_group_members` observe the staged times.

```rust
#[test] fn exact_feature_scan_certifies_ww_ws_wb_from_the_current_boundary() {}
#[test] fn certified_selection_has_no_primitive_publication_or_feature_word() {}
#[test] fn exact_feature_scan_certifies_all_pairs_before_time_key_ordering() {}
#[test] fn weapon_body_certification_uses_time_then_medial_then_region() {}
```

Mutation proof: seed from compatibility TOI; stop after the first candidate; store or
order by primitive feature/point; reverse medial/region/key ties; turn budget/sub-raw
refusal into separation. Each named test must go red, then be restored.

## B -- canonical publication is atomic and precedes suppression

After the earliest certified time and all same-time rows are selected, advance once
as today. Before consulting `suppressed`, closure, drivers or group caps, call
`exact_contact_at_pose` for every selected key at that exact time using unique
collider indices. Stage the returned `ContactFact`s separately from selections.

Canonical recompute exclusively owns point, normal, velocities, distance, region and
feature. For each result require:

- `Some(fact)`;
- exact `ContactKey` equality with its selection; and
- WB region equality with its selection (`NO_REGION` for WW/WS).

`None`, key mismatch or region mismatch is a named exact-scan refusal, not
`EmptyDriverSet`, separation, suppression or fallback to the sweep witness. Add a
specific feature-only diagnostic detail such as `CanonicalNone`,
`CanonicalKeyMismatch` or `CanonicalRegionMismatch` without changing the public
payloadless `ResolutionError::ExactScan`. Primitive feature mismatch is expected and
is not compared; canonical feature owns the fact.

Commit no selected member until every canonical fact is valid. Sort canonical facts
by `ContactKey`, then run existing suppression/group membership, closure and driver
construction from those facts. This ordering is load-bearing: suppression sees the
canonical normal and feature, never primitive metadata. If atomic staging refuses,
restore the last-safe pose/state through the existing tick rollback and clear both
selection and fact staging.

```rust
#[test] fn canonical_fixed_pose_facts_are_staged_before_suppression() {}
#[test] fn canonical_none_key_or_region_mismatch_refuses_the_whole_group_by_name() {}
#[test] fn primitive_feature_cannot_reach_suppression_or_fact_publication() {}
#[test] fn two_fact_canonical_staging_is_atomic_under_second_fact_refusal() {}
```

Mutation proof: suppress before recompute; accept `None`; use the scan fact; compare
or copy primitive feature; commit the first of two facts; map mismatch to
`EmptyDriverSet`. Each test must fail under its mutation and pass after restoration.

## C -- retained capacity, rescan and deterministic progress

Extend `ContactCollectionScratch`/`ContactTickScratch` with retained Vec staging only
where existing candidate storage cannot express the two atomic phases. Reserve from
the already-declared `ContactBounds.candidate_bound`; do not allocate after reserve,
clone a high-water buffer as capacity zero, or grow on retry. Manual clone/default
must reserve the same declared bound and reset length/diagnostic high-water.

Before each boundary scan, clear compatibility enumeration, selection and
canonical-fact staging. After an accepted group completes apply/lifecycle, set
`global = time`, increment the ordinal once, rerun compatibility enumeration and
exact-certify *all* its supported candidates from the new exact boundary. Never
reuse a pre-impulse selection. A fully separated certified set finishes normally.
Refusal before an accepted fact consumes no group ordinal and changes no suppression,
resolution, lifecycle or retained trajectory state.

Keep cfg(feature)-only diagnostics for pair counts by WW/WS/WB, total/per-pair visits,
WB region visits, AABB early-outs, separated/certified counts, canonical calls and
staging high-water. They are evidence-only and unhashed. At the declared maximum-row
fixture require capacities/pointers stable over two scans and a second World step;
permutation must leave selected `(time,key,region)` and canonical facts byte-equal.

```rust
#[test] fn accepted_exact_group_rescans_every_supported_pair_from_the_new_boundary() {}
#[test] fn exact_certification_and_canonical_staging_allocate_nothing_after_reserve() {}
#[test] fn cloned_high_water_contact_scratch_rereserves_empty_staging() {}
#[test] fn pair_permutation_preserves_certified_order_and_canonical_facts() {}
```

Mutation proof: retain a pre-group candidate; omit one pair on rescan; reserve one
short; clone Vec capacity as zero; order before all rows are staged. Restore all.

## D -- frozen replay, regression firewall and later geometry boundary

Run the Smart90 replay first. It must select the frozen fighter-right-weapon/brute-
Legs WB row at exact time `905`, publish only canonical point
`[814289,6901,58982]` and canonical feature `4`, and never expose sweep point
`[814289,6900,58982]` or primitive feature `0` beyond diagnostics. The old
`1 mapped / 0 recomputed / EmptyDriverSet` boundary must disappear. Live rerun and
Replay must agree every tick and breakpoint.

Then run all 91 resolution tests and the complete feature suite. Classify every
remaining failure by exact test and first cause. Smart94 may repair only stale
fixtures whose expected scan time/feature explicitly belonged to the superseded
compatibility membership contract; a new geometry, solver, energy, anatomy or World
failure stops. Run default sim/workspace and wasm equality controls to prove the
feature gate did not leak into default behavior.

Only after the entire feature suite is green may the unregistered feature digest be
measured twice native/wasm as a portability witness. Do not update any registered
pin. Do not reapply Smart87 geometry in Smart94: author/execute that later session on
the green exact-membership baseline, then rerun its frame/runtime gates. No Smart41
7,560-case corpus runs until both Smart94 and that later Smart87 landing are green.

```powershell
cargo test -p sim exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint --features cartesian-recoil -- --nocapture
cargo test -p sim exact_feature_scan_certifies_ww_ws_wb_from_the_current_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim certified_selection_has_no_primitive_publication_or_feature_word --features cartesian-recoil -- --nocapture
cargo test -p sim exact_feature_scan_certifies_all_pairs_before_time_key_ordering --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_certification_uses_time_then_medial_then_region --features cartesian-recoil -- --nocapture
cargo test -p sim canonical_fixed_pose_facts_are_staged_before_suppression --features cartesian-recoil -- --nocapture
cargo test -p sim canonical_none_key_or_region_mismatch_refuses_the_whole_group_by_name --features cartesian-recoil -- --nocapture
cargo test -p sim primitive_feature_cannot_reach_suppression_or_fact_publication --features cartesian-recoil -- --nocapture
cargo test -p sim two_fact_canonical_staging_is_atomic_under_second_fact_refusal --features cartesian-recoil -- --nocapture
cargo test -p sim accepted_exact_group_rescans_every_supported_pair_from_the_new_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim exact_certification_and_canonical_staging_allocate_nothing_after_reserve --features cartesian-recoil -- --nocapture
cargo test -p sim cloned_high_water_contact_scratch_rereserves_empty_staging --features cartesian-recoil -- --nocapture
cargo test -p sim pair_permutation_preserves_certified_order_and_canonical_facts --features cartesian-recoil -- --nocapture
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

Expected registered pin moves: zero. A default pin move or native/wasm disagreement
stops without re-record. Smart94 lands only on a green feature suite and default/
portable controls; otherwise revert the production change and record the first stop.

## Stopped result

The temporary exact-certification integration fixed its motivating replay case: the
fighter-right-weapon/brute-Legs pair certified at `905`, canonical recompute
published Y `6901`, and the replay gate passed. Reintroducing the compatibility-time
shortcut made the declared mutation red, so the replay test genuinely covered the
new authority.

Smart94 nevertheless stopped on two later, distinct failures. First,
`zero_response_exact_scan_is_byte_equal_to_every_behavior_case` encountered
`CompatibilityIdentity`, so exact certification has not proved it accepts every
zero-response compatibility grammar already promised by the behavior corpus. Second,
the group diagnostic expected one primitive `wide_toi` provenance row but recorded
zero: the time-only selection correctly discarded primitive fact fields, but also
discarded evidence that must be projected into the unhashed diagnostic. Neither
failure authorizes changing geometry or copying primitive feature/point into the
canonical fact. The complete production experiment was reverted; the post-revert
`combat::resolution::tests` result was `91/91` green. No pin measurement or corpus
ran.
