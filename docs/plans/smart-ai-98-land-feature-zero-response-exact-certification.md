# Smart AI 98 -- route feature zero-response candidates through exact certification

**Status:** stopped under review; Smart99 supersedes two incorrect assumptions.
Smart97 proved Smart96's exact path
was bypassed: zero-response `scan_detector_into` returned a compatibility WB root
`902` before certification, producing Recompute `ExactScan`. Smart98 relands the
Smart94/96 architecture and removes that early return only for feature exact input.
Non-feature and explicit compatibility callers remain byte-identical. No registered
pin update, Smart87 geometry, full mechanics audit or Smart41 corpus is authorized.

Review found two independent contract errors in this plan. First, compatibility
membership is not the exact candidate domain: after an accepted response, a supported
WW/WS/WB pair can become an exact candidate even when compatibility scanning did not
enumerate it. Exact scanning must traverse every supported hostile exact pair from
the current boundary. Second, Smart47's compatibility-sweep evidence was never
revoked by Smart95. Each mapped exact row requires `wide_toi`; a matching
`compatibility_sweep` is optional -- present when legacy enumeration produced that
key, absent for response-created exact-only keys. It remains non-authoritative. The
earlier blanket expectation `compatibility_sweep == 0` and this plan's
compatibility-membership enumeration are superseded. No current Smart98 production
diff is accepted under this plan.

## A -- split enumeration from authority in the feature exact dispatcher

Edit `crates/sim/src/combat/contact.rs` and `crates/sim/src/combat/resolution.rs`.
Preserve `scan_candidates_into` and
`DetectorInput::ZeroResponseCompatibility` exactly: they continue to call
`scan_compatibility_candidates_into`, return compatibility facts and support default
behavior/corpus serialization unchanged.

For `DetectorInput::Exact { trajectories, owners }`, keep complete preflight and its
proof of zero/nonzero response, but do not return compatibility candidates when the
response is zero. Instead:

1. run compatibility scanning into retained evidence scratch only to obtain optional
   legacy witnesses, never the exact candidate set;
2. discard every compatibility TOI, point, distance, feature and publication word;
3. enumerate every supported hostile WW/WS/WB pair from exact trajectory rows; and
4. run wide certification for every such pair from the current accepted group
   boundary through tick end regardless of whether response is proven zero or the
   compatibility evidence contains that key.

This is not promotion of unsupported pairs: the exact feature domain remains WW, WS
and WB; inert combinations remain inert. Existing exact identity, arithmetic, 96-
visit, swept-AABB and sub-raw refusal rules remain unchanged. The zero-response proof
may still optimize response-coordinate evaluation inside exact geometry, but cannot
choose compatibility TOI authority.

```rust
#[test] fn feature_zero_response_exact_domain_is_all_supported_hostile_pairs() {}
#[test] fn explicit_compatibility_input_still_returns_the_legacy_candidate_bytes() {}
#[test] fn nonfeature_scan_candidates_contract_is_byte_identical() {}
#[test] fn zero_response_exact_scan_never_publishes_compatibility_fallback_provenance() {}
```

Mutation proof: restore the zero-response early return and require the frozen feature
test red at root `902`; route explicit compatibility through exact certification and
require its byte contract red. Restore both.

## B -- reapply reserved selection, canonical facts and parallel evidence

Reapply Smart96's complete retained two-stage path with Smart95's reserve precondition:

- reserve compatibility enumeration, `CertifiedSelection`, canonical fact staging,
  parallel `CertifiedProvenance` and wide scratch from the declared candidate bound;
- selection stores only `(time_raw,key,region,medial)`;
- primitive `wide_toi` is paired separately by `(key,time_raw)` and affects only the
  existing unhashed group diagnostic;
- legacy `compatibility_sweep` is independently paired by key when compatibility
  enumeration produced it, and is absent rather than fabricated for exact-only keys;
