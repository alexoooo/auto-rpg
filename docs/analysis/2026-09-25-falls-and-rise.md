# Falls and the rise: why a body falls again, and a rise that stands on its feet

2026-09-25. Release-120 defaults: physics and control at 120 Hz, contacts read on arrival.

The owner's report:

> Right now falls happen very often, and also once you fall you just keep falling again and again.
> Falling from time to time is good, but it feels like too much.
>
> Also visually, when the character gets up from a fall, it looks very unnatural -- like a
> marionette that's pulled up by the shoulders.

**Answer.**

- **Why a body falls again.** Four causes are in the rise and one is in the skeleton's walk.
  - **R1. A rising body was judged on the last stance it had before it fell.** That base was the
    one read on the boundary before the fall, so the centre of mass sat on its edge. A rising body's
    fall line therefore had a median of about 0.02 m/s, and any touch put it back down. Before the
    fix, 126 of stone's 259 falls began in a rise, and 3310 of the skeleton mirror's 7528.
  - **R2. The old rise did not put the feet under the body.** It hoisted the pelvis where it lay
    and dragged straight legs in under it. The body stood up with its feet 0.1 to 0.3 m from its
    hips and its centre of mass up to 163 mm outside its stance. A standing body never steps to
    re-centre, so the next touch felled it. This is also the marionette.
  - **R3. A walking skeleton's centre of mass is off its feet.** See section 5.
  - **R4. A rise under way was refused when the other body fell beside it.** A lying body's
    footprint jumps to its ragdoll, inside the riser's, and the rise gate dropped the riser. This
    was 452 of the skeleton's refused rises.
  - **The rise itself swung the arms into the other body.** The gather turned the pelvis upright
    at up to 5 rad/s, and a rising body's items were the hardest thing a standing one was hit by.
- **What changed.**
  - A staged rise for every biped: gather the feet in, squat, then extend with the trunk rising last
    (`BipedRise` in `src/golem/config.ts`, `bipedRiseFrame` and `bipedRiseLegs` in
    `src/golem/locomotion/biped.ts`).
  - A rising body is judged on the most centred stance it has had, not the last one
    (`readTipping` in `src/supported-locomotion-production.ts`).
  - A lying body no longer refuses a rise already under way (`clearOfOccupants`).
  - The rise's turn is held to 3 rad/s (`BipedRise.turnPeakRadS`).
  - The skeleton's hips sit under its centre of mass (`SKELETON_BIPED.hipAhead` 0.09).
  - The biped's joint slew rate is lifted off a cliff it sat just above at 120 Hz
    (`LOCOMOTION_BIPED.targetRate` 10.5 -> 11.5). This is a walk change and does not move the
    falls.
- **The result** is in section 6.

Every figure names its harness:

- **Node research runner**: `research/fall-loop.mjs`, 96 side-swap blocks a group, cap 150 s,
  seed 20260925.
- **Node rise bench**: `research/rise-bench.mjs`, a headless supported pair 6 m apart. The left body
  is knocked down by a ledger shove at twice its fall line and a 1.5 m/s impulse at the core, then
  watched through its rise and 3 s standing.

## 1. The measurement

`research/fall-loop.mjs` plays each group through the research runner. A per-substep probe
(`research/fall-loop-worker.mjs`) logs:

- every fall: the state it fell from, why, the ledger's reading on that boundary, the centre of
  mass's margin in its base, and the other body's state;
- every rise and how it ended;
- the 3 s after each stand.

The groups:

- **stone**: the four probe minds, all ten pairings;
- **skeleton**: the skeleton-duelist mirror;
- **human**: the humanoid-duelist mirror;
- **multileg** and **wheel**: the duelist and brawler.

### Baseline (Node research runner, HEAD 5ac61ce)

| Group | Falls/min | Down % | Re-fall <=1 s | <=2 s | <=3 s | Falls in a rise |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| stone | 2.51 | 7.9 | 24.4 | 29.4 | 35.3 | 126 of 259 (blow 110, refused 16) |
| skeleton | 17.19 | 63.8 | 41.2 | 63.3 | 75.4 | 3310 of 7528 (blow 2791, refused 519) |
| wheel | 1.96 | 7.6 | 13.1 | 20.4 | 25.1 | 167 of 375 (blow 149, refused 14, deadline 4) |
| multileg | 0.28 | 0.0 | 0 | 0 | 0 | none |
| human | 0.00 | 0.0 | 0 | 0 | 0 | none |

