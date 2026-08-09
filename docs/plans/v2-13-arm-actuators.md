# v2-13 — integrate body yaw, two arms, and a body-facing shield

**Status:** complete

**Goal:** connect persistent articulated pose to `World::step` under bounded
physical actuation, while explicitly skipping every contact and damage phase.

**Depends on:** complete `v2-11`, including its post-`v2-12` equipment validation,
and complete `v2-12`.

**Golden expectation:** all six legacy hashes remain byte-identical. Articulated
digests are compared structurally and through replay but are not pinned.

Read [Determinism](../reference/determinism.md#contract),
[Combat specs](../reference/combat-specs.md), and
[Articulated actuators](../reference/articulated-actuators.md) before editing.

## 1. Record the actuator evidence

Create `docs/performance/v2-actuator-sweep.md` before adding constants to Rust.
Record the exact constants already frozen in the actuator reference, the Fighter
and Brute fixture specs, and tick traces for:

```text
stationary yaw 0 -> quarter turn
stationary yaw 0 -> exact half turn
Fighter left arm MID -> HIGH at effort 1
Fighter sword arm tucked -> full reach at effort 1
Brute club right arm tucked -> full reach at effort 1
Fighter shield MID -> HIGH at effort 1
```

Each trace records tick, target error, speed, acceleration, fatigue, and raw
residue until settled. This is deterministic evidence, not a wall-clock
benchmark. The acceptance thresholds are: yaw takes more than 1 and no more
than 40 ticks to quarter turn; MID-to-HIGH and tuck-to-full each take more than
1 and no more than 90 ticks; all speeds stay within the reference constants;
Club fatigue after 120 driven ticks exceeds Sword fatigue under equal stats and
commands. If the frozen formulas miss a threshold, amend the plan and reference
before source implementation rather than silently tuning code.

Use `Scenario::articulated_duel()` (name `articulated-duel-v1`) and seed `1`.
Unless a row below says otherwise, submit `Intent::Hold`, zero movement,
`Keep/Keep`, effort zero on the axis not under test, and hold every other target
at its current scalar. Yaw traces use Fighter slot zero. Arm traces use Fighter
left/shield for MID-to-HIGH, Fighter right/Sword and Brute right/Club for
tuck-to-full, and the named limb for the shield row. Record raw integer columns:

```text
yaw: tick, target, entry angle, entry error, desired speed, acceleration cap,
     final speed, step, final angle, authority residue
arm: tick, limb, target bearing/height/reach, three entry errors, three entry
     speeds, three acceleration caps, three final speeds, three steps,
     fatigue, work residue, previous hand xyz, hand xyz, velocity xyz
```

The equal-stats fatigue comparison uses two test-only articulated worlds with
Fighter anatomy and Fighter base stats. One carries only Sword right and the
other only Club right; their legacy loadout rows match that item. For ticks
`0..120`, effort is one and the right target alternates every 20 ticks between
`(bearing=0,height=MID,reach=1/4)` and
`(bearing=HALF,height=HIGH,reach=1)`, starting with the latter. Movement is zero,
yaw is zero, and the left arm is empty. This exact schedule, not shipped
Fighter-vs-Brute stat differences, proves the Club inequality.

## 2. Allocate, initialize, reuse, and hash state

Add the exact structs and parallel columns from
[Persistent state](../reference/articulated-actuators.md#persistent-state) to the
combat module and `World`. This is dynamic slot-keyed storage, not a new sim body
cap. Extend `World::new`, `spawn`, slot reuse, and all test-only mutators so every
column has exactly `alive.len()` rows and reused rows are fully reset.

That length invariant is model-specific: every new v2-13 pose/authority Vec is
empty in a Legacy world, and every Articulated path keeps it exactly aligned with
`alive`. Every legacy path branch-guards access.

Initialization is the reference's faction-facing-yaw/tucked-arm rule. Body yaw
copies the already initialized `facing` (zero for the Fighter fixture and a half
turn for the Brute), while arm bearing starts at raw zero. Derive both initial
hands and the shield only after anatomy/equipment IDs have resolved. An invalid
articulated scenario must have been rejected by construction; no actuator path
falls back to a global or body default.

Add `hash_articulated_into` in the exact order under
[Hash and replay order](../reference/articulated-actuators.md#hash-and-replay-order).
Keep `World::state_hash()`'s LegacyV1 writer byte-for-byte untouched and guarded
to legacy worlds.

Tests:

```text
articulated_columns_follow_every_allocated_and_reused_slot
articulated_spawn_initializes_yaw_arms_grips_and_shield_exactly
legacy_worlds_do_not_allocate_or_hash_articulated_pose
every_actuator_field_changes_only_the_articulated_hash_domain
move_turn_and_arm_impairment_factors_are_one_and_already_hashed
articulated_mutation_apis_preserve_immutable_construction
```

The field-coverage test mutates one field at a time, including each coordinate,
previous pose, velocity, fatigue, residue, grip option, shield dimension, and
neutral authority factor, including `move_authority`.
The mutation-API test proves `set_body` and `set_loadout` are false and
nonmutating in Articulated, while `set_stats` is accepted and changes the next
tick's actuator caps without changing anatomy, equipment, or grips.

## 3. Integrate body yaw

Implement the raw yaw algorithm and constants in
[Yaw integration](../reference/articulated-actuators.md#yaw-integration). Do not
convert through degrees, radians, `f32`, or `atan2`. The exact half-turn already
appears as `Angle::delta == -32768`; do not add an equality special case that
reverses it.

Tests:

```text
a_stationary_body_turns_toward_its_requested_yaw
body_yaw_obeys_acceleration_speed_and_half_turn_tie
body_yaw_snaps_without_overshoot_or_residual_speed
translation_and_turning_do_not_share_effort
move_authority_scales_acceleration_without_changing_requested_velocity
```

Include the two raw tick vectors from the reference verbatim.
The articulated movement branch reads submitted `move_dir`, retains the existing
`action_of(i).spec().move_bonus` desired-speed term and feet-facing update, and
multiplies only the traction cap by `move_authority`. Legacy reads neither new
input nor factor.

## 4. Integrate arms and grips

Implement desired-hand derivation, scalar chase, power/agility/inertia factors,
fatigue, and work residue exactly as specified under
[Arm target and integration](../reference/articulated-actuators.md#arm-target-and-integration).
Use the reference's fully parenthesized left-to-right `Fx` operation order,
entry-to-final stored speed deltas, `i64` raw work accumulation, and tick-entry
idle recovery predicate literally; algebraically equivalent regrouping is not
byte-equivalent.
Apply both grip requests atomically before either arm advances. `Both` equipment
receives one target: the right-arm target is authoritative and the left target
is ignored only after validation of the resulting current-plus-request grip pair
has proved both arms hold the same `Both` item;
the left hand mirrors the right hand across the body's forward axis at shoulder
width. This convention must remain aligned with
`docs/reference/articulated-command-v1.md` in the same edit.

Store `hand`, `previous_hand`, actuator target hand, and `ShieldPose.centre`
relative to the authoritative body origin, with components oriented in world
axes. `linear_velocity` is the per-tick difference of those relative hand points
and therefore excludes body translation. Do not add planar `pos` in V13; V14
owns conversion to absolute collider points and the addition of authoritative
body translation velocity. Keep this wording aligned with the V16 ABI's
body-relative hand-position contract.

Tests:

```text
both_arms_chase_targets_independently
an_intermediate_height_uses_the_same_actuator
changing_height_and_reach_takes_more_than_one_tick
requested_effort_scales_torque_and_not_position
a_heavy_weapon_fatigues_its_arm_sooner
grip_requests_apply_atomically_or_not_at_all
grip_transactions_validate_the_resulting_current_pair
a_two_handed_grip_cannot_bind_a_shield
a_two_handed_target_mirrors_the_off_hand
```

The independent-arm test uses empty hands; the two-handed test is separate so
the ignored-left-target rule cannot masquerade as failed independence.
The resulting-pair test executes every row of the reference truth table,
including held-Both `Keep/Keep`, one-arm release rejection, and `Release/Release`.
Because construction rejects a `Both` item beside any second item, those are the
only transitions reachable from held `Both` in a valid V1 world. Prove the
one-occupied rows separately with the single-hand fixtures. Submission validates against authoritative grips at tick
entry; it never chains an earlier pending request from the same tick.

## 5. Derive the shield and split the phase schedule

Derive `ShieldPose` after arm integration from the immutable shield dimensions.
Its normal is body yaw only, never arm bearing. Implement the explicit pair of
phase schedules under
[Articulated phase schedule](../reference/articulated-actuators.md#articulated-phase-schedule).
The articulated branch must not call `regenerate`, `drive_limbs`,
`resolve_parries`, `resolve_swings`, `apply_recoil`, `resolve_shots`, or the
legacy-HP `reap_dead`. Leave the legacy call order and all legacy function bodies
untouched.

Tests:

```text
a_shield_normal_follows_body_yaw_and_cannot_orbit
a_right_bound_shield_is_found_past_an_empty_or_nonshield_left_grip
changing_shield_height_takes_more_than_one_tick
articulated_actuation_cannot_create_healing_damage_death_recoil_or_shots
legacy_commands_still_derive_facing_from_movement_and_cannot_turn_in_place
the_legacy_phase_trace_is_unchanged
```

`the_legacy_phase_trace_is_unchanged` uses a test-only phase recorder around the
existing `Scenario::duel` and asserts the exact legacy sequence from the
reference; the recorder is absent from release state and hashing.

## 6. Replay every pose

Record only the accepted final articulated command. Rejection diagnostics remain
runtime host metadata and are not added to `Replay` or its codec. Extend playback
to call the model-correct submission method and compare the full pose after every
tick, including prior/current hands, velocities, fatigue, residues, grips,
shield option, and authority factors.

Every `Stored` result is appended in insertion order, including equal ticks.
Playback submits all equal-tick rows in that order before stepping. Later rows
overwrite the pending command, but every grip validation sees the same current
authoritative grip state because grips change only during `step`; same-tick
requests do not chain. The final pending safe command wins.

Tests:

```text
articulated_replays_reproduce_every_pose
rejected_commands_record_only_the_final_safe_command
equal_tick_submissions_replay_in_insertion_order_without_chaining_grips
```

The first test intentionally changes yaw, both independent arm targets, effort,
height, reach, and a legal grip transaction over at least 180 ticks. It compares
`StateDigest` and a `cfg(test)` crate-private copied pose view on each intermediate
tick. That view contains yaw, both arms, both grips, shield option, and all
authority factors; it is absent from release builds and no production view API
or second byte grammar is added.

Appending pose fields intentionally moves the existing paired articulated
command-probe digest in the Rust web test and `tools/wasm_check.js`. Re-record
those two mirrors from the same accepted fixture only after native/wasm equality
passes. This cross-target probe is not `ARTICULATED_HASH`; the v2-17 mechanical
gate remains the sole owner of that later canonical pin.

## Verification

```powershell
cargo test -p sim
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Pass means the actuator sweep meets its stated tick thresholds, all pose fields
round-trip through replay and ArticulatedV1 hashing, the articulated schedule can
produce no damage, and every legacy hash remains unchanged. Do not record
`ARTICULATED_HASH`; `v2-17` owns that one pin.
