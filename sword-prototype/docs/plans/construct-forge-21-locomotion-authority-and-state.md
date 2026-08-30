# Session 21 -- add dormant locomotion authority, support and state

## Status -- complete (2026-08-30)

Scoped carrier authority, fresh physical-support evidence, authored-shove stability, deterministic
fall/rise transitions and their mutation proofs landed green in `82f16e8`. The production activation
continues to use these frozen state-machine constants unchanged.
The dormant session's pure bracket was not the real-Havok evidence its implementation paragraph
promised. That later physical debt is now closed by
`tests/supported-locomotion-stability-physical.test.mjs`: live supported body mass, both fresh foot
terminals and valid posture bracket 0.006 and 0.014 m/s below/at, and exact fall releases the real
pelvis from ANIMATED to DYNAMIC.

## Outcome

Add the complete scoped command, support, stability and recovery semantics while keeping carrier
motion disabled for every selectable body. This session makes later activation safe: stale drive,
fake foot contact, solver-impulse knockdown and automatic idle recovery are already impossible
before a carrier can move.

## Implement

1. Extend `ControllerContext` at `src/construct/scheduler.ts#L55` with a dedicated
   `LocomotionWriter`; do not widen `EffectWriter` at `#L93` or turn `ActionEffect` at `#L38` into a
   body-control escape hatch. The writer is constructed from the admitted action/group, derives
   its carrier/support identity internally and validates finite normalized inputs. Arbitration is
   **one winning request per carrier per boundary**, not one per group: full/left-limp/right-limp
   groups can resolve to the same carrier. Every locomotion Action claims the shared
   `resource:balance`; simultaneous requests are refused with both action/group IDs. A controller
   cannot supply a part ID.

2. In new `src/construct/assisted-locomotion.ts`, implement
   `resolveSupportCarrier(blueprint, group)`. It returns the carrier plus the exact critical
   joint/module/attachment IDs rather than claiming a static blueprint can prove live connectivity.
   Each ordered support binding must be a continuous
   joint chain; its contact module must belong to the terminal attached part; all first joints must
   share one carrier parent; and the carrier-to-blueprint-root path must remain connected. Derive
   from topology, never `ConstructProfile.footPartIds`, blueprint ID or names. Mixed parents and
   two supported groups resolving to different carriers are named refusals. After every
   `LiveConstructState` reconciliation, a live resolver validates every returned ID; losing any
   carrier-to-root or support-chain edge revokes authority at the next safe boundary.

3. In `src/construct/control.ts`, latch `begin-clear -> scheduler -> commit` exactly once. Action
   withdrawal, claim conflict, controller exception, capability loss, handover, verdict,
   `stopFighting` and disposal clear immediately even when no later driver step occurs. Add an
   after-step hook; `recordStop` must clear motion as well as record scheduler cancellation.

4. Add dormant adapters to `Fighter` and `Construct` through the optional locomotion port on
   `Combatant` at `src/units.ts#L59`. Fighter support comes from live hip/knee attachment paths,
   not merely nonzero leg health; its current `steer` at `src/fighter.ts#L1841` still commits the
   old velocity until Session 23. Construct support comes from live group bindings after
   `LiveConstructState` reconciliation. Losing a hand or weapon does not affect walking.

   Define a provider-driven `StandableSupportEvidence` input containing safe-boundary sequence,
   support binding, contacted owner/category, point, upward normal and freshness. The pure state
   machine accepts only current evidence categorized `standable-world`; opponent, wall, weapon,
   proxy, detached-part and debris categories never count. Session 21 tests this with fakes. Session
   22 owns physical classification, the authoritative registry, slope bound and query.

