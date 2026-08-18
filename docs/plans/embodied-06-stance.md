# Embodied 06 -- stance: hips, pelvis, and a twist budget that forces a step

**Status:** sim side complete, landed 2026-08-17. The `EMBODIED_STANCE_V1`
publication is the one outstanding piece and is the only predicted pin move in the
plan.

Legs and torso are automatically controlled, as they are in the source material.
There is no leg command and there will not be one. What this session adds is the
*constraint* the legs impose: hips that turn slower than the torso, a bounded twist
between the two, and a forced step when the budget runs out.

## Why hips and not knees

With locomotion automatic and no jump or crouch, the depth of legs in the source
material is stance and footwork -- where your weight is, which way your hips face,
and whether you can bring a weapon round without repositioning. Knee angle is a
thing a renderer solves from foot and pelvis positions and it changes no decision.
Modelling it would add two joints, four collider segments and a hash block per body
in exchange for nothing a policy could act on.

## State, and one field the plan asked for that is not there

```rust
pub struct StanceState {
    pub hip_yaw: Angle,
    pub hip_yaw_speed_turns: Fx,
    pub hip_authority_residue: Fx,
    pub pelvis: Fx,
    pub step_left: u8,
}
```

**`twist` is not a field.** The plan listed one; it is
`body_yaw.delta(hip_yaw)`, derived wherever it is wanted, because a stored copy is a
second thing that can disagree with the two angles it is a function of -- and the
clamp that bounds it already lives on the torso's target rather than on a column. It
is absent from the hash for the same reason: both angles are already in that stream,
so hashing the difference would be hashing one fact twice and would let a future
change to the derivation disagree with itself.

`hip_authority_residue` is present and the plan did not list it. `integrate_yaw`
carries a sub-raw accumulator so that a fractional authority does not round to zero
every tick; hips need their own or they would share the torso's and steal from it.

