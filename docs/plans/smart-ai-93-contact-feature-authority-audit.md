# Smart AI 93 -- audit contact feature authority before time-only certification

**Status:** complete and reverted. At WeaponBody time `905`, the sweep candidate's
sentinel feature `0` and fixed-pose primitive feature `4` are distinct, but poisoning
the copied sweep feature to `255` together with copied point/normal/velocity changes
neither `(time,key,Legs,medial)` selection nor the canonical fact. WW and WS controls
prove the same boundary. Suppression reads only key/global/normal/relative velocity;
feature cannot enter it. Smart90's three focused tests, feature/default no-run and
diff-check were green; all diagnostics were reverted. No behavior, pin or corpus
changed. Smart94 may omit primitive feature from certified selection and let
fixed-pose recompute own canonical publication.

## A -- inventory every feature read and write

Read and enumerate the exact production seams in:

- `crates/sim/src/combat/contact.rs`: closest-candidate feature assignment in wide
  segment/segment, segment/rectangle and segment/body geometry; each sweep winner;
  `make_candidate`/`make_wide_candidate`; and `exact_contact_at_pose`;
- `crates/sim/src/combat/resolution.rs`: candidate sorting/dedup, earliest-time and
  group membership, `Resolved` suppression, recompute, driver construction and
  `ContactResolution` publication; and
- every consumer found by `rg "\.feature|feature:" crates/sim/src`.

Create a cfg(test)-only table, one row per actual access:

```rust
enum FeatureUse {
    ClosestCandidateTie,
    RegionWinnerTie,
    PairOrdering,
    GroupMembership,
    NormalConstruction,
    SuppressionIdentity,
    RecomputeValidation,
    ResolutionPublication,
    DiagnosticOnly,
}
```

For each use, record pair kind, source (`Sweep` or `FixedPose`), whether changing only
feature changes authoritative output/control flow, and the exact compared fields.
The inventory test must fail if a production read/write is omitted; implement it by
calling named instrumented cfg(test) wrappers, not by asserting a hand-maintained
count from source text.

```rust
#[test] fn every_contact_feature_access_has_a_named_authority_role() {}
```

Mutation proof: remove one wrapper mark at each of selection, normal, suppression and
publication; the inventory must go red each time and green after restoration.

## B -- freeze WeaponBody's feature split and causal paths

Reuse the exact Smart90/92 tick-79 pair at certified time `905`. Freeze:

```text
sweep feature       0
canonical feature   4
sweep point         [814289,6900,58982]
canonical point     [814289,6901,58982]
```

Capture region, medial rational, closest A/B, key, normal, velocities and published
fact for both routes. Then run independent cfg(test) mutations that replace only the
feature word at each boundary while all geometry remains frozen:

1. before per-region closest selection;
2. after region/time/medial winner selection but before publication;
3. before normal construction;
4. before `Resolved` suppression comparison; and
5. before `ContactFact`/resolution serialization.

Each test states whether output/control flow must remain equal or which exact word/
branch changes. Do not infer independence because feature is absent from one struct;
exercise the downstream call with `0` and `4`. Region authority remains earliest
time, then medial, then region ordinal unless measurement proves feature is read.

```rust
#[test] fn weapon_body_feature_does_or_does_not_participate_in_region_selection() {}
#[test] fn weapon_body_feature_does_or_does_not_participate_in_normal_construction() {}
#[test] fn weapon_body_feature_does_or_does_not_participate_in_suppression() {}
#[test] fn weapon_body_feature_publication_names_its_single_authority() {}
```

Mutation proof: deliberately consult feature in region tie-breaking, normal axis,
suppression identity and, conversely, discard it from publication. The matching test
must go red for each mutation; restore all.

## C -- WW and WS controls distinguish real feature identity

Build frozen exact fixtures for WeaponWeapon and WeaponShield with at least two
closest-feature outcomes at the same certified time and distance/tie envelope. For
each kind compare sweep and canonical fixed-pose:

- selected time, closest candidate ordinal and feature;
- canonical operand direction and `ContactKey`;
- closest A/B, point and normal;
- both velocities;
- suppression behavior after one accepted resolution; and
- serialized resolution feature/region words if present.

