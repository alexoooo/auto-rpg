# Embodied 07 -- two links, a derived elbow, and an arm that is finally as long as it says

**Status:** the arm-length constraint and the derived elbow are complete and landed
2026-08-17, and no pin moved. The forearm **collider** and the commanded swing plane
are outstanding; what they need and why they were separated is at the foot of this
file.

## This is a mechanics fix, not an animation one

`limb::hand_position` places the hand at `physical_reach` in the horizontal plane and
then *overwrites* `hand.z` with `standing_height * height`. Height and reach are
independent axes, so the actual shoulder-to-hand distance is
`sqrt(physical_reach^2 + dz^2)`, which exceeds `arm_length` whenever the arm is both
extended and raised or lowered. **The reachable set was a cylinder shell, not a
sphere, and nothing in the model bounded the limb by its own length.**

That is the strongest argument for the elbow and it is not the one usually given. A
two-link arm makes reach genuinely cost what it should: a high guard at full
extension is not reachable, and a policy that asks for one now gets the nearest pose
that is.

## The clamp is in target space, and the two wrong answers before it are the reason

The obvious spelling -- compute the hand, pull it onto the annulus, invert back to a
target -- **does not work**, and the failure is worth keeping because it is not
visible from the code.

`hand_position` and `inverse_hand` are inverses only on the poses `hand_position` can
*reach*: `reach` is floored at `ARM_MIN_REACH_RAW` and `height` is a bounded
fraction, so an inverted point outside those ranges comes back as a different, longer
arm. Measured: a clamp to `0.7500` produced a hand at `0.7666`.

The second draft clamped in target space but computed the vertical budget from the
height that was *asked for*. `height` is quantised on the way through, and for a hand
below the shoulder that quantisation makes `dz` **larger** -- so the arm came back a
raw unit long again.

`reachable_extent` clamps the two axes in the order they constrain each other, and
measures from the height the forward map will actually produce:

1. the vertical is fixed by `height` alone, so it goes first -- bounded not by the
   arm's length but by what is left after the *shortest* horizontal the forward map
   can express, or the floor on `reach` would push a fully-raised arm straight back
   outside;
2. the height is quantised, and `dz` is re-measured from the realised value;
3. the horizontal takes whatever the annulus has left at that height.

**Applied before integration**, in `World::reachable_arm_target`, which sits inside
the one function [session 05](embodied-05-torso-relative-command.md) already made the
single door for an embodied arm target. Clamping the arm's *result* would leave the
actuator converging forever on a pose it cannot reach and sitting at the limit with a
permanent error; clamping the target makes it chase something it can hold and stop.
It is the same argument the twist budget makes one joint up.

## Geometry

The arm is `upper` from shoulder to elbow and `fore` from elbow to hand, with
`UPPER_ARM_FRACTION_RAW` a half. **Equal links make the naive inner bound
`|upper - fore|` zero** -- a hand that could touch its own shoulder -- which is
exactly why the real inner bound comes from `ELBOW_MIN_INCLUDED_ANGLE_RAW`, the
joint's own stop, rather than from the link lengths. Saying so is more honest than
choosing an asymmetry in order to manufacture a bound the elbow already provides.

`Elbow::reach_bounds` is the law of cosines at that stop, and it is a *fold* rather
than a hinge: an elbow at forty degrees still holds the hand a third of an arm's
length from the shoulder.

`elbow_point` is the two-link inverse kinematics solution and it is exact rather than
iterative -- the elbow lies on the circle of radius `upper` about the shoulder and
radius `fore` about the hand, and the intersection of two circles is one square root
in `Fx`.

**The swing plane is not commanded yet, and the default is a choice worth naming.** A
human elbow at rest hangs below the line from shoulder to hand, so the off-axis
direction is the downward one made perpendicular to the axis; when the axis is itself
vertical there is no "below" to project and the fallback is forward, the only
direction that invents nothing the bearing did not already say.

`ArmPolyline` now carries up to three points and yields *segments*, so a collider
builder asks for "the arm" and gets whichever this body has. `arm_polyline` builds
the single-link arm and `jointed_arm_polyline` the two-link one -- two constructors
rather than an `Option` parameter, because they answer different questions and a
caller with no elbow to give should not have to say so.

