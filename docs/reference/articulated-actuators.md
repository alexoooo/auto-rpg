# Articulated actuator contract

**Purpose:** Freeze initialization, integration, grip, shield, phase, and hashing rules for `v2-13`.
**Status:** current
**Canonical source:** This contract plus `crates/sim/src/combat/actuator.rs`, `crates/sim/src/world.rs`, and `crates/sim/src/replay.rs`.
**Update when:** An actuator constant, formula, phase order, initialization, or hashed field changes.

## Persistent state

Articulated state uses parallel `Vec` columns keyed by entity slot. In v2-13 native
`World::spawn` could grow without a sim-level limit. V2-14 deliberately supersedes
that statement with `MAX_ARTICULATED_ENTITIES=64` for Articulated worlds so retained
contact scratch has one checked bound; exact Legacy limits remain unchanged. Reused
slots are overwritten in full before becoming alive.

```rust
pub struct BodyYawState {
    pub angle: Angle,
    pub speed_turns: Fx,
    pub authority_residue: Fx,
}
pub struct ArmState {
    pub bearing: Angle,
    pub bearing_speed_turns: Fx,
    pub height: CombatHeight,
    pub height_speed: Fx,
    pub reach: Fx,
    pub reach_speed: Fx,
    pub previous_hand: Vec3,
    pub hand: Vec3,
    pub linear_velocity: Vec3,
    pub fatigue: Fx,
    pub work_residue: Fx,
}
pub struct GripState { pub equipment_slot: Option<u8> }
pub struct ShieldPose {
    pub centre: Vec3,
    pub normal: Vec3,
    pub half_width: Fx,
    pub half_height: Fx,
    pub thickness: Fx,
}
```

All five values derive `Clone`, `Copy`, `PartialEq`, `Eq`, and `Debug`; the
crate-private test view below can therefore copy a coherent slot without exposing
mutable authority.

The world holds `body_yaw: Vec<BodyYawState>`, `arms: Vec<[ArmState;2]>`,
`grips: Vec<[GripState;2]>`, and `shield_pose: Vec<Option<ShieldPose>>`.
Limb index `0` is left and `1` is right. It also holds three hashed neutral factors
per entity: `move_authority: Fx`, `turn_authority: Fx`, and
`arm_authority: [Fx;2]`, all initialized to one. `v2-15` may lower them without
adding a column or changing hash layout.

These new pose and authority columns are model-specific. In a Legacy world they
remain empty and no legacy path indexes them. In an Articulated world each has
exactly `alive.len()` rows after construction, growth, death, and reuse. The older
submitted-command and construction columns keep their existing v2-12 storage rule;
this paragraph governs only the v2-13 columns above.

At spawn, yaw angle is the already initialized legacy `facing`; speed and residue
are zero. Both arms start tucked at bearing zero, height `MID`, reach `1/4`, all
speeds/fatigue/residues zero. `previous_hand == hand` and `linear_velocity == 0`.
Initial grips follow immutable bindings: the Fighter has shield left and sword
right; the Brute has its club right and an empty left hand. Initial shield pose is derived after
both hands are initialized. Dead slots retain their final values until reuse and
are hashed like every other allocated slot.

The v2-12 immutable-construction mutation policy remains in force:
`World::set_body` and `World::set_loadout` return `false` without mutation in an
Articulated world. `World::set_stats` remains accepted; actuator power and agility
read the changed, already-hashed stat row on the next tick, while anatomy and
equipment remain unchanged. Replays do not represent host stat edits, as already
documented for the replay input vocabulary. Test-only authority mutation writes
the model-specific columns directly and must preserve `[0,1]`.

## Yaw integration

One `Fx` raw turn equals one `Angle` raw unit. These raw constants are normative:

```text
BODY_YAW_MAX_SPEED_RAW = 546       # floor(65536 / 120)
BODY_YAW_ACCEL_RAW = 91            # floor(65536 / 720)
```

Let `error = target.delta(current)` in `[-32768,32767]`. `-32768` is the exact
half-turn and is negative, therefore clockwise. Let desired speed raw be
`clamp(error, -546, 546)`. Scale acceleration without losing sub-raw authority:

