# Embodied 05 -- the arm belongs to the torso

**Status:** proposed. Depends on [03](embodied-03-embodied-model-scaffold.md).
Independent of [04](embodied-04-terrain-and-elevation.md).

Reinterpret `EmbodiedCommandV1`'s two arm bearings, and its movement vector, as
**relative to body yaw** rather than absolute world bearings. No byte moves, no field
is added, no layout version changes. This is the highest-value single item in the
plan and it is almost entirely a semantic amendment.

## What it changes, and why it is worth a session

The [articulated actuator contract](../reference/articulated-actuators.md#arm-target-and-integration)
is explicit that a bearing is absolute: "Body yaw moves the shoulders... it does not
silently rewrite an absolute arm target." That was a deliberate choice and it has a
cost that the source material does not pay: **turning the body does not carry the
sword.** A fighter who pivots keeps the blade pointing where it pointed, so footwork
and swing are two independent subsystems that happen to share a shoulder.

Making the bearing torso-relative couples them. Turning the hips swings the weapon;
reaching across the body costs bearing travel the torso could have supplied for free;
and a body that must turn to bring the weapon round is a body whose stance
([session 06](embodied-06-stance.md)) can meaningfully constrain its attack. Every
later session in this plan is worth less without it.

There is corroborating evidence in the repository that the split was a real defect
source rather than a stylistic choice. The shield-normal amendment of 2026-08-16 --
the plate's *position* followed the hand while its *facing* followed the torso, with
nothing tying the two together, measured across 2.86M samples as a 0-to-180 degree
disagreement with a 32 degree median -- is the same split showing up one layer down.
That fix took the normal from the arm; this session takes the arm from the body.

## The change

In the embodied arm driver, the desired hand becomes

```text
world_bearing = body_yaw + command.bearing        // u16 wrapping add
```

and everything downstream -- `limb::hand_position`, the chase integration, the
derived shield normal -- consumes `world_bearing` unchanged. The stored `ArmState`
keeps its **world** bearing, because that is what the geometry, the contact phase and
the pose publication all read, and because storing a relative angle would make the
published hand depend on a yaw the reader has to re-apply.

The command is relative; the state is absolute; the conversion happens once, on the
way in. That is the same shape as the pose module's world-space conversion on the way
out, and for the same reason.

Movement follows the same rule: `move_dir` is interpreted in the body frame, so `+x`
is forward and `+y` is body-left. WASD then maps directly, with `W` as `(1, 0)`, and
the client stops needing to know the body's yaw to drive it.

## The consequence a policy has to be told about

An absolute bearing is *stable under yaw*: a policy that wants the blade held east
submits east every tick and the arm stays east while the body pivots. A relative
bearing is *stable under the body*: the same submission now sweeps the blade with the
torso. Both are useful and they are not interchangeable.

`crates/policy/src/articulated_script.rs` sets `arm.bearing == body_yaw`
unconditionally when nothing is visible, which under the new reading is the constant
zero and means "arm forward" -- which is what that code was trying to say. The
tracking branches need converting to deltas rather than absolute targets. Do the
conversion explicitly and name it in the diff; a policy that reads absolute under a
relative contract aims at nothing and still compiles.

## Tests

- `an_embodied_arm_bearing_is_measured_from_the_body_and_not_from_the_world`
- `turning_the_body_carries_the_hand_with_it_at_a_held_bearing` -- yaw the body 90
  degrees with an unchanged submitted command and assert the hand's offset from the
  shoulder rotated with it. The articulated twin of this test asserts the opposite
  and must stay green.
- `an_articulated_arm_bearing_is_still_absolute` -- the guard that says this session
  did not reach the old model.
- `embodied_movement_is_expressed_in_the_body_frame`
- `a_zero_bearing_command_holds_the_arm_directly_ahead_at_every_yaw`
- `the_shield_normal_still_follows_the_arm_that_carries_it` -- the 2026-08-16
  amendment survives the frame change.

Show the second one failing by reverting the `+ body_yaw` term.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify     --seeds 200
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**Nothing moves.** The reinterpretation is confined to the embodied arm driver;
`ArticulatedCommandV1`, its payload width, its validation and its actuator are
untouched, so `ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`,
`EXACT_TRAJECTORY_STATE_DIGEST` and `LIFTED_COULOMB_SOLVER_DIGEST` cannot see it.
The articulated gate corpus and `lab duel` win rates answer what they answered
before.

**Session 03's pose equality is deliberately broken by this session and is the
measurement, not a regression.** Replace
`an_embodied_duel_equals_the_articulated_duel_it_was_copied_from` with
`an_embodied_duel_equals_the_articulated_duel_when_every_body_yaw_is_zero`, which is
the exact condition under which the two readings coincide, and record in the embodied
command reference that this is the session that separated them.

## Documentation owed

`docs/reference/embodied-command-v1.md` gains its coordinate rule, written as an
explicit contrast with the articulated one rather than as a fresh statement, so a
reader who knows the older contract is told which sentence stopped applying and why.
