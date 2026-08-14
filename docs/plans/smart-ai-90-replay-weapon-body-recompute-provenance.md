# Smart AI 90 -- isolate the tick-79 WeaponBody recompute drop

**Status:** diagnosis complete; diagnostic prototype reverted. Smart89's bounded
equipment-only frame fallback passed nine direct tests, all 91 resolution tests and
then a post-correction full feature run of `647 passed; 25 failed; 3 ignored`. That
run still stops in the replay fixture at loop index `79` (diagnostic tick `80`):
fighter right weapon to brute `BODY_SLOT`, `WeaponBody`, selected time `902`, one scan
candidate, one mapped member, zero recomputed facts, zero drivers, then
`EmptyDriverSet`. Smart90 diagnoses only that dropped member. It changes no behavior,
pin, tolerance, bound, policy, audit, or corpus.

## A -- freeze the one authoritative boundary

Work only in cfg(test) code in:

- `crates/sim/src/replay.rs`, beside
  `exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint`;
- `crates/sim/src/combat/contact.rs`, beside `exact_contact_at_pose`; and
- `crates/sim/src/combat/resolution.rs`, only if a test-private accessor is required
  to copy the already-retained group row.

Do not add a public diagnostic, feature runtime branch, hash input, raw-remainder ABI,
allocation on the driver path, or an additional geometry evaluation inside World.
Extract the replay fixture's scenario and `command_at` grammar into a cfg(test) helper
so the old test and Smart90 drive byte-identical commands. At loop index `79`, copy
the state already owned at the group boundary into the test before it is cleared:

```text
diagnostic tick                     80
group ordinal                      0
selected_time_raw                  902
scan_candidates                    1
mapped_time_members                1
recomputed_facts                   0
driver_contacts                    0
reject                             EmptyDriverSet
key                                fighter:RightArm -> brute:BODY_SLOT, WeaponBody
```

Freeze the candidate's complete `ContactFact`, feature, region, distance square,
compatibility-sweep/wide provenance, collider indices, and the two compatibility
colliders. Also freeze the matching `ExactContactTrajectory` rows, both referenced
`ExactOwnerTrajectory` rows, and the canonical owner-frame input. Assert there is
exactly one candidate and that key/index lookup is unique; do not select the first
row by convenience. The test must first reproduce `Some(scan candidate)` and
`Ok(None)` from `exact_contact_at_pose(..., 902, ...)` on those same copied inputs.

```rust
#[test]
fn replay_tick_79_freezes_the_single_weapon_body_recompute_drop() {}

#[test]
fn replay_tick_79_pair_is_selected_by_key_not_iteration_position() {}
```

Mutation proof: change `902` to `901`, change RightArm to LeftArm, and choose the
first WeaponBody-shaped row without matching the full key. Each mutation must make
its named freeze assertion red, then be restored.

## B -- compare scan and recompute without choosing a new authority

Add a cfg(test)-only, direct helper in `contact.rs` that accepts the frozen slices,
the resolved pair indices and time. It invokes the existing calculations and returns
copied evidence; it must not be called by production:

```rust
#[cfg(test)]
struct WeaponBodyRecomputeComparison {
    compatibility: WeaponBodyStageWords,
    exact: WeaponBodyStageWords,
    first_difference: WeaponBodyDifference,
}

#[cfg(test)]
enum WeaponBodyDifference {
    SegmentEndpoint { endpoint: u8, axis: u8 },
    BodyEndpoint { region: u8, endpoint: u8, axis: u8 },
    Radius { region: u8 },
    Closest { region: u8, field: ClosestField, axis: Option<u8> },
    DistanceCompare { region: u8 },
    MedialOrder { left_region: u8, right_region: u8 },
    ChosenRegionOrFeature,
    OwnerFrame { axis: u8 },
    Point { axis: u8 },
    Normal { axis: u8 },
    Velocity { side: u8, axis: u8 },
    ExactDroppedAfterEqualOperands,
}
```

`WeaponBodyStageWords` records exact rational numerator/denominator pairs, not only
their quotient, for:

1. weapon hilt, tip and radius at `902`;
2. every present body region's lower/upper endpoint and radius;
3. closest A, closest B, distance square and medial value per region;
4. `distance_sq <= radius_sq` and the deterministic medial/region tie-break;
5. selected region and closest feature;
6. owner motor frame and response velocities; and
7. the candidate publication point, normal and both velocities, when construction
   reaches them.

The compatibility column must use the actual scan route (`candidate` /
`segment_body_candidate`, followed at its selected TOI by `segment_body_at_pose`),
including its integer interpolation and publication. The exact column must use the
same production helpers as `exact_contact_at_pose`: `wide_segment_body_at_time`,
wide radius square/compare, medial selection, `wide_owner_motor_frame`,
`wide_response_velocity`, and `make_wide_candidate`. Do not reconstruct either
column from expected literals. Compare in the numbered order and stop at the first
unequal word or exact `None`; later differences are not evidence until the earlier
one is explained.

