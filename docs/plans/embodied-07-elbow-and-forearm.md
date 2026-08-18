# Embodied 07 -- two links, a derived elbow, and an arm that is finally as long as it says

**Status:** complete. The arm-length constraint and the derived elbow landed
2026-08-17 with no pin moved; **the commanded swing plane landed the same day**, also
with no pin moved -- `EMBODIED_PAYLOAD_BYTES` 53 -> 57, the embodied layout version
1 -> 2, and the first embodied-only world column. **The forearm collider landed the
same day and moved exactly one pin**, `ARTICULATED_STREAM_DIGEST`, as a layout move;
it is written up at the foot of this file.

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

**The swing plane is commanded, and `Angle::ZERO` is the choice that used to be the
only one.** A human elbow at rest hangs below the line from shoulder to hand, so the
zero direction is the downward one made perpendicular to the axis; when the axis is
itself vertical there is no "below" to project and the zero direction is forward, the
only one that invents nothing the bearing did not already say. `plane` rotates that
direction about the shoulder-to-hand axis.

The rotation is the **two-term** form and not a full Rodrigues: `side` is already
perpendicular to the axis by construction, so the `(1 - cos)` term multiplies a dot
product that is zero. With `s` the unit side and `b = axis x s`, the offset is
`s*out*cos(plane) + b*out*sin(plane)`. Writing the general form would spend two more
products on a term that cannot contribute *and* would stop reproducing the old answer
bit for bit at zero -- which is the property that let this land without moving a pin,
since `cos(ZERO)` is exactly `Fx::ONE`, `out * Fx::ONE` is exactly `out`, and
`mul_div(v, 0, d)` is exactly zero.

The degenerate branch rotates too, through the same code path rather than returning
early: the axis is then `+/-Z` and the plane is a rotation in the horizontal plane,
which is as meaningful as any other. Returning early would have made the one pose with
no natural default also the one pose a policy could not steer.

**The held plane is chased, not snapped, and that is required rather than polish.**
`ElbowPlaneState` keeps `commanded` beside `held`; `submit_embodied_v1` writes the
first and the arms phase moves the second toward it by at most
`ELBOW_PLANE_MAX_SPEED_RAW = ARM_BEARING_MAX_SPEED_RAW` a tick, shortest way round.
The elbow may not swing about the arm's own axis faster than the shoulder swings the
whole arm, so the number is derived from one already measured rather than invented,
and it is a rate bound and **not** a bill: the work an arm does about its own axis is
not modelled, and inventing a fatigue charge for it would be a number with nothing
behind it. Once the forearm is a swept collider, a commanded plane that jumped half a
turn in one tick would sweep the forearm across the body inside that tick and hand the
contact solver an absurd closing energy.

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
  because the interesting failures are at its two ends, and now across six commanded
  planes as well. **The slack was re-measured and did not move.** The guess was that
  the rotation's extra `Fx` product and second per-axis `mul_div` would cost a raw
  unit or two; measured, they cost none, and four is still the exact maximum -- three
  fails, five passes on an error that has already grown.
- `a_zero_plane_reproduces_the_default_elbow` -- the pre-plane expression written out
  in the test and compared bit for bit, over a sweep that includes the vertical arms
  the degenerate branch answers. Asserted rather than claimed, because every pin over
  the shared primitives was recorded with the unrotated elbow.
- `a_commanded_plane_swings_the_elbow_about_the_arm` -- the other half, since the
  test above is satisfied completely by a `plane` parameter the body ignores.
- `an_elbow_plane_cannot_cross_the_arm_in_one_tick` -- bounded from both sides:
  "no further than the budget" alone is satisfied by an elbow that never moves and
  "arrives" alone is satisfied by a snap, so every approach tick is asserted to move
  by exactly the budget, the arrival tick to land exactly on the command, and the
  ticks after it to move by nothing.
- `the_two_payload_contracts_share_a_prefix_and_diverge_after_byte_52`, which retires
  `an_embodied_payload_is_the_articulated_payload_byte_for_byte` -- the test whose own
  doc comment said session 07 was the one that would end it.
- `an_embodied_command_record_carries_its_swing_plane` -- the codec fork. It failed
  before the fix as `LimitExceeded(OrderRecords)`, which is what a four-byte
  desynchronisation looks like from the far end of the stream.
