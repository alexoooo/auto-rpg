# Embodied stance and elbow constants

**Purpose:** Record where every embodied stance and elbow constant's value actually came from — which were measured, which were derived from another constant, which were judgements — and the alternatives argued down while choosing them.
**Status:** current
**Canonical source:** this record, [`actuator.rs`](../../crates/sim/src/combat/actuator.rs#L34) and [`limb.rs`](../../crates/sim/src/combat/limb.rs#L45); the [embodied actuator contract](../reference/embodied-actuators.md#constants-and-where-each-number-comes-from) owns the constants table itself
**Update when:** A stance or elbow constant moves, a sweep is finally run for one of them, or a bound test changes what it asserts.

The [embodied actuator contract](../reference/embodied-actuators.md) is the contract: it
names each constant, its value and a one-line provenance, and a reader who needs to know
*what the number is* should stop there. This document is the evidence behind those
one-liners — how each value was arrived at, what was rejected on the way, and what holds
it in place now. It exists because the ten-document `embodied-*` plan set is deleted by
the commit that finishes the topic, and several of these arguments exist nowhere else.

## The finding: there were no sweeps

The closing item this record discharges asked for "the stance and elbow constants, with
their sweeps". **There are no sweeps. Not one of these twelve constants was chosen by
running a corpus over candidate values**, and saying so is the whole of the honest
version of this document. The source says as much where it can be read beside the
numbers themselves:

> Every one is a placeholder until a sweep produces it, and every one is bounded from
> both sides by the decision it encodes rather than by one side of a range.

That is the stance block's own header comment in
[`actuator.rs`](../../crates/sim/src/combat/actuator.rs#L34), and it is still true. What
the plan set produced instead of sweeps is a *decision* per constant, written down with
both of its failure modes, and a test that fails if the value leaves the range the
decision implies. That is weaker than a sweep and stronger than a bare number, and it is
what there is.

Three further facts sharpen that rather than soften it:

- **The sweep the constants name cannot measure them.** The block comment names the debt
  as `lab articulated --seeds 400 --mirrored` against the embodied corpus. `lab
  articulated` runs `Scenario::articulated_duel` or a configured duel built from it, and
  an articulated body has no stance column at all — `an_articulated_body_has_no_stance_row`
  is the assertion that it does not. The embodied corpus is driven by `lab embodied`,
  which did not exist when the debt was written. **The owed sweep, as spelled, is
  unrunnable**; whoever pays it will be writing a harness, not typing a recorded command.
- **The repository's only actuator sweep harness varies two constants, and neither is one
  of these.** `strike-corpus --calibrate-actuator` steps a four-rung ladder of
  `(bearing_max_speed_raw, bearing_accel_raw)` over the striker corpus, bracketing every
  candidate between two production controls asserted byte-for-byte equal. There is no
  candidate type for a hip rate, a twist budget or an elbow stop.
- **One constant does have a measured ladder in its ancestry**, and exactly one:
  `ELBOW_PLANE_MAX_SPEED_RAW`, because it is defined as `ARM_BEARING_MAX_SPEED_RAW`,
  which that ladder chose. See [below](#the-one-number-with-a-ladder-behind-it).

## How each number was actually chosen

The values live in the
[contract's table](../reference/embodied-actuators.md#constants-and-where-each-number-comes-from)
and are not repeated here. This is the *kind* of evidence each one has.

| Constant | How the value was chosen | What holds it there now |
|---|---|---|
| `STANCE_TWIST_LIMIT_RAW` | a judgement about play, with both failure modes named | [`the_twist_limit_is_bounded_from_both_sides`](../../crates/sim/src/world/mod.rs#L3165) |
| `STANCE_HIP_MOVING_SPEED_RAW` | derived: the torso's own rate, unchanged | [`a_moving_body_turns_its_hips_faster_than_a_standing_one`](../../crates/sim/src/world/mod.rs#L3045) |
| `STANCE_HIP_STANDING_SPEED_RAW` | derived: half the moving rate, and the ratio is the mechanic | [`the_standing_hip_rate_is_bounded_from_both_sides`](../../crates/sim/src/world/mod.rs#L3175) |
| `STANCE_HIP_ACCEL_RAW` | derived: the torso's acceleration, unchanged | nothing bounds it; it is an equality by definition |
| `STANCE_STEP_TICKS` | arithmetic on the two rates, plus one upper judgement | [`a_forced_step_outlasts_the_turn_it_exists_to_make`](../../crates/sim/src/world/mod.rs#L3216) |
| `STANCE_STEP_MOVE_AUTHORITY_RAW` | a judgement: not zero, not one | [`the_step_authority_is_bounded_from_both_sides`](../../crates/sim/src/world/mod.rs#L3183) |
| `PELVIS_HEIGHT_RAW` | anatomy: the pelvis is halfway up a standing body | [`pelvis_height_falls_with_speed_and_with_twist_and_is_never_commanded`](../../crates/sim/src/world/mod.rs#L3083), on the base value only |
| `PELVIS_SPEED_DROP_RAW` | a judgement, "small on purpose", with no bound on the magnitude | the same test, in direction only |
| `PELVIS_TWIST_DROP_RAW` | the same judgement, stated twice deliberately | the same test, in direction only |
| `ELBOW_PLANE_MAX_SPEED_RAW` | derived from a **measured** constant | [`the_elbow_plane_rate_is_bounded_from_both_sides`](../../crates/sim/src/world/mod.rs#L3203) |
| `UPPER_ARM_FRACTION_RAW` | a refusal to invent an asymmetry, not a measurement | [`an_elbow_stop_is_a_fold_and_not_a_hinge`](../../crates/sim/src/combat/limb.rs#L745), which bounds what the equality forces |
| `ELBOW_MIN_INCLUDED_ANGLE_RAW` | anatomy: where a human elbow meets its own bicep | the same test, from both sides |

**`STANCE_HIP_ACCEL_RAW` is the one row with no bound at all**, and that is defensible
rather than an oversight: it is `BODY_YAW_ACCEL_RAW` by definition, so a test would have
to either restate the definition — passing whatever either number became — or invent a
second claim about hip acceleration that nothing in the model makes. What differs between
hips and torso is the ceiling they accelerate towards, not how hard they can push.

### The twist limit is a decision with two named failure modes

A sixth of a turn, sixty degrees. The argument is entirely about what a fighter can do
without moving their feet, and both ends were written before the value:

- **below about a tenth of a turn**, an ordinary guard change forces a step, so footwork
  stops being a choice and becomes a tax on aiming;
- **at or above a quarter turn**, a fighter covers both flanks without moving, and the
  constraint buys nothing a free torso did not already give.

The test asserts exactly those two — `limit > 65_536/10` and `limit < 65_536/4` — so the
admissible band runs 36° to 90° and the value sits near its middle. That is a real
constraint on the number, and it is not a measurement of anything.

### The hip rates are the torso's, once and halved

`STANCE_HIP_MOVING_SPEED_RAW` is `BODY_YAW_MAX_SPEED_RAW` exactly, because a body already
committing its feet should not pay for the turn twice; `STANCE_HIP_STANDING_SPEED_RAW` is
half of it. **The asymmetry, not either value, is the mechanic.** Equal rates delete the
decision the session exists to create; a standing rate near zero leaves a planted fighter
unable to answer anything off its centre line. Two tests split that claim in half — one
asserts the strict inequality through actual driven ticks, the other the range — and the
driving one carries a correction worth keeping. Its first draft raced a walking body
against a planted one, and `move_dir` is torso-relative, so "walk forward" names a target
that turns with the body: the test measured the target rather than the rate. Both bodies
are now given the same hip target.

Neither rate bottoms out in a measurement. `BODY_YAW_MAX_SPEED_RAW` is
`floor(65_536 / 120)` and `BODY_YAW_ACCEL_RAW` is `floor(65_536 / 720)` — a turn in two
seconds, full speed in six ticks — chosen as exact divisions and recorded as
[normative](../reference/articulated-actuators.md#yaw-integration). The
[v2 actuator sweep](v2-actuator-sweep.md) is the only record that touches them and it is
a *trace* record: it freezes those inputs and pins what the integrator does with them,
which says nothing about why they are those numbers.

### The forced step is arithmetic on the other two

`STANCE_STEP_TICKS` is 24, and its lower bound is derived rather than judged: crossing a
sixth of a turn at the moving rate takes `10_922 / 546`, twenty ticks, so a step shorter
than that ends with the twist still saturated and re-arms immediately — a stutter rather
than a step. The test computes that crossing time **from the other two constants**, so it
cannot go stale when either moves. Only the upper bound is a judgement: under sixty ticks,
because a step longer than a second commits a fighter for a visible age.

This is the most defensible number in the set, and the reason is worth naming: it is the
only stance constant whose bound is a function of the model rather than an opinion about
play.

### The step's movement cost is a half, and both ends are named

**Not zero and not one.** Zero makes a forced step a stun, which is a much heavier
mechanic than "your feet are busy"; one makes it free and the constraint decorative. The
bound test asserts `0 < authority < 1`, which is a wide band, and the value's position
inside it is a choice nothing has measured. The paired test asserts the *duration* — the
cost lands for exactly the ticks the step runs and not one more — which is the half of the
claim that could actually regress.

### The pelvis constants are the weakest-evidenced numbers here

`PELVIS_HEIGHT_RAW` is half of standing height: anatomy, and the only one of these twelve
numbers anybody could check against a body.

The two drop terms are a judgement, and their test bounds them **in direction only**. It
asserts that speed lowers the pelvis, that twist lowers it, and that a squared standing
body sits at the base height — nothing asserts how far, so the magnitude is satisfied by
any positive value. That is exactly the one-sided-bound shape AGENTS.md warns about, and
it is recorded here rather than repaired, because the repair is a decision about how deep
a weight shift should be, which is a sweep's answer and not a documentation session's.

Two things stop it mattering as much as it looks. The drop is small by construction — each
term is a twentieth of standing height — and **the region volumes are deliberately not
lowered with it**: this is a pelvis that shifts weight, not one that changes what a blow
can reach. A crouch that also shrank the torso capsule would change which region a sweep
selects, which is a much heavier mechanic, and *these constants were never bounded against
it*. The two terms are separate constants because they are separate claims: a body can be
sprinting square-on or standing wound up, and one combined number could express neither.

### The elbow stop is anatomy

Forty degrees, "about where a human elbow meets its own bicep". The bound test is
two-sided and both ends are geometric consequences rather than opinions: under ten degrees
the arm folds flat and the hand could reach its own shoulder, and past a right angle a
fighter cannot bring a guard in close enough to hold one. At forty degrees the law of
cosines puts the hand a third of an arm's length from the shoulder, which is what makes
the stop a **fold and not a hinge** — the sentence the contract keeps, asserted here as
`inner < outer/2` over every shipped anatomy.

### Equal links are a refusal, not a measurement

`UPPER_ARM_FRACTION_RAW` is a half, and the interesting part is what that costs: equal
links make the naive inner bound `|upper - fore|` **zero**, a hand that could touch its own
shoulder. The plan considered manufacturing an asymmetry to produce a non-zero inner bound
and rejected it — the joint's own stop already provides one, and choosing link lengths to
make an expression work would be a number invented for arithmetic and then described as
anatomy. So the fraction stays a half and the inner bound comes from
`ELBOW_MIN_INCLUDED_ANGLE_RAW`. **Saying so is the evidence**; there is no sweep.

### The one number with a ladder behind it

`ELBOW_PLANE_MAX_SPEED_RAW` is `ARM_BEARING_MAX_SPEED_RAW`, and that constant was chosen
from a real four-rung ladder — `1_092`, `2_184`, `4_368`, `8_736`, each paired with its
acceleration, 3,600 cases per candidate, every candidate bracketed between two production
controls asserted byte-for-byte equal. The
[calibration record](smart-ai-actuator-calibration.md#result) has the table; the
[2026-08-15 split](smart-ai-actuator-calibration.md#the-split-measured-2026-08-15) is what
eventually promoted the 2× rung, by showing that the `tunnelling` column blocking it held
no defect at all.

The derivation is an argument about what the joint *is*, not a convenience: an elbow
rotating about the shoulder-to-hand axis **is** the shoulder swinging the whole arm about
that axis, and nothing in this model lets an arm turn faster than the bearing ceiling, so
a plane that outran it would be an elbow overtaking the shoulder that carries it. Equality
is the honest reading of "no faster", and a separate constant here would be a number with
no sweep behind it pretending to be a measurement. Its test writes that as an inequality —
`0 < plane <= ARM_BEARING_MAX_SPEED_RAW` — rather than as an equality against the constant
it is defined from, which would restate the definition and pass whatever either number
became; and it adds the property the swept forearm needs, that half a turn of plane change
must cost more than one tick, which at this rate is fifteen.

**It is a rate bound and deliberately not a bill.** The work an arm does about its own axis
is not modelled — `bill_fatigue` charges the hand's travel and the bearing's sweep, both of
which move the hand — so charging a plane change to the fatigue budget would have invented
a cost with nothing behind it. Free and slow is the pair of properties the swept forearm
needs.

## What was measured instead

No constant was swept. Several *consequences* of the constants were, exhaustively, and
those measurements are real numbers with real slack in them.

### The arm-length clamp, swept over its whole commanded range

[`a_hand_can_never_be_further_from_its_shoulder_than_the_arm_is_long`](../../crates/sim/src/world/mod.rs#L2956)
enumerates both bodies × two pelvis heights × four yaws × two limbs × sixteen bearings ×
nine heights × nine reaches and asserts the realised hand stayed on the annulus. **Both
bounds carry the exact slack that was measured**: one raw unit over the outer bound and
three inside the inner one — 1.5e-5 and 4.6e-5 world units — which is three truncations
(the height's quantisation, the reach's, and `length`'s own square root), each of at most
one raw unit and not all in the same direction. Pinning the measured maxima rather than a
generous epsilon is what makes the test catch a regression instead of absorbing one.

The sweep was chosen over sampling because the defect it replaced was not at a corner: the
excess grew with both axes at once, and every one-axis sweep missed it.

### The elbow solution, swept across the annulus and six planes

[`the_elbow_lies_on_both_link_circles`](../../crates/sim/src/combat/limb.rs#L581) sweeps
seventeen radii across the reachable annulus at four bearings, four yaws, both limbs and
six commanded planes. The measured maximum error off either link circle is **four raw
units**, and it is exact from both sides: three fails, and five would pass on an error that
had already grown.

**The re-measurement contradicted the expectation, which is why it is worth recording.**
The guess when the commanded plane landed was that its extra `Fx` product and second
per-axis `mul_div` would cost a raw unit or two. They cost none — four was the maximum
before the rotation and four is the maximum after it. Widening the tolerance "because the
rotation must cost something" would have been a range chosen to absorb the next regression.

### The defect the two-link arm was built to fix, measured on recorded fights

The strongest measured evidence in the elbow work is not about a constant at all. It is the
size of the hole: `limb::hand_position` placed the hand at `physical_reach` in the
horizontal plane and then overwrote `hand.z`, so the true shoulder-to-hand distance was
`sqrt(physical_reach^2 + dz^2)` and **the reachable set was a cylinder shell rather than a
sphere**.

How often that actually bit was measured on the browser side, over recorded fights, and it
is recorded on [`elbowOf`](../../client/src/arena/geometry.ts#L645): the shoulder-to-hand
distance is at or past `armLength` on **43% of `fight.json`'s 14,404 arm rows, 68% of
`fight-windmill.json`'s and 67% of `fight-learned.json`'s**, with medians of 0.95, 1.04 and
1.07 times `armLength` and a maximum of 1.62. On every one of those rows the client's
invented elbow collapses onto the midpoint of the published capsule — the invention was
overruled by the simulation about half the time.

That number is why the clamp is a mechanics fix rather than an animation one, and why the
published forearm replaced the invented elbow instead of merely improving it. It lives in a
source comment that survives the plan set; it is cited here because this is the document
that has to explain why an elbow was worth building.

### The corpus that would notice any of these drifting

The stance and elbow constants have no gate of their own. What they have is
`EMBODIED_CORPUS_DIGEST`, one number over eight seeds of both embodied fixtures in both
orientations, which `cargo test -p lab` runs — see
[the corpus record](embodied-corpus-and-high-ground.md#the-registered-pin). Any change to
any constant on this page moves it. That is a detector and not a measurement: it says a
number changed the fight, never whether the change was an improvement.

## Rejected alternatives

These are the arguments that die with the plan set, so they are recorded rather than
summarised.

**Stance**

- **Knees.** With locomotion automatic and no jump or crouch, the depth of legs in the
  source material is stance and footwork — where your weight is, which way your hips face,
  and whether you can bring a weapon round without repositioning. Knee angle is something a
  renderer solves from foot and pelvis positions and it changes no decision. Modelling it
  would have added two joints, four collider segments and a hash block per body in exchange
  for nothing a policy could act on.
- **A stored `twist` field.** The plan listed one. It is `body_yaw.delta(hip_yaw)`, derived
  wherever it is wanted, because a stored copy is a second thing that can disagree with the
  two angles it sits between — and it is absent from the hash for the same reason: both
  angles are already in that stream.
- **`STANCE_STEP_COST_TURNS_RAW`.** The overview's constant list named a "yaw the hips
  recover per forced step". It was never implemented and does not exist: a step is a
  *duration* during which the hips turn at the full rate, not an instantaneous recovery of
  some angle. `STANCE_STEP_TICKS` is what replaced it, and the replacement is what made the
  duration bound derivable from the hip rate instead of being a third invented number.
- **Clamping the torso's step instead of its target.** Clamping the *target* into the twist
  budget is what stops the torso saturating and sitting at the limit with a permanent
  error: the integrator converges on a reachable angle and stops, exactly as it does when
  the request was inside the budget all along. It also meant `integrate_yaw` needed no
  change at all.
- **Writing the step's cost into the `move_authority` column.** That column is the
  *anatomy's* — what the legs are still capable of after injury — and `settle_anatomy`
  rewrites it every tick near the end of the schedule, so the write would have been silently
  overwritten before movement read it and the forced step would have been free. The cost is
  applied at the point of use instead.
- **A separate hips phase and torso phase.** The two constrain each other inside one tick:
  the torso's reachable target depends on where the hips ended up, and whether a step is
  forced depends on what the torso was asking for. Two phases would impose an ordering
  neither wants, and a torso that turned before its hips were consulted would exceed the
  budget for one phase and be pulled back inside it in the next — a body that flickers past
  its own limit every tick.
- **Lowering the region volumes with the pelvis.** Deliberately not done, and it bounds what
  these constants mean: a crouch that shrank the torso capsule would change which region a
  sweep selects. The pelvis moves the shoulder, and through it the arm and the hand; it does
  not move what a blow can reach.

**Elbow and forearm**

- **A commanded elbow.** Rejected in the overview: making the joint an independent input
  doubles the command surface for very little depth. What is worth choosing is the *swing
  plane*, and that is the field that landed.
- **Clamping in hand space.** The obvious spelling — compute the hand, pull it onto the
  annulus, invert back to a target — does not work, because `hand_position` and
  `inverse_hand` are inverses only on the poses `hand_position` can reach. **Measured: a
  clamp to `0.7500` produced a hand at `0.7666`.**
- **Clamping in target space against the asked-for height.** The second draft. `height` is
  quantised on the way through, and for a hand below the shoulder that quantisation makes
  `dz` *larger* — so the arm came back a raw unit long again. `reachable_extent` re-measures
  `dz` from the height the forward map will actually produce.
- **Asymmetric link lengths**, to manufacture an inner bound the joint's stop already
  provides. See [above](#equal-links-are-a-refusal-not-a-measurement).
- **The full Rodrigues rotation** for the swing plane. The off-axis direction is
  perpendicular to the axis by construction, so the `(1 - cos)` term multiplies a dot
  product that is zero. The two-term form spends two fewer products *and* reproduces the
  pre-plane answer bit for bit at `Angle::ZERO`, which is the property that let the plane
  land without moving a pin.
- **Returning early on the degenerate vertical axis.** When the shoulder-to-hand axis is
  itself vertical there is no "below" to project, so the zero direction is forward. The
  degenerate case rotates through the same code path anyway: returning early would have made
  the one pose with no natural default also the one pose a policy could not steer.
- **Snapping the held plane to the commanded one.** Required rather than polish. The forearm
  is a swept collider, so a plane that jumped half a turn in one tick would sweep it bodily
  across the body inside that tick and hand the contact solver a closing energy no arm can
  produce.
- **Splitting the arm into upper and fore in the *anatomy*.** That would double the armor
  table and move `BodyPart::COUNT` and `ANATOMY_HASH_ROW_BYTES`. The arm stays one anatomy
  region and becomes two swept *volumes*, which the region-selection tuple already tolerated.
- **An `Option` parameter instead of two constructors.** `arm_polyline` and
  `jointed_arm_polyline` answer different questions, and a caller with no elbow to give
  should not have to say so.

## What a sweep would have to do, when somebody runs one

Recorded because the debt outlives the plan that incurred it.

- **It needs a harness that does not exist.** The command named on the constants,
  `lab articulated`, cannot drive a body with hips. The corpus to sweep against is
  `lab embodied`'s, and the candidate machinery to copy is
  `strike-corpus --calibrate-actuator`'s: a candidate type, a ladder, and every candidate
  bracketed between two controls asserted equal.
- **Three of these constants can be swept without re-tuning the policy, and that is by
  construction.** `ObservedStance` publishes `twist_fraction`, `pelvis_fraction` and
  `step_fraction` — each a ratio of its constant, because the constants are `pub` in
  `combat::actuator` and deliberately not re-exported from `sim`, so a policy handed the raw
  numbers could not interpret them. The scripted policy's own thresholds (`UNWIND_TWIST` at
  seven eighths, `OPENING_TWIST` at three quarters) are therefore fractions of whatever the
  limit becomes, and follow it automatically.
- **What a sweep must not do is tune until the number comes out.** The
  [high-ground measurement](embodied-corpus-and-high-ground.md#where-this-leaves-session-04s-acceptance-criterion)
  made that refusal explicitly and it applies here for the same reason: fitting a constant to
  a corpus is fitting a policy to a corpus one step removed, and the first thing lost is the
  corpus's ability to say anything.
- **Expect `EMBODIED_CORPUS_DIGEST` to move and nothing else.** Every constant on this page
  is read only under `CombatModel::has_stance` or `has_swing_plane`, so no legacy or
  articulated pin can see one, and the digests taken over the articulated payload width are
  forked away from the embodied one on purpose.

## What would invalidate this record

- **A sweep.** The moment one runs, the rows above that say "judgement" are superseded rather
  than merely supplemented, and this is the document its table belongs in.
- **A change to `BODY_YAW_MAX_SPEED_RAW`, `BODY_YAW_ACCEL_RAW` or
  `ARM_BEARING_MAX_SPEED_RAW`.** Four of the twelve constants are defined from those three,
  so moving one moves the derived values without touching a line of this page's subject.
- **A bound test that changes what it asserts.** The bands quoted here are the tests' bands.
  A test relaxed on one side stops defending the decision it was written for, which is the
  failure AGENTS.md names and which the pelvis drop terms already have.
- **Region volumes that follow the pelvis.** These constants were never bounded against a
  crouch that changes what a blow can reach; if one lands, the pelvis numbers need
  re-arguing rather than re-recording.
