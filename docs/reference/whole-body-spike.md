# The whole-body spike

Can one bounded torque solve over the coupled dynamics, with the ground's contacts and the joints'
stops (`wholeBodyTracking`, `src/core/control/whole-body.ts`, through `createMotionBody`), carry a
body that stands on free feet under the stand competency's shoves, and throws an explosive punch at
the punch competency's pad, sequenced pelvis, trunk, arm, unassisted, at 120 and 480 Hz, within a
step budget for two fighters in real time?

**No.** It stands to 0.2 N s/kg in every cell, against a threshold of 0.5 and today's stance's 0.6.
Standing in place, no controller can do much better: the capture point allows 0.30 to 0.34 N s/kg
from behind without a step. Its punch lands 4.2 to 4.4 m/s on the Warrior at 480 Hz, in half the
time today's controller takes, but not the 6.8 m/s the threshold asks. It costs 2.2 to 2.8 ms a
body a step on a quiet machine, five or six times the 0.36 to 0.46 ms a body costs today: two
fighters fit in the 8.33 ms step at 120 Hz, and not in the 2.08 ms step at 480.

`research/whole-body-spike.mjs` runs it. Harness: Node, the core's world on Rapier (`rapier`, the
reference engine), symmetric actuation, each body built in its guard (`poseAngles`), nothing
holding the root. A cell's figures are read by the competencies' rules
(`research/competencies.mjs`, [competencies](competencies.md)): the stand's level by
`fastestHeld`, the punch's speed over the last 10 cm (`approachSpeed`); `spikeFigures` reads them
from the rows, `whole-body-spike.json.gz` (408 trials: `--held empty`, then `--held club`).

## The controller

Every step, one solve finds the muscles' torques that best give the accelerations asked of:

- every joint, toward the guard (`guardPosture`), the knees bent 0.3 rad;
- the mass centre, over the middle of the soles (x, z);
- the pelvis, 4 cm under where it was built, and turned as it was built.

The solve keeps every contact force it asks of the ground pushing and within friction
(`ContactTrackingSettings`), or rejects the step, which zeroes its torques.

The punch adds three goals to these. Each is a minimum-jerk profile, the chest `lead` after the
pelvis and the fist `lead` after the chest:

- the pelvis's turn about up, which brings the striking shoulder forward;
- the chest's turn, the same way;
- the fist's strike point, from where it stands to `through` past the pad.

It drives the fist until `follow` after it touches, or the path is done, and then returns to the
guard.

## Settings

The spike's own choices (`SPIKE`). The contact model and the joints' feedback and weights are the
support task's ([support transition](support-transition.md)); the rest were set on the Warrior at
120 Hz by trying the stance and the punch by hand.

| Setting | Value |
|---|---:|
| Contact points, gap, least upward normal | 64, 5 mm, 0.9 |
| Effort cost, capacity | 1e-6, 5 |
| Pelvis under its built height, knee bend | 0.04 m, 0.3 rad |
| Joints toward the guard: feedback, leg weight, other weight | 0.3 s, 0.02, 0.1 |
| Mass centre and pelvis: feedback, centre weight, pelvis weight | 0.25 s, 10, 1 |
| Punch: fist path, through, pelvis turn, chest turn, lead | 0.12 s, 0.2 m, 0.25 rad, 0.45 rad, 0.06 s |
| Punch: fist feedback and weight, turns' feedback and weight, arm joints' weight while driven | 0.05 s and 3, 0.15 s and 1, 0.001 |
| Punch: driven after contact, cycle, returned within | 0.03 s, 2 s, 5 cm |

## Stand

The stand competency's trial: settled 1.5 s, shoved at the middle trunk's centre of mass at 0.2 to
0.8 N s per kg of the body's mass from 8 directions, watched 10 s; down if it is down or its mass
centre sinks 25 cm. The largest level held from every direction, as at every level below it:

| Cell | 120 Hz | 480 Hz | Today's stance ([baseline](competencies.md#stand)) |
|---|---|---|---|
| Warrior, empty | 0.2 | 0.2 | 0.6 \| 0.6 |
| Warrior, club | 0.2 | 0.2 | 0.6 \| 0.6 |
| Rogue, empty | 0.2 | 0.2 | 0.6 \| 0.6 |
| Rogue, club | 0.2 | 0.2 | 0.6 \| 0.6 |

Which directions held at 120 Hz, 0° the shove forward and growing to the right (`.` held, `X`
down). At 480 Hz each cell lost one more trial at 0.4, and was otherwise the same:

| Level | Warrior, empty | Warrior, club | Rogue, empty | Rogue, club |
|---|---|---|---|---|
| 0.3 | `....X...` | `....X...` | `....X...` | `....X...` |
| 0.4 | `XX..X..X` | `X...X...` | `X..XXX..` | `X..XX...` |
| 0.5 | `XX.XXX.X` | `XX.XXX.X` | `XXXXXXXX` | `XXXXXXXX` |
| 0.6, 0.8 | all down | all down | all down | all down |

The first shove to fell it comes from in front, pushing it backward, at 0.3. **Standing in place,
that is the limit.** A body that does not step can stop its mass centre only by moving its centre
of pressure to the edge of its soles, and the capture point bounds the speed it can then stop at
that edge's distance times the square root of g over the height. Built in its guard, the
Warrior's mass centre (1.02 m up) is 2.5 cm ahead of the soles' middle, and the Rogue's (0.92 m)
3.3 cm. Read from the foot boxes:

| Body | Forward | Backward | To the side |
|---|---:|---:|---:|
| Warrior | 0.60 | 0.30 | 0.84 |
| Rogue | 0.56 | 0.34 | 0.80 |

