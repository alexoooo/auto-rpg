# Smart AI 95 -- audit zero-response grammar and exact provenance carry

**Status:** complete. All behavior cases `0..=6` have valid zero-response exact
grammar; Smart94's `CompatibilityIdentity` came from calling the direct audit without
its required retained `try_reserve(64)`, not from a row/owner mismatch. Parallel
`wide_toi` evidence pairs one-to-one by `(key,time)` and poisoning it changes only the
diagnostic. Feature focused/provenance filters report nine green total. The retained
cfg(test) audit and its mutations are green/restored. No production behavior,
candidate authority, pin, tolerance, bound, full audit or corpus changed. Smart96 may
reland Smart94 with the reserve precondition and parallel evidence carry.

## A -- inventory every zero-response behavior grammar

Work only in cfg(test) code beside `zero_response_compatibility`,
`scan_exact_candidates_into` and the behavior corpus in
`crates/sim/src/combat/contact.rs` and `crates/sim/src/combat/resolution.rs`. Do not
special-case a failing case number before enumerating the entire frozen corpus.

For every `behavior_case` row, record:

```text
case ordinal
collider count and ordered (entity,slot,shape,present,faction)
hostile candidate keys/kinds produced by compatibility scan
owner count and every owner entity/body mass/common scale/held slots
trajectory count and every entity/slot/kind/owner_index/held_index/spec/present/motor
preflight zero-response result
per-candidate exact row/index lookup result
supported primitive chosen or inert classification
first ExactScanReject stage, if any
```

Build a cfg(test)-only `ZeroResponseGrammarStage` enum that distinguishes owner
construction, body lookup/mass, held-slot uniqueness, trajectory construction,
entity/index consistency, candidate-key lookup, primitive direction and exact sweep.
Map it back to the unchanged production `CompatibilityIdentity`; no new runtime
diagnostic is authorized.

```rust
#[test] fn every_zero_response_behavior_case_has_a_complete_exact_grammar_inventory() {}
#[test] fn zero_response_inventory_names_the_first_compatibility_identity_boundary() {}
#[test] fn zero_response_candidate_keys_resolve_unique_exact_rows_in_both_directions() {}
```

The inventory must include WW, WS, WB and all inert/unsupported combinations present
in the behavior table, including equipment-only owners, Body plus held equipment,
absent rows and whichever side is canonical after operand swap. State explicitly
whether the Smart94 refusal occurs while enumerating compatibility candidates, while
building zero-response exact state, or only when resolving one candidate into exact
rows. Do not repair a pure behavior fixture by fabricating a Body row or relaxing the
Smart89 exact-one equipment-only fallback.

Mutation proof: swap one owner index, duplicate one held slot, erase one Body row,
reverse one candidate direction and skip the first failing stage. Each mutation must
make its named inventory assertion red and be restored.

## B -- direct old/new grammar oracle without behavior changes

For each behavior case, run two cfg(test)-only routes on the same immutable collider
slice:

1. current `scan_exact_candidates_into` zero-response route; and
2. the Smart94 candidate-enumeration plus boundary-started exact-certification
   prototype, reconstructed only in the test.

Compare candidate key/kind sets before geometry, then owner/trajectory identity maps,
then exact certified outcomes. Stop at the first difference. The Smart94 prototype
must not use compatibility TOI, point, feature or distance as exact authority, but it
must preserve the current zero-response grammar domain byte for byte. If the old
route succeeds because response is proven zero and intentionally uses compatibility
geometry, record that branch explicitly rather than forcing a wide sweep through a
grammar that does not own exact state.

```rust
#[test] fn smart94_candidate_enumeration_preserves_zero_response_grammar_domain() {}
#[test] fn zero_response_old_new_oracle_stops_at_the_first_identity_difference() {}
```

This checkpoint chooses no fix. A result may recommend preserving the proven-zero
compatibility dispatcher or repairing an exact identity map only after it identifies
the exact case, rows and violated invariant. It may not widen Smart89 grammar,
manufacture ownership, change behavior corpus bytes or infer that every zero-response
case needs an exact sweep.

Mutation proof: route one zero-response case into exact certification prematurely;
copy a compatibility candidate whose key has no unique exact rows; ignore an identity
difference. Each corresponding test must go red, then be restored.

## C -- project primitive provenance without restoring primitive authority

Separately reproduce Smart94's group-provenance failure in cfg(test) using the frozen
replay group and a WW/WS control. Freeze:

```text
certified selections      1 (or control group width)
canonical staged facts    same width
primitive wide_toi rows   expected 1, observed 0 in Smart94
```