```text
n = (91_i64 * i64::from(turn_authority.raw)) + i64::from(authority_residue.raw)
a = trunc_toward_zero(n / 65536)
authority_residue.raw = n - a * 65536
speed.raw += clamp(desired_speed_raw - speed.raw, -abs(a), abs(a))
step = clamp(speed.raw, min(error,0), max(error,0))
angle = Angle::from_raw(angle.raw wrapping_add step as u16)
if step == error: speed = 0
```

`turn_authority` is validated in `[0,1]`. Translation never changes it and yaw
never consumes translation effort. A stationary body follows the same rule.
For articulated planar movement, the requested maximum velocity is unchanged but
the per-tick velocity change is clamped by
`stats.traction() * move_authority`. Thus impairment changes acceleration/braking,
not the submitted direction or top speed. Legacy movement does not read this field.

## Arm target and integration

An arm target bearing is an absolute world bearing, matching the frozen v2-11
command layout: zero is world `+x` and positive is counter-clockwise. Height and
reach are normalized `[0,1]`. Height maps to `standing_height * height`; physical
reach maps to `arm_length * max(target.reach, 1/4)`. The shoulder starts at body-local
`(0,+shoulder_half_width,shoulder_height)` for left and the negative width for
right, then rotates by body yaw into body-origin-relative coordinates whose axes
are parallel to the world axes. Body-left is
`(-sin(yaw), cos(yaw), 0)`. The desired hand is the rotated shoulder plus
`(cos(target.bearing), sin(target.bearing), 0)` times reach, with its `z`
replaced by mapped height. Body yaw moves the shoulders and shield normal; it
does not silently rewrite an absolute arm target.

`ArmState.hand`, `ArmState.previous_hand`, actuator target-hand positions, and
`ShieldPose.centre` all use that same space: they are relative to the
authoritative body origin `(pos.x, pos.y, 0)`, while their components are oriented
in world axes. V13 never adds the planar body position to those stored points.
Consequently `linear_velocity = hand - previous_hand` is actuator-relative
velocity and excludes body translation. V14 creates absolute collider points by
adding the authoritative planar body position and incorporates body translation
velocity at the contact-solver seam defined there. This is the same
body-relative position convention exported by the V16 articulated ABI.

The controller integrates bearing, height, and reach separately with the same
chase operation. Bearing error uses `Angle::delta`, including the clockwise
half-turn tie. Height/reach error uses `Fx` subtraction. Each scalar first chases
its desired speed by bounded acceleration, then advances without overshooting.
For each scalar in raw units, compute `desired_speed=clamp(error,-max_speed,max_speed)`,
then `speed += clamp(desired_speed-speed,-acceleration,acceleration)`, then
`step=clamp(speed,min(error,0),max(error,0))`; reaching the target zeros speed.
Bearing addition wraps `u16`; linear values use `Fx`. The desired reach is the
accepted target reach clamped to `[ARM_MIN_REACH_RAW, 65_536]`. Height uses
`CombatHeight::try_from_raw` after the bounded step, which cannot fail.
The raw constants are:

```text
ARM_BEARING_MAX_SPEED_RAW = 1092    # floor(65536 / 60) turns/tick
ARM_BEARING_ACCEL_RAW = 182         # floor(65536 / 360) turns/tick^2
ARM_LINEAR_MAX_SPEED_RAW = 1638     # floor(65536 / 40) normalized/tick
ARM_LINEAR_ACCEL_RAW = 273          # floor(65536 / 240) normalized/tick^2
ARM_MIN_REACH_RAW = 16384           # 1/4
FATIGUE_WORK_SCALE_RAW = 256        # divide raw work by 256
FATIGUE_RECOVERY_RAW = 4            # per idle tick
```

For the gripped equipment, define inertia
`max(1/4, mass * (1/4 + balance))`; an empty hand uses inertia `1/4`.
Define `power = (8 + stats.power) / 28` and
`agility = (8 + stats.agility) / 28`, both clamped `[1/4,1]`.
Available acceleration is