- all supported candidates certify before `(time,key)` ordering;
- canonical `exact_contact_at_pose` facts stage atomically before suppression; and
- canonical `None`, key mismatch or region mismatch refuses by the existing named
  ExactScan detail, never falls back to primitive publication.

WB region choice remains earliest time, then smaller medial, then region ordinal.
After accepted apply/lifecycle, clear enumeration/selection/facts/evidence and rescan
all supported hostile exact pairs from the new boundary. Clone and maximum-capacity tests
must preserve reservation/pointers with no allocation after reserve.

```rust
#[test] fn feature_zero_response_certification_reserves_every_stage_before_scan() {}
#[test] fn certified_provenance_remains_parallel_unhashed_and_non_authoritative() {}
#[test] fn canonical_fact_staging_precedes_suppression_and_is_atomic() {}
#[test] fn accepted_group_clears_and_rescans_zero_response_exact_candidates() {}
```

Mutation proof: omit one reserve; put provenance inside selection; copy primitive
feature/point into fact; suppress before canonical staging; retain evidence across
rescan. Each named test must go red and be restored.

## C -- frozen replay and former blocker gates

Run the frozen replay first and assert the full recovered boundary changes exactly:

```text
selected_time_raw       905
scan_candidates         1
mapped_time_members     1
recomputed_facts        1
primitive               SegmentBodyRegion
region                  Legs
visit_count             > 0
accepted_root_raw       905
canonical point         [814289,6901,58982]
canonical feature       4
```

`CompatibilityFallback`, root `902`, visit count zero, recomputed zero and
`EmptyDriverSet`/Recompute ExactScan are forbidden. Restoring the early return must
make this exact assertion red. Live/rerun/replay must agree every tick and breakpoint;
the fixture's later expected lifted refusal remains `ExactSolver` unless measurement
names a new downstream first cause.

Then run:

- all zero-response behavior cases `0..=6`, both explicit compatibility byte equality
  and feature exact certification with the declared reserve;
- group provenance requiring one mandatory `wide_toi` per mapped key and optional
  per-key `compatibility_sweep` evidence;
- Smart95 poison/None/stale evidence tests; and
- all 91 resolution tests.

```powershell
cargo test -p sim exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint --features cartesian-recoil -- --nocapture
cargo test -p sim feature_zero_response_exact_domain_is_all_supported_hostile_pairs --features cartesian-recoil -- --nocapture
cargo test -p sim explicit_compatibility_input_still_returns_the_legacy_candidate_bytes --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_exact_scan_never_publishes_compatibility_fallback_provenance --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_exact_scan_is_byte_equal_to_every_behavior_case --features cartesian-recoil -- --nocapture
cargo test -p sim group_provenance_counts_the_production_rows_at_each_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim every_zero_response_behavior_case_has_a_complete_exact_grammar_inventory --features cartesian-recoil -- --nocapture
cargo test -p sim provenance_poison_cannot_change_time_key_fact_or_suppression --features cartesian-recoil -- --nocapture
cargo test -p sim refusal_or_rescan_cannot_publish_stale_or_partial_wide_toi --features cartesian-recoil -- --nocapture
cargo test -p sim combat::resolution::tests --features cartesian-recoil
```

## D -- full regression firewall and stop

Only after checkpoint C is green run the complete feature suite. Classify every
failure by exact test and first cause. Smart98 may repair only stale fixtures whose
expectation explicitly encoded the removed feature early return or reserve/provenance
integration. A geometry, lifted solver, energy, anatomy, World, allocation or wasm
stack failure stops without scope expansion.

If the feature suite is green, run default sim/workspace and wasm equality controls.
Default compatibility facts and every registered pin must remain unchanged. The
feature digest may be observed twice only as an unregistered portability witness; no
pin is updated. Smart87 geometry remains a later session, and no full mechanics audit
or 7,560-case corpus runs until both are green.

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

Expected registered pin moves: zero. Any pin move, target disagreement, allocation
growth or unclassified feature failure stops and requires reverting Smart98.
