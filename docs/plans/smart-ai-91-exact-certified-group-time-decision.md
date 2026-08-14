# Smart AI 91 -- choose an exact-certified group time

**Status:** stopped and reverted. Boundary-started exact certification finds the
frozen WeaponBody contact at `905`, but the sweep witness and canonical fixed-pose
recompute do not publish the same fact: scanner point `[814289,6900,58982]` versus
canonical recompute `[814289,6901,58982]`. All other displayed words match. Per the
fixed-pose equality firewall, Smart91 chose no production architecture and every
prototype was reverted. No behavior, pin, tolerance, bound, policy, audit or corpus
changed; Smart92 diagnoses whether time-only certification can discard the sweep
publication without changing selection or ordering.

## A -- preserve the group contract that already exists

Read and test these exact seams before adding a prototype:

- `crates/sim/src/combat/contact.rs`: `scan_detector_into`,
  `scan_compatibility_candidates_into`, `wide_sweep_segment_body`, and
  `exact_contact_at_pose`;
- `crates/sim/src/combat/resolution.rs`: `candidate_global_time`,
  `earliest_group_time`, `count_group_members`, and the recompute loop in
  `solve_contact_tick_with`; and
- `crates/sim/src/replay.rs`:
  `exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint`.

The current contract first maps every unsuppressed scan candidate into global time,
chooses the minimum, counts every candidate at that mapped word as one simultaneous
group, advances once, then recomputes those members. This ordering owns cap counting,
same-time grouping, zero-time suppression, lifecycle acceptance and rollback. The
tick-79 row exposes one missing invariant: mapped membership is currently certified
only by the scan fact, so a compatibility candidate can count at `902` even though
authoritative recompute returns no fact. The empty exact set then reaches the lifted
driver as `EmptyDriverSet`.

Freeze that description in a cfg(test) state-machine test before considering a
change. Assert the exact `1 scan / 1 mapped / 0 recomputed / 0 driver` sequence and
that no lifecycle, suppression row, group ordinal or accepted resolution exists.

```rust
#[test]
fn tick_79_empty_driver_is_created_by_uncertified_mapped_membership() {}
```

Mutation proof: bypass recompute or manufacture one driver from the scan fact; both
must make the stage-boundary assertion red. Restore each mutation.

## B -- reject compatibility-time filtering and define the certification domain

Prototype the tempting filter only to disprove it: before counting a compatibility
member, call the authoritative exact predicate at its proposed time and retain only
`Some`. Use copied exact state; do not advance World or write authoritative scratch.
Record `Certified`, `Separated`, or the existing exact refusal.

For the frozen pair this correctly removes `902`, but removal alone is not a complete
algorithm: `earliest_group_time` has no candidate from which to discover `905`.
Smart91 must reject this option: `earliest_group_time` has no candidate from which to
discover `905`. More importantly, compatibility `902` is not proved to be a lower
bound on exact contact and must not seed, clamp or prune exact search.

The candidate architecture instead certifies every supported hostile exact pair --
WeaponWeapon, WeaponShield and WeaponBody -- directly from the current accepted group
boundary through tick end. It uses that boundary from `ExactKinematics::time_basis`
and owner `group_time_raw`, not a compatibility TOI. Only certified exact candidates
enter earliest-time ordering or simultaneous membership. Compatibility colliders
remain identity/material/publication inputs; their swept TOI is not geometry
authority in this feature path.

```rust
#[test]
fn certification_only_names_its_no_progress_state_at_tick_79() {}

#[test]
fn certification_cannot_drop_a_later_exact_contact_or_an_earlier_other_pair() {}
```

Mutate the prototype to return ordinary end-of-tick when it filters `902`; the first
test must go red because it loses the proven `905` contact. Mutate it to advance the
group ordinal or suppression set while empty; the second must go red. Restore both.

## C -- test bounded exact certification from the current group boundary