```text
effort * arm_authority[limb] * (1 - fatigue) * power / inertia
```

clamped `[0,1]`, multiplied by the relevant base acceleration. Maximum speed is
the relevant base speed multiplied by `agility`. All divisions use `Fx`'s
truncation. Requested effort scales acceleration/torque only; it never changes
the desired position.

The grouping is normative because `Fx` truncates: `inertia = max(1/4,
mass * (1/4 + balance))`; `power = clamp(Fx::from_ratio(8 + stats.power, 28),
1/4, 1)` and likewise for agility; `available = clamp(((((effort *
arm_authority[limb]) * (1 - fatigue)) * power) / inertia), 0, 1)`;
`acceleration = base_acceleration * available`; and `max_speed = base_max_speed *
agility`. Evaluate exactly left to right inside the shown parentheses. Reachable
products must not saturate.

Positive work for a moving arm is
`inertia * inertia * effort * (abs(delta_bearing_speed) + abs(delta_height_speed) +
abs(delta_reach_speed))`. Add `work.raw + work_residue.raw`, divide by 256 with
truncation, add that raw amount to fatigue, and retain the remainder in
`work_residue`; clamp fatigue to `[0,1]`. On a tick where all three target errors
and speeds are zero, fatigue decreases by raw `4` and residue is unchanged.
This formula makes a heavier otherwise-identical item fatigue sooner and never
changes its mass.

For each scalar, save the stored speed at tick entry, perform chase, step, and
target snap, then define `delta_speed = final_stored_speed - entry_speed`. Thus a
snap to zero bills its deceleration. The sum is
`((abs(delta_bearing_speed) + abs(delta_height_speed)) +
abs(delta_reach_speed))`, and work is evaluated left to right as
`(((inertia * inertia) * effort) * sum)`. Accumulate `work.raw +
work_residue.raw` in `i64`; quotient and remainder by positive `256` determine
the fatigue increment and next residue. The idle recovery predicate is evaluated
at tick entry: all three errors and all three speeds must already be zero. An arm
that arrives this tick pays its final work and cannot recover until the next tick.

For an independently actuated arm, after scalar integration copy `hand` to
`previous_hand`, derive the new hand
from the new scalars, and set `linear_velocity = hand - previous_hand`. The copy
occurs before derivation, so later sweep geometry spans exactly one tick.

## Grip transactions and shield pose

Both grip requests are validated as one transaction before either grip changes.
`Keep` preserves that limb, `Release` empties it, and `EquipSlot(n)` names one of
the two immutable equipment slots. Invalid slot, empty slot, binding/limb
mismatch, duplicate single-hand ownership, or any conflict involving `Both`
rejects the whole submitted command. A `Both` equip request must appear on both
arms with the same slot in the same command. The safe fallback preserves both
current grips.

Validation applies each request to the current grip pair in a temporary value:
`Keep` copies that arm's current slot, `Release` writes `None`, and
`EquipSlot(n)` writes `Some(n)`. It then validates the complete resulting pair.
The accepted transition table is:

| Resulting pair | Valid when |
|---|---|
| `[None, None]` | always |
| one occupied arm | the named item exists and its binding names that arm |
| two different occupied slots | both items are single-hand, one Left and one Right, and at most one is a shield |
| the same occupied slot twice | that item is `Both` and is not a shield |

Every other pair is invalid, including half of a `Both` item, a single-hand item
on both arms, two `Both` items, two shields, and `Both` beside any other item.
Consequently an already-held `Both` item accepts `Keep/Keep`, rejects a one-arm
release, and may be released only by a transaction whose resulting pair contains
neither half. The right-arm target convention below is selected from the
resulting grip pair, not from whether this tick happened to contain two
`EquipSlot` tags. Rejected transactions store the neutral fallback with
`Keep/Keep`; applying that fallback therefore preserves the pre-command pair.
Because construction rejects a `Both` item beside any second item, a valid V1 world
can only retain it with `Keep/Keep` or release it with `Release/Release`. The
one-occupied truth-table rows are exercised by the ordinary single-hand fixtures,
not by an impossible transition out of held `Both`.

