# Smart AI 92 -- prove time-only certification and canonical publication

**Status:** stopped and reverted. The frozen WeaponBody pair confirmed the Smart91
point split, then disproved Smart92's proposed selection record: at time `905` the
sweep reports closest feature `0`, while canonical fixed-pose recompute publishes
feature `4`. The required key/region/feature match therefore failed. Every prototype
was reverted. No production behavior, pin, tolerance, bound, policy, full audit or
corpus changed; Smart93 must determine whether feature is selection authority or only
publication metadata before it can be removed from a time-only record.

## A -- freeze two different products at one exact time

Work only in cfg(test) code in `crates/sim/src/combat/contact.rs` and
`crates/sim/src/combat/resolution.rs`; use the replay fixture in
`crates/sim/src/replay.rs` only to copy the already-diagnosed tick-79 inputs. Do not
add a live feature diagnostic or public row.

Split the test vocabulary deliberately:

```rust
struct CertifiedSelection {
    time: u32,
    key: ContactKey,
    region: u8,
    feature: u8,
    medial: WideRational4096,
}

struct CanonicalPublication {
    fact: ContactFact,
}
```

`CertifiedSelection` may contain only fields used to choose the earliest pair and
WeaponBody region. It must not expose or retain sweep closest A/B, point, normal,
distance publication or velocities. `CanonicalPublication` is produced only by
`exact_contact_at_pose` at the certified time on the current exact state and current
compatibility identity/material rows.

Freeze the Smart91 WeaponBody witness at time `905`:

```text
sweep point                 [814289,6900,58982]
canonical recompute point   [814289,6901,58982]
```

Record the exact selected Legs region, closest feature, medial rational, ContactKey,
normal and velocities from both routes. The test must assert the one-word point
difference rather than hiding it, and assert every field whose equality was reported
by Smart91 using exact words rather than “other fields equal.”

```rust
#[test] fn tick_79_sweep_and_fixed_pose_have_distinct_publication_products() {}
#[test] fn certified_selection_contains_no_sweep_publication_word() {}
```

Mutation proof: copy the sweep point into canonical publication and require the first
test red; add a point/normal/velocity field to `CertifiedSelection` or consult it in
ordering and require the second test red. Restore both.

## B -- prove WeaponBody selection is independent of discarded publication

Run the existing boundary-started wide WeaponBody sweep from the current group
boundary with its 96 visits per region. Freeze, for every contacting/tied region:

- earliest certified time;
- exact medial rational at that time;
- region ordinal and closest feature;
- the pair `ContactKey`; and
- the final time/medial/region winner.

Then construct the canonical fixed-pose fact at the winning time and verify its key,
region and feature match the selection metadata. Normal and both velocities are
checked against a second direct fixed-pose call, never against the discarded sweep
fact. The production tie law remains earliest time, then smaller medial, then lower
region ordinal; pair ordering remains certified global time then `ContactKey`.

Prove independence with a cfg(test) mutation that changes only the sweep witness
closest A/B enough to move its integer midpoint from Y `6900` to `6901`, while
leaving exact time, medial, region and feature frozen. Selection and ordering must be
unchanged. Conversely, mutate medial or region ordinal and require the appropriate
selection test red. Do not perturb authoritative geometry to manufacture this proof;
mutate only the copied diagnostic witness after the sweep has selected.

```rust
#[test] fn weapon_body_selection_uses_time_medial_region_not_sweep_point() {}
#[test] fn weapon_body_canonical_fact_preserves_selected_region_key_and_feature() {}
#[test] fn weapon_body_normal_and_velocities_come_only_from_fixed_pose() {}
```

## C -- WW and WS controls close the supported domain

Construct direct reflected/permuted fixtures for WeaponWeapon and WeaponShield using
the existing exact sweep helpers. For each kind, freeze:

1. boundary-started certified time and existing closest-feature tie result;
2. canonical pair direction and `ContactKey` after any internal operand swap;
3. fixed-pose recompute `Some(ContactFact)` at that time; and
4. byte equality between two fixed-pose calls for point, normal, velocities, region
   and feature.