`body_yaw` keeps its current meaning exactly -- it is the *torso* -- so
`BodyYawState` is unchanged and the [yaw integration
rules](../reference/articulated-actuators.md#yaw-integration) continue to govern it.
What changed is that the torso is now measured against the hips rather than being
the only thing there is.

## The phase, and where the alias finally broke

`EMBODIED_PHASES` stopped being an alias of `ARTICULATED_PHASES` here, which is
exactly where [session 05](embodied-05-torso-relative-command.md) predicted it would.
But it did not become a second hand-typed table: **every row is now a named
constant** and the two tables list names. A divergence is a substituted name in a
list, and an omission is a missing name rather than a missing closure, so the hazard
[session 02](embodied-02-phase-schedule-and-seams.md) removed stays removed.

The two tables differ in exactly one row: `P_BODY_YAW` becomes `P_STANCE`, in the
same slot. It sits there deliberately -- everything after it (grips, arms, geometry,
contact) reads a settled torso, and moving the row would change what those four see
rather than what the hips do.

`drive_stance` does hips and torso together because the two constrain each other
inside one tick: the torso's reachable target depends on where the hips ended up, and
whether a step is forced depends on what the torso was asking for. Two phases would
impose an ordering between them that neither wants.

## The rules

**Hips chase, and what they chase depends on whether the body is moving.** A
translating body turns its hips toward `move_dir`; a stationary one turns them
toward the torso, at half the rate. That asymmetry is the mechanic -- a body already
committing its feet reorients for free, and a planted one pays.

**The torso's target is clamped into the twist budget**, around the hips as they now
are. Clamping the *target* rather than the step is what stops the torso saturating
and sitting at the limit with a permanent error: the integrator converges on a
reachable angle and stops, exactly as it does when the request was inside the budget
all along. It also means `integrate_yaw` needed no change.

**A request the budget refused arms a step.** During one the hips turn at the full
rate and move authority is reduced.

**Move authority is applied at the point of use, not written into a column.** The
`move_authority` column is the *anatomy's* -- what the legs are still capable of
after injury -- and `settle_anatomy` rewrites it every tick, near the end of the
schedule. A forced step is a transient claim on the same budget, so `moving_authority`
combines the two where movement reads it. Writing it into the column would have been
silently overwritten before movement saw it, and the step would have been free.

**Pelvis height is derived, never commanded**: the standing height less a speed term
less a twist term, each clamped, evaluated left to right with the grouping written
down, because `Fx` truncates and a reordering is a different number.

## Shoulders move, and one door makes everything follow

`stance_anatomy` returns the body with its `shoulder_height` and `standing_height`
lowered by however far the pelvis has sunk, and `posed_anatomy(i)` is the **one
door** every consumer that computes a shoulder now reads: the arm integrator, the
contact phase's arm capsule, and the observation's opponent regions. Threading the
drop into the *spec* rather than into four `limb.rs` signatures is what keeps
`limb.rs` unchanged and every existing call site reading zero, and it is why a
lowered pelvis cannot move one of the three consumers and leave the other two where
they were -- the failure `limb::arm_polyline` closed one layer down.

**The region volumes are deliberately not lowered, and the limit is worth stating.**
This is a pelvis that shifts weight, not one that changes what a blow can reach. A
crouch that also shrank the torso capsule would change which region a sweep selects,
which is a much heavier mechanic than the twist budget is asking for, and it is not
what these constants were bounded against.

## Constants, each bounded from both sides

Every one is a placeholder until a sweep produces it, and each names the sweep it
owes -- `lab articulated --seeds 400 --mirrored` against the embodied corpus. In the
meantime each is bounded from **both** sides by the decision it encodes, because a
one-sided bound is satisfied by a range wider than the decision and this repository
has shipped two of those in one session.

| constant | value | bounded by |
|---|---|---|
| `STANCE_TWIST_LIMIT_RAW` | a sixth of a turn | `the_twist_limit_is_bounded_from_both_sides` |
| `STANCE_HIP_STANDING_SPEED_RAW` | half the torso's | `the_standing_hip_rate_is_bounded_from_both_sides` |
| `STANCE_STEP_MOVE_AUTHORITY_RAW` | a half | `the_step_authority_is_bounded_from_both_sides` |
| `STANCE_STEP_TICKS` | 24 | `a_forced_step_outlasts_the_turn_it_exists_to_make` |

That last one is the least obvious and the most useful: a step shorter than the time
the hips need to cross the budget ends with the twist still saturated and re-arms
immediately, which is a stutter rather than a step. The test derives the crossing
time from the other two constants, so it cannot go stale when either moves.

## Tests

- `a_torso_cannot_turn_past_its_hips_by_more_than_the_twist_budget`
- `a_saturated_twist_forces_a_step_and_the_step_recovers_it` -- both halves: the
  step arms on the first refused tick, and six hundred ticks later the body has
  actually arrived and is no longer wound to its limit
- `a_moving_body_turns_its_hips_faster_than_a_standing_one` -- **raced against the
  same target**, which the first draft was not. `move_dir` is torso-relative, so
  "walk forward" names a direction that turns with the body, and comparing a walking
  body against a planted one measures the target rather than the rate. The test
  records why.
- `pelvis_height_falls_with_speed_and_with_twist_and_is_never_commanded`
- `a_forced_step_reduces_move_authority_for_exactly_its_duration` -- and asserts it
  is a cost rather than a stun
- `the_shoulder_follows_the_pelvis_and_the_arm_follows_the_shoulder`, which also
  asserts the shoulder and the hand sank by the *same* amount
- `an_articulated_body_has_no_stance_row` -- the guard, over both other models
- `an_embodied_duel_equals_the_articulated_duel_while_its_stance_is_inert` -- session
  03's equality, narrowed a second time and for the second measured reason. It now
  requires zero yaw **and** zero movement, and it asserts the stance stayed squared,
  so it cannot pass because both sides drifted somewhere that agreed. Its setup
  squares the hips as well as the torso; the first draft squared only the torso,
  which is a body wound to its limit -- the opposite of inert -- and the test said so
  immediately.

**Shown failing.** Raising `STANCE_TWIST_LIMIT_RAW` past a half turn turns three
tests red -- the two-sided bound, the forced-step arming, and the step-duration
coherence -- and leaves the other 634 green.

## What is outstanding

The `EMBODIED_STANCE_V1` publication: one record per live embodied body carrying
`entity_index generation hip_yaw_raw pelvis_raw twist_raw step_left`, on the
`DUNGEON_OBJECT_V1` pattern. `World::stances()` and `sim::StanceView` are in place
for it to read -- a view rather than the column, for the reason `ArticulatedPose` is
a view, and with `twist_raw` derived at the boundary so a consumer cannot be handed
one that disagrees with the two angles it sits between.

## Hash expectation

**`ARTICULATED_STREAM_DIGEST` moves, by extension, and it is the only pin that
moves.** Its rule is every published word of every publication, so a fifth section
reaches it even though its twenty-tick fixture contains no embodied body: the new
tail is a zero length and a zero drop count, and their presence is the change. This
is the same shape of move v2-ui-06 made when the region section landed, and the
pose-and-event-and-region prefix of all twenty ticks must stay byte-identical --
which is the property that distinguishes an extension from a layout change and must
be asserted rather than claimed.

Everything else holds still, and the sim side has already been measured holding
still: `LAB_HASH` answers `0xfe31370e141ef531`, `duel --seeds 400` answers 238/162 at
59.5%, and `articulated --seeds 400 --mirrored` answers the same fixture pair, the
same 285/299 split, the same 1,761,481 resolutions and the same 337 severances.
`FRAME_LAYOUT_VERSION`, `POSE_LAYOUT_VERSION`, `REGION_LAYOUT_VERSION`,
`COMBAT_EVENT_LAYOUT_VERSION`, `ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
`COMBAT_GEOMETRY_HASH`, both exact digests and every legacy pin are untouched.
