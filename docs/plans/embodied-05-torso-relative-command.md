# Embodied 05 -- the arm belongs to the torso

**Status:** complete. Landed 2026-08-17. No pin moved.

`EmbodiedCommandV1`'s two arm bearings and its movement vector are now read
**relative to body yaw** rather than as absolute world bearings. No byte moved, no
field was added, no layout version changed. This is the highest-value single item in
the plan and it is almost entirely a semantic amendment.

## What it changes, and why it was worth a session

The [articulated actuator contract](../reference/articulated-actuators.md#arm-target-and-integration)
is explicit that a bearing is absolute: "Body yaw moves the shoulders... it does not
silently rewrite an absolute arm target." That was a deliberate choice and it has a
cost the source material does not pay: **turning the body does not carry the sword.**
A fighter who pivots keeps the blade pointing where it pointed, so footwork and swing
are two independent subsystems that happen to share a shoulder.

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

## The change, and where it is

One predicate and two accessors. `CombatModel::command_frame()` answers
[`CommandFrame::World` or `CommandFrame::Torso`](../../crates/sim/src/scenario.rs#L145),
and `World::world_arm_target` and `World::world_move_dir` are the only two places in
the tick that read it.

```rust
CommandFrame::Torso => ArmTarget { bearing: self.body_yaw[i].angle + target.bearing, ..target }
```

and, for movement, the ordinary rotation -- forward is `(cos yaw, sin yaw)` and left
is `(-sin yaw, cos yaw)` -- so `W` is `(1, 0)` at every yaw and the client stops
needing to know which way the body faces in order to drive it.

**The command is relative, the stored state is absolute, and the conversion happens
once on the way in.** `ArmState` keeps a world bearing under both models because that
is what the geometry, the contact phase and the pose publication all read; storing a
relative angle would make the published hand depend on a yaw every reader had to
re-apply. That is the same shape as the pose module's world-space conversion on the
way out, and for the same reason.

### Two phase bodies, not four

The plan expected `EMBODIED_PHASES` to stop being an alias here. It has not, and the
reason is the one [session 02](embodied-02-phase-schedule-and-seams.md) argued: a
second fourteen-row table identical to the first except in two rows is a second place
to forget `press_doors`. The divergence is *inside* two phase bodies, at one named
line each, and the alias is paid for when [session 06](embodied-06-stance.md) adds a
phase that genuinely does not exist for an articulated body.

The clamp order in the movement phase moved with it, and it matters: `move_dir` is
clamped to unit length **after** the frame conversion, not before. A rotation
preserves length exactly in real arithmetic and only to within a raw unit in `Fx`, so
clamping first would let a rounded-up vector out at 65,537 raw.

## The consequence a policy has to be told about

An absolute bearing is *stable under yaw*: a policy that wants the blade held east
submits east every tick and the arm stays east while the body pivots. A relative
bearing is *stable under the body*: the same submission now sweeps the blade with the
torso. Both are useful and they are not interchangeable.

`crates/policy/src/articulated_script.rs` is **deliberately untouched**. It drives
articulated worlds, whose contract is unchanged, and editing it would move the
`lab articulated` gate corpus in a session whose contract is that nothing moves. The
embodied policy is [session 09](embodied-09-observation-and-policy.md)'s, and it is a
new file rather than a mode of that one, because the two read a bearing in different
frames and a shared file would make the frame a runtime question.

## Tests

- `an_embodied_duel_equals_the_articulated_duel_when_every_body_yaw_is_zero` --
  session 03's equality, replaced rather than deleted. Zero is the one yaw at which
  the two readings coincide, so the test **establishes** that condition (the fixture
  spawns its two bodies facing each other, so one starts at half a turn) and then
  asserts the bodies held it, tick by tick. Without that assertion the equality could
  pass because both drifted somewhere that happened to agree.
- `an_embodied_arm_bearing_is_measured_from_the_body_and_not_from_the_world` -- over
  six yaws including both wrap boundaries, and it also asserts that height, reach and
  effort come through untouched.
- `a_zero_bearing_command_holds_the_arm_directly_ahead_at_every_yaw`
- `embodied_movement_is_expressed_in_the_body_frame` -- exact, not approximate: a
  quarter turn takes body-forward to world-left with no rounding.
- `turning_the_body_carries_the_hand_with_it_at_a_held_bearing` -- the session's
  point, measured through 400 actual ticks rather than through the conversion.
  **Bounded from both sides**: the embodied arm must arrive within a sixteenth of a
  turn of the torso *and* the articulated one must stay within a sixteenth of where
  it started, so neither a body that failed to turn nor an arm that spun freely
  could pass it.
- `an_articulated_arm_bearing_is_still_absolute` -- folded into the two tests above
  as their guard half, so the claim and its control cannot drift apart.
- `the_shield_normal_still_follows_the_arm_that_carries_it` -- run against **both**
  models, so the 2026-08-16 amendment is asserted to survive the frame change rather
  than assumed to.

**Shown failing.** Reverting the `+ self.body_yaw[i].angle` term turns all three
bearing tests red -- the two unit ones immediately and the 400-tick one on its
"embodied arm did not follow the torso" message -- and every other test stays green,
which is the second half of the demonstration.

## Verification, as run

```powershell
cargo test                                                      # 613 in sim's lib alone
cargo run --release -p lab -- hash                               # 0xfe31370e141ef531
cargo run --release -p lab -- verify     --seeds 200
cargo run --release -p lab -- duel       --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation, and what happened

**Nothing moved.** The reinterpretation is confined to two accessors that answer
`CommandFrame::World` for every model but `Embodied`, so `ARTICULATED_COMMAND_HASH`,
`ARTICULATED_STREAM_DIGEST`, `EXACT_TRAJECTORY_STATE_DIGEST` and
`LIFTED_COULOMB_SOLVER_DIGEST` cannot see it. `LAB_HASH` answers
`0xfe31370e141ef531`, `duel --seeds 400` answers 238/162 at 59.5%, and the
articulated gate answers the same fixture pair, the same 285/299 split, the same
1,761,481 resolutions and the same 337 severances it has answered since before
session 01.

**Session 03's pose equality was broken by this session on purpose, and that is the
measurement rather than a regression.** It is now conditional on a zero body yaw,
which is the exact condition under which the two readings coincide.