A re-fall is a fall from standing within that long of the body's last stand, as a share of all falls
from standing. A multileg's falls are all "support chain is not live", a leg cut off, and it
never rises from those. The humanoid-duelist mirror never fell in 192 bouts.

By pairing, stone falls are concentrated in the brawler. The brawler mirror runs 8.26 falls/min
and spends 27.8 % of the bout down. Every pairing without a brawler is at or under 1.23 falls/min.

## 2. The causes

The probe logs what fed the ledger on the boundary each body fell, and where its centre of mass
was in its base. Four causes came out of it. None of them is a threshold that is too low.

- **R1. A rising body's stance.** `readTipping` judged a rising body on "the last standing base that
  held the centre of mass". That base is the one read the boundary before the fall. The body was
  about to fall, so its centre of mass sat on the edge of that base. The fall line read on it has a
  median of about 0.02 m/s, and so any contact during the rise, a parry or the other body's
  footprint, felled it again. That was 110 of stone's 126 falls in a rise and 2791 of the
  skeleton's 3310.
- **R2. The rise did not put the feet under the body.** The old rise keyframed the pelvis straight
  up and upright from the first frame, and the legs were dragged in after it from wherever they had
  landed. The Node rise bench measured the result at the moment of standing:
  - the feet 0.1 to 0.3 m from the hips;
  - the centre of mass over the two soles for 0 to 25 % of the rise's second half;
  - the least margin over the 3 s after standing as low as -163 mm, i.e. standing with the centre
    of mass outside the stance.

  A standing body never steps to re-centre itself, so it stood up already falling. This is also the
  marionette the owner saw: the shoulders arrive before the hips, and the legs hang.
- **R3. The skeleton walks with its centre of mass off its feet.** Its centre of mass is 107 to
  130 mm ahead of its pelvis (ribcage, skull and arms forward of a narrow pelvis), and its legs hang
  from the pelvis's centre. The Node research runner's stance probe (`.review/falls/stance.mjs`,
  standing substeps of the skeleton mirror) puts the centre of mass outside the stance for 15 to
  30 % of the time the skeleton is walking fast, and the skeleton-duelist walks faster than
  0.7 m/s for 92 % of the time it stands. At the moment of a standing fall the median margin was
  -16 mm and the median fall line 0 m/s. Any blow at all fells a body in that state: 2860 of the
  skeleton's 3389 re-falls within 2 s had a blow on that boundary that was past the line by itself.
- **R4. A rise was refused because the other body lay down beside it.** The rise gate asks, at every
  boundary of a rise, that the target be clear of the other footprint. A fallen body's footprint is
  its ragdoll root, not its carrier. So when the other body went down during this body's rise, its
  footprint jumped from its carrier, which was at exact contact, to its pelvis. That pelvis was
  inside this body's footprint, and the riser was dropped within a median 0.01 s. The same happened
  against a ragdoll that was still settling. Of 452 refused rises on the skeleton, 443 were
  against a lying body; stone had 18 of 19, and the wheel group 24 of 24.

What is not a cause:

- **The human does not fall.** The humanoid-duelist mirror never fell in 192 bouts.
- **The multileg does not rise, by design.** Its falls are all a leg severed, which it does not
  get up from.
- **Stone's brawler falls because it fights at contact.** The stone falls that remain are
  concentrated in the brawler, whose pairings run 1 to 3 falls/min. That was the subject of the
  rate-falls study (`docs/analysis/2026-09-25-rate-falls.md`): close-contact geometry under a held
  step. It is a fight at contact, not a loop.

## 3. The staged rise

`BIPED_RISE` in `src/golem/config.ts` holds the table and `bipedRiseFrame` and `bipedRiseLegs` in
`src/golem/locomotion/biped.ts` the code. The pelvis stays keyframed and the legs are driven by
their own motors. Each substep, the leg targets are solved by two-link IK for where the pelvis is,
so that each foot stands under its hip with its sole level.

1. **Gather** (at least 0.3 s). The knees fold to 1.6 rad and the feet are pulled in under where the
   body will stand. The pelvis turns from however it lay to upright, pitched 0.35 rad forward, and
   moves to squat height, a fifth of a thigh behind the feet.