Trace the existing primitive `ExactWideToiDiagnostic` from wide sweep production to
the current `Candidate`, compatibility collection, group diagnostic
`mapped_member_keys`/`wide_toi`, and canonical staging. Name the precise ownership
move where time-only `CertifiedSelection` dropped it.

Prototype a cfg(test)-only parallel evidence row:

```rust
struct CertifiedProvenance {
    key: ContactKey,
    time_raw: u32,
    wide_toi: ExactWideToiDiagnostic,
}
```

It is not part of ordering, membership, canonical fact equality, suppression or hash
state. Pair it to selection by exact `(key,time_raw)`, require one-to-one cardinality,
and project it into the already-existing feature-only group diagnostic only after all
certification succeeds. A separated pair and a refusing atomic scan publish no group
row. A canonical `None`/key/region refusal cannot leave partial provenance. Clearing
and rescanning a new boundary clears evidence together with selection.

```rust
#[test] fn certified_wide_toi_provenance_is_parallel_to_not_inside_selection() {}
#[test] fn group_diagnostic_recovers_one_to_one_wide_toi_without_fact_authority() {}
#[test] fn refusal_or_rescan_cannot_publish_stale_or_partial_wide_toi() {}
#[test] fn provenance_poison_cannot_change_time_key_fact_or_suppression() {}
```

Poison primitive feature, closest witness, visited times and comparison enum after
certification; the displayed diagnostic must change, while certified time/key,
canonical fact, suppression and state digest remain byte-identical. Conversely,
remove the `(key,time)` pairing or carry stale evidence across rescan and require the
cardinality/staleness tests red. Restore all mutations.

## D -- stop and successor decision

Smart95 completes only when it records:

- every zero-response behavior grammar and the exact first failing case/stage/rows;
- whether zero-response compatibility dispatch or exact identity construction owns
  that case, without proposing geometry changes;
- the exact point where primitive provenance was dropped; and
- a one-to-one, atomic, non-authoritative projection proof whose poisoning cannot
  affect selection or canonical facts.

Revert every diagnostic prototype. Only then may a pre-code Smart96 plan choose the
minimal grammar handling and provenance carry needed before retrying Smart94. No
production edit, registered pin measurement/update, wasm digest, full feature repair,
Smart87 geometry, damage selection, mechanics audit or 7,560-case corpus belongs here.

```powershell
cargo test -p sim every_zero_response_behavior_case_has_a_complete_exact_grammar_inventory --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_inventory_names_the_first_compatibility_identity_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_candidate_keys_resolve_unique_exact_rows_in_both_directions --features cartesian-recoil -- --nocapture
cargo test -p sim smart94_candidate_enumeration_preserves_zero_response_grammar_domain --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_old_new_oracle_stops_at_the_first_identity_difference --features cartesian-recoil -- --nocapture
cargo test -p sim certified_wide_toi_provenance_is_parallel_to_not_inside_selection --features cartesian-recoil -- --nocapture
cargo test -p sim group_diagnostic_recovers_one_to_one_wide_toi_without_fact_authority --features cartesian-recoil -- --nocapture
cargo test -p sim refusal_or_rescan_cannot_publish_stale_or_partial_wide_toi --features cartesian-recoil -- --nocapture
cargo test -p sim provenance_poison_cannot_change_time_key_fact_or_suppression --features cartesian-recoil -- --nocapture
cargo test -p sim zero_response_exact_scan_is_byte_equal_to_every_behavior_case --features cartesian-recoil -- --nocapture
cargo test -p sim group_provenance_counts_the_production_rows_at_each_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim --no-run --features cartesian-recoil
cargo test -p sim --no-run
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

## Completed findings

Every frozen zero-response behavior case `0..=6` constructs owners/trajectories,
resolves each candidate key in both directions and scans successfully when the direct
audit first calls `ContactCollectionScratch::try_reserve(64)`. Omitting that reserve
made the exhaustive inventory red with `CompatibilityIdentity`; restoring it made the
inventory green. The former Smart94 blocker was therefore a caller-owned retained-
scratch precondition, not unsupported behavior grammar and not permission to loosen
Smart89 ownership rules.

Selection and primitive evidence remain separate rows paired exactly by
`(ContactKey,time_raw)`. Poisoning evidence `accepted_root_raw`, `closest_feature`,
visited times and comparison enum changed only the projected feature diagnostic;
selection, canonical `exact_contact_at_pose` fact and suppression were byte-identical.
Supplying `None` evidence made the refusal mutation red and restoring evidence made it
green. A stale key/time pair refuses and clears `mapped_member_keys` and `wide_toi`
atomically, so no partial or old-boundary diagnostic survives. The feature focused/
provenance filters reported nine green tests total; no unsupported split of that
aggregate is inferred. All declared mutations were restored.
