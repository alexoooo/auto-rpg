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
it lies slack and reads again; on its front they are the rise: poses and bearing stages up to
knees and hands, a kneel-up, a step to a half kneel, and a lunge up onto both feet, where the
stance has it. This is the record of the recipe's numbers and the player's, and of where the
rise stops.

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
  is 0.049 m from its place: `NEAR` is the term that ends it.
  [What a bearing stage is done by](#what-a-bearing-stage-is-done-by) reads each term.
- **A limb a stage leaves** bears 0.01 (`LEFT`) against the stage's own limbs, whose shares sum
  to 1, until the centre of mass has been over those (within their outline, drawn in as a
  stance's is, `withinSupport`): it bears what they cannot yet, and little once they can. Read
  on the Warrior, on its knees and hands, under a stage that bears on its left shin (0.8) and
  its hands (0.1 each) and leaves its right shin: with `LEFT` 0.01 the shin is let go after
  0.21 s, and with 0.2 and with 1 not in the stage's 2 s.

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
| `fours` | 0.33, 0.45, 0.45, 0.37 | 0.15, 0.15, 0.10, 0.08: given up, on its back | 0.33, 0.43, 0.44, 0.39 |

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
| `hand.<side>` | end | the hand's capsule where it touches: under its lower end, or under its middle when both ends are down | the shoulder's three freedoms |
| `foot.<side>` | foot | its sole, as a stance stands on it (`bearingSole`, `src/core/control/support.ts`): flat, or on its front edge once its heel is up, its turn about the edge then free | every freedom from the hip down |

A limb's other freedoms (the ankle of a shin, the elbow, the wrist, the forearm's turn) are asked
toward the stage's posture. The trunk's joints are both arms' stem: the bearing solve
(`bearing.ts`) moves the limbs' ends with them as the servo asks them to move. A stage may hold
the body over where a propped foot stands in place of its patch's middle (`overProp`): the
centre of mass brought onto the toes, off the knee. A limb a stage bears on that is not down is
brought straight down onto the ground, and bears from the step it is.

Among the splits of the ground's wrench that hold the body at its place, the riser's solve takes
the one its muscles carry with the least effort (`makeBearing`'s `effort`); the stance's solve
does not weigh it.

The freedoms of a shin's or a hand's chain that take its point's task are drawn toward the
stage's posture, within what the task leaves them, at a time constant of 0.1 s
(`TAKES_SECONDS`), shorter than the stage's own, so that a hip carrying a knee keeps the turn the
posture gives it while the knee's point holds. A foot's chain is not drawn.

**How the step's numbers were read.** This sweep and every sweep of the recipe's numbers below
were read on the battery ([Staged](#staged)) with the Warrior's 128 shoves with each loadout,
each watched 40 s, one number changed at a time, the rest the game's:

```powershell
node research/core-rise.mjs --workers 30 --watch 40 --shoves 128 --only workshop-fighter --falls --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}],"guard":"pose","aim":"head"}'
```

Each cell gives how many falls rose (2 s up running) and how many are up at the end of the
watch. In brackets: the falls up at the end that the game's numbers leave down, and those
it has up that the changed number leaves down. One fall of the 128 with nothing in its hands,
and seven with the club, do not go down.

| `TAKES_SECONDS` | empty, of 127 | club, of 121 | the worst asked of the ground beyond the soles, weights |
|---|---|---|---|
| none drawn | 60, 60 (+6 -43) | 7, 9 (+7 -6) | 4.7 |
| 0.05 | 75, 72 (+10 -35) | 7, 6 (+4 -6) | 9.6 |
| **0.1** | 96, 97 | 8, 8 | 6.9 |
| 0.2 | 88, 90 (+8 -15) | 17, 15 (+12 -5) | 0.8 |

Read on the Warrior, on its knees and hands: each shin is propped (it bears from the knee back
0.41 m) and each hand lies flat. The skeleton's feet do not prop its shins there (no corner of
a sole is within `DOWN` of the ground), and they bear at the knee alone.

### The bearing stage

`fours`, the rise's first bearing stage: on knees and hands.

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

Fallen forward under the game's recipe as far as `fours`, at the step it ends:

| | Warrior | Rogue | skeleton |
|---|---|---|---|
| `fours` ends | done after 1.62 s | given up at 5 s | done after 1.44 s |
| centre of mass from its place, m | 0.049 | 0.22 | 0.050 |
| centre of mass, pelvis, chest, head up, m | 0.33, 0.45, 0.45, 0.37 | 0.15, 0.15, 0.10, 0.08 | 0.33, 0.43, 0.44, 0.39 |
| asked beyond what its patches give, mean, of its weight | 0 | 0.24 | 0 |
| the fastest a segment moves in the whole rise, m/s | 1.48 | 3.44 | 0.99 |
| the fastest in `fours`, m/s | 0.50 | 3.44 | 0.78 |

The Warrior and the skeleton end on their knees and hands, still. Their fastest segment is the
pose stages': `fours` moves nothing faster. The Rogue comes to `fours` with its chest on the
ground and its hands beside its knees, is asked 0.24 of its weight that the ground under its
limbs cannot give, its feet swing as its shins are drawn down, and it ends on its back.

`fours` swept, one number at a time, the others the game's: "done" with the stage's seconds, or
"-" where it was given up at its limit. The Rogue gives it up in every row.

| Shin, hand | Warrior | skeleton |
|---|---|---|
| 0.45, 0.05 | - (0.20 m from its place) | done 1.04 |
| 0.40, 0.10 | - (0.11 m from its place) | - (at its place, short of its pitch) |
| **0.33, 0.17** | done 1.62 | done 1.44 |
| 0.30, 0.20 | done 1.40 | done 1.80 |
| 0.25, 0.25 | done 1.02 | done 3.98 |

| Pitch, rad | Warrior | skeleton |
|---|---|---|
| 1.1 | done 1.66 | done 1.63 |
| 1.2 | done 1.63 | done 1.39 |
| **1.3** | done 1.62 | done 1.44 |
| 1.4 | done 0.75 | done 1.46 |
| 1.5 | done 0.73 | done 1.48 |

| Time constant, s | Warrior | skeleton |
|---|---|---|
| 0.2 | done 0.89 | done 0.90 |
| 0.3 | done 1.22 | done 1.09 |
| **0.4** | done 1.62 | done 1.44 |
| 0.6 | - (0.057 m from its place) | done 2.35 |

The Warrior's fastest segment is 1.48 m/s and the skeleton's 0.99 in every row; the Rogue's is
1.6 to 7.2. With the shins bearing four fifths or more the Warrior's centre of mass does not
come back to its place: its knees come to their stop (2.57 rad) with it 0.11 m short. The
game's numbers are not the sweep's fastest: a steeper pitch and a shorter time constant are done
sooner on these two bodies, and were read on a stiff topple alone.

### What a bearing stage is done by

Each term of the done test, read on a body brought to its knees and hands by the game's recipe
and then put under one stage more.

**Slow.** The stage after is `fours` again, which the body is at: unknocked, it is done at its
first step. Knocked as that stage begins, by an impulse at the middle trunk that gives the whole
body the speed named, across the ground along the pelvis's right or its forward:

| Knock, m/s | Warrior: done after, steps | skeleton: done after, steps |
|---|---|---|
| none | 1 | 1 |
| 0.2 across | 9 | 25 |
| 0.3 across | 13 | 56 |
| 0.5 across | 144 | 75 |
| 0.3 forward | 20 | 105 |
| 0.3 backward | 104 | 33 |

The Warrior knocked 0.2 m/s across is done at 0.090 m/s.

**At its height.** The stage after is `fours` with a height, 3 s at most. Asked 0.27, 0.25 or
0.22 of its standing height, the Warrior's centre of mass stays 0.33 m up, still (under 0.005
m/s), and the stage is given up: its shins leave it no lower. Asked 0.4 it stays at 0.34 m and
is given up. The skeleton is given up at the three lower heights, moving 0.10 to 0.24 m/s, and
done after 12 steps at 0.4.

**Its left limbs let go.** Under a stage that bears on the shins (0.4 each) and the right hand
(0.2) and leaves the left hand, 3 s at most, neither the skeleton nor the Warrior lets the hand
go: on three limbs the centre of mass stops still 0.07 m (skeleton) and 0.12 m (Warrior) short
of the place, never over the three limbs' outline, and the stage is given up. A stage that
leaves nothing is done at its place alone: `fours` with the shins bearing 0.38 each and the
hands 0.12 is done on the skeleton after 1.0 s with its centre of mass nearer its knees than
that outline; with the shins at 0.4 each its pelvis stays short of its pitch and the stage is
given up at its limit. That a body on three limbs stops short of its place is open.

### The abort

A rise whose trunk has been off the ground and comes back down has gone down. Once every
segment of the trunk (`Recipe.trunk`: the lower, middle and upper trunk and the head) has been
more than 0.1 m (`RAISED`) over the ground in an attempt, one of them back within `DOWN` ends it,
and the riser lies slack and begins another from the body as it is. On the battery, as
[The limbs](#the-limbs) reads it:

| `RAISED`, m | empty, of 127 | club, of 121 |
|---|---|---|
| no abort | 89, 91 (+2 -8) | 9, 8 (+5 -5) |
| 0.05 | 3, 3 (+0 -94) | 1, 1 (+0 -7) |
| **0.1** | 96, 97 | 8, 8 |
| 0.2 | 97, 99 (+2 -0) | 11, 9 (+5 -4) |

At 0.05 m the attempts end in `tuck`: 77 of the 80 falls on the back with nothing in the hands
get no further. With no abort, a body down again at the half kneel stays there until the stage's
limit: 17 of those 80 falls end at `half kneel`, against 8 with it. 0.2 m differs from 0.1 m by two
falls with nothing in the hands, which these falls cannot tell from none, so 0.1 m stays.

### The kneel-up

From knees and hands to tall on the knees, by poses alone: the body sits back on its heels and
its hands come off the ground, the trunk is raised over the knees, the forearms are brought in,
and the hips straighten. Both sides alike; from the anatomical zero, rad; a freedom a stage does
not name goes to its zero:

| Stage | Posture | Seconds |
|---|---|---|
| `sit` | `SIT`: lumbar flexion -0.2, shoulder flexion 0.6, shoulder abduction 0.2, wrist flexion -1, hip flexion 2, knee flexion 2.55, ankle dorsiflexion 0.389 (its stop) | 1 |
| `kneel 0` to `kneel 2` | three even steps from `SIT` to `KNEEL`: as `SIT`, but neck flexion -0.29, thoracic flexion 0.12, lumbar flexion 0.18, hip flexion 0.4 | 0.25 each |
| `arms`, `hold` | `KNEEL_ARMS`: as `KNEEL`, and shoulder flexion -0.09, shoulder abduction 0.28, shoulder internal rotation 0.54, elbow flexion 1.17, wrist flexion -0.04 | 0.3, then 1 |
| `tall 0` to `tall 2`, `tall` | three even steps from `KNEEL_ARMS` to `TALL`, then `TALL` held: shoulder abduction 0.28, shoulder internal rotation 0.54, elbow flexion 0.3, wrist flexion -0.04, hip flexion 0.25, knee flexion 2.2, ankle dorsiflexion 0.389 | 0.5 each, then 1 |

Each number was set by hand and read on the stand, not swept. The Warrior shoved 350 degrees
about up (a forward topple a little to its left), at each stage's last step: how it lies, and the
heights of the centre of mass and of the pelvis's, the upper trunk's and the head's centres of
mass, m:

| Stage | Warrior | skeleton |
|---|---|---|
| `fours` | front; 0.34, 0.45, 0.45, 0.38 | front; 0.33, 0.43, 0.44, 0.39 |
| `sit` | front; 0.38, 0.41, 0.58, 0.72 | front; 0.36, 0.37, 0.56, 0.73 |
| `kneel 2` | left; 0.52, 0.48, 0.84, 1.06 | right; 0.44, 0.40, 0.73, 0.97 |
| `arms` | left; 0.53, 0.48, 0.86, 1.09 | left; 0.44, 0.40, 0.73, 0.97 |
| `hold` | right; 0.51, 0.45, 0.85, 1.09 | right; 0.44, 0.39, 0.73, 0.96 |
| `tall` | left; 0.55, 0.51, 0.91, 1.15 | right; 0.48, 0.45, 0.78, 1.02 |

The skeleton was read toppled straight forward. A body tall on its knees lies on a side by
`lieOf`'s reading, since its pelvis's forward is level. **The kneel-up does not hold every forward
topple.** The Warrior shoved 330, 340, 345, 350, 355, 0, 5, 10 and 15 degrees plays every stage at
340, 350 and 15. At the other six it goes down on its front out of `arms` (355, 5) or `hold`
(330, 345, 0, 10), with the centre of mass 0.20 to 0.21 m up at the stage's end.

### The step

From tall on the knees to a half kneel: the weight goes onto the right knee, the left knee lifts
and swings through, and the left foot lands flat ahead. Then two bearing stages carry the body on
the right shin and the left foot. The step's poses (from the anatomical zero, rad; `@` either side
where the posture is both sides'):

| Stage | Posture | Seconds | Drive |
|---|---|---|---|
| `shift` | `SHIFT`: as `TALL`, and lumbar lateral flexion right 0.05, left hip abduction 0.15, right hip abduction -0.15 | 0.6 | the pose drive |
| `lift` | `LIFT`: as `SHIFT`, and lumbar flexion -0.2, left hip flexion 0.35, left hip abduction 0.17, left knee flexion 2.56, left ankle dorsiflexion -0.85 | 0.35 | `QUICK` |
| `swing` | `SWING_THROUGH`: as `LIFT`, but left hip flexion 1.8, left hip abduction 0.1 | 0.3 | `QUICK` |
| `flip` | `FLIP`: as `SWING_THROUGH`, but left ankle dorsiflexion 0.38 | 0.12 | `QUICK` |
| `reach` | `REACH`: as `FLIP`, but left hip abduction 0.56, left knee flexion 2, left ankle dorsiflexion 0.389, left ankle inversion 0.56 | 0.25 | `QUICK` |

The poses were set by hand and read on the stand, not swept. `QUICK` asks each freedom the speed
that closes its error in 0.1 s, no faster than 6 rad/s, where the pose drive asks 0.2 s and
3 rad/s: a knee swung through slowly is a body on one knee for longer. On the battery:

| `QUICK` | empty, of 127 | club, of 121 |
|---|---|---|
| the pose drive | 8, 9 (+7 -95) | 9, 9 (+9 -8) |
| 4 rad/s, 0.15 s | 60, 62 (+11 -46) | 40, 39 (+35 -4) |
| 5 rad/s, 0.12 s | 97, 98 (+6 -5) | 18, 15 (+11 -4) |
| **6 rad/s, 0.1 s** | 96, 97 | 8, 8 |

The slower step lifts the club five times as often, and costs the body with nothing in its hands
a third of its rises: the step that suits one loadout does not suit the other, and is open
([Where the rise stops](#where-the-rise-stops)).

The bearing stages:

| | `half kneel` | `onto the toes` |
|---|---|---|
| bears on | the right shin 0.65, the left foot 0.35 | the right shin 0.4, the left foot 0.6 |
| held over | the middle of the shin's patch | where the right foot stands on its toes (`overProp`) |
| height, pitch | none asked | none asked |
| posture | `HALF_KNEEL` | `HALF_KNEEL` |
| time constant, limit | `BEAR_SECONDS`, `BEAR_LIMIT` | the same |

`HALF_KNEEL` is the statics' answer for the posture audit's row `half kneel` (on the right knee
and its tucked toes and the left sole: `ROWS`, `research/core-posture-trials.mjs`), from a search
longer than [postures.md](postures.md)'s. The script that ran it is not kept. Its angles are
rounded to 0.01 rad, the stops given whole (the right knee's 2.567, the right ankle's 0.389). Read
again by the statics (`statics` and `recordOf`, snapped), the answer holds at 0.034 of the body's
strength, 0.13 m inside its support. One angle is not the answer's: the left ankle is asked
-0.55 rad, not 0.389. While the left foot bears, the posture's ankle is read: asked 0.389, the
ankle stays 1.26 rad short of it on the stand, and on the battery 91 falls with nothing in the
hands are up at the end, against 97 (+2 -8; club 9 against 8, +4 -3). With -0.55 the statics hold
the recipe's posture at 0.146.

The shares were read on the battery, as the other numbers:

| `onto the toes`, shin and foot | empty, of 127 | club, of 121 |
|---|---|---|
| 0.5, 0.5 | 25, 19 (+2 -80) | 11, 10 (+6 -4) |
| **0.4, 0.6** | 96, 97 | 8, 8 |

`BEAR_SECONDS` is the time constant of every bearing stage from the half kneel up, 0.35 s.
`BEAR_LIMIT`, 4 s, is the longest any of them may take before the attempt is given up:

| `BEAR_SECONDS`, s | empty, of 127 | club, of 121 | the worst asked, weights |
|---|---|---|---|
| 0.25 | 85, 79 (+3 -21) | 8, 8 (+4 -4) | 14.9 |
| 0.3 | 95, 89 (+2 -10) | 10, 9 (+3 -2) | 3.7 |
| 0.325 | 96, 96 (+2 -3) | 10, 9 (+3 -2) | 3.3 |
| **0.35** | 96, 97 | 8, 8 | 6.9 |
| 0.375 | 92, 97 (+2 -2) | 6, 7 (+3 -4) | 0.8 |
| 0.4 | 83, 85 (+0 -12) | 5, 6 (+2 -4) | 3.0 |
| 0.6 | 6, 4 (+0 -93) | 3, 3 (+2 -7) | 3.0 |

With `BEAR_LIMIT` at 3 s every fall reads as at 4 s.

### The lunge

From the half kneel onto both feet: four bearing stages on the left foot and the right, the
right on its toes, each holding the centre of mass at a height (a part of the height the body
was built standing at: 1.0145 m for the Warrior), then the weight even on the feet.

| Stage | Height, of standing | Left foot's share | Posture |
|---|---|---|---|
| `lunge 0` | 0.59 | 0.6 | `LUNGE[0]` |
| `lunge 1` | 0.69 | 0.67 | `LUNGE[1]` |
| `lunge 2` | 0.79 | 0.79 | `LUNGE[2]` |
| `lunge 3` | 0.89 | 0.75 | `LUNGE[3]` |
| `even` | 0.89 | 0.5 | `LUNGE[3]` |

Each rung of `LUNGE` is the statics' answer for the audit's row `lunge` (the right ball and the
left sole) at a centre of mass 0.6, 0.7, 0.8 and 0.9 m up. The search ran with the feet held to the
half kneel's placement (a penalty on the distance between the left sole and the right ball, and on
each foot's heading about the line between them), each rung started from the one below; the
script that ran it is not kept. A rung's height is its answer's over the Warrior's standing one,
to 0.01. Its share, from `lunge 1` up, is where its answer's centre of mass stands along the line
from the right ball to the left sole: 0.668, 0.787, 0.747. Read again by the statics, snapped, the
recipe's rounded postures hold at:

| Rung | Share of strength | Inside its support, m | Left sole, right ball, N |
|---|---|---|---|
| `lunge 0` | 0.34 | 0.047 | 285, 490 |
| `lunge 1` | 0.41 | 0.067 | 559, 216 |
| `lunge 2` | 0.51 | 0.045 | 639, 136 |
| `lunge 3` | 0.29 | 0.076 | 554, 221 |

`lunge 0`'s share is not its answer's (0.342): it is `onto the toes`'s, the centre of mass held
where the stage before left it. On the battery, at its answer's 0.34, 70 falls with nothing in the
hands are up at the end against 97 (+1 -28; club 8, +1 -1).

The step, the lunge and the hand-over, read on the Warrior shoved 350 degrees (as
[The kneel-up](#the-kneel-up)), at each stage's last step:

| Stage | lies on its | centre of mass, pelvis, chest, head up, m |
|---|---|---|
| `shift` | right | 0.55, 0.50, 0.90, 1.14 |
| `reach` | left | 0.59, 0.50, 0.90, 1.13 |
| `half kneel` | left | 0.58, 0.48, 0.88, 1.12 |
| `onto the toes` | back | 0.56, 0.47, 0.84, 1.07 |
| `lunge 0` | back | 0.56, 0.47, 0.83, 1.07 |
| `lunge 1` | back | 0.66, 0.61, 0.90, 1.10 |
| `lunge 2` | right | 0.76, 0.73, 1.04, 1.21 |
| `lunge 3` | right | 0.84, 0.82, 1.14, 1.31 |
| `even` | right | 0.88, 0.87, 1.18, 1.35 |

Standing as built, the Warrior's centre of mass is 1.01 m up and the stance holds it 0.03 m lower
(`STANCE_LOWER`). The skeleton toppled straight forward plays the step and goes down in
`half kneel`, its centre of mass 0.32 m up at the stage's end.

### The handover

After `even` the riser's rise is over. If the body is up, its host's stance has it; the
locomotion skill is resumed (`Skill.resume`), facing the way the pelvis faces. It reads that from
the pelvis's left-to-right axis, which says it however far forward the pelvis is pitched. Two
numbers carry the body from the lunge's last rung into the stance:

- **The asked height** rises from where the centre of mass is to the stance's by a smoothstep over
  1.3 s (`RISING_SECONDS`). Asked its full height at once from a crouch, the stance drives the knees
  straight under a centre of mass that has not come over the feet.
- **Squaring**: the foot nearer the centre of mass stays, and the other steps to its own side of
  it, across the heading at the width the body was built standing at, as far ahead as it is. It
  stays where it is if it is within 0.1 m of that place (`SQUARE_NEAR`).

| | empty, of 127 | club, of 121 |
|---|---|---|
| `RISING_SECONDS` none (the full height at once) | 96, 87 (+1 -11) | 8, 7 (+1 -2) |
| `RISING_SECONDS` 0.65 | 96, 97 (+0 -0) | 8, 9 (+1 -0) |
| **`RISING_SECONDS` 1.3** | 96, 97 | 8, 8 |
| `RISING_SECONDS` 2.6 | 96, 97 (+0 -0) | 8, 9 (+1 -0) |
| no squaring | 96, 94 (+1 -4) | 8, 8 (+1 -1) |
| `SQUARE_NEAR` 0.05 | 96, 94 (+0 -3) | 8, 8 (+0 -0) |
| **`SQUARE_NEAR` 0.1** | 96, 97 | 8, 8 |
| `SQUARE_NEAR` 0.2 | 96, 94 (+1 -4) | 8, 7 (+0 -1) |

Neither number changes whether a body rises: both act once it is up. What they change is
whether it stays up. A rising height is worth ten falls of the 127; how long it takes, from 0.65
to 2.6 s, is worth none these falls can tell. Squaring is worth three or four, and no `SQUARE_NEAR`
read does better than 0.1 m.

### Where the rise stops

The Warrior with nothing in its hands stands up. Of 127 shoved falls, watched 40 s, 96 rise and 97
are up at the end ([Staged](#staged)); of the 30 left down, 12 end their last attempt at the half
kneel and 10 in the kneel-up. What is open, each read on the stand or the battery above:

- **The kneel-up falls forward** out of `arms` or `hold` in six of the nine forward topples read
  ([The kneel-up](#the-kneel-up)): the trunk raised over the knees, with the forearms brought in,
  is not held over them.
- **The club stalls at the half kneel**: 8 of 121 falls rise, and 74 of the 113 left down end their
  last attempt at `half kneel`. A slower step lifts it five times as often and costs the body with
  nothing a third of its rises ([The step](#the-step)).
- **On three limbs the centre of mass stops short of its place**
  ([What a bearing stage is done by](#what-a-bearing-stage-is-done-by)), so no stage leaves a hand
  or a shin by bearing on the other three.
- **The Rogue and the skeleton do not rise.** The Rogue's arms do not raise its chest
  ([The pose stages](#the-pose-stages)); on the battery it gets as far as the kneel-up, and once
  into the step. The skeleton plays the step and goes down in the half kneel, and its roll does not
  turn it ([Staged](#staged)).

What the Warrior's body allows on each way from knees and hands, held still with no controller in
it, is read in [postures.md](postures.md#the-verdict-by-route).

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
recipe (`RISE`): the roll, and the rise to its feet, where its stance has it. No assist: every
side's balance is 0 %. Each fall is watched 40 s, since a fall, the stillness after it, a roll and
a rise take 20 s and more:

```powershell
node research/core-rise.mjs --workers 30 --watch 40 --falls --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}],"guard":"pose","aim":"head"}'
```

Harness: the battery's ([Battery](#battery)), 30 workers, each fall watched 40 s.

**The bar**, set and not swept: each human with each loadout risen within the watch in at least
three falls of four; no way of lying under half, for either human; at least half of the bouts'
falls risen; the skeleton reported, and not held to it; and nothing flung, no row's median peak
over its row of [Driven](#driven).

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | median s it last moved | the longest, s | up at the end |
|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 15 | 2 | 23.67 | 8.55 | 2.6 | 39.99 | 39.99 | 1 |
| workshop-fighter, empty, shoved | 16 | 16 | 12 | 23.00 | 4.55 | 2.9 | 30.22 | 39.99 | 11 |
| workshop-rogue, club, shoved | 16 | 16 | 0 | - | 5.57 | 0.0 | 39.99 | 39.99 | 0 |
| workshop-rogue, empty, shoved | 16 | 16 | 0 | - | 4.31 | 0.0 | 39.99 | 39.99 | 0 |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | - | 7.37 | 0.0 | 39.99 | 39.99 | 0 |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | - | 4.97 | 0.0 | 39.99 | 39.99 | 0 |
| bouts | 9 | 6 | 1 | 23.32 | 6.16 | 0.4 | 39.99 | 39.99 | 1 |

| falls, as the body lay | fell | rose | the furthest stage reached | played to the rise's end |
|---|---|---|---|---|
| bouts, on its back | 3 | 0 | none: 1, hold: 2 | 0 |
| bouts, on its front | 1 | 0 | hold: 1 | 0 |
| bouts, on its right | 2 | 1 | hold: 1, even: 1 | 1 |
| crypt-skeleton, club, shoved, on its back | 12 | 0 | none: 6, tuck: 3, fours: 2, sit: 1 | 0 |
| crypt-skeleton, club, shoved, on its front | 2 | 0 | none: 1, half kneel: 1 | 0 |
| crypt-skeleton, club, shoved, on its left | 1 | 0 | none: 1 | 0 |
| crypt-skeleton, club, shoved, on its right | 1 | 0 | tuck: 1 | 0 |
| crypt-skeleton, empty, shoved, on its back | 9 | 0 | none: 9 | 0 |
| crypt-skeleton, empty, shoved, on its front | 3 | 0 | tuck: 1, half kneel: 2 | 0 |
| crypt-skeleton, empty, shoved, on its left | 2 | 0 | none: 2 | 0 |
| crypt-skeleton, empty, shoved, on its right | 2 | 0 | none: 1, half kneel: 1 | 0 |
| workshop-fighter, club, shoved, on its back | 11 | 2 | hold: 1, tall 0: 1, half kneel: 6, lunge 1: 1, lunge 2: 1, even: 1 | 2 |
| workshop-fighter, club, shoved, on its front | 4 | 0 | half kneel: 4 | 0 |
| workshop-fighter, empty, shoved, on its back | 10 | 10 | none: 1, even: 9 | 10 |
| workshop-fighter, empty, shoved, on its front | 3 | 1 | fours: 1, half kneel: 1, even: 1 | 1 |
| workshop-fighter, empty, shoved, on its left | 1 | 0 | fours: 1 | 0 |
| workshop-fighter, empty, shoved, on its right | 2 | 1 | hold: 1, even: 1 | 1 |
| workshop-rogue, club, shoved, on its back | 12 | 0 | none: 1, fours: 1, hold: 9, tall 0: 1 | 0 |
| workshop-rogue, club, shoved, on its front | 3 | 0 | hold: 2, reach: 1 | 0 |
| workshop-rogue, club, shoved, on its left | 1 | 0 | hold: 1 | 0 |
| workshop-rogue, empty, shoved, on its back | 14 | 0 | none: 1, fours: 3, hold: 10 | 0 |
| workshop-rogue, empty, shoved, on its front | 1 | 0 | hold: 1 | 0 |
| workshop-rogue, empty, shoved, on its left | 1 | 0 | hold: 1 | 0 |

"The furthest stage" is the last attempt's, as the watch ends; a body that rose and went down
again may have begun another.

**The bar is missed.** The Warrior with nothing in its hands meets it: 12 of 16 falls rise and 11
are up at the end. With the club 2 of 15 rise, the Rogue and the skeleton none, and 1 of the 6
bouts' falls. Nothing is flung: the median peaks are 4.3 to 8.6 m/s where the driven body's are
10 to 15.

The Warrior's 16 falls a loadout tell little, so the battery was read with 128 shoves a loadout,
the Warrior alone; every sweep of [Stages](#stages) is read on it:

```powershell
node research/core-rise.mjs --workers 30 --watch 40 --shoves 128 --only workshop-fighter --falls --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}],"guard":"pose","aim":"head"}'
```

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | median s it last moved | the longest, s | up at the end |
|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 128 | 121 | 8 | 25.15 | 8.32 | 3.5 | 39.99 | 39.99 | 8 |
| workshop-fighter, empty, shoved | 128 | 127 | 96 | 22.74 | 4.47 | 6.9 | 28.85 | 39.99 | 97 |

| falls, as the body lay | fell | rose | the furthest stage reached | played to the rise's end |
|---|---|---|---|---|
| workshop-fighter, club, shoved, on its back | 74 | 5 | none: 2, arms: 1, hold: 9, tall 0: 2, tall 1: 3, tall: 1, swing: 1, half kneel: 47, onto the toes: 1, lunge 1: 2, lunge 2: 1, even: 4 | 5 |
| workshop-fighter, club, shoved, on its front | 35 | 2 | fours: 1, kneel 2: 1, arms: 1, hold: 5, tall: 1, half kneel: 22, lunge 1: 1, lunge 3: 1, even: 2 | 2 |
| workshop-fighter, club, shoved, on its left | 8 | 1 | fours: 1, hold: 3, half kneel: 3, even: 1 | 1 |
| workshop-fighter, club, shoved, on its right | 4 | 0 | hold: 1, shift: 1, half kneel: 2 | 0 |
| workshop-fighter, empty, shoved, on its back | 80 | 66 | none: 1, fold: 1, hold: 2, tall 0: 1, half kneel: 8, lunge 1: 1, lunge 3: 1, even: 65 | 66 |
| workshop-fighter, empty, shoved, on its front | 27 | 21 | fours: 1, hold: 2, half kneel: 2, lunge 2: 1, even: 21 | 21 |
| workshop-fighter, empty, shoved, on its left | 10 | 2 | none: 1, fours: 1, hold: 1, tall 0: 1, tall: 1, half kneel: 1, lunge 3: 1, even: 3 | 2 |
| workshop-fighter, empty, shoved, on its right | 10 | 7 | hold: 2, half kneel: 1, even: 7 | 7 |

What the rows say of the falls:

- **The Warrior with nothing in its hands rises from three falls of four**: 96 of 127, 97 up at
  the end, in a median 22.7 s from the fall. From its back 66 of 80 rise, from its front 21 of 27,
  from its right 7 of 10, from its left 2 of 10: **its left side is under half**, so the bar's
  "no way of lying under half" is missed by this body too.
- **With the club it stalls at the half kneel**: 74 of the 113 falls left down end their last
  attempt there ([Where the rise stops](#where-the-rise-stops)).
- **The Rogue** comes to its knees and hands and into the kneel-up, and once into the step: 29 of
  its 32 falls end their last attempt at `fours` or in the kneel-up.
- **The skeleton**: its roll does not turn it (15 of its 21 falls on the back begin no stage of the
  rise), and from its front it goes down in the half kneel.
- **The bouts**: 1 of 6 falls rises, from its right side; four of the other five end at `hold`.

What a rising body costs a step is in `play.md#bodies-in-the-step`.
