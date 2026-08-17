# Embodied 07 -- two links, a derived elbow, and an arm that is finally as long as it says

**Status:** proposed. Depends on [06](embodied-06-stance.md).

Make the embodied arm an upper arm and a forearm with a derived elbow, give the
forearm a collider, and close the reach hole that session 02 recorded.

## This is a mechanics fix, not an animation one

`limb::hand_position` -- moved there by session 02 from
[`actuator.rs#L137`](../../crates/sim/src/combat/actuator.rs#L137) -- places the hand
at `physical_reach` in the horizontal plane and then *overwrites* `hand.z` with
`standing_height * height`. Height and reach are independent axes, so the actual
shoulder-to-hand distance is `sqrt(physical_reach^2 + dz^2)`, which exceeds
`arm_length` whenever the arm is both extended and raised or lowered. **The reachable
set is a cylinder shell, not a sphere, and nothing in the model bounds the limb by
its own length.**

That is the strongest argument for the elbow and it is not the one usually given. A
two-link arm with a derived elbow makes reach genuinely cost what it should: a high
guard at full extension is not reachable, and a policy that asks for one gets the
nearest pose that is.

## Geometry

The arm is `upper` from shoulder to elbow and `fore` from elbow to hand, with

```text
upper_length = anatomy.arm_length * UPPER_ARM_FRACTION_RAW
fore_length  = anatomy.arm_length - upper_length
```

The command names shoulder bearing, height and reach as it does today; those three
produce a *desired* hand, which is then **clamped to the reachable annulus**

```text
|hand - shoulder| in [ |upper_length - fore_length| , upper_length + fore_length ]
```

along the shoulder-to-hand direction. The clamp is applied before integration, so the
arm chases a pose it can actually hold rather than converging on one it cannot and
sitting at the limit with a permanent error. `inverse_hand` -- which the contact
phase already calls to put a struck hand back into joint space -- clamps to the same
annulus, so the forward and inverse maps agree by construction rather than by
inspection.

Given a reachable hand, the elbow is the two-link inverse kinematics solution in the
**swing plane**, and the swing plane is the one new command field:

```text
swing_plane   u16, an angle about the shoulder-to-hand axis
```

`EMBODIED_PAYLOAD_BYTES` goes 53 to 57, two bytes per arm, appended at the end.
Session 03 forked this payload precisely so that this widening cannot reach
`ARTICULATED_PAYLOAD_BYTES` or the three digests that read it.

Elbow position, in the plane, is exact: the elbow lies on the circle of radius
`upper_length` about the shoulder and radius `fore_length` about the hand, and the
intersection is one `sqrt` in `Fx` with the half-plane chosen by `swing_plane`.
`ELBOW_MIN_INCLUDED_ANGLE_RAW` is the joint's own stop and clamps the annulus's inner
bound above the naive `|upper - fore|`, because an elbow does not fold flat.

## The forearm as a collider, without a sixth region

`RegionVolume` is one capsule per region and `AnatomyRegion::COUNT` is 5, frozen, with
`ANATOMY_HASH_ROW_BYTES` and a five-entry armor table hanging off it. Splitting the
arms into upper and fore would double the armor table and move both, for a
distinction -- forearm versus upper arm -- that changes no decision a policy makes.

So region *identity* stays five and the volume *list* grows. `arm_polyline` returns
three points, `region_volumes` returns seven capsules, and the two arm capsules of
each arm both carry `BodyPart::LeftArm` or `BodyPart::RightArm`. The region selection
tuple in
[anatomy assignment](../reference/anatomy-health.md#region-volumes-and-assignment) is
`(toi.raw, medial_distance_squared.raw, BodyPart as u8)` and already tolerates two
volumes answering the same part: the nearer one wins on the second term and the
`BodyPart` it reports is the same either way. No `ContactKey` is duplicated because
identity is the part, not the capsule.

The embodied region publication carries `EMBODIED_REGIONS_PER_BODY = 7`.
`REGIONS_PER_BODY` stays 5 for articulated bodies and its section is untouched.

## What this buys the fight

A forearm that collides is a forearm that can block, be cut, and get in the way of
your own swing. Combined with [session 05](embodied-05-torso-relative-command.md)'s
torso-relative bearing and [session 06](embodied-06-stance.md)'s twist budget, the
three together are what make a swing a whole-body act: the hips permit the torso, the
torso carries the shoulder, the shoulder and the swing plane place the elbow, and the
elbow decides whether the edge or the arm arrives.

## Tests

- `a_hand_can_never_be_further_from_its_shoulder_than_the_arm_is_long` -- swept over
  the full command range at several yaws and pelvis heights. This is the hole being
  closed and it fails today against the articulated actuator, which is worth
  recording in the test rather than only in prose.
- `the_forward_and_inverse_hand_maps_agree_on_every_reachable_pose`
- `an_unreachable_target_is_clamped_before_integration_and_leaves_no_standing_error`
- `the_elbow_lies_on_both_link_circles`
- `the_swing_plane_chooses_between_the_two_elbow_solutions`
- `an_elbow_never_folds_past_its_stop`
- `a_forearm_capsule_can_take_a_contact_and_reports_its_arm_region`
- `two_arm_capsules_never_produce_two_contact_keys_for_one_blade`
- `an_articulated_arm_is_still_one_capsule_from_shoulder_to_hand` -- the guard.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify      --seeds 200
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --quick
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**`ARTICULATED_STREAM_DIGEST` moves again, by extension only**, because the embodied
region section gains its seven-row shape and the embodied stance section is already
on the wire. Predict it from the fixture, measure native first, then wasm.

**`EMBODIED_PAYLOAD_BYTES` moves 53 to 57 and takes the embodied command digest with
it.** That is the pin session 03 created for exactly this, and it is re-recorded by
this session with the widening stated.

**Nothing articulated moves.** `ARTICULATED_COMMAND_HASH`,
`EXACT_TRAJECTORY_STATE_DIGEST` and `LIFTED_COULOMB_SOLVER_DIGEST` all read
`ARTICULATED_PAYLOAD_BYTES`, which is untouched; `COMBAT_GEOMETRY_HASH` and
`CONTACT_BEHAVIOR_DIGEST` are corpus pins over the shared primitives, which gain no
new law here -- the two-capsule arm is two calls to the sweep that already exists.
If either moves, a primitive changed and the session stops.
