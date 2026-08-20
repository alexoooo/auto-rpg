# Combat control extensions 03 -- the body is solid

**Status:** future mechanics session. Depends on 02.

Rear projection prevents the clearest impossible target but does not stop a forearm,
opposite arm or held segment sweeping through its owner. This session adds a deterministic
anatomical constraint without pretending self-contact is an attack.

## Constraint phase

Do not remove the hostile scanner's same-entity/same-faction exclusion. Add a separate
phase after arm integration and before shield and hostile-contact geometry are derived.

Moving shapes are each upper arm, forearm and held segment. Obstacles are the owner's
non-socket head, torso and legs, the opposite arm, and the opposite held segment/shield.
Exclude structural neighbours sharing shoulder/elbow/hand/hilt, absent or severed regions,
and the duplicate representation of a two-handed item.

"Non-socket torso" is exact: upper-arm/torso contact is ignored only while the closest
point on the upper segment lies within one upper-arm radius of its shoulder endpoint.
Every other torso point is solid. Named adjacent pairs are exclusions by semantic joint,
not by a loose distance epsilon. Scenario construction evaluates the same exclusions and
refuses a nonstructural initial self-overlap by name before tick zero.

The sweep start is the pre-arm joint state re-derived on the **already settled current
body pose**, not last tick's world-space `previous_hand`; rigid body translation/turning is
therefore not mistaken for arm motion. The end is the arm driver's requested state in that
same body frame. Opposite moving shapes use a relative sweep with both arms evaluated at
the same fixed-point time.

For each pass, choose the earliest time of impact in stable order
`(time, entity slot, moving limb, moving shape, obstacle kind, obstacle region)`. Exact
time ties use that tuple. Interpolate the actuator state itself--angles by shortest turn,
scalar fields linearly--then forward-derive arm and held geometry; do not inverse a hand
position and assume elbow-plane state survived. Sixteen fixed bisection steps choose the
last nonpenetrating fraction. Clamp every arm participating in a moving/moving pair to the
same fraction, remove only blocked normal velocity, forward-reconstruct, and rescan.

Run at most `SELF_CONSTRAINT_PASSES = 8`. If revalidation still finds a nonstructural
overlap, restore both arms' pre-arm states on the settled body pose for that tick and
recompute geometry. Thus termination and failure behavior are deterministic and the
published pose is clear. Bill fatigue from achieved constrained motion, not the rejected
request.

The phase emits no combat event, damage, block/parry, contact energy or opponent contact
key. It uses fixed-point predicates, fixed iteration counts and stable arrays—no float,
epsilon loop, hash-map order or per-tick allocation.

The phase is scheduled from the same World owner that drives stance at
[`drive_stance`](../../crates/sim/src/world/articulated.rs#L44), but remains separate from
the hostile scanner in
[`contact_phase.rs`](../../crates/sim/src/world/contact_phase.rs#L1). The existing
same-owner exclusion stays intact; shared swept predicates may move only through the
narrow geometry file named below.

## Files

| file | change |
|---|---|
| `crates/sim/src/world/self_collision.rs` | new canonical swept anatomical constraint workspace |
| `crates/sim/src/world/mod.rs` | phase schedule between arm integration and hostile geometry |
| `crates/sim/src/world/articulated.rs` | constrained achieved-state commit and velocity |
| `crates/sim/src/combat/spec.rs` | named construction refusal for nonstructural initial overlap |
| `crates/sim/src/combat/geometry.rs` | narrowly shared swept capsule/segment predicates |
| `crates/sim/src/combat/limb.rs` | forward geometry from interpolated constrained arm state |
| `crates/sim/src/world/query.rs` | proof that ordinary pose/region publication suffices |
| `crates/sim/tests/determinism.rs` | replay, reflection and feature fixtures |
| `crates/lab/src/main.rs` | reached corpus/pin measurement |
| `crates/web/src/lib.rs`, `tools/wasm_check.js` | paired reached-pin mirrors only |
| `docs/design/combat.md` | self-constraint ordering and non-damage semantics |
| `docs/architecture/simulation.md` | new deterministic phase ownership |
| `docs/reference/hashes.md` | measured pin provenance |

## Tests

- `an_arm_cannot_sweep_through_its_owners_torso`
- `a_held_segment_cannot_sweep_through_its_owners_head_or_torso`
- `opposite_arms_stop_at_contact_without_wounding_their_owner`
- `opposite_held_segments_cannot_cross_in_one_tick`
- `adjacent_shoulder_elbow_hand_and_hilt_pairs_are_not_self_contacts`
- `a_two_handed_item_is_constrained_once_by_its_driving_arm`
- `a_translating_and_turning_body_with_zero_arm_actuation_cannot_self_hit`
- `a_nonstructural_initial_overlap_is_refused_before_tick_zero`
- `the_shipped_fighter_brute_and_loadouts_pass_initial_self_clearance`
- `socket_clearance_is_pinned_on_both_sides_of_one_upper_arm_radius`
- `multiple_contacts_converge_or_restore_the_pre_arm_state_in_eight_passes`
- `self_collision_selects_the_earliest_pair_in_canonical_order`
- `a_self_constraint_emits_no_combat_event_damage_or_contact_energy`
- `self_collision_is_reflection_and_limb_swap_invariant`
- `a_self_constrained_run_is_identical_on_rerun_and_exact_on_replay`

Mutation-check by omitting the new scan, reversing pair order, using endpoint overlap
instead of a sweep and routing the result through damage/events. Each corresponding test
must go red.

## Hash expectations

High-risk values-only mechanics move; no layout move is pre-authorized. Before editing,
trace all six relevant registry fixtures: `EMBODIED_CORPUS_DIGEST`,
`EMBODIED_GOLDEN_DIGEST`, `ARTICULATED_COMMAND_HASH`,
`EXACT_TRAJECTORY_STATE_DIGEST`, `LIFTED_COULOMB_SOLVER_DIGEST` and the independently
published `ARTICULATED_STREAM_DIGEST`. Corpus, golden and stream are probable movers;
command and both exact diagnostics remain unchanged only if their concrete fixtures do
not reach the constraint. Any reached exact move updates both wasm mirrors. Geometry/contact table hashes
remain unchanged if no primitive grammar or constant changes. A new stored self-contact
column or publication row is scope expansion requiring a separate ABI/hash session.

## Verification

Run the entire repository gate, both feature sets, exact diagnostics, corpus and replay
sweeps, and both rebuilt wasm artifacts. No browser production edit is expected; the
session-09 desired/achieved diagnostics expose the constrained result through existing
publications.
