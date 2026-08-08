# v2-13 — integrate body yaw, two arms, and a body-facing shield

**Goal:** connect persistent articulated pose to `World::step` under bounded physical
actuation, without contact or damage.

**Depends on:** `v2-11` and `v2-12`.

**Golden expectation:** legacy hashes remain byte-identical; no articulated pin yet.

## State and phase

At the explicit phase schedule in `World::step` in `crates/sim/src/world.rs`, branch
only on `CombatModel`: legacy executes the untouched schedule; articulated adds body
yaw after planar locomotion and arm/shield actuation before geometry. Add fixed-capacity
state keyed by entity slot:

```rust
pub struct BodyYawState { pub angle: Angle, pub speed_turns: Fx, pub residue: Fx }
pub struct ArmState { /* hand pose, linear/angular velocity, fatigue, residues */ }
pub struct ShieldPose { /* center, normal, half extents */ }
```

`BodyYawState` chases the command yaw with maximum speed 1/120 turn per tick and
acceleration 1/720 turn per tick squared. Exact-half-turn chooses clockwise. No
translation is required to turn. The values are first-slice controls, recorded with
the actuator sweep in `docs/performance/v2-actuator-sweep.md`; change them only with
that sweep and the named tests.

Each `[ArmState; 2]` chases `ArmTarget` through joint limits using equipment mass,
balance, body power/agility, and requested effort. Effort scales torque, not position.
Fatigue accumulates from positive actuator work and reduces available torque; it does
not change mass. Previous and current poses are retained for later sweeps.

A shield-bound arm consumes height/reach/effort. Shield normal is body yaw plus a
reserved zero offset; independent shield orbit is rejected in V1. Low-to-high travel
takes multiple ticks. Two-handed bindings reserve both arms and cannot coexist with a
shield.

Stagger and leg-impairment factors are `1` until `v2-15`; their fields already enter
ArticulatedV1 hashing so activating them later does not change layout.

## Replay and hash coverage

Articulated replays reproduce every pose. `BodyYawState`, both arms, grip state,
fatigue, prior/current geometry, and actuator residues implement
`hash_articulated_into`. Legacy hashing never reads them. Do not pin the resulting
digest.

## Tests and verification

```text
a_stationary_body_turns_toward_its_requested_yaw
body_yaw_obeys_acceleration_speed_and_half_turn_tie
both_arms_chase_targets_independently
a_shield_normal_follows_body_yaw_and_cannot_orbit
changing_shield_height_takes_more_than_one_tick
an_intermediate_height_uses_the_same_actuator
a_heavy_weapon_fatigues_its_arm_sooner
a_two_handed_grip_cannot_bind_a_shield
articulated_replays_reproduce_every_pose
every_actuator_field_changes_only_the_articulated_hash_domain
```

```powershell
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```