N s/kg, the largest shove each way stopped without a step. The trunk's turn can add to it a
little; nothing in place reaches 0.5 from behind. Today's stance meets 0.6 by stepping, 1.4 to 1.8
steps at that level. The spike's forward and diagonal falls at 0.4 and 0.5 are under the bound:
its mass centre goal, held at 0.25 s, does not bring the centre of pressure to the toes.

## Punch

The punch competency's trial: 8 s of blows, three in all from 2 s, with each hand at a compliant
pad at the cell's place (0.1 m to the hand's side, 1.55 m up, 0.55 m ahead), at full reach
(`fullReach`), and 1 m aside as a miss. Empty-handed only, as the competency is.

| Cell | Landed | Mean speed, m/s | Slowest | First contact, s | Returned | Falls |
|---|---|---|---|---|---|---|
| Warrior, 120 Hz | 12/12 | 3.47 | 0.73 | 0.23 | 8/12 | 0 |
| Warrior, 480 Hz | 11/12 | 4.39 | 3.51 | 0.19 | 7/12 | 1 |
| Rogue, 120 Hz | 11/12 | 2.25 | 0.80 | 0.29 | 7/12 | 0 |
| Rogue, 480 Hz | 12/12 | 3.75 | 2.03 | 0.19 | 8/12 | 0 |

Today's controller, the path strike's planted cross ([baseline](competencies.md#punch)), lands
the Warrior's blows at 4.4 to 4.9 m/s with first contact at 0.34 to 0.37 s, and the Rogue's at 1.7
to 4.0 m/s, most of them late or not at all. No cell of either meets the threshold: every trial
upright, 95 % landed, every landed blow 6.8 m/s or faster, first contact within 0.5 s.

- **The speed is not the target's.** The fastest blow is 5.1 m/s, the Warrior's right at full reach
  at 480 Hz. The fist's path is asked to be done in 0.12 s and is not: it lands at 0.17 to 0.20 s.
- **It is not converged with the rate.** The Rogue's mean is 2.25 m/s at 120 Hz and 3.75 at 480; at
  120 Hz the fist's 0.05 s feedback is six steps. The slowest blows, 0.7 to 1.5 m/s, are all at
  120 Hz.
- **A third of the blows do not return** within 5 cm of where they began before the next.
- **The fall**, the Warrior's left hand at full reach at 480 Hz: the solve rejects 5 steps at the
  first blow's contact (2.19 s) and 6 at the second's (4.19 s), when the pad's push leaves no
  contact forces that hold the asked motion, and zeroes the torques for them; the body is down at
  4.87 s, 0.67 s after the second contact. The other 1042 of its 1053 rejected steps come after.

## Infeasible steps

A step the solve rejects is one whose contact forces would pull, or slide, or whose joint stops
it cannot keep; its torques are zeroed. Over every cell:

| Cell | Stand, empty | Stand, club | Punch |
|---|---|---|---|
| Warrior, 120 Hz | 0 of 35898 | 6 of 38145 | 1 of 5760 |
| Warrior, 480 Hz | 8 of 139072 | 186 of 148099 | 1054 of 23040 |
| Rogue, 120 Hz | 3 of 33775 | 29 of 35089 | 9 of 5760 |
| Rogue, 480 Hz | 35 of 130447 | 208 of 135989 | 23 of 23040 |

Every one of the stand's 475 rejected steps is in a trial that fell; no trial that stood had one.
In the punch's trials, 0.25 to 0.55 of the muscles' channels are at their torque bound in a step,
on average.

## Cost

`node research/whole-body-spike.mjs --timing`: one body alone on a quiet machine (nothing else
running), standing 5 s after settling 1.5 s, then the punch trial at the cell's place; the mean
and longest wall time of the world's whole step, its physics and the solve together, ms (Node,
the core's world on Rapier):

| Body | Rate, Hz | Standing: mean | longest | Punching: mean | longest |
|---|---|---:|---:|---:|---:|
| Warrior | 120 | 2.79 | 83.12 | 2.60 | 11.84 |
| Rogue | 120 | 2.30 | 5.56 | 2.52 | 13.90 |
| Warrior | 480 | 2.21 | 6.67 | 2.35 | 15.03 |
| Rogue | 480 | 2.24 | 6.71 | 2.33 | 10.66 |

The Warrior's longest standing step at 120 Hz, 83 ms, is its first run's, before the code is
compiled. A body under today's control costs 0.36 to 0.46 ms a step, and a two-body bout's step
has a median of 0.30 ms ([step cost](step-cost.md)). Two fighters on the solve take about 5 ms of
the game's 8.33 ms step at 120 Hz, with nothing drawn; at 480 Hz a step is 2.08 ms, under one
body's cost. The solve's share of the step was not read apart from the physics'.

The `msPerStep` of the rows is not a timing: the cells ran four at a time beside a 28-worker
search, and read 5.9 to 7.5 ms.

## What it says

- **A whole-body solve can sequence a blow.** The pelvis, chest and fist, three task goals over one
  solve with the stance, land the Rogue's blows where today's controller seldom does, and the
  Warrior's in half the time, at 480 Hz.
- **It cannot stand without stepping**, and neither can anything else: the threshold is beyond the
  capture point from behind. Today's stance steps; the solve has no stepping.
- **Its punch is still slow.** The path's 0.12 s is not achieved, and its speed has not converged
  with the rate.
- **A rejected step goes limp.** Zeroing the torques where the solve finds no admissible contact
  forces is safe for a fixture and not for a fighter.