For a resulting `Both` grip, both arms hold the same slot. The right-arm target is
the single authoritative target and the left-arm target is ignored after validation.
The right arm follows the ordinary controller. After it advances, set left bearing
raw to `2 * body_yaw.raw - right_bearing.raw` with `u16` wrapping, negate right
bearing speed, and copy right height/reach and their speeds. Both fatigue controllers
are billed independently using the same right-target deltas and the shared item
inertia. For geometry let `f=(cos(yaw),sin(yaw),0)`,
`l=(-sin(yaw),cos(yaw),0)`, and `d=right_hand-right_shoulder`; then
`left_hand=left_shoulder + f*dot(d,f) - l*dot(d,l) + (0,0,d.z)`.
This makes two-handed geometry deterministic without averaging contradictory
commands.

At tick entry, copy each arm's old `hand` to that arm's `previous_hand` exactly
once. Integrate the right scalars, derive its new hand, then overwrite the left
scalars with the documented mirror and derive the mirrored left hand from the
saved old left hand. Each `linear_velocity` is its own new hand minus its own
saved previous hand; the forced left mirror may therefore be a larger one-tick
displacement than an independently actuated hand. Both fatigue accounts use the
right arm's entry-to-final scalar speed deltas and the shared inertia. The shared
trajectory uses the right arm's effort, fatigue, stats, and
`arm_authority[RightArm]`; left authority does not alter a `Both` trajectory in
v2-13, but remains authoritative and affects the left controller whenever the
arms are independent. A later impairment rule that couples two-handed torque
must amend this contract before changing that behavior.

Grip changes apply before arm integration. A shield consumes its arm's bearing,
height, reach, and effort like any other item. Its pose is derived after the arm:

```text
centre = gripping hand
normal = (cos(body_yaw), sin(body_yaw), 0)
half_width/half_height/thickness = immutable shield geometry
```

The arm target cannot add an orbit offset to the normal. Releasing the shield
sets `shield_pose` to `None` that tick. A two-handed item and shield can never
coexist because command validation rejects the transaction.
Shield derivation inspects both resulting grips in left-then-right order and
continues past an empty or non-shield left grip; a test-only right-bound shield
must therefore produce a pose. The transaction rule above makes two simultaneous
shields invalid, so a derived pose never needs an arbitrary winner.

## Articulated phase schedule

`CombatModel::Legacy` executes the existing schedule byte-for-byte:

```text
clear events -> expire decisions -> regenerate -> apply movement -> separate
-> drive legacy limb -> legacy parries -> legacy swings -> recoil -> shots
-> doors -> reap -> increment tick -> pending -> navigation
```

`CombatModel::Articulated` in `v2-13` executes:

```text
clear events -> expire decisions -> apply planar movement
-> separate -> drive body yaw -> apply grip transaction -> drive both arms
-> derive shield/weapon geometry -> doors -> increment tick
-> pending -> navigation
```

It explicitly skips legacy regeneration, limb, parry, swing, recoil, shot, and
legacy-HP reap phases. Therefore this session cannot create healing, contact,
damage, recoil, death, or a projectile. `v2-15` later inserts articulated anatomy
evolution and death without inheriting a temporary legacy-HP behavior. Planar
movement may continue to update legacy `facing` from nonzero translation; that
field means feet direction in an articulated world and is distinct from body yaw.
`v2-14` inserts contact after geometry without changing the preceding order.

The articulated movement phase reads `ArticulatedCommandV1::move_dir` from the
currently stored submitted command, or zero when that slot has no submitted
command. It otherwise preserves the existing desired-velocity expression:
`clamp_length(move_dir, 1) * stats.move_speed() * action_of(i).spec().move_bonus`,
where `action_of(i)` remains the existing legacy held-slot cache. Only the
per-tick velocity-change cap becomes `stats.traction() * move_authority[i]`.
Nonzero requested direction continues to update legacy `facing` as feet
direction. The Legacy branch reads neither the submitted command nor authority.

## Hash and replay order