The preferred decision candidate is scanner-side exact certification. For every
supported hostile pair, the exact detector starts at the current accepted group
boundary and continues until it finds the earliest publishable exact contact, proves
separation through tick end, or returns an existing named refusal. Prototype this
entirely in cfg(test) around the existing wide SegmentSegment, SegmentShield and
SegmentBody predicates and safe-step/AABB rules. Do not start from compatibility
`902`, use `time + 1` as the general search, add an epsilon, widen `12451`, or accept
the first rounded overlap.

For every candidate, the prototype returns:

```rust
enum ExactCertifiedCandidate {
    Contact(Candidate),       // fact.toi is the certified exact time
    SeparatedThroughTick,
    Refused(ExactScanReject),
}
```

It retains the existing bound of at most 96 visits for each exact sweep (and per body
region for WeaponBody), `AnatomyRegion::COUNT` regions, the current wide arithmetic
envelope, and the named sub-raw enter/exit refusal. First certify *all* supported
hostile pairs from the same boundary into retained staging; only after certification
finishes may the existing global-time ordering choose the minimum and count all rows
at that time. Thus another pair certified at `903` beats the frozen pair's `905`,
while distinct facts certified at the same global word remain one group.

WeaponBody's tie law is exact and unchanged: earliest contact time wins across
regions; at equal time the smaller medial distance wins; equal medial distance uses
the lower `AnatomyRegion` ordinal. Across pairs the existing `ContactKey` order is the
strict deterministic tie-break. WeaponWeapon and WeaponShield retain their existing
closest-feature tie laws. A permutation of collider or trajectory rows must not
change any certified row.

Each certified fact is published canonically at its certified fixed pose by the same
`make_wide_candidate`/owner-frame path that `exact_contact_at_pose` uses. The scanner
must not publish sweep witnesses or compatibility interpolation as the fact. Direct
fixed-pose recompute at the certified time must be byte-equal to the staged fact; any
difference stops the design rather than choosing one opportunistically.

Freeze Smart90's exact literals in the direct prototype:

```text
hilt [704359,9233,58982] + [135,2569,0] * t/65536
tip  [835023,-1099,58982] + [495,9421,0] * t/65536
weapon radius 2621
Legs [827064,13107,91750] -> [814776,13107,58982], radius 9830
combined radius 12451
```

Record compatibility `902` only as the disproved historical selection. Require exact
`Greater` at `900..904`, exact `Less` at `905..910`, a boundary-started certified
candidate at exactly `905`, and a successful direct
`exact_contact_at_pose(..., 905, ...)`. Publication words are observations only after
that geometry gate; Smart89's frame must remain unreachable at `902`.

```rust
#[test] fn tick_79_boundary_scan_certifies_905_as_the_first_exact_contact() {}
#[test] fn exact_certification_preserves_other_pair_and_same_time_group_ordering() {}
#[test] fn exact_certification_preserves_region_medial_and_key_tie_breaks() {}
#[test] fn exact_certification_proves_separation_or_returns_the_existing_named_refusal() {}
#[test] fn every_supported_pair_is_certified_before_earliest_group_ordering() {}
#[test] fn certified_fact_equals_canonical_fixed_pose_recompute() {}
#[test] fn accepted_group_rescans_all_pairs_from_the_new_boundary() {}
```

After an accepted group, advance/apply/lifecycle completes exactly once, then discard
the prior certification staging and rescan *all* supported hostile pairs from the new
accepted boundary. Reusing a pre-group candidate is forbidden because the impulse may
change both trajectory and ordering. An empty certified set finishes the tick; a
filtered compatibility set does not.

Mutation proof: seed search from `902` or `903`; certify/order one pair before the
rest; reuse a candidate after an accepted group; publish the sweep witness instead of
fixed-pose recompute; use rounded distance; exceed/erase the existing 96-visit bound;
stop at the first body region; reverse medial, region or key tie-break; turn a budget/
sub-raw refusal into separation. Each named test must go red and green after restore.