Permute segment endpoints, shield corners and input row order. Require the documented
geometric feature mapping under each permutation and double restoration. A feature
may be discarded from a certification row only if changing the sweep feature after
time selection cannot change time, candidate/region winner, canonical key, normal,
velocities, suppression or any ordering input for that pair kind.

```rust
#[test] fn weapon_weapon_feature_authority_survives_endpoint_permutation() {}
#[test] fn weapon_shield_feature_authority_survives_corner_permutation() {}
#[test] fn feature_never_orders_distinct_pairs_or_same_time_group_members() {}
#[test] fn suppression_identity_is_or_is_not_feature_sensitive_for_all_pair_kinds() {}
```

Mutation proof: order same-time pairs by feature; use sweep feature to choose canonical
operand direction; change feature during endpoint/corner permutation without the
declared mapping; add/remove feature from suppression identity. Each named control
must go red, then be restored.

## D -- time-only record decision firewall

Prototype no production record. Instead, derive a proof matrix:

| Pair | Sweep feature affects time/selection? | Affects normal/velocity? | Affects suppression/order? | Canonical publication owner |
|---|---|---|---|---|
| WB | measured | measured | measured | measured |
| WW | measured | measured | measured | measured |
| WS | measured | measured | measured | measured |

Removing feature from a future `CertifiedSelection` is permitted only if every cell
in the first three columns is proven “no” for all three pair kinds and canonical
fixed-pose recompute deterministically owns the final feature. One “yes” or unresolved
cell stops and requires a different selection record; do not copy sweep feature into
canonical publication or declare it advisory. Also prove that canonical recompute at
the certified time cannot return a different key/region than time selection; feature
independence alone is insufficient.

Record all exact literals, branches, mutations and the completed matrix in Smart93
and durable research, then revert every diagnostic. Only after a fully green matrix
may a successor plan restore time-only certification with canonical publication.

```powershell
cargo test -p sim every_contact_feature_access_has_a_named_authority_role --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_feature_does_or_does_not_participate_in_region_selection --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_feature_does_or_does_not_participate_in_normal_construction --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_feature_does_or_does_not_participate_in_suppression --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_body_feature_publication_names_its_single_authority --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_weapon_feature_authority_survives_endpoint_permutation --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_shield_feature_authority_survives_corner_permutation --features cartesian-recoil -- --nocapture
cargo test -p sim feature_never_orders_distinct_pairs_or_same_time_group_members --features cartesian-recoil -- --nocapture
cargo test -p sim suppression_identity_is_or_is_not_feature_sensitive_for_all_pair_kinds --features cartesian-recoil -- --nocapture
cargo test -p sim --no-run --features cartesian-recoil
cargo test -p sim --no-run
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No registered pin measurement/update, wasm digest, full feature repair, mechanics
audit, damage selection or Smart41 7,560-case corpus is authorized in Smart93.

## Completed authority audit

The frozen WeaponBody contact at `905` carries sweep `Candidate.feature = 0` as a
sentinel, while the direct fixed-pose closest primitive and canonical fact carry
feature `4` and point `[814289,6901,58982]`. Replacing the copied sweep feature with
`255` and poisoning its copied point, normal and velocities left the complete
selection tuple `(time, ContactKey, Legs region, medial)` and every canonical fact
word unchanged. Thus those sweep publication fields are not selection authority.

A comparator alias control supplied identical closest A/B/distance with feature `0`
versus `255`. It remained deterministic, and its midpoint/publication was identical;
feature did not provide a hidden pair or region tie. WW and WS controls independently
poisoned copied sweep feature and normal: certified time/key and the direct
fixed-pose canonical fact remained unchanged for both primitives. Source and direct
call tracing confirmed suppression identity reads `ContactKey`, global time, normal
and relative velocity only; feature has no path into suppression, same-time group
ordering or pair ordering.

Therefore the completed proof matrix is “no” for sweep feature affecting certified
time/selection, canonical normal/velocity, suppression or ordering for WB, WW and WS.
Canonical fixed-pose recompute exclusively owns published feature. The Smart90 three
focused tests, feature and default `--no-run` compiles, and diff-check passed. No
named aggregate test count was recorded, so none is inferred here. All diagnostic
code was reverted.