This is a provenance comparison, not permission to make compatibility geometry
authoritative. Do not add epsilon contact, widen a radius, change `902`, accept the
scan row merely because recompute returned `None`, or alter region/tie ordering.

```rust
#[test]
fn replay_tick_79_names_the_first_scan_recompute_operand_difference() {}

#[test]
fn replay_tick_79_current_publication_is_compared_only_after_geometry_matches() {}
```

Mutation proof: round the exact endpoint at the diagnosed boundary to its
compatibility word and require the first-difference test red; skip that comparison
and require the phase/order assertion red; force the scan's region or feature into
the exact result and require the selection assertion red. If geometry and selection
are equal and publication is first, substitute only the diagnosed old publication
word and require the publication test red. Restore every mutation. A mutation may
exist only in cfg(test) reconstruction, never in production helpers.

## C -- separate scan eligibility from recompute publication

The final focused test calls `exact_contact_at_pose` twice on the frozen exact rows:
first with the production compatibility colliders, then with a cfg(test) collider
copy whose published point/velocity fields are changed while shape, identity, mass,
surface and exact rows remain fixed. This answers whether `Ok(None)` occurs before
`make_wide_candidate` or whether current publication inputs are involved. It does
not feed the altered collider back into scanning or World.

```rust
#[test]
fn replay_tick_79_drop_is_classified_before_or_inside_publication() {}
```

Require one of these exclusive results:

- both calls return `None` and the first difference is geometry, radius, comparison
  or region selection;
- geometry selects the same region but candidate publication refuses; or
- both construct a fact and the original `None` was caused by a captured-input error,
  which stops Smart90 and requires the fixture seam to be corrected before diagnosis.

Mutate a publication-only collider word. If it changes a pre-publication diagnosis,
the classification test must go red. Mutate the diagnosed exact geometry operand by
one raw rational numerator; the first-difference identity must also go red. Restore
both mutations.

## D -- gates, record, and stop

Run the focused replay baseline first, then the new diagnostics and compile controls:

```powershell
cargo test -p sim exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint --features cartesian-recoil -- --nocapture
cargo test -p sim replay_tick_79_freezes_the_single_weapon_body_recompute_drop --features cartesian-recoil -- --nocapture
cargo test -p sim replay_tick_79_pair_is_selected_by_key_not_iteration_position --features cartesian-recoil -- --nocapture
cargo test -p sim replay_tick_79_names_the_first_scan_recompute_operand_difference --features cartesian-recoil -- --nocapture
cargo test -p sim replay_tick_79_current_publication_is_compared_only_after_geometry_matches --features cartesian-recoil -- --nocapture
cargo test -p sim replay_tick_79_drop_is_classified_before_or_inside_publication --features cartesian-recoil -- --nocapture
cargo test -p sim --no-run --features cartesian-recoil
cargo test -p sim --no-run
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Record the exact frozen operands, the first unequal stage/region/axis or refusal, and
every red/restored mutation in this plan and the durable contact research document.
Then revert all diagnostic helpers unless a tiny cfg(test) fixture is independently
worth retaining. Smart90 ends there. Only a later pre-code plan, written from that
exact first cause, may authorize a production correction. No registered pin
measurement/update, wasm digest, full mechanics audit, Smart41 7,560-case corpus,
policy change, damage selection, or tolerance/bounds change belongs to this session.

## Completed diagnosis

The single compatibility scan member is the fighter's right weapon against the
brute's Legs body region at mapped time `902`. Its frozen exact motor inputs are:

```text
weapon hilt start [704359,9233,58982] delta [135,2569,0]
weapon tip  start [835023,-1099,58982] delta [495,9421,0]
weapon radius     2621
Legs lower        [827064,13107,91750]
Legs upper        [814776,13107,58982]
Legs radius       9830
combined radius   12451
```

At `902`, exact closest-point quotients are
`A=[813803,693,58982]` and `B=[814776,13107,58982]`. The exact distance/radius
comparison is `Greater` at every integer time `900..904` and first becomes `Less`
at `905` (remaining `Less` through `910`). Thus the compatibility scan's `902`
member is not an exact contact at the group boundary; `exact_contact_at_pose`
correctly returns `None`, leaving zero drivers. Smart89's owner-frame and candidate
publication code is never reached. The defect is the scan-to-group membership/time
contract, not equipment-only frame grammar, point/normal publication, the lifted
solver, or a tolerance. Smart90's focused tests and mutations must be green before
Smart91 chooses between exact certification of mapped membership and a bounded retry
to the earliest exact contact. No behavior, pin measurement, or corpus ran.