- `an_embodied_only_column_cannot_move_an_articulated_digest` -- `ground_z`, the
  stance and both halves of the elbow plane, each perturbed by one raw unit.
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
cargo test                                                      # sim 654 in its lib alone
cargo test -p sim --features cartesian-recoil                    # 823 passed, 0 failed
cargo run --release -p lab -- hash                                # 0xfe31370e141ef531
cargo run --release -p lab -- verify      --seeds 200
cargo run --release -p lab -- duel        --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js                                   # 33 pass, 0 fail
node tools/check_docs.js
```

The forearm collider re-ran all of the above and added the client half:
`lab strong-strike` both ways, `npm run check`, `node tools/check_deps.js`, and the
four `client/test` suites. `cargo test` answers 654 in `sim`'s lib and 141 in `web`'s;
`cargo test -p sim --features cartesian-recoil` answers 823; `lab hash` is still
`0xfe31370e141ef531`; `duel --seeds 400` is still 238/162 at 59.5%; the articulated
gate is still the same fixture pair, the same 285/299 split, **1,761,481** resolutions
and **337** severances. `wasm_check.js` passes 33 on both builds.

## Hash expectation, and what happened

### The first two halves

**Nothing moved.** The clamp answers `CommandFrame::World` for
every model but `Embodied`, so `ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`
and both exact digests cannot see it; `COMBAT_GEOMETRY_HASH` and
`CONTACT_BEHAVIOR_DIGEST` are corpus pins over the shared primitives, which gained no
new law -- `elbow_point` still has no production caller.

The swing plane adds a second reason and a second set of pins to say it about.
`EMBODIED_PAYLOAD_BYTES` moved and `ARTICULATED_PAYLOAD_BYTES` did not, which is
exactly what session 03's fork was bought for: the three digests taken over the
articulated width are untouched. The new world column is written in the block behind
the model guard at the end of `articulated_state_digest`, after `ground_z` and the
stance, so only `HashDomain::EmbodiedV1` can reach it -- and those digests are pinned
by nothing, compared only against themselves by
`crates/sim/tests/determinism.rs`. `LAB_HASH` answers `0xfe31370e141ef531`,
`duel --seeds 400` answers 238/162 at 59.5%, and the articulated gate answers the same
fixture pair (`0x068d05fcada1027b` / `0x6dbf62f0b336050b`) and the same 1,761,481
resolutions.

The wasm mirrors moved with the constants and not with a pin:
`EMBODIED_COMMAND_BYTES` 57 -> 61 and `embodied_command_layout_version()` 1 -> 2, in
`crates/web/src/lib.rs` and again in `tools/wasm_check.js`, whose 57-byte embodied
fixture grew to 61 and whose header word became layout 2.

## The forearm as a collider, as landed

`BODY_VOLUME_COUNT` is 7 and `AnatomyRegion::COUNT` stays 5. The selection tuple
`(toi, medial_distance_squared, volume)` already tolerated two volumes answering one
`BodyPart`, and `ArmPolyline::segments` was the seam, exactly as this plan predicted.

**The rename was the whole safety argument and it worked as designed.**
`ContactFact::region` became `ContactFact::volume` and `NO_REGION` became
`NO_VOLUME`, which broke every reader at compile time. Four of them turned the byte
into anatomy and would otherwise have dropped a forearm wound in silence -- the
wounding pass and the severance report in `contact_phase.rs`, the published
`COMBAT_EVENT_BODY_PART` word, and `learn`'s region histogram -- and three more
wanted the volume and kept it. `volume_region` is the single bridge; the trap it
closes is that `BodyPart::from_index(5)` answers `None`, so the old spelling takes an
`else { continue }` and the blow does nothing at all.

Two constructors and not an `Option` parameter: `body_region_volumes` builds a body
whose arms are one capsule and `jointed_body_region_volumes` one whose arms are two,
on `limb`'s own argument one layer down. `present` stays five wide on both, because
it is a *severance* mask and there is no state in which a forearm is gone and its arm
is not.

The elbow is derived and never stored -- `World::arm_elbows` is a function of the
posed anatomy, the hand and the held plane -- but it is **retained** in `TickEntry`,
because contact sweeps from the tick-entry pose to the settled one and needs the
joint the body actually had at each end. Applying this tick's plane to last tick's
hand would sweep a forearm from a joint the body never occupied.

`PosedArm::elbow` is published in world space so `crates/web` and `crates/lab` can
build the same seven volumes without reaching for `Elbow`, which stays `pub(crate)`.
On the browser side the forearm's `lower` **is** that elbow to the raw unit, which is
what let `client/src/arena/scene.ts` stop inventing one; `elbowOf` survives as the
fallback for a single-link body, and its own doc records that the invention was
overruled on 43-68% of recorded arm rows.

Three things this plan did not know:

- **`World::swept_regions` had to grow to seven and the observation had to stay at
  five**, and the two decisions point in opposite directions on purpose. The first is
  an oracle checking the solver's own answer and cannot check a row it cannot see;
  the second is a targeting view, a forearm is not separately targetable, and
  widening it would move `FEATURE_LAYOUT_VERSION` and every trained checkpoint's
  input shape -- which is session 09's business.
- **`TRACE_SCHEMA` moved 5 -> 6.** `pose.regions` stopped being parallel to
  `regionNames`, which is a column changing meaning rather than one being added. The
  live and traced paths agree at seven rows --
  `a_live_fight_matches_the_traced_fight` passes on 3,601 and 641 recorded frames --
  and a schema-5 file would have failed inside a pose diff instead of at the door.
- **`emit_abi.rs` asserted `REGIONS_PER_BODY == POSE_BODY_PART_COUNT`.** They are now
  two numbers; the assertion states `+ 2` and says why the pose block's per-region
  arrays stayed five.

One thing the swing plane learned carried straight over, in a milder form: the fork
[session 03](embodied-03-embodied-model-scaffold.md) made kept the three articulated
digests still but did **not** protect the replay codec, which read both schemas at
`ARTICULATED_PAYLOAD_BYTES`. The same shape here would have been a reader assuming
five volumes because `AnatomyRegion::COUNT` is five -- and there were six of them, all
found by the rename rather than by inspection.

### The forearm collider

**`ARTICULATED_STREAM_DIGEST` moved and it is the only pin that did**, predicted in
writing before anything was run: `0x686ecf8a2f5dd479` -> `0x2a34c9104bdf18b9` on the
default build and `0xde453a669e770512` -> `0x9e9442671b790fb2` on the exact one, with
`REGION_LAYOUT_VERSION` 1 -> 2 beside it. It is a **layout** move rather than an
extension or a values move: the region section went from five rows a body to seven, so
its words and everything after them in each tick's stream shifted.

**That the fight did not change is measured rather than argued**, which is what the
prediction was owed. `the_region_section_is_the_whole_of_the_forearm_digest_move`
recomputes the digest with the region section suppressed and gets
`0xc6482a30f399d2cb` -- the same suppression measured on `b453ca1` in a throwaway
worktree before any of this landed -- so every pose, event, projectile and stance word
of all twenty ticks is byte-identical. It supersedes
`the_stance_section_extends_the_digest_without_disturbing_its_prefix`, whose constant
was a stream with a five-row region section and can no longer be computed.

Everything else answered what it answered: `LAB_HASH` `0xfe31370e141ef531`,
`CONTACT_BEHAVIOR_DIGEST` `0x587b0259e877105a` over the same 3,548 bytes,
`COMBAT_GEOMETRY_HASH` `0x9d15344883cf6e9c`, `ARTICULATED_COMMAND_HASH`, both exact
digests, `LEARNED_INFERENCE_DIGEST`, every legacy golden, both scenario fingerprints
and the legacy feature prefix. `lab articulated --seeds 400 --mirrored` answers the
same fixture pair, the same 285/299 split, the same 1,761,481 resolutions and the same
337 severances -- articulated bodies get `[None; 2]` elbows, so their arm volume is
still shoulder-to-hand and volumes 5 and 6 are absent.

**The three warm-up plateaus in `client/test/wasm-memory.test.mjs` all moved and none
of the loop counts needed to.** Re-traced: the contact fixture 266 -> 265 with its
settling round 10 -> 16; the articulated stress fixture 302 -> 305 with its settling
round 12 -> 4; the arena warm set 236 -> 238, still settling on round one. The session
grew `MAX_REGIONS` by 4,096 bytes and one fixture came back a page *smaller*, which is
the fourth reading in a row saying those figures are records of dlmalloc's arena and
never budgets.