2. **Hold** (0.2 s). Both soles are on the floor under the body.
3. **Extend.** The legs straighten, the hips travel forward over the feet, and the trunk holds its
   pitch through the first 35 % of the extension, so the trunk comes up last: it is still pitched
   0.16 to 0.22 rad forward when the pelvis has made nine tenths of its height (stone and human,
   Node rise bench).

The shoulders make half their height a little before the hips do (0.47 s against 0.54 on stone's
fall onto its back), because sitting up out of the lying pose is most of the shoulders' gain and
that happens in the gather. By nine tenths the two arrive within 0.04 s of each other. What the
marionette lacked was not that order but feet: the old rise lifted the shoulders with the legs
still lying where they fell.

Every lift is a smoothstep held to `KNOCKDOWN.risePeakMps` (0.9 m/s). The rise's length is
`bipedRiseDurationS`, which `risingDuration` takes the larger of against the settle rule. The
recovery stat still divides it (`recoveredRiseS`).

The skeleton runs `trunkPitch` 0 and `hipsBack` 0.3 (`SKELETON_BIPED.rise`). Its 100 Nm waist at
`fallenTone` cannot hold a pitched ribcage while the pelvis turns under it: at 0.35 rad the core
overshot to +0.46 rad, and the body stood with its centre of mass off its feet.

**Nothing in the rise asks for support it does not have.** The gate is unchanged: settled, dwell,
live support chain, ground, occupancy. The feet are placed by the rise itself; they are not required
to be planted before it starts.

**What it costs.** The stages cost about 0.2 s a rise, the hold plus a longer path for the pelvis:
1.04 to 1.47 s against the hoist's 0.84 to 1.27 s (Node rise bench). The turn cap below adds
another 0.1 to 0.3 s, for 1.13 to 1.58 s. The owner asked for about 1 s. Every stage is bounded by
the same 0.9 m/s lift and 3 rad/s turn, so a shorter rise means a faster one, and the fast turn is
exactly what was clubbing the other body.

### The gather's turn is capped

The first staged rise turned the pelvis from however it lay to upright within the 0.3 s gather: 1.5
to 2.5 rad in 0.3 to 0.8 s, peaking at 3 to 5 rad/s. The arms hang from the trunk, so that turn
swings them and whatever they carry at 5 to 6 m/s (Node rise bench, `--speeds`), and a rising
body's blade or plate is then a club swung at whoever is standing next to it. A per-attacker census
of six skeleton mirrors (Node research runner, `.review/falls/strikers.mjs`) found the biggest
shoves on a standing skeleton came from a *rising* opponent's items, at 0.2 to 0.4 of its rise:
p90 15.6 Ns, against 5.4 from a standing opponent. With the rise itself fixed, 30.6 % of the
skeleton's standing falls happened while the other body was rising.

`BipedRise.turnPeakRadS` holds the turn to 3 rad/s: the gather lasts at least `1.5 x turn /
turnPeakRadS`, where the turn is the angle from the pelvis's lying rotation to its squat rotation
(`bipedRiseTurnRad`). The port asks for the duration with the carrier's yaw
(`risingDuration(distanceM, yaw)`), and the plan is made once, at the rise's first frame, from the
actual turn. `the_staged_rise_turns_the_pelvis_no_faster_than_its_table_allows` in
`tests/golem-locomotion.test.mjs` pins it for stone, skeleton and human; removing the turn term
turns it red at 3.88 rad/s.

Node rise bench, back / front / side; item p90 is the 90th percentile of the fastest carried part's
speed over the rise:

| body | cap rad/s | rise s | item p90 m/s | planted before lift s |
| --- | --- | --- | --- | --- |
| stone | none | 1.42 / 1.04 / 1.05 | 6.64 / 5.16 / 5.73 | 0.32 / 0.04 / 0.25 |
| stone | **3** | 1.54 / 1.13 / 1.36 | 5.19 / 4.83 / 3.20 | 0.32 / 0.13 / 0.29 |
| stone | 2 | 2.02 / 1.40 / 1.74 | 2.84 / 3.54 / 2.13 | 0.37 / **0.00** / 0.30 |
| skeleton | none | 1.40 / 1.28 / 1.25 | 4.74 / 5.12 / 5.03 | 0.09 / 0.09 / 0.09 |
| skeleton | **3** | 1.43 / 1.39 / 1.50 | 4.70 / 4.43 / 3.36 | 0.09 / 0.09 / 0.09 |
| skeleton | 2 | 1.83 / 1.78 / 1.94 | 3.53 / 2.94 / 1.90 | 0.09 / 0.09 / 0.09 |
| human | none | 1.47 / 1.41 / 1.38 | 3.83 / 2.61 / 3.14 | 0.04 / 0.03 / 0.03 |
| human | **3** | 1.58 / 1.41 / 1.38 | 3.23 / 2.61 / 3.14 | 0.04 / 0.03 / 0.03 |
| human | 2 | 2.05 / 1.58 / 1.75 | 2.17 / 2.22 / 2.16 | 0.02 / 0.03 / 0.04 |