After the combat-spec block in the ArticulatedV1 suffix, each allocated entity slot
writes, without another slot count:

```text
body yaw angle, speed, residue,
left arm fields in struct declaration order,
right arm fields in struct declaration order,
left grip option, right grip option,
shield option and every ShieldPose field in declaration order,
move authority, turn authority, left arm authority, right arm authority
```

Angles write `u16`, `Fx` writes raw `i32`, `Vec3` writes x/y/z raw, and options
write a `u8` tag. Previous and current hands, cached velocity, fatigue, and both
residues are deliberately included. LegacyV1 reads none of these columns.

Replay records only accepted final `ArticulatedCommandV1` values. A rejection
diagnostic is runtime metadata owned outside `Replay`; it is not persisted and
does not enter authoritative hashing. Playback starts from the same initialization
and must match every pose field at every tick, not merely the final digest.

Every `Stored` result is recorded in insertion order; equal ticks are legal and
are not coalesced. Playback submits all records for that tick in the same order
before stepping. A later submission overwrites the pending command, so the final
stored accepted command wins the tick. Grip changes occur only during the step:
each same-tick submission therefore validates against the same current
authoritative grip pair, never against an earlier pending request. A host records
the safe command returned by a rejected request, not the rejected request.

No production pose-view API is added for proof. Under `cfg(test)`, `world.rs`
exposes a crate-private copied test view containing `BodyYawState`, both
`ArmState` rows, both `GripState` rows, `Option<ShieldPose>`, and all four
authority factors. Replay tests compare that view and `StateDigest` after every
tick. The test view is absent from release builds and is not a second byte grammar.

Appending this block intentionally moves the existing paired articulated
command-probe digest in the Rust web test and `tools/wasm_check.js`. Those two
mirrors are re-recorded only from the same accepted fixture after native/wasm
equality passes. They are a cross-target probe, not the canonical
`ARTICULATED_HASH`; v2-17 remains the sole owner of that later pin.

## Evidence fixture

The actuator sweep uses `Scenario::articulated_duel()` (name
`articulated-duel-v1`) and seed `1`. Unnamed inputs are `Intent::Hold`, zero
movement, `Keep/Keep`, zero effort on axes not under test, and targets equal to
their current scalars. Yaw uses Fighter slot zero. Arm rows use Fighter
left/Shield for MID-to-HIGH, Fighter right/Sword and Brute right/Club for
tuck-to-full, and the named shield limb.

Yaw rows record raw tick, target, entry angle/error, desired speed, acceleration
cap, final speed, step, final angle, and authority residue. Arm rows record raw
tick and limb; three targets, entry errors, entry speeds, acceleration caps,
final speeds, and steps; fatigue and work residue; and previous hand, hand, and
velocity xyz.

The equal-stats fatigue comparison uses two test-only worlds with Fighter anatomy
and Fighter base stats, carrying only Sword right or only Club right with matching
legacy loadout. For ticks `0..120`, effort is one and the right target alternates
every 20 ticks between `(0,MID,1/4)` and `(HALF,HIGH,1)`, starting with the latter.
Yaw and movement are zero and the left hand is empty.

## Frozen test vectors

- Yaw from raw `0` toward `32768` chooses negative speed. The first speed is
  `-91`, the first angle is raw `65445`; speeds reach `-546` on tick 6 and never
  exceed it.
- Yaw from raw `0` toward raw `100` advances `91`, then snaps to `100` with
  speed zero on tick 2.
- A tucked Fighter hand at yaw zero has shoulder `x=0`, left shoulder `y=1/4`,
  right shoulder `y=-1/4`, hand `x=3/16`, and height `9/10`.
- A Fighter arm commanded from height `1/2` to `3/4` cannot arrive in one tick:
  its first normalized height increase is at most raw `273`.
- With identical stats, target, and effort, the Club inertia is greater than
  Sword inertia and its fatigue after 120 non-idle ticks is strictly greater.
- At yaw quarter-turn, a held shield normal is exactly `(0,1,0)` within the
  sine table's exact cardinal values, regardless of its arm bearing.