## Tests

- `a_hand_can_never_be_further_from_its_shoulder_than_the_arm_is_long` -- swept over
  the whole commanded range at four yaws, two pelvis heights and both arms, because
  the failure it replaces was not at a corner: the excess grew with both axes at
  once and every one-axis sweep missed it. **Both bounds carry the exact slack that
  was measured** -- one raw unit over the outer bound and three inside the inner one,
  1.5e-5 and 4.6e-5 world units -- rather than a round number chosen to make it pass.
  Pinning the measured maxima is what makes it catch a regression instead of
  absorbing one.
- `an_articulated_arm_target_is_still_unclamped` -- the guard. Closing the hole for
  one model must not close it for the other, or every articulated corpus moves.
- `a_raised_arm_at_full_reach_is_longer_than_the_arm`, kept and re-argued: the raw
  forward map is shared by both models and must stay exactly as it is. What closed
  the hole for an embodied body is the clamp *in front of* it.
- `the_elbow_lies_on_both_link_circles` -- swept across the annulus at four bearings,
  because the interesting failures are at its two ends
- `an_elbow_never_folds_past_its_stop` and `an_elbow_stop_is_a_fold_and_not_a_hinge`,
  the second bounding the constant from both sides
- `a_jointed_arm_polyline_runs_shoulder_elbow_hand`
- `an_unreachable_hand_leaves_the_arm_one_segment` -- a collider builder needs a
  connected arm more than it needs a joint
- `an_articulated_arm_is_still_one_capsule_from_shoulder_to_hand` -- the guard
- `an_embodied_duel_equals_the_articulated_duel_while_its_stance_is_inert`, narrowed
  a third time. The two models now agree only on a pose an articulated arm would also
  have held, which is not a range the test can assume -- so it **searches** the
  command space for a target the clamp leaves untouched and fails if there is none.

## Verification, as run

```powershell
cargo test                                                      # sim 636 in its lib alone
cargo test -p sim --features cartesian-recoil                    # 812 passed, 0 failed
cargo run --release -p lab -- hash                                # 0xfe31370e141ef531
cargo run --release -p lab -- verify      --seeds 200
cargo run --release -p lab -- duel        --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
```

## Hash expectation, and what happened

**Nothing moved.** The clamp answers `CommandFrame::World` for every model but
`Embodied`, so `ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST` and both exact
digests cannot see it; `COMBAT_GEOMETRY_HASH` and `CONTACT_BEHAVIOR_DIGEST` are corpus
pins over the shared primitives, which gained no new law -- `elbow_point` has no
production caller yet. `LAB_HASH` answers `0xfe31370e141ef531`, `duel --seeds 400`
answers 238/162 at 59.5%, and the articulated gate answers the same fixture pair and
the same 1,761,481 resolutions.

## What is outstanding, and why it was separated

**The forearm as a collider.** `body_region_volumes` returns one capsule per region
and `AnatomyRegion::COUNT` is 5. Growing the *volume list* to seven while keeping
region *identity* at five is the plan's design and it still holds -- the selection
tuple `(toi, medial_distance_squared, BodyPart)` already tolerates two volumes
answering the same part, and `ArmPolyline::segments` is the seam it needs. What it
touches is `build_contact_colliders` and the region publication, and the second of
those is in the same file as the stance publication that was in flight when this
landed.

**The commanded swing plane**, widening `EMBODIED_PAYLOAD_BYTES` 53 to 57. The fork
[session 03](embodied-03-embodied-model-scaffold.md) made is exactly what lets this
happen without touching `ARTICULATED_PAYLOAD_BYTES` or the three digests that read
it -- but that fork is now insurance rather than necessity, because [backwards
compatibility is not a constraint](embodied-00-overview.md#backwards-compatibility-is-not-a-constraint-here)
in this plan. The widening is a straight edit of the embodied layout, not an
append-only exercise, and the byte order may be whatever reads best. Until it lands,
`elbow_point`'s downward default is the plane, and it is a defensible one rather than
a placeholder.