And the skeleton mirror (Node research runner, 192 bouts, everything else as shipped):

| cap rad/s | Falls/min | Down % | Re-fall <=2 s % | Rise p50 s |
| --- | ---: | ---: | ---: | ---: |
| none | 9.99 | 42.3 | 49.7 | 1.31 |
| **3** | 9.18 | 44.1 | 46.5 | 1.58 |
| 2 | 8.53 | 48.9 | 47.8 | 2.08 |

3 was chosen. 2 buys another 0.65 falls/min, but costs half a second a rise, raises the share of
the bout spent down, and on stone's fall onto its front the gather ends with nothing planted before
the lift.

**Arm hang is not addressed.** The arms follow `Golem.motorTone`'s climb back to full tone, and the
arm drives belong to the other Release-120 task. The bench's "arm hang" column (the hands' height
below the shoulders at the end of the rise) is reported in section 6.

## 4. A rising body on its most centred stance

`readTipping` now keeps, of every standing base the body has had, the one with the largest
centre-of-mass margin (`hullCentreMarginM` in `src/tipping.ts`, the signed distance from the centre
of mass's ground point to the base's nearest edge). A rising body is judged on that base, placed
around where its centre of mass is now, at its live height and gyration.

- **Why that base.** A body that has stood has shown what its stance is. The base it had at the
  instant of its fall is the least representative one it will ever have.
- **Why not the live base.** A live reading of what is on the floor midway through a keyframed rise
  is a keyframe's reading, not a body's. Judging a rising body on its live base was tried: the
  skeleton's "a staggering blow during a rise puts it down" test then failed, because a blow landing
  during the gather found nothing under the centre of mass.

No blow is exempt: a rise is put down by the ledger exactly as a standing body is.

The rise gate has a matching change (R4, `clearOfOccupants` in
`src/supported-locomotion-production.ts`):

- **A lying body still reserves its footprint against a rise that has not begun.** The recovery
  rings still go around it.
- **It no longer refuses a rise already under way.** The riser is a keyframed body, and the solver
  moves the ragdoll out of its way.
- **A standing or rising body still refuses a rise under way.**

`a_rise_under_way_is_not_put_down_by_a_lying_body_but_is_by_one_walking_in` in
`tests/supported-locomotion-obstacles.test.mjs` pins the pair. Deleting the rule turns its first half
red. Extending the rule to every occupant turns its control red.

## 5. The skeleton

**Its hips are moved under its centre of mass.** `LocomotionBiped.hipAhead` (0 for every other
biped) moves the legs' mounting points forward along the pelvis by that share of the hip's width,
in the build and in `bipedPose` and `bipedFootSpeed`, so the feet land where the mass is.
`SKELETON_BIPED.hipAhead` is 0.09. The choice, from its doc comment in
`src/golem/skeleton/body.ts` (stance probe and Node research runner, skeleton mirror, before R4 and
the turn cap):

| hipAhead | Outside at speed | Slow-walk CoM ahead of soles | Falls/min | Down % | Re-fall <=2 s % |
| --- | --- | --- | ---: | ---: | ---: |
| 0 | 33 % | 73 mm | 13.85 | 58.2 | 66.7 |
| 0.06 | 15 % | 21 mm | | | |
| **0.09** | 10 % | 1 mm | 11.06 | 45.7 | 52.1 |
| 0.12 | 5 % | -28 mm | 10.88 | 44.6 | 49.9 |

0.12 is a little better in the fight but puts the slow walk's centre of mass behind the soles, so
the walk trades one edge for the other. 0.09 centres it.

