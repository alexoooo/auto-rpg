# Session 22 -- build the dormant carrier and collision runtime

## Status -- complete (2026-08-30)

The body-less carrier, standable-world registry, symmetric footprint resolver, bounded root/rise
actuators, collision filtering and resource census landed dormant and green in `9698eab`. Session 23
activates that same runtime rather than replacing it.

## Outcome

Build and physically test the assisted carrier, world query, passive-contact policy and lifecycle
behind an internal test-only enable. Every Setup-selectable body retains old behaviour. Session 23
can therefore activate one already-proven atomic system rather than landing an invulnerable half.

## Implement

1. Add the runtime half of `SupportedLocomotion` in `src/supported-locomotion.ts`. Its dormant
   enable is an immutable constructor/fixture input owned by the pair host, never a mutable global,
   URL flag or hidden Setup branch; a Setup-built body cannot turn it on before Session 23. Use
   non-body casts/sweeps against the authoritative standable-world collider registry, explicitly
   excluding every body in the owner's articulation. Opponent clearance comes only from pure pair
   footprints. Do not instantiate `PhysicsCharacterController`, a proxy shape, or a query that can
   hit its owner's torso.

2. Add a `LocomotionFootprint` with measured radius, height, step height and maximum slope. Derive
   it from bind geometry/profile provenance and keep it separate from `BodyView.collisionRadius`,
   which remains combat/perception/learning data. The carrier acceleration-limits horizontal
   speed/yaw, keeps world-up and uses allowed rather than requested displacement.

   Implement the physical `StandableSupportEvidence` provider from Session 21 against the
   authoritative registry. Freeze 0.18 m step height, 35 degree maximum standable slope and the
   50 degree refusal fixture here; wall/opponent/weapon/debris and stale-contact mutations must
   fail before the carrier runtime can be enabled.

3. Add dormant supported-root adapters around a **virtual, non-body carrier**. Fighter's pelvis is
   currently ANIMATED at `src/fighter.ts#L911`; Session 23 converts it to DYNAMIC under assist.
   Construct bodies are already DYNAMIC at `src/construct/compile.ts#L385`. A bounded, mass-scaled
   root motor pulls the topology-derived physical root toward the virtual carrier with capped force,
   acceleration and error; it never writes a limb transform and never creates infinite mass combat
   anatomy. Fallen/released bodies disable the motor without changing transforms or velocities.

4. Extend `src/physics.ts#L70` with explicit supported-passive and fist-trigger leaves. Pin the
   complete symmetric table in a test: supported passive trunk/arm/leg collides with WORLD,
   same-owner exceptions exactly as today, opposing SWORD/SHIELD/ARROW and DEBRIS, but not opposing
   supported passive anatomy or any navigation carrier; unsupported anatomy retains the current
   table. SWORD/SHIELD/ARROW keep their current opposing-body/world relationships. A dedicated
   non-solving `LEFT_FIST_TRIGGER`/`RIGHT_FIST_TRIGGER`, rigidly following the real hand and using
   its measured velocity/contact point, is the only new combat sensor; it collides only with
   opposing damageable anatomy and routes through ordinary `Combat` scoring. This is required
   because `FistStrike` currently uses the ARM-layer hand body and an ARM filter would otherwise
   delete punching. Havok compound filtering lives on leaves: write and read every leaf, not only
   its container.

   The virtual carrier has no membership, collide mask, `PhysicsBody` or trigger. World clearance
   is a query; opponent clearance is the pure pair-footprint resolver. No navigation proxy is ever
   materialized merely so a cast can find it.

5. Pair resolution is symmetric. Given both requested displacements and footprints, project both
   allowed moves from one unordered calculation. Braced/support capacity determines resistance,
   but neither side is an immovable kinematic pusher. Wall/other-carrier ordering is fixed and
   mirrored inputs produce mirrored outputs.

6. Own every query shape, virtual-carrier record, observer, root motor, trigger and transition
   transactionally. Virtual navigation state is absent from `Combat.owns`, `limbFor`,
   `damageTargetFor`, `parriedBy`, line of sight and projectile ownership. Fatality, topology
   release, stop and dispose clear it without waiting for another step.

   Add explicit created/disposed IDs for every query, root motor, fist trigger and observer to the
   existing resource census. Acceptance compares those owned IDs; it does not infer liveness from
   private Havok maps.

7. Implement Session 21's rising state as a dormant actuator now that its primitives exist. Sweep
   the complete footprint from fallen root pose to a yaw-preserving upright target. If clear, start
   the virtual carrier at the live root transform and follow the frozen 0.45 s acceleration-limited
   Hermite path while the bounded root motor and real limb motors write brace. Anatomy remains
   DYNAMIC throughout. Enter supported only after composite posture/contact dwell. A hit, lost
   support or new obstruction aborts at the next safe boundary, disables the motor at the exact
   current transform/velocity and clears staged drive.

## Tests watched failing

- `a_test_enabled_carrier_moves_at_zero_and_pi_without_roll_or_vertical_drift`
- `pair_resolution_is_symmetric_under_side_order_and_mirror`
- `two_carriers_stop_at_their_footprints_without_penetration_or_launch`
- `a_carrier_cannot_bulldoze_a_braced_opponent_through_a_wall`
- `the_world_query_excludes_every_owner_part_and_still_finds_standable_world`
- `pair_resolution_finds_the_opponent_footprint_without_query_geometry`
- `the_virtual_carrier_has_no_body_and_never_blocks_scores_parries_or_occludes`
- `supported_passive_parts_do_not_entangle_but_real_sword_shield_arrow_and_fist_hits_still_score`
- `the_supported_collision_table_is_exact_for_both_sides_every_membership_and_every_leaf`
- `held_weapon_pressure_against_a_wall_cannot_receive_an_unbounded_kinematic_launch`
- `compound_leaf_masks_not_container_masks_own_the_collision_rule`
- `posture_or_topology_release_is_continuous_and_Dynamic_on_the_next_safe_boundary`
- `rising_is_swept_acceleration_limited_and_continuous_at_start_finish_and_abort`
- `rising_cannot_snap_cross_a_wall_or_opponent_or_use_stale_wall_contact_as_support`
- `twenty_build_release_dispose_cycles_return_every_runtime_resource_to_baseline`

Required mutations: one-sided separation, a materialized proxy in a weapon mask, query that ignores
only the root, container-only mask writes, deleted fist trigger, an ANIMATED physical root,
unbounded root-motor force, instant recovery snap, Setup-accessible test enable and omitted census
disposal. Each physical/census test must fail independently.

## Accept

The dormant runtime must not move the page or null control.

```powershell
node --test tests/supported-locomotion-runtime.test.mjs tests/physics.test.mjs tests/unarmed.test.mjs tests/arrow.test.mjs tests/integration.test.mjs tests/construct-runtime.test.mjs
npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823
npm run construct:qualify -- --out <fresh-directory> --workers 8 --expect rejected
npm test
npm run check
npm run build
```