The sweep witness point is deliberately overwritten in the cfg(test) copy before
pair ordering. Certified time/key/feature and the canonical result must not move.
Include two different pair kinds at one certified time and prove ordering uses
`ContactKey`, not witness point, distance quotient, scan iteration or pair kind.

```rust
#[test] fn weapon_weapon_time_and_feature_survive_discarded_sweep_publication() {}
#[test] fn weapon_shield_time_and_feature_survive_discarded_sweep_publication() {}
#[test] fn supported_pair_ordering_uses_certified_time_then_contact_key_only() {}
```

Mutation proof: order by sweep point, compatibility TOI or input iteration and require
the ordering control red; publish the sweep fact rather than call fixed-pose
recompute and require the WW/WS control red. Restore every mutation.

## D -- atomic refusal and decision firewall

Prototype the proposed two-stage driver only in cfg(test): certify all supported
pairs into selection rows, order them, choose the earliest same-time set, then invoke
canonical fixed-pose recompute for every chosen row into separate staging. Commit no
group unless every chosen row returns `Some` and its key/region/feature matches the
selection row. `None`, arithmetic, budget, sub-raw or identity refusal discards the
entire staged set and preserves the existing named error; it never falls back to the
sweep fact. After a successful group, all prior selection/publication staging is
cleared before the required all-pair rescan from the new boundary.

```rust
#[test] fn time_only_certification_stages_canonical_facts_atomically() {}
#[test] fn fixed_pose_none_or_refusal_cannot_fall_back_to_the_sweep_fact() {}
#[test] fn accepted_group_clears_selection_and_publication_before_rescan() {}
```

Mutate one member of a two-fact group to `None`; partial commit must make the atomic
test red. Reuse the sweep fact on `None`, or retain a prior selection after accepted
group; each named test must go red. Restore all mutations.

Smart92 succeeds only if WB, WW and WS prove that discarded sweep publication cannot
affect certified time, region/feature selection, pair ordering, canonical normal or
velocities, and if canonical staging is atomic. Record every exact field, mutation
and refusal. Then revert the diagnostic prototype and author a separate pre-code
production plan. Any counterexample stops without a fix.

```powershell
cargo test -p sim tick_79_sweep_and_fixed_pose_have_distinct_publication_products --features cartesian-recoil -- --nocapture
cargo test -p sim certified_selection_contains_no_sweep_publication_word --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_selection_uses_time_medial_region_not_sweep_point --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_canonical_fact_preserves_selected_region_key_and_feature --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_normal_and_velocities_come_only_from_fixed_pose --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_weapon_time_and_feature_survive_discarded_sweep_publication --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_shield_time_and_feature_survive_discarded_sweep_publication --features cartesian-recoil -- --nocapture
cargo test -p sim supported_pair_ordering_uses_certified_time_then_contact_key_only --features cartesian-recoil -- --nocapture
cargo test -p sim time_only_certification_stages_canonical_facts_atomically --features cartesian-recoil -- --nocapture
cargo test -p sim fixed_pose_none_or_refusal_cannot_fall_back_to_the_sweep_fact --features cartesian-recoil -- --nocapture
cargo test -p sim accepted_group_clears_selection_and_publication_before_rescan --features cartesian-recoil -- --nocapture
cargo test -p sim --no-run --features cartesian-recoil
cargo test -p sim --no-run
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No registered pin measurement/update, wasm digest, full feature repair, mechanics
audit, damage selection or Smart41 7,560-case corpus is authorized in Smart92.

## Stopped result

At the certified WeaponBody time `905`, the sweep witness carries feature `0` while
canonical `exact_contact_at_pose` carries feature `4`. This is not merely the known
point difference `[814289,6900,58982]` versus `[814289,6901,58982]`: Smart92's
checkpoint B explicitly required the canonical fact's key, region and feature to
match its `CertifiedSelection`, so the prototype stopped at that feature assertion.
No evidence yet proves whether feature participates in time/region choice,
closest-point ties, normal construction, suppression identity or only fact
publication. The complete diagnostic prototype was reverted; Smart92 authorizes no
time-only production record.