5. Add the pure shared state machine in `src/supported-locomotion.ts`:

   ```ts
   type SupportState = "supported" | "staggered" | "fallen" | "rising";
   ```

   Queue the deliberate shove computed around `src/combat.ts#L416` in a separate stability event
   and reconcile it on the next safe pre-physics edge; do not widen every `HitReport` constructor.
   Never derive stability from `solverImpulse`. Freeze these v1 starting constants in one exported
   table and bracket them physically in both directions before Session 21 lands:

   ```ts
   STABILITY_DECAY_MPS_PER_S = 0.020
   STAGGER_SPECIFIC_IMPULSE_MPS = 0.006
   FALL_SPECIFIC_IMPULSE_MPS = 0.014
   BRACE_CAPACITY_MULTIPLIER = 1.50
   FALLEN_DWELL_S = 0.35
   SUPPORT_GRACE_S = 0.10
   RISING_DURATION_S = 0.45
   ```

   Horizontal authored shove magnitude divided by live supported mass is the accumulated specific
   impulse; decay is linear between events. Brace scales both thresholds. A controller descriptor
   supplies an explicit stability scale for degraded gaits; it is never inferred from group size.
   Contact callbacks only queue events and never change motion type.

   Posture is adapter-specific because v1 has no hidden torso/head roles. Fighter uses its known
   pelvis-up, torso height and head-above-torso anatomy. A Construct locomotion controller declares
   an ordered `balance-chain` binding; its carrier, blueprint root and topology-derived terminal
   provide up/height/order without part names. A non-humanoid controller may declare its own
   topology-derived posture adapter. Missing or discontinuous posture bindings refuse support.

   Keep the four-field `LocomotionRequest` public command unchanged. Beside it, derive an
   engine-owned, non-persisted `LocomotionAuthority` from the registered controller descriptor and
   admitted Action: carrier ID, exact live bindings, brace-capacity multiplier and gait stability
   scale. The Mind/controller cannot write that envelope, and runtime never recognizes brace or
   limp by controller name.

6. Freeze recovery input. Fighters request rising with nonzero forward/strafe/turn after the
   fallen dwell; the humanoid hand tactic named `recover` remains unrelated. Constructs use only
   their saved locomotion `recover` Action. Both feed one occupancy/support/hit-interrupt gate and
   neither rises while idle.

7. Land only pure rising eligibility and state transitions here. After dwell, eligibility requires
   the authority envelope, a live support chain and fresh standable contact; hit, lost support,
   occupancy refusal or request withdrawal returns to `fallen` and clears staged drive. The swept
   trajectory/root-motor actuator belongs to Session 22, after its footprint, query and motor exist.

## Tests watched failing

Add `tests/supported-locomotion-state.test.mjs` and
`tests/construct-assisted-locomotion.test.mjs`:

- `support_bindings_derive_one_carrier_from_topology_not_part_names`
- `mixed_parents_discontinuous_chains_and_detached_contact_modules_are_refused`
- `a_controller_cannot_name_a_carrier_or_support_outside_its_group`
- `one_carrier_accepts_at_most_one_balance_claim_even_across_full_and_limp_groups`
- `withdrawal_conflict_failure_capability_loss_handover_verdict_and_dispose_each_clear_drive`
- `a_required_support_lost_mid_stride_cancels_on_the_next_safe_boundary`
- `a_detached_grounded_foot_cannot_authorize_locomotion`
- `wall_opponent_weapon_debris_and_stale_contacts_are_not_standable_ground`
- `every_critical_carrier_root_and_support_joint_is_live_gated`
- `renamed_parts_preserve_support_while_tiny_support_spam_cannot_raise_the_action_cap`
- `unrelated_hand_or_weapon_loss_does_not_cancel_walking`
- `authored_shove_not_solver_impulse_drives_supported_staggered_and_fallen`
- `an_upright_carrier_with_folded_torso_or_inverted_head_is_not_supported`
- `Fighter_movement_input_and_Construct_recover_Action_share_recovery_gates_without_aliasing_hand_recover`
- `rising_eligibility_requires_live_authority_standable_support_dwell_and_clearance`
- `a_hit_obstruction_or_lost_support_aborts_rising_state_and_leaves_no_staged_drive`
- `stagger_fall_brace_decay_and_cumulative_shoves_cross_each_frozen_threshold_in_both_directions`

Independently mutate every terminal clear, hard-code `pelvis`, trust stale contact, use
`solverImpulse`, drop posture binding, accept wall contact, let a request forge its authority,
remove `resource:balance`, and let idle bodies enter rising. Each must go red.

## Accept

No selectable motion changes. Existing saved digests and `duelist-swinger` values remain exact.

```powershell
node --test tests/supported-locomotion-state.test.mjs tests/supported-locomotion-stability-physical.test.mjs tests/construct-assisted-locomotion.test.mjs tests/construct-scheduler.test.mjs tests/death.test.mjs tests/handover.test.mjs
npm run construct:qualify -- --out <fresh-directory> --workers 8 --expect rejected
npm test
npm run check
npm run build
```