This was measured again on the finished tree, with every change here including `targetRate` 11.5
(Node research runner, skeleton mirror, 192 bouts). The order held:

| hipAhead | Falls/min | Down % | Re-fall <=2 s % |
| --- | ---: | ---: | ---: |
| 0 | 12.26 | 60.4 | 65.3 |
| 0.06 | 10.19 | 50.1 | 53.2 |
| **0.09** | **9.30** | **45.6** | **48.0** |

**What it costs: a body pressed into something in front of it.** The full gate found this, not the
fight. The locomotion bench's walk (`WALK_SEQUENCE`, 12.7 m) ends pressed against one of the headless
arena's posts. There the feet stop at the post while the weight stays back, so the more the hips
lead, the less stance is left behind the centre of mass. Rear reach of the stance, pressed (Node
locomotion bench, `.review/falls/walk-zero.mjs`):

| hipAhead | 0 | 0.03 | 0.06 | 0.075 | 0.09 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rear reach, pressed (mm) | 103 | 74 | 46 | 31 | 26 |

At 0.09 the fall line reads zero in 104 of the 125 pressed samples, against none at 0. In the open
first 8 m it reads zero in 1 of 150 samples at 0.09 and in none at 0. Chest to chest, a push from the
front therefore has little base behind it. The fight table above says the trade is still worth
making, but this is the posture the skeleton will be felled from in a clinch.
`a_foot_in_the_air_is_still_part_of_the_base_a_walking_body_stands_on` read those pressed samples
as a walk, and now reads the open 8 m (section 6).

**What still fells it.** After every change here, the skeleton mirror still runs about 9 falls/min
and re-falls within 2 s half the time (section 6). What is left is not a loop in the rise:

- **It is light, with a narrow base.** The inside-base fall line of a standing skeleton has a p50
  of 0.17 to 0.20 m/s. Blows from a standing opponent have a p50 of 0.13 m/s, and their p90 is
  0.6 m/s. So a large share of ordinary blows are past the line by themselves: 1039 of the 1389
  re-falls within 2 s at the shipped settings.
- **Both bodies go down together.** At half of all stands the other skeleton is down too, and the
  first thing either does on standing is close and strike.
