# Down, and getting up

The records the core's reading of a fall, and what a body does after one, are measured against.

## Down

A body is down while its centre of mass is more than `FALLEN`, 0.25 m, under the height it is
asked to hold (`uprightness`, `src/core/control/ground.ts`). The bar is set, not swept: it is the
one the stance's batteries count a fall by (`stance-tuning.md#fallen`).

- **The height is over the body's lowest point**: the least over every segment's shape, a
  capsule's ends and a sphere's centre less the radius, a box's corners, a hull's points. The
  ground is level, and a body on it touches it there. The soles' middles, which the stance
  measures its own height from, are not on the ground once a body lies, so a height over them says
  nothing of a lying body. What a hand holds weighs in the centre of mass, and is not a point the
  body lies on.
- **The height asked is the stance goal's** (`MotorControl.standing`), and no more than the body's
  standing height by its spec: a body asked to stand taller than it can is not down for failing
  to. A body with no stance goal is read against its standing height. So a body held low on
  purpose is not down for it: a crouch, a kneel or a roll asks its own height.
- **It is a reading, not a memory**: taken from the body at every step (`BodyView.down`), true
  while the body is down and false once it is up again. A fight, a page and a test read the one
  view, so none can disagree with the body's mind about it.

The standing heights by their specs, m: Warrior 1.0145 (1.0174 with the wooden club in its right
hand), Rogue 0.9098, skeleton 0.8824. Node stand (`tests/harness/core-stand.mjs`), Rapier,
120 Hz: built on the ground each is within 1 mm of its centre of mass's height over the ground,
and lying limp within 5 mm of it (a lying body rests 2 to 3 mm into the ground).

