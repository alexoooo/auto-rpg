# Arena response 02 -- the body stops the blade

**Status:** implementation in progress, exact-law gate red; paused at the
[2026-08-21 handoff](arena-response-99-handoff.md).
**Blocks:** session 03.

## Outcome

Add an authoritative deterministic anatomical constraint so a controlled arm, shield or
held weapon cannot sweep through its owner's head, torso, opposite arm or opposite held
item. This is the repair for the demonstrated circular-mouse sword-through-body failure.
The existing 135-degree target envelope stays as an early projection; it is not counted as
self-collision and is not weakened.

## Current seams

The current arm phase is
[`World::drive_arms`](../../crates/sim/src/world/articulated.rs#L493); its next geometry
owner is [`derive_geometry`](../../crates/sim/src/world/articulated.rs#L579), and the public
tick enters at [`World::step`](../../crates/sim/src/world/mod.rs#L1657). The existing
[`rear_limited_bearing`](../../crates/sim/src/combat/limb.rs#L183) is an input projection,
not collision evidence. Constrain each owner's proposed pair inside the existing arms
phase, before that owner commits achieved geometry, and leave the hostile scanner's
same-owner exclusion intact.

## Phase and geometry

Keep the hostile contact scanner's same-entity/same-faction exclusion. Self-contact is a
separate law inside the arms phase, after both arms of one owner have been proposed and
before that owner's achieved pair is committed. Owners do not self-constrain one another,
so this per-owner ordering is equivalent to a global pass and needs no per-tick `World`
collection. It still finishes before `derive_geometry` and hostile contact construction.

For each live embodied owner, snapshot both arm states after stance/body settlement and
before arm integration. Normalize the pre-arm geometry into that settled body frame, so
translation, torso settlement or a zero-rate turn is not counted as arm actuation. Produce
both arms without billing them, then forward-derive the proposed upper arm, forearm,
shield and held segment in the same frame. Obstacles are the owner's head, non-socket
torso, legs, opposite arm and opposite held item. Exclude only semantic neighbours that
share a shoulder, elbow, hand or hilt, absent/severed regions, and the duplicate off hand
of one two-handed item.

The shoulder socket exclusion is exact: ignore upper-arm/torso contact only when the
closest point on the upper segment is within one upper-arm radius of that arm's shoulder
endpoint. Compare squared raw coordinates rather than rounded fixed-point squared
distance so the radius boundary is included and one raw unit beyond it is not. It is not
an epsilon around the whole torso.

The authoritative within-tick path is linear motion of every collider endpoint from the
settled pre-arm pose to the proposed achieved pose. It is deliberately the same endpoint
path the existing fixed-point hostile sweeps solve, not a sampled arc reconstructed from
joint angles. Moving/moving pairs use relative endpoint motion at the same fixed-point
fraction.

Extend the existing conservative sweep result narrowly with `last_clear`, `first_hit` and
`exhausted`. Its maximum relative endpoint displacement is the distance Lipschitz bound,
so an advance cannot skip an earlier collision. Select the earliest result in stable
`(fraction, entity slot, moving limb, moving shape, obstacle kind, obstacle region)` order.
For an observed overlap, run exactly sixteen bisection steps inside that proven
clear/overlap bracket. A bisection over `[0, time_of_impact]` is forbidden because overlap
over a whole sweep is not a monotone predicate. If the fixed conservative-advance budget
is exhausted, treat the pair as a conservative hit and clamp at `last_clear`; do not
invent an overlapping endpoint for bisection.

Shipped tucked poses contain legacy structural arm/body intersections. A pair overlapping
at the settled entry pose is ignored only until its continuous endpoint path first becomes
strictly clear; a later clear-to-hit re-entry in the same tick is constrained normally. A
pair that never clears remains the structural baseline for that tick. This is a path rule,
not a pair-kind exemption: a clear pose is protected on the next tick naturally.

Commit every participant in a moving/moving pair at the same last-clear fraction. Stop
the three joint actuator speeds of each participating arm at its achieved pose;
`bearing_speed_turns`, `height_speed` and `reach_speed` are the next-tick motor state, so a
Cartesian normal projection into derived `linear_velocity` would not stop the motor that
caused the contact. Nonparticipants retain their speeds. Forward-derive geometry and
rescan. Run exactly eight passes. If a nonstructural overlap remains, restore the involved
arms to their pre-arm states on the settled body for that tick.

Arm integration returns an unbilled proposal plus the inertia, effort, grip and work data
needed to bill it. Interpolate the achieved actuator state, including shortest-way angles
and elbow plane, then bill only the achieved joint-speed and centre-of-mass velocity
change. Do not call `inverse_hand` and assume its inexact round trip preserved a clear
forearm. In the exact-law build, `ArmState::hand` and retained physical COM velocity are
authoritative and may differ from the scalar forward pose: interpolate and canonicalize
those achieved values rather than overwriting them with `hand_position`. Fraction one
must reproduce today's exact proposal bit for bit; fraction zero bills no rejected work
and performs ordinary recovery only when the arm was idle at entry. A two-handed item has
one right-arm proposal, one shared achieved fraction and two half work accounts.

Contact response obeys the same two-link reachability law. The default projector brackets
the linear tick-entry-hand to requested-contact-hand path against both elbow radii and
prices only the last representable reachable point. The lifted exact solve retains its
registered contact feasibility law; after that solve, an anatomical joint reaction moves
the exact held position and momentum to the same reachable endpoint, records the signed
energy change under external reason `ANATOMICAL_CONSTRAINT = 64`, and rebases the owner.
It creates no damage, event, opponent-contact credit or contact-group energy. Final commit
must therefore be a no-op for both laws: it stores the endpoint and COM state already
priced by their respective authority and derives the elbow/forearm from them. An untouched
row remains byte-identical and is not inverse-mapped merely to check the constraint.

The constraint emits no combat event, damage, block, parry, contact energy or opponent
contact key. It allocates no per-tick collection and uses no float, tolerance loop, hash
iteration or host state.

## Construction and publication

Scenario construction and `World::try_spawn` refuse a nonstructural initial self-overlap
by name before mutating a world. Extract one pure initial-pose builder from
`initialize_pose`; construction validation, spawn validation, fingerprint validation and
the eventual commit all read that builder rather than reproducing tucked hands, grips or
shield pose. Add named initial-overlap variants to `WorldBuildError` and `SpawnError`
rather than disguising a posed loadout failure as a table-shape error. Shipped
Fighter/Brute loadouts pass because their structural arm/body entry intersections are the
release-law baseline; held/held, held/opposite-arm, shield/opposite-arm and
shield/opposite-held intersections are refused. Ordinary pose/region publication already has
the achieved arm and held geometry and `target_hand` already remains separate; no layout
is added. The desired target may remain on the far side of a constraint so the HUD shows
desired-versus-achieved error honestly.

## Files

| file | change |
|---|---|
| `crates/sim/src/world/self_collision.rs` | fixed workspace, pair ordering, sweep, iteration and fallback |
| `crates/fx/src/geom3.rs` | narrow clear/hit/exhausted bracket returned by existing conservative sweeps |
| `crates/sim/src/world/mod.rs` | arms-phase dispatch and named build/spawn refusal |
| `crates/sim/src/world/articulated.rs` | shared initial pose, unbilled pair proposal and constrained achieved-state commit |
| `crates/sim/src/combat/actuator.rs` | split unbilled proposal, exact achieved COM state and achieved-work billing |
| `crates/sim/src/combat/geometry.rs` | narrowly shared static and swept capsule/segment predicates |
| `crates/sim/src/combat/limb.rs` | forward arm/held geometry at an interpolated state |
| `crates/sim/src/combat/spec.rs` | pure initial-loadout clearance validation |
| `crates/sim/src/world/query.rs` | verify existing achieved and desired/achieved publication distinction |
| `crates/sim/tests/determinism.rs` | rerun, replay, reflection and exact-law coverage |
| `crates/lab/src/main.rs` | reached pin/corpus measurement only |
| `crates/web/src/lib.rs`, `tools/wasm_check.js` | paired mirrors for reached pins only |
| `docs/design/combat.md`, `docs/architecture/simulation.md` | normative phase and non-damage law |
| `docs/reference/hashes.md` | measured reached-pin provenance |

## Tests and mutations

- `a_held_sword_cannot_sweep_through_its_owners_torso`
- `an_arm_cannot_sweep_through_its_owners_head_or_torso`
- `opposite_arms_stop_at_contact_without_wounding_their_owner`
- `opposite_held_items_and_a_shield_cannot_cross_in_one_tick`
- `adjacent_shoulder_elbow_hand_and_hilt_pairs_are_not_self_contacts`
- `a_two_handed_item_is_constrained_once_by_its_driving_arm`
- `turning_and_translating_a_body_without_arm_actuation_cannot_self_hit`
- `socket_clearance_is_pinned_on_both_sides_of_one_upper_arm_radius`
- `an_entry_overlap_may_clear_but_cannot_clear_and_reenter`
- `multiple_self_contacts_converge_or_restore_in_exactly_eight_passes`
- `self_collision_selects_the_earliest_pair_in_canonical_order`
- `a_self_constraint_emits_no_event_damage_or_contact_energy`
- `self_collision_is_reflection_and_limb_swap_invariant`
- `a_constrained_circular_mouse_command_replays_without_crossing_the_owner`
- `contact_hand_projection_stops_at_both_joint_annulus_boundaries`
- `exact_contact_anatomical_projection_owns_the_hand_momentum_and_external_energy_row`

The last test pins both representable boundary poses and exact repeatability of the shared
projection helper. Replay coverage remains the real recorded-command route in
`a_constrained_circular_mouse_command_replays_without_crossing_the_owner`; the bounded
4,312-configuration search did not find one final-law world strike that was simultaneously
self-clear under both response laws and retained every old directional-projector premise,
so this session does not label two calls to a pure projection function as a replay.

Mutation-check removal of the held-segment scan, endpoint-only collision, reversed pair
order, replacement of the clear/hit bracket with `[0, time_of_impact]`, proposal-work
billing, exact-hand forward reconstruction, `inverse_hand` reconstruction and hostile
damage routing. Each named behavior must go red.

## Hash expectations and verification

Session 01's exact-feature audit (`cargo run --release -p lab --features
cartesian-recoil -- embodied --self-clearance-audit`) measured:

| registered pin fixture | first forbidden preconstraint crossing | session 02 expectation |
|---|---:|---|
| `EMBODIED_CORPUS_DIGEST` | tick 14, entity 1, upper-left/legs (`2/4`) | **moves** |
| `EMBODIED_GOLDEN_DIGEST` | tick 5, entity 0, right-held/legs (`8/4`) | **moves** |
| `ARTICULATED_COMMAND_HASH` | unreached in its unstepped command probe | **must not move** |
| `ARTICULATED_STREAM_DIGEST` | tick 5, entity 1, left-forearm/right-forearm (`5/6`) | **moves** |
| `EXACT_TRAJECTORY_STATE_DIGEST` | tick 7, entity 0, right-held/legs (`8/4`) | **moves** |
| `LIFTED_COULOMB_SOLVER_DIGEST` | tick 7, entity 0, right-held/legs (`8/4`) | **moves** |

Codes are the registered swept-volume order; the observer excludes the same-arm
shoulder/elbow/hilt adjacencies and the inclusive one-upper-arm-radius shoulder collar,
then records the production-selected pair before its sweep is clamped. The shared release
bracket ignores geometry that overlaps on entry until it first becomes strictly clear; a
same-tick re-entry after that release is a forbidden crossing. This removed every false
tick-1 entry-overlap report while exposing the later genuine crossings above. The mover
set did not change. No command/frame/publication layout, state-digest grammar, Scenario
fingerprint or trace schema may move. Re-record only the
fixtures proven to reach the new constraint, native first and wasm second. Run the full
gate in `AGENTS.md`, including both exact-law builds and both wasm artifacts.

The `LIFTED_COULOMB_SOLVER_DIGEST` fixture keeps its frozen offset, chamber/strike order,
reach grid and ordinary submitted-command provenance. The new constraint stops every one
of its eighteen former cross-body blows before opponent contact. Its dedicated receipt
therefore moves deliberately from `ARPG-LIFTED-COULOMB-V1` to V2: each case records the
terminal outcome bit/tick, command receipt, final state, external/anatomy/cap/refusal rows,
and contact mechanics only when a contact exists. Re-aiming the fixture to keep a contact
would test a different command and is forbidden. The broader state-digest grammar and every
public ABI remain unchanged.

The preconstraint diagnostic, rather than the clear achieved pose after clamping, proves
why: all eighteen cells first select entity 0's held segment against its own Legs at tick 7.
The ordinary right-arm cells clamp at raw fraction `16_151`; their mirrored left-arm cells
clamp at `7_425`. Strike and reach deltas do not begin until later, so the same pair/fraction
across each three-by-three half-grid is expected. A regular exact-feature test pins the full
grid, entity, limb, shape, region and fraction. The old opponent-contact-only receipt became
invalid because it treated absence of its former downstream contact as fixture failure,
discarding the authoritative self-constraint outcome that now terminates the path first.