- **A fallen body keeps striking.** 21.5 % of the skeleton's standing falls came while the other
  body was lying, and 390 of those 677 had a blow on the boundary that was past the line by itself.
  A lying body lands those with its limbs and what they carry; in a separate census (Node research
  runner, six mirrors), a fallen body's items dealt 18 % of the blows a standing skeleton took. The arm tone of a fallen or rising body
  (`Golem.motorTone`'s climb from `GROUNDED_TONE`) is arm-drive territory and was left to the other
  Release-120 task.

None of those is fixed by making the ledger harder to trip. The fall line is the physics of that
body, and the rule this study was given is to reach the band by root cause.

## 6. Before and after

Node research runner, 192 bouts a group, seed 20260925. "After" is every change here except
`targetRate` (commit cae7a55's tree). The skeleton's "after" row reproduced to the digit in two
separate runs.

| Group | | Falls/min | Down % | Re-fall <=1 s | <=2 s | <=3 s | Falls in a rise | Rise p50 s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| skeleton | before | 17.19 | 63.8 | 41.2 | 63.3 | 75.4 | 3310 of 7528 | 1.10 |
| skeleton | after | **9.18** | **44.1** | 29.8 | **46.5** | 59.8 | **74 of 3144** | 1.58 |
| stone | before | 2.51 | 7.9 | 24.4 | 29.4 | 35.3 | 126 of 259 | 0.97 |
| stone | after | **1.36** | **5.2** | 8.4 | **16.0** | 19.3 | **3 of 132** | 1.57 |
| wheel | before | 1.96 | 7.6 | 13.1 | 20.4 | 25.1 | 167 of 375 | 1.17 |
| wheel | after | **1.36** | **5.9** | 16.2 | 24.1 | 28.1 | **7 of 272** | 1.17 |
| multileg | both | 0.28 | 0.0 | 0 | 0 | 0 | none | -- |
| human | both | 0.00 | 0.0 | 0 | 0 | 0 | none | -- |

- **Falls in a rise are gone.** 3310 of the skeleton's falls began in a rise and 74 do now. For
  stone the numbers are 126 and 3, and for the wheel 167 and 7. What is left is a blow landing
  during the rise, which the rise is judged on like any other.
- **The skeleton stands centred.** The median margin at the moment of standing went from 6 mm to
  181 mm, and the share of the 3 s after a stand spent with the centre of mass outside the stance
  fell from 33.0 % to 10.6 %.
- **A re-fall is now a fall that follows a fight, not one that follows a rise.** 1356 of the
  skeleton's 1389 re-falls within 2 s had a blow in the half second before, and 1039 of them a blow
  on the boundary that was past the line by itself.
- **The wheel's re-fall share rose** (20.4 to 24.1 % within 2 s) while its falls went down by a
  third. The wheel has no staged rise. R1 and R4 took away its falls in a rise, and the re-falls
  that remain are a larger share of fewer falls: 61 of 253 stands.

By pairing, after (clustered by mind pairing, pairings as units, 95 %):

| Group | Pairing | Falls/min | Down % | Re-fall <=2 s % |
| --- | --- | ---: | ---: | ---: |
| stone | brawler mirror | 3.25 | 15.1 | 31.3 |
| stone | brawler against champion / duelist / miser | 2.26 / 1.94 / 0.79 | 9.4 / 7.9 / 3.0 | 0 / 11.1 / 6.7 |
| stone | every pairing without a brawler | 0.18 to 0.99 | 0.0 to 2.2 | 0 |
| wheel | brawler against duelist | 2.86 | 11.2 | 25.9 |
| wheel | brawler mirror | 0.94 | 4.6 | 21.7 |
| wheel | duelist mirror | 0.00 | 0.0 | 0 |
| skeleton | duelist mirror | 9.18 | 44.1 | 46.5 |

### A proposed band

What "a fall from time to time" should mean is the owner's call. What these numbers support:

- **Stone and wheel, a fighting pairing: 0.5 to 2 falls/min, re-fall within 2 s under 10 %.** Every
  stone pairing without a brawler is inside it now. Brawler pairings are 2 to 3.3/min and are the
  rate-falls study's close-contact subject, not a loop.
- **Skeleton: 3 to 5 falls/min, re-fall within 2 s under 25 %.** It is meant to be the fragile
  body, but at 9/min it is down 44 % of the bout, and that is a fight spent on the floor. Section 5
  says what is left; none of it is in the rise.
- **Human: it should fall at all.** 0 in 192 bouts is a body that cannot be knocked down, which is
  its own question.

### `LOCOMOTION_BIPED.targetRate` 10.5 -> 11.5

The size-law study (branch `worktree-agent-a2f255c16aa8ce981`, `docs/analysis/2026-09-25-size-law.md`)
found that at 120 Hz the stone biped's walk sat within 5 % of a cliff in its joint slew rate. That was
re-measured here (Node locomotion bench, table in `targetRate`'s doc comment): x1 slip 222.8 ->
184.0 mm/s, x1.2 342.1 -> 217.7, x1.25 301.6 -> 235.6, and the stone biped's flight over the tests'
walk 10 -> 7 substeps, which turns
`a_planted_sole_holds_its_ground_within_the_budget_written_in_the_module_file` green. Its cost is a
small body: at x0.8 the flight count goes 6 -> 15 of 479. The fight, before and after (Node research
runner, 192 bouts):

| Group | targetRate | Falls/min | Down % | Re-fall <=2 s | Falls in a rise | Rise p50 s |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| skeleton | 10.5 | 9.18 | 44.1 | 46.5 | 74 of 3144 | 1.58 |
| skeleton | 11.5 | 9.30 | 45.6 | 48.0 | 87 of 3313 | 1.60 |
| stone | 10.5 | 1.36 | 5.2 | 16.0 | 3 of 132 | 1.57 |
| stone | 11.5 | 1.37 | 5.2 | 10.2 | 0 of 133 | 1.56 |

The fight does not move beyond noise; this is a walk change, taken for the walk. The stone row
clustered by pairing is 1.04 +- 0.60 falls/min and 3.0 +- 4.0 % re-fall within 2 s.

`a_sole_holds_its_ground_sideways_and_in_a_spin_too_and_not_only_in_a_walk` is still red, and not
from the rate. The strafe reads 42 of 959 substeps with no sole down at every rate from 9.45 to
13.65, and 15 of 479 over a 2 s strafe that stays inside the posts, so the flights are the strafe's
own at 120 Hz, not the posts. Its slip, 766 to 1017 mm/s, is inside its 1399 budget. Both of the
harness's walks (`WALK_SEQUENCE` and the strafe) run to 12.7 m, into the arena's wall, as the
size-law study found.

### Three tests this turned red, and what they had been reading

Each was bisected across this branch's commits, re-read, and repaired. Each repair was then mutated
to show it goes red on its subject.

- **`a_foot_in_the_air_is_still_part_of_the_base_a_walking_body_stands_on`**. Red from `hipAhead`
  0.09, with the skeleton reading zero in 116 of 360 samples. 105 of those 116 came from the body
  pressed against a post (section 5). It now reads an 8 m walk in open ground: 0 of 150 for the biped
  and 1 of 150 for the skeleton. With only planted soles in the base, the mutation, those are 81 and 85.
- **`a body walked into stands against one weight, ... felled by a giant`** (`tests/contact-press.test.mjs`).
  Red from `targetRate`, and **its giant had never felled anything in open ground.** At 10.5 the
  default body went down 8.08 m from where it stood, 2.90 s in, which is the post ring at 9.5 m. At
  11.5 it went down at 8.11 m by lost posture, and at 11.0 it was still up at 8.48 m. Once the
  contact's acceleration is spent, a default body backs away at the giant's pace. The outrun rule
  files only what is past what the legs can accelerate, so a steady push files nothing, and a giant
  at movement x1.5 fares no better. The giant's case now pushes a body of half the stability: it goes
  down at 0.47 s and 0.09 m at both rates. It must fall within 1 m, so that a post cannot pass the
  case again. With the outrun filing switched off, that body stands. **Owner question:** should a
  giant tip a default body in open ground? That would need a speed rule on being pushed back, not
  only an acceleration rule, and it is outside this study.
- **`the worker counts a corner's knockdowns and its time down ...`** (`tests/research-physical.test.mjs`).
  Red from `targetRate`. Every seed pair from 44 to 75 put both the x0.5 and the x1 idle body down
  twice in 15 s, for 6.25 to 6.37 s, except one, where x1 went down three times. Against a brawler,
  the stability attribute hardly separates two idle bodies: the brawler's blows pass both lines, and
  an x2 control went down five times on one pair (Node bout runner through `research/worker.mjs`).
  The fixture now runs 20 s, where 44 and 45 give three falls against two. In every such bout the
  brawler goes down once with it, so the check that the count belongs to one corner reads a
  difference, not a zero. Counting the bout's falls into both corners, the mutation, turns it red.

## 7. What to look at

A page check was made on a Vite server on port 5191 (the arena, skeleton-duelist mirror and
golem-brawler mirror). The tab was hidden, so the world was stepped by hand one 1/60 s host frame at
a time, and a side-view camera was rendered every 8 frames. What it showed:

- **Skeleton.** It goes from lying, to sitting with its knees drawn up (0.13 to 0.4 s), to a squat
  with the shins upright and both feet flat (0.5 to 1.1 s), to extending (1.2 to 1.5 s). Its
  trunk stays upright throughout, as its table asks. The arms hold the blade and plate out in front;
  they do not hang.
- **Stone brawler.** It rolls up, turns into a crouch with the trunk pitched forward and the knees
  bent, and extends to standing at about 1.55 s. In that capture the other brawler was pressed
  against it throughout, which is a rise the gate now lets through.

What the owner should look at:

1. **The rise from each side** (back, front, side) on stone, human and skeleton. The feet should
   land under the hips before the pelvis lifts, and the trunk should come up last. Nothing should be
   pulled up by the shoulders.
2. **The first second after a stand.** The body should stand centred over its feet, not start
   already tipping.
3. **Whether 1.1 to 1.6 s reads as slow.** The rise is at the owner's "about 1 s" only when the body
   lies nearly upright. Shortening it means turning faster, which is what swung the arms.
4. **The skeleton mirror, over a minute.** It still falls about 9 times a minute. Judge whether that
   reads as a loop or as a fragile body taking blows. The analysis says the latter (section 5).
5. **A fallen body's blade.** It still hits whoever stands over it.
6. **Arms during the rise.** Their tone climbs back from the grounded tone, and they are not part of
   this change.
7. **A skeleton in a clinch.** Pressed chest to chest, its weight sits on its heels (section 5).
   Check whether it goes over backwards more than it should.