Against the reading it replaced (the centre of mass over the soles' middles, kept once true), a
bout that ends by a fall ends 0.05 to 0.6 s later, and is the same bout to the bit until the step
it used to end at (`bouts.md#down-read-from-the-body`).

A body's mind reads it too: the game's hands a body that is down to `lie`, which asks its muscles
for nothing ([Lying](#lying)).

## Battery

The falls a riser is measured on (`research/core-rise-trials.mjs`), and their table
(`research/core-rise.mjs`). Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz,
each fall in a world of its own with the arena's solids.

```powershell
node research/core-rise.mjs --workers 14 [--mind '<MindConfig JSON>']
```

Every body has the game's mind (`FIGHTER`, `src/core/mind/config.ts`), or the one `--mind` gives.

- **A shove** (`shoved`): a body built as the arena builds one, ordered to stand in guard
  (`STAND_ORDERS`), is shoved after 1 s at its middle trunk's centre by 1.5 N s for each kilogram
  of the whole body, across the ground. Sixteen shoves, 22.5 degrees apart about up, for each
  model with the wooden club in its right hand and with nothing (`LOADOUTS`). It fell if it is
  down within 3 s; a shove it holds is counted and left out of the rates.
- **A bout's fall** (`boutFall`): each of the arena's nine matchups at 4 m is played to the first
  step a side is down; the other side is then ordered to stand. A bout nobody falls in is counted
  and left out.
- **The watch**: 15 s from the fall (`WATCH_SECONDS`). A body has risen at the start of the first
  2 s it is up running (`UP_SECONDS`, `risenAt`): up for less and down again is not a rise.

The columns: how many falls of how many trials; how many of those rose; the median seconds from
the fall to the rise; the median, over the falls, of the fastest any segment's centre of mass
moved from 1 s after the fall to the watch's end, m/s (how much it thrashes); the most the
stance asked of the ground beyond what its soles gave over the same span, in the body's weights
(`StanceReading.shortfall`; `inf` once its size is past what a number holds); and the median and
the longest, over the falls, of the seconds from the fall to the last step any segment's centre
moved faster than 0.05 m/s (`STILL`; 14.99 is the watch's last step).

A second table has a line for each way each row's bodies lay a second after the fall (`lieOf`,
[Stages](#stages)): how many, how many of those rose, the furthest stage of the game's rise each
began (`none` if its riser began none; the count is of the body's last fall within the watch),
and how many played the rise to its end within the watch: its last stage done, and not given up
at its limit. Under a mind with no riser the last two columns are empty.

## Driven

A fighter that hands its body to nobody: a body that is down is driven on by its stance, which
bears on soles that are not under it. Every character's balance is 0, so no assist answers the
ask.

```powershell
node research/core-rise.mjs --mind '{"kind":"fighter","subs":[],"guard":"pose"}'
```

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | median s it last moved | the longest, s |
|---|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 15 | 0 | - | 12.11 | inf | 14.99 | 14.99 |
| workshop-fighter, empty, shoved | 16 | 16 | 0 | - | 11.98 | inf | 14.99 | 14.99 |
| workshop-rogue, club, shoved | 16 | 16 | 0 | - | 12.47 | inf | 14.99 | 14.99 |
| workshop-rogue, empty, shoved | 16 | 16 | 0 | - | 14.62 | inf | 14.99 | 14.99 |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | - | 12.74 | inf | 14.99 | 14.99 |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | - | 11.54 | inf | 14.99 | 14.99 |
| bouts | 9 | 7 | 0 | - | 10.41 | inf | 14.99 | 14.99 |

Of 102 falls none rises, and none is ever still. A body on the ground is thrown about at 10 to
15 m/s by its own muscles, and what its stance asks of the ground grows without bound: read on
the Warrior with the club shoved to its right and sampled once a second, the ask is 3 to 82
weights from 1 to 4 s after the shove, past 1e30 at 6 s and past 1e100 at 16 s.

## Lying

The game's mind (`FIGHTER`): from the step a body is down it is `lie`'s (`lying`,
`src/core/mind/lie.ts`), which asks its muscles for nothing, and the command layers ask its
stance nothing.

```powershell
node research/core-rise.mjs
```

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | median s it last moved | the longest, s |
|---|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 15 | 0 | - | 2.56 | 0.0 | 3.06 | 14.99 |
| workshop-fighter, empty, shoved | 16 | 16 | 0 | - | 2.48 | 0.0 | 2.15 | 13.51 |
| workshop-rogue, club, shoved | 16 | 16 | 0 | - | 1.92 | 0.0 | 3.27 | 14.99 |
| workshop-rogue, empty, shoved | 16 | 16 | 0 | - | 1.83 | 0.0 | 3.61 | 14.99 |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | - | 3.10 | 0.0 | 10.82 | 14.99 |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | - | 4.14 | 0.0 | 11.49 | 14.99 |
| bouts | 9 | 7 | 0 | - | 1.41 | 0.0 | 1.74 | 14.99 |

The same 102 falls, and none rises. The stance asks nothing. What moves from a second after the
fall is the end of the fall itself: a median of 1.4 to 4.1 m/s, where the driven body's is 10 to
15.

**A lying body is a limp one.** At an activation of 0 the muscle driver sets each joint's motor
to give no torque, which is what releasing the muscles does (`Body.dispose`). Read with the
muscles released at the fall in place of `lie` (a script that is not kept; eight of each row's
shoves, 45 degrees apart), the seconds each body last moved are the same to the digit.

**A limp body does not always come to rest.** The humans are still a median of 2 to 4 s after
the fall and the skeleton 11 s, and in six rows of the seven some body still moves on the
watch's last step. Read each second on two of the shoves, the fastest segment and its speed (the
same script):

- the Warrior with the club, shoved forward: a hand at 7.6 m/s in the fall's first second, a
  foot at 6.1 m/s in the next, 0.26 m/s in the third, and under 0.01 m/s from then on;
- the skeleton with nothing, shoved forward: its left hand at 3.4 to 3.5 m/s through the third
  and fourth seconds, 0.5 and 1.7 m/s in the fifth and sixth, and 0.15 to 0.21 m/s, turning at 3
  to 5 rad/s, in every second from the seventh to the fifteenth, while its centre of mass lies
  within a millimetre of where it lay.

No muscle moves it: it is a light segment on the ground at the end of a slack joint, kept going
by the solver. What in the solver does it is not read. A crypt body out of the fight is limp in
the same way (`DungeonRun.drop`).

## Stages

The riser (`stagedRise`, `src/core/mind/rise/staged.ts`) plays a recipe (`Recipe`, `RISE`,
`src/core/mind/rise/stages.ts`): it lies slack until still, reads how it lies, and plays stages.
On its back or a side they are that lie's roll, poses that turn it onto its front, after which
it lies slack and reads again; on its front they are the rise, poses and then a stage that
bears the body on its limbs. This is the record of the recipe's numbers and the player's, and of
where the rise stops.

Harness, for every figure of this section but the battery's: Node, the core world
(`src/core/world.ts`) with the arena's solids, Rapier, 120 Hz; the body with nothing in its
hands, held stiff in its reference pose, shoved as the battery shoves and held stiff 1.5 s more
(`toppled`, `research/core-rise-trials.mjs`), so that it lands in one piece the way it was
shoved; then the riser has it. No assist: every balance is 0.

```powershell
node research/core-rise-poses.mjs --model workshop-fighter --lie front [--stages '<Stage[] JSON>']
```

### A posture is written from each freedom's own zero

A body's joint angles are measured from its reference pose, and the reference poses differ: the
humans stand with their arms out and down, the skeleton with its elbows at a right angle. Each
freedom's angle in the reference pose from its own zero (the anatomical position) is in its spec
(`DofSpec.bind`), and a stage's posture (`Posture`) is written from that zero, so one posture is
the same shape on all three. The freedoms a rise names, rad:

| The reference pose's | Warrior | Rogue | skeleton |
|---|---|---|---|
| elbow flexion | 0.81 | 0.73 | 1.62 |
| shoulder abduction | 0.72 | 0.74 | 0.00 |
| shoulder flexion | 0.03 | -0.04 | -0.09 |
| hip flexion | 0.11 | 0.03 | 0.00 |
| knee flexion | 0.11 | 0.14 | 0.00 |
| ankle dorsiflexion | 0.03 | 0.07 | 0.00 |

Written from the reference pose, the humans' folded elbow (1.6 rad from theirs) is past the
skeleton's stop (0.84 rad from its own). From the zero, the ranges are the source's and the
Warrior's and the skeleton's are the same, so a recipe that fits one fits the other
(`stageFaults`).

### The player's numbers

Each is set, not swept, but where a sweep is given.

- **Still** is the centre of mass under 0.1 m/s (`SLOW`) for 0.5 s (`STILL_SECONDS`). It is the
  centre of mass and not the segments because a limp body's hand can turn on the ground for as
  long as it is watched ([Lying](#lying)) while the body lies where it lay.
- **How it lies** (`lieOf`): the pelvis's forward against up. Over 0.5 (`LIE_UP`), within 60
  degrees of straight up, it is on its back; under -0.5, on its front; between, on the side its
  left is under.
- **The pose drive**: each freedom is asked the speed that closes its error in 0.2 s
  (`POSE_SECONDS`), no faster than 3 rad/s (`POSE_SPEED`), at full activation: the muscle driver
  turns the joint toward the posture with what its muscles give at that speed. The core's other
  way to a pose, the joint servo (`servo`, `src/core/control/servo.ts`), solves each freedom's
  torque with the root taken as held and no contact known, and a body pressing itself off the
  ground is neither; its record rejects asking a speed for a joint held in the air, which a
  hard stop reverses within a step. Both read fallen forward, at the end of `prop`, with the
  bare `prop` ([The pose stages](#the-pose-stages)): the heights of the pelvis's and the upper
  trunk's centres of mass, m:

  | Drive | Warrior | Rogue | skeleton |
  |---|---|---|---|
  | lying, before any | 0.17, 0.14 | 0.14, 0.12 | 0.10, 0.10 |
  | the speeds | 0.43, 0.46 | 0.38, 0.23 | 0.40, 0.42 |
  | the servo, 0.1 s | 0.30, 0.15 | 0.32, 0.11 | 0.31, 0.12 |
  | the servo, 0.2 s | 0.21, 0.15 | 0.20, 0.14 | 0.22, 0.12 |

  The servo draws the knees half under and props nothing; at 0.1 s it leaves the Warrior on its
  side.
- **A stage's time** is counted to the nearest step.
- **A limb is down** when its point is within 0.03 m of the ground (`DOWN`), and only then does
  it bear; a foot props its shin when a corner of its sole is that near. It is a tolerance on a
  reading, and it has to tell these apart: toppled stiff, a hand lies on its far end, which
  reads 0.000 m over the ground, with its near end 0.033 m up (Warrior), 0.033 and 0.036
  (Rogue), 0.067 and 0.069 (skeleton); on its knees and hands, both a hand's ends are within
  0.002 m; and lying flat after `fold`, the knees' points are 0.094 m up (Warrior), 0.10
  (Rogue), 0.054 (skeleton), so a body on its front is not on its knees and a stage asked of it
  then bears on nothing and runs to its limit.
- **A bearing stage is done** when every limb it bears on is down, those it leaves are let go,
  the centre of mass is within 0.05 m of its aim (`NEAR`) and slower than `SLOW`, and the pelvis
  is within 0.15 rad of its pitch (`TURNED`). When `fours` is done the Warrior's centre of mass
  is 0.050 m from its place: `NEAR` is the term that ends it.
  [What a bearing stage is done by](#what-a-bearing-stage-is-done-by) reads each term.
- **A limb a stage leaves** bears 0.01 (`LEFT`) against the stage's own limbs, whose shares sum
  to 1, until the centre of mass has been over those (within their outline, drawn in as a
  stance's is, `withinSupport`): it bears what they cannot yet, and little once they can. Read
  on the Warrior, on its knees and hands, under a stage that bears on its left shin (0.8) and
  its hands (0.1 each) and leaves its right shin: with `LEFT` 0.01 the shin is let go after
  0.33 s, with 1 after 0.22 s, and with 0.2 not in the stage's 2 s.

### The pose stages

Both sides alike; a freedom a stage does not name goes to its zero. From the anatomical zero, rad:

| Stage | Posture | Seconds |
|---|---|---|
| `fold` | `FOLD`: shoulder flexion 0.9, shoulder abduction 0.7, elbow flexion 2.4, ankle dorsiflexion -0.85 | 1 |
| `tuck` | `TUCK`: as `FOLD`, and hip flexion 2.1, knee flexion 2.5, lumbar flexion 0.7, thoracic flexion 0.3 | 2 |
| `prop` | `PROP`: as `TUCK`, but shoulder flexion 1.3, elbow flexion 1.0, lumbar flexion 0.4, and shoulder internal rotation -0.4, wrist flexion -1.2, ankle dorsiflexion 0.38 | 1.5 |

`fold` points the feet, so the shins lie flat, and asks the arms folded; lying on them a body
cannot fold them (the humans' elbows and the skeleton's shoulders end 1.7 rad short), and they
fold as `tuck` lifts it off them.
`tuck` draws the knees under: the pelvis comes up over the shins. `prop` reaches the arms ahead
and straightens them, turns the hands palm down, and tucks the toes under, so that each shin is
propped on its foot and each hand lies flat: what the bearing stage after it bears on.

Fallen forward, at each stage's last step, the heights of the centre of mass and of the
pelvis's, the upper trunk's and the head's centres of mass, m; the last row is the bearing stage
([The bearing stage](#the-bearing-stage)):

| | Warrior | Rogue | skeleton |
|---|---|---|---|
| lying | 0.14, 0.17, 0.14, 0.10 | 0.12, 0.14, 0.12, 0.08 | 0.10, 0.10, 0.10, 0.09 |
| `fold` | 0.16, 0.17, 0.15, 0.11 | 0.14, 0.16, 0.14, 0.09 | 0.11, 0.10, 0.10, 0.10 |
| `tuck` | 0.26, 0.41, 0.23, 0.11 | 0.23, 0.37, 0.16, 0.07 | 0.24, 0.37, 0.25, 0.12 |
| `prop` | 0.33, 0.42, 0.44, 0.39 | 0.26, 0.39, 0.26, 0.11 | 0.31, 0.40, 0.41, 0.39 |
| `fours` | 0.33, 0.45, 0.45, 0.37 | 0.18, 0.17, 0.18, 0.25: given up, on its left side | 0.32, 0.42, 0.43, 0.39 |

Every body gets its pelvis over its shins. The Warrior and the skeleton prop their trunks; the
**Rogue's arms do not raise its chest**: at `prop`'s end its hands are beside its knees, its
shoulders 0.6 rad short of the posture and its wrists 2.0 to 2.4. Its shoulder flexors peak at
32 N m and its elbow extensors at 25, the Warrior's at 67 and 57, for 57.6 kg against 79.0: per
kilogram, 0.66 and 0.60 of the Warrior's.

**The bare `prop`**: as `TUCK`, but shoulder flexion 1.3, elbow flexion 1.0, lumbar flexion 0.4
and thoracic flexion 0, with the hands as they fall and the feet pointed. The drive's table
above and the readings below were read with it; it ends the Warrior at
0.34, 0.43, 0.46, 0.48, the Rogue at 0.25, 0.38, 0.23, 0.10 and the skeleton at 0.32, 0.40,
0.42, 0.46. With it:

- Twelve other recipes were read on the Rogue (no `fold`; the arms nearer the trunk; the
  shoulders less flexed; the elbows straighter and more bent; the trunk straight and arched;
  `prop` for 3 s; the hips opened to 1.9, 1.7, 1.3 and 0.6 rad): its chest ended 0.12 to 0.23 m
  up in every one. Opening its hips lowers its pelvis (to 0.31 m at 1.3 rad) and lifts nothing,
  since its trunk's weight is ahead of its knees and its arms do not carry it. On the Warrior
  and the skeleton the hips at 1.3 rad end the chest at 0.50 and 0.49 m, with the pelvis at 0.45
  and 0.42.
- Without `fold` (`tuck` for 2 s, then `prop`) the Warrior's chest ends at 0.22 m and its head at
  0.11: the arms asked to fold while the knees draw under do not get under the shoulders.
- With the arms asked 0.3 rad from the trunk in place of 0.7 (`shoulder abduction`), the
  readings are the Warrior's and the Rogue's to the centimetre, and the skeleton's chest 0.45.
- A body toppled stiff to a side lies on that side at the first step it is down, and is on its
  front or its back by the time its stiffness ends. A side is a lie a fall passes through.

### The limbs

What a bearing stage may bear on is the recipe's (`Recipe.limbs`), made of a body by
`riseLimbs` (`src/core/mind/rise/limbs.ts`). Both sides alike:

| Limb | Kind | Bears on | Its task is taken by |
|---|---|---|---|
| `shin.<side>` | propped | the shank from its knee end's point to where its foot stands on its toes, a sole of no width; unpropped, the knee's point alone | the hip's three freedoms and the knee's flexion |
| `hand.<side>` | end | the hand's capsule where it touches: under its lower end, or under its middle when both ends are down | the shoulder's three freedoms and the elbow's flexion |

A limb's other freedoms (the ankle, the wrist, the forearm's turn) are asked toward the stage's
posture. The trunk's joints are both arms' stem: the bearing solve (`bearing.ts`) moves the
limbs' ends with them as the servo asks them to move.

Read on the Warrior, on its knees and hands: each shin is propped (it bears from the knee back
0.41 m) and each hand lies flat. The skeleton's feet do not prop its shins there (no corner of
a sole is within `DOWN` of the ground), and they bear at the knee alone.

### The bearing stage

`fours`, the rise's last stage: on knees and hands.

| | |
|---|---|
| bears on | each shin 0.33, each hand 0.17 |
| leaves | nothing |
| pelvis pitched forward | 1.3 rad from upright |
| height | none asked: the shins leave the body none of its own |
| posture | `FOURS`: lumbar flexion 0.3, thoracic flexion 0.2, shoulder flexion 1.9, shoulder abduction 0.3, shoulder internal rotation -0.4, elbow flexion 0.3, wrist flexion -0.8, hip flexion 1.9, knee flexion 2.4, ankle dorsiflexion 0.38 |
| time constant of its aims | 0.4 s |
| limit | 5 s |

The shares are both where the centre of mass is held (the middle of where the limbs bear, so
weighed: a third of the way from the shins' middles to the hands) and how the ground's wrench is
split among the limbs, so the load each limb is asked is the one that holds the body there.

Fallen forward under the game's recipe, at the step `fours` ends:

| | Warrior | Rogue | skeleton |
|---|---|---|---|
| `fours` ends | done after 1.75 s | given up at 5 s | done after 0.70 s |
| centre of mass from its place, m | 0.050 | 0.19 | under 0.05 |
| centre of mass, pelvis, chest, head up, m | 0.34, 0.45, 0.45, 0.37 | 0.18, 0.17, 0.18, 0.25 | 0.32, 0.42, 0.43, 0.39 |
| asked beyond what its patches give, mean, of its weight | 0 | 0.65 | 0 |
| the fastest a segment moves in the whole rise, m/s | 1.48 | 2.63 | 1.21 |

The Warrior and the skeleton end on their knees and hands, still (0.06 m/s). Their fastest
segment is the pose stages': `fours` moves nothing faster. The Rogue comes to `fours` with its
chest on the ground and its hands beside its knees, is asked 0.65 of its weight that the ground
under its limbs cannot give, drifts 0.47 m to its left and ends on its side.

`fours` swept, one number at a time, the others the game's: "done" with the stage's seconds, or
"-" where it was given up at its limit.

| Shin, hand | Warrior | Rogue | skeleton |
|---|---|---|---|
| 0.45, 0.05 | - (0.19 m from its place, pitch 1.43) | - | done 1.23 |
| 0.40, 0.10 | - (0.11 m from its place, pitch 1.28) | - | done 1.04 |
| **0.33, 0.17** | done 1.75 | - | done 0.70 |
| 0.30, 0.20 | done 1.58 | - | done 1.02 |
| 0.25, 0.25 | done 1.11 | - | done 1.22 |

| Pitch, rad | Warrior | Rogue | skeleton |
|---|---|---|---|
| 1.1 | done 1.80 | - | done 1.60 |
| 1.2 | done 1.76 | - | done 1.10 |
| **1.3** | done 1.75 | - | done 0.70 |
| 1.4 | done 0.79 | - | done 0.52 |
| 1.5 | done 0.60 | - | done 0.48 |

| Time constant, s | Warrior | Rogue | skeleton |
|---|---|---|---|
| 0.2 | done 0.94 | - | done 0.53 |
| 0.3 | done 1.32 | - | done 0.65 |
| **0.4** | done 1.75 | - | done 0.70 |
| 0.6 | done 2.56 | - | done 1.23 |

The Warrior's fastest segment is 1.48 m/s and the skeleton's 1.21 in every row; the Rogue's is
2.6 to 5.4. With the shins bearing four fifths or more the Warrior's centre of mass does not
come back to its place: its knees come to their stop (2.57 rad) with it 0.11 m short. A pitch
under 1.1 rad is not reached in this posture (0.3, 0.6, 0.9 and 1.0, with a limit of 2 s, are
given up with the pelvis at 1.22 to 1.25 rad). The game's numbers are not the sweep's fastest:
a steeper pitch and a shorter time constant are done sooner on these two bodies, and were read
on a stiff topple alone.

### What a bearing stage is done by

Each term of the done test, read on a body brought to its knees and hands by the game's recipe
and then put under one stage more.

**Slow.** The stage after is `fours` again, which the body is at: unknocked, it is done at its
first step. Knocked as that stage begins, by an impulse at the middle trunk that gives the whole
body the speed named:

| Knock, m/s | Warrior: done after, steps | skeleton: done after, steps |
|---|---|---|
| none | 1 | 1 |
| 0.2 across | 13 | 40 |
| 0.3 across | 18 | 72 |
| 0.5 across | 269 | given up after 360 |
| 0.3 forward | 101 | 41 |
| 0.3 backward | 28 | 90 |

The Warrior knocked 0.2 m/s across is done at 0.097 m/s.

**At its height.** The stage after is `fours` with a height, 3 s at most. Asked 0.27, 0.25 or
0.22 of its standing height, the Warrior's centre of mass stays 0.33 m up (0.06, 0.08 and 0.11
m over what is asked), within 0.053 rad of its pitch and under 0.005 m/s, and the stage is
given up: its shins leave it no lower. Asked 0.4 it is given up 0.28 rad from its pitch. The
skeleton is given up at the three lower heights and done after 19 steps at 0.4. `fours` itself
with a height of 0.5 is given up with the centre of mass 0.13 m under it and the pelvis 0.49
rad from its pitch.

**Its left limbs let go.** The skeleton under a stage that bears on its shins (0.4 each) and
its right hand (0.2) and leaves its left: its centre of mass is within `NEAR` of the place,
slow, and its pelvis at its pitch after 0.80 s, and over the three limbs' outline drawn in
after 0.99 s, when its left hand is let go and the stage is done. A stage that leaves nothing
is done at its place alone: `fours` with the shins bearing 0.4 each is done on the skeleton
with its centre of mass nearer its knees than that outline.

### Where the rise stops

At `fours`. The Warrior and the skeleton come to their knees and hands, the rise is over with
the body still down, and the riser lies slack and begins again (the Warrior's second attempt
begins 2.4 s after its first ends). The Rogue does not reach `fours`. Nothing stands.

What was read of the ways on from knees and hands, each as one stage more:

- **Onto the shins alone** (bears on each shin 0.5, leaves the hands, the pelvis asked to 0.5
  rad, the posture sitting back on the heels: hip flexion 2.0, knee flexion 2.5, 3 s). The hands
  are never let go. The Warrior ends still, its knees on their stop (2.57 rad), its elbows
  straight and its pelvis at 0.59 rad, with its centre of mass 0.04 m ahead of its knees'
  points and 0.14 m ahead of the shins' outline drawn in; the skeleton, 0.03 m ahead of its
  knees' points. The arms' length holds the shoulders up no further while the hands are down,
  and the knees fold no further to carry the pelvis back: the passage from hands down to a body
  over its shins is not one the body can hold still through. Asked to keep its pitch (1.3 rad)
  the Warrior ends 0.06 m ahead of its knees.
- **The child's pose** (after `tuck`, a pose with the toes tucked and the arms swept back, then
  onto the shins alone with no hand down). At the pose's end the centre of mass is 0.21 m ahead
  of the knees on both bodies; on the shins alone the Warrior is asked a mean 0.77 of its
  weight beyond what its patches give and the skeleton 0.76, and both go down forward (3.8 and
  3.9 m/s).
- **A hand drawn back** (bears on each shin 0.4 and the right hand 0.2, leaves the left hand,
  whose arm the posture draws back beside its knee, 3 s). The Warrior's hand is never let go:
  its knees on their stop, its centre of mass ends 0.11 m ahead of the place. The skeleton's is
  let go after 0.99 s.
- **A shin lifted** (bears on the left shin 0.8 and each hand 0.1, leaves the right shin, 2 s).
  The Warrior's right shin is let go after 0.33 s, and the stage is given up at its limit: it
  is not at its place on three limbs.
- **Hands and feet** was read with a third kind of limb, a foot on its sole, which no stage
  kept plays and the recipe does not keep: bearing on each foot 0.3 and each hand 0.2 with the
  pelvis asked to 1.7 rad, the Warrior's elbow extensors are at their ceiling, its elbows fold
  to 2.5 rad and its chest sinks; the stage is never done.

What a way on asks that a stage does not give: **a limb moved to a place**. A stage's limbs
bear where they came down, and a limb it leaves goes where the posture puts it. Reckoned from
the bodies' ranges and strengths, not read on the stand: a foot planted between the hands needs
the hip's flexion (2.21 rad) and the lumbar spine's (0.89) at their stops together; standing on
one leg from a half kneel asks 140 to 210 N m of a knee that gives 142; and a squat on flat feet
asks more dorsiflexion than the ankle's 0.39 rad.

### The roll

A body on its back plays `RISE.roll.back`: four poses that turn it over its right side onto its
front. A posture names the side that goes under `near` and the side that comes over the top
`far` (`rollingOver`); a freedom a stage does not name goes to its zero. From the anatomical
zero, rad:

| Stage | Posture | Seconds |
|---|---|---|
| `wind` | `WIND`: far hip flexion 1.2, far hip abduction 0.54, near hip flexion 0.2, near shoulder flexion 2.8 | 0.5 |
| `swing` | `SWING`: far hip flexion 0.8, far hip internal rotation 0.6, near hip abduction 0.2, lumbar flexion 0.8, far shoulder flexion 1.4, near shoulder flexion 1.2, near shoulder abduction 2 | 1 |
| `over` | `OVER`: far hip flexion 1.2, far hip abduction 0.54, near shoulder flexion 2.8 | 0.5 |
| `flat` | `FLAT`: near shoulder flexion 2.8, far shoulder internal rotation -0.8, far elbow flexion 2.1 | 1 |

`wind` raises the far leg out to its own side and lays the near arm overhead, out of the roll's
way. `swing` throws the far leg and the far arm across the body with the pelvis curled off the
ground, and the body turns onto its near side. `over` lays the trunk straight with the far leg
kept ahead of it, and the body goes on over. `flat` lays the legs straight and sets the far hand
down beside the chest, so that the rise finds the body square on its front. Toppled backward,
both humans read on their back until `flat` begins, on their right side then, and on their
front when it ends; the body then lies slack until still, and the rise begins.

**On a side** a body plays the last two stages over the side that is under it
(`RISE.roll.left`, `RISE.roll.right`): `over` and `flat`, with `near` the side it lies on.

**How it was found.** Two rolls written by hand (a knee drawn up and its foot pushing the pelvis
over with the trunk turned after it; the far leg and arm swung across with the trunk turned)
leave the Warrior on its back at every playing, and so does the second on the Rogue. The game's
came of a seeded random search (a script that is not kept): 2,400 sequences of two to four
poses, each a random half of 23 freedoms (the hips, knees, shoulders, elbows, trunk and neck) at
random angles within every body's range, 0.4 to 1.3 s a pose, played as the back's roll on the
Warrior toppled backward. 13 ended on the front, 34 on a side and 2,353 on the back; three of
the best sixteen turned the Rogue as well. The best of those turned its body only at its second
playing, from where the first left it, so its second pose is played first (`wind`). Then each
freedom was dropped in turn, and the drop kept while every one of the twelve falls below still
ended on the front at the first playing; the angles were rounded the same way; and `flat` was
added for the rise.

**Each number's reading.** Twelve falls: both humans, with the wooden club and with nothing,
toppled backward and 20 degrees to each side of it. The roll ends all twelve on the front at
its first playing (the pelvis's forward 0.84 to 1.00 of straight down) with no segment faster
than 3.61 m/s. Fourteen falls more: the Warrior, with the club and with nothing, toppled 150 to
210 degrees about up by tens. The rise after the roll is done (`fours`) at its first attempt in
all fourteen. The same with one thing taken away:

| Without | On the front at the first playing, of 12 | The Warrior's `fours` done, of 14 |
|---|---|---|
| nothing: the game's roll | 12 | 14 |
| `wind`'s far hip flexion | 9 | 13 |
| `wind`'s far hip abduction | 10 | 12 |
| `wind`'s near hip flexion | 12 | 11 |
| `wind`'s near shoulder flexion | 12 | 12 |
| `swing`'s far hip flexion | 0 | 0 |
| `swing`'s far hip internal rotation | 0 | 0 |
| `swing`'s near hip abduction | 9 | 14 |
| `swing`'s lumbar flexion | 0 | 0 |
| `swing`'s far shoulder flexion | 9 | 4 |
| `swing`'s near shoulder flexion | 4 | 0 |
| `swing`'s near shoulder abduction | 6 | 14 |
| `over`'s far hip flexion | 6 | 2 |
| `over`'s far hip abduction | 12 | 12 |
| `over`'s near shoulder flexion | 0 | 0 |
| `flat`'s near shoulder flexion | 6 | 0 |
| `flat`'s far shoulder internal rotation | 12 | 8 |
| `flat`'s far elbow flexion | 12 | 0 |
| `wind` | 0 | |
| `swing` | 0 | |
| `over` | 8 | |
| `flat` | 12 | 7 |

Three numbers are kept on the rise's count alone, which fourteen falls do not hold firmly:
`wind`'s near hip and near shoulder, and `over`'s far hip abduction. `flat` is the rise's:
without it every body is on its front, turned, and half the Warrior's rises are given up; and
without the far hand set down beside the chest none is done.

A stage's seconds, the others the game's; on the front at the first playing, of 12, and for
`flat` the Warrior's `fours` done, of 14:

| Seconds | `wind` | `swing` | `over` | `flat` |
|---|---|---|---|---|
| 0.25 | 7 | 0 | 12 | 12 |
| 0.5 | **12** | 3 | **12** | 12; 13 |
| 0.75 | 12 | 12 | 12 | 12; 12 |
| 1 | 12 | **12** | 12 | **12; 14** |
| 1.25 | | | | 13 of 14 |
| 1.5 | 12 | 9 | 12 | 12; 14 |

`swing` for 1.5 s flings a segment at 6.86 m/s.

**With `swing`'s near hip flexed** 1 rad, as the search left it, the twelve falls end on the
front and the Warrior's fourteen rises are done just the same, and the fastest segment moves at
5.44 m/s in place of 3.61. On the battery ([Staged](#staged)) the Warrior then plays the rise
to its end in 16 falls of 31 where the game's does in 14, and the humans' median peaks are 4.2
to 5.1 m/s where the game's are 3.3 to 4.1. The number buys nothing these falls can tell, and
is not kept.

**Over the right.** Mirrored, over the left, the roll ends 9 of the twelve on the front: the
Rogue with the club in its right hand stays on its back in all three of its falls.

**The skeleton is not turned.** Toppled backward under the same recipe it reads on its back at
every stage and after each of its playings. On the battery's sixteen shoves of each model and
loadout ([Battery](#battery)), each watched 30 s (a script that is not kept), of the falls a
riser first reads on the back, the next reading is the front in 9 of 11 and 7 of 11 for the
Warrior (with nothing, with the club), 11 of 14 and 8 of 11 for the Rogue, and 0 of 11 and 1 of
10 for the skeleton.

**A shoved body on its front lies twisted.** Of the same shoves' falls that a riser first reads
on the front, the rise is given up at `fours` in 6 of the Warrior's 7 and 4 of the Rogue's 4. Reading a body as
on its front only when its pelvis's forward is under -0.9, in place of `LIE_UP`'s -0.5, so that
a twisted one plays its side's roll first: over a 30 s watch the Warrior comes to its knees and
hands at least once in 16 of 16 falls with nothing and 10 of 15 with the club, against 15 and
12 with the game's. No difference these falls can tell, so `LIE_UP` stays.

## Staged

A fighter whose body, once down, is the staged riser's ([Stages](#stages)), playing the game's
recipe (`RISE`): the roll, and the rise as far as `fours`. No assist: every side's balance is
0 %.

```powershell
node research/core-rise.mjs --workers 30 --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}],"guard":"pose"}'
```

Harness: the battery's ([Battery](#battery)), 30 workers.

**The bar**, set and not swept: each human with each loadout risen within the watch in at least
three falls of four; no way of lying under half, for either human; at least half of the bouts'
falls risen; the skeleton reported, and not held to it; and nothing flung, no row's median peak
over its row of [Driven](#driven).

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | median s it last moved | the longest, s |
|---|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 15 | 0 | - | 4.09 | 0.0 | 14.99 | 14.99 |
| workshop-fighter, empty, shoved | 16 | 16 | 0 | - | 3.67 | 0.0 | 14.99 | 14.99 |
| workshop-rogue, club, shoved | 16 | 16 | 0 | - | 3.34 | 0.0 | 14.99 | 14.99 |
| workshop-rogue, empty, shoved | 16 | 16 | 0 | - | 3.27 | 0.0 | 14.99 | 14.99 |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | - | 6.38 | 0.0 | 14.99 | 14.99 |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | - | 4.45 | 0.0 | 14.99 | 14.99 |
| bouts | 9 | 7 | 0 | - | 3.01 | 0.0 | 14.99 | 14.99 |

| falls, as the body lay | fell | rose | the furthest stage reached | played to the rise's end |
|---|---|---|---|---|
| bouts, on its back | 4 | 0 | fours 4 | 0 |
| bouts, on its front | 3 | 0 | fours 3 | 2 |
| crypt-skeleton, club, shoved, on its back | 12 | 0 | none 9, fours 3 | 2 |
| crypt-skeleton, club, shoved, on its front | 2 | 0 | none 1, fours 1 | 1 |
| crypt-skeleton, club, shoved, on its left | 1 | 0 | none 1 | 0 |
| crypt-skeleton, club, shoved, on its right | 1 | 0 | fours 1 | 1 |
| crypt-skeleton, empty, shoved, on its back | 9 | 0 | none 9 | 0 |
| crypt-skeleton, empty, shoved, on its front | 3 | 0 | fours 3 | 2 |
| crypt-skeleton, empty, shoved, on its left | 2 | 0 | none 2 | 0 |
| crypt-skeleton, empty, shoved, on its right | 2 | 0 | none 1, fours 1 | 1 |
| workshop-fighter, club, shoved, on its back | 11 | 0 | prop 1, fours 10 | 4 |
| workshop-fighter, club, shoved, on its front | 4 | 0 | prop 1, fours 3 | 1 |
| workshop-fighter, empty, shoved, on its back | 10 | 0 | prop 1, fours 9 | 7 |
| workshop-fighter, empty, shoved, on its front | 3 | 0 | fours 3 | 0 |
| workshop-fighter, empty, shoved, on its left | 1 | 0 | fours 1 | 0 |
| workshop-fighter, empty, shoved, on its right | 2 | 0 | fours 2 | 2 |
| workshop-rogue, club, shoved, on its back | 12 | 0 | none 1, fours 11 | 0 |
| workshop-rogue, club, shoved, on its front | 3 | 0 | fours 3 | 0 |
| workshop-rogue, club, shoved, on its left | 1 | 0 | fours 1 | 0 |
| workshop-rogue, empty, shoved, on its back | 15 | 0 | none 1, prop 1, fours 13 | 0 |
| workshop-rogue, empty, shoved, on its front | 1 | 0 | fours 1 | 0 |

**The bar is missed: of 102 falls none rises.** The rise ends on knees and hands
([Where the rise stops](#where-the-rise-stops)), which is down, and the riser then lies slack
and begins again: every body moves to the watch's last step. Nothing is flung: the median peaks
are 3.0 to 6.4 m/s where the driven body's are 10 to 15, and the stance is asked nothing.

What the rows say of the falls:

- **Of 95 shoved falls 69 end on the back**, 16 on the front and 10 on a side: a body that
  fights a shove turns as it goes down, and shoved forward it is as likely to land on its back.
  The roll carries them: of the humans' 48 falls on the back, 43 begin `fours`.
- **The Warrior** plays the rise to its end, on its knees and hands, in 14 falls of 31: 9 of 16
  with nothing in its hands and 5 of 15 with the club; 11 of the 21 on its back, 1 of the 7 on
  its front ([The roll](#the-roll): shoved onto its front it lies twisted) and 2 of the 3 on a
  side. The watch is short for it: a body is first read 1 to 3.5 s after its fall, and a roll,
  the stillness after it and a rise take 10 s more, so an attempt given up leaves no time for
  another. Over a 30 s watch (a script that is not kept) it
  comes to its knees and hands at least once in 15 of 16 falls with nothing and 12 of 15 with
  the club.
- **The Rogue** begins `fours` in 29 falls of 32 and is done with it in none, in 15 s or in
  30: its arms do not raise its chest ([The pose stages](#the-pose-stages)).
- **The skeleton** ends the rise in 7 falls of 32. The roll does not turn it, and 18 of its 21
  falls on the back begin no stage of the rise.
- **The bouts**: all 7 falls begin `fours`, and 2 end the rise, both from the front.

What a rising body costs a step is in `play.md#bodies-in-the-step`.