## D -- decision firewall and successor

Smart91 chooses scanner-side bounded exact certification only if all of the following are
proved in the cfg(test) prototype:

1. from the current group boundary, the frozen pair certifies exact contact `905`
   independently of compatibility time `902`;
2. recompute at `905` returns the same exact fact the certified scanner staged;
3. an unrelated exact candidate at `903` or `904` still wins globally;
4. exact same-time candidates still form one group with unchanged cap semantics;
5. no-contact, budget, arithmetic and sub-raw refusal paths keep their existing
   meanings; and
6. pair/region permutation changes no selected time, key or fact word;
7. WW, WS and WB are all certified before ordering and fixed-pose publication equals
   direct recompute byte for byte; and
8. every accepted group causes a fresh all-pair scan from the new boundary.

If any condition fails, record the first counterexample and stop without a production
plan. If all pass, revert the prototype, record exact visit/bound evidence, and author
a separate pre-code Smart92 production plan limited to replacing feature-path scan
membership with the all-pair certified staging before `earliest_group_time`. Do not modify
the recompute loop merely to tolerate empty groups: that would conceal the bad time
and lose the `905` contact.

Record diagnostic cost before that decision: supported hostile pair count, exact
sweeps attempted by kind, region sweeps, total and maximum visits, AABB early-outs,
separated pairs, staged candidates and retained capacity high-water for the frozen
tick and a declared maximum-row fixture. Counters are cfg(test)-only and unhashed.
The prototype must allocate nothing after existing reservation and must not evaluate
any pair twice within one boundary scan. A bound/capacity overflow keeps the existing
named refusal; it is never truncation or an excuse to fall back to compatibility.

```powershell
cargo test -p sim tick_79_empty_driver_is_created_by_uncertified_mapped_membership --features cartesian-recoil -- --nocapture
cargo test -p sim certification_only_names_its_no_progress_state_at_tick_79 --features cartesian-recoil -- --nocapture
cargo test -p sim certification_cannot_drop_a_later_exact_contact_or_an_earlier_other_pair --features cartesian-recoil -- --nocapture
cargo test -p sim tick_79_boundary_scan_certifies_905_as_the_first_exact_contact --features cartesian-recoil -- --nocapture
cargo test -p sim exact_certification_preserves_other_pair_and_same_time_group_ordering --features cartesian-recoil -- --nocapture
cargo test -p sim exact_certification_preserves_region_medial_and_key_tie_breaks --features cartesian-recoil -- --nocapture
cargo test -p sim exact_certification_proves_separation_or_returns_the_existing_named_refusal --features cartesian-recoil -- --nocapture
cargo test -p sim every_supported_pair_is_certified_before_earliest_group_ordering --features cartesian-recoil -- --nocapture
cargo test -p sim certified_fact_equals_canonical_fixed_pose_recompute --features cartesian-recoil -- --nocapture
cargo test -p sim accepted_group_rescans_all_pairs_from_the_new_boundary --features cartesian-recoil -- --nocapture
cargo test -p sim --no-run --features cartesian-recoil
cargo test -p sim --no-run
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No registered pin measurement/update, wasm digest, full feature repair, mechanics
audit, damage selection or Smart41 7,560-case corpus is authorized in Smart91.

## Stopped result

The all-pair boundary-started prototype corrected the diagnosed time: the frozen
WeaponBody pair certifies `905` rather than compatibility `902`. Its sweep witness
then publishes point `[814289,6900,58982]`, while a direct canonical
`exact_contact_at_pose(..., 905, ...)` publishes `[814289,6901,58982]`. The remaining
displayed fact words are equal. This violates checkpoint D's required byte equality
and prevents treating the sweep candidate as a staged fact. The prototype and its
diagnostics were fully reverted. Smart91 does not establish that the point is inert
to region choice, medial/key tie-breaking, normal, velocities or cross-pair ordering;
that bounded proof belongs to Smart92 before any production plan.
