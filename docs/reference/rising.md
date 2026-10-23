# Down, and getting up

How the core reads a fall (`fallen`, `BodyView.down`), the owner's stand-up target, the battery of
falls a riser is read on, and the staged riser's recipe (`RISE`, `stagedRise`,
`src/core/mind/rise/`) with the readings behind each of its numbers. Read by the rise's modules
and `research/core-rise*.mjs`.

## Down

A human is down while its centre of mass is more than its spec's `fallen`, 0.25 m, under the
height it is asked to hold (`DownSpec` `asked`, `src/core/spec/body.ts`, read by `uprightness`,
`src/core/control/ground.ts`). The bar is set, not swept: it is the one the stance's batteries
count a fall by (`stance-tuning.md#fallen`). The reptile is down by its own rule (`low`,
`reptile.md`).

- **The height is over the body's lowest point**: the least over every segment's shape (a
  capsule's ends, a sphere's centre less its radius, a box's corners, a hull's points). The soles'
  middles, which the stance measures from, are off the ground once a body lies. A held item weighs
  in the centre of mass and is not a point the body lies on.
- **The height asked is the stance goal's** (`MotorControl.standing`), at most the standing height
  by its spec; a body with no stance goal is read against its standing height. A crouch, a kneel
  or a roll asks its own height and is not down for it.
- **It is a reading, not a memory**: taken at every step (`BodyView.down`), so a fight, a page, a
  test and the body's own mind read the same thing.

Standing heights by spec, m: Warrior 1.0145 (1.0174 with the wooden club in its right hand), Rogue
0.9098, skeleton 0.8824. On the Node stand, Rapier, 120 Hz, a body built on the ground is within
1 mm of its centre of mass's height, and lying limp within 5 mm (it rests 2 to 3 mm into the
ground). Against the reading it replaced (over the soles' middles, latched), a bout that ends by a
fall ends 0.05 to 0.6 s later and is the same to the bit until then
(`bouts.md#down-read-from-the-body`).

## The owner's target

A stand-up is read on the owner's 64-fall target:

```powershell
npm run evaluate -- rising-target [riser ...]
```

- **The falls**: the Warrior and the Rogue, empty-handed and with the club, each shoved sixteen
  ways 22.5 degrees apart, through the Lab's Stand-up mode (`src/lab/ground-mode.ts`), a shove the
  body holds given again the same way 1.5 s later, at most three (`SHOVED`): the Warrior's braced
  stance holds 6 of its 16 club shoves and 1 empty-handed, and a fall not made is no stand-up; Node stand,
  core world, Rapier, 120 Hz, calm air, Balance 0 and Grit 0, a 30 s cap. The flag fixes models,
  loadouts, directions and assists; the Lab's Stand-up scenario plays the same falls as a round on
  one body. A riser is the game's Stand up (`step-up`) unless named: `support-recovery`,
  `stand-up` with every technique, a technique's name, or a mind's JSON. `research/rising-bed.mjs
  --target` plays the same falls (`src/evaluation/rising.ts`).
- **A recovery** is timed to verified standing, from the riser's takeover, through landing,
  orientation and retries. A fall not stood counts at the cap.
- **The bar** (`risingReport`'s gates): every direction present once in each group; at least 15 of
  16 within 6 s in each body and loadout group, and 61 of 64 overall; every cardinal direction
  within 6 s; a failure-inclusive median of at most 4 s.
- **The baseline** is the game's Stand up (`step-up`) ([Step-up on the owner's target](#step-up-on-the-owners-target)).
- **A controller that acts on the muscles from an observation** runs on the stand-up screen's
  sixteen falls, made afresh each run:
  `node research/stand-up-acceptance.mjs --candidate <module>`. The screen does not establish the
  target.

The protocol changes when a controller needs it to; a figure read on an earlier protocol is read
again before it is compared. Failures and external-actuation rejections are reported as failures.

## Battery

The falls a riser is measured on (`research/core-rise-trials.mjs`) and their table
(`research/core-rise.mjs`). Node, the core world (`src/core/world.ts`), Rapier, 120 Hz, each fall
in a world of its own with the arena's solids; every body has the game's mind (`RECIPE_FIGHTER`,
`src/core/mind/config.ts`) or the one `--mind` gives.

```powershell
node research/core-rise.mjs --workers 14 [--mind '<MindConfig JSON>']
```

- **A shove** (`shoved`): a body built as the arena builds one, ordered to stand in guard
  (`STAND_ORDERS`), is shoved after 1 s at its middle trunk's centre by 1.5 N s per kilogram of
  body, across the ground. Sixteen shoves 22.5 degrees apart, for each model with the wooden club
  in its right hand and with nothing (`LOADOUTS`). It fell if it is down within 3 s; a shove it
  holds is counted and left out of the rates.
- **A bout's fall** (`boutFall`): each of the arena's nine matchups at 4 m, played to the first
  step a side is down; the other side is then ordered to stand.
- **The watch**: 15 s from the fall (`WATCH_SECONDS`), or `--watch`. A body has risen at the start
  of its first 2 s up (`UP_SECONDS`, `risenAt`).

Columns: falls of trials; how many rose; median seconds to rise; median over the falls of the
fastest any segment moved from 1 s after the fall, m/s (how much it thrashes); the most the stance
asked of the ground beyond its soles, in body weights (`StanceReading.shortfall`; `inf` past what
a number holds); the median and longest seconds to the last step any segment moved faster than
0.05 m/s (`STILL`). With `--falls` a second table gives, for each way the bodies lay a second after
the fall (`lieOf`), how many rose, the furthest stage of the rise each last attempt began, and how
many played the rise to its end.

## Driven

A fighter that hands its body to nobody: once down it is driven on by its stance, bearing on
soles that are not under it, with no assist.

```powershell
node research/core-rise.mjs --mind '{"kind":"fighter","tactics":{"kind":"seek","guard":"pose","aim":"head","range":"close"},"locomotion":{"kind":"stance-walk"},"guard":{"kind":"cover-guard"},"blow":{"kind":"recipe-strike"},"kick":null,"support":null,"subs":[]}'
```

Of 102 falls (95 shoves, 7 bouts) none rises and none is ever still. Median peaks are 10.4 to
14.6 m/s; the stance's ask grows without bound (`inf` in every row): on the Warrior with
the club shoved right, 3 to 82 weights from 1 to 4 s, past 1e30 at 6 s and 1e100 at 16 s.

## Lying

The recipe fighter (`RECIPE_FIGHTER`, the Lab's minds): from the step a body is down it is
`lie`'s (`lying`, `src/core/mind/lie.ts`), which asks its muscles and stance for nothing. At an
activation of 0 the muscle driver sets each motor to give no torque, which is what releasing the
muscles does (`Body.dispose`): read with the muscles released in place of `lie`, the seconds each
body last moved are the same to the digit. A crypt body out of the fight is limp in the same way
(`DungeonRun.drop`).

```powershell
node research/core-rise.mjs
```

| falls | of | fell | rose | median peak, m/s | median s it last moved | the longest, s |
|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 15 | 0 | 2.56 | 3.06 | 14.99 |
| workshop-fighter, empty, shoved | 16 | 16 | 0 | 2.48 | 2.15 | 13.51 |
| workshop-rogue, club, shoved | 16 | 16 | 0 | 1.92 | 3.27 | 14.99 |
| workshop-rogue, empty, shoved | 16 | 16 | 0 | 1.83 | 3.61 | 14.99 |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | 3.10 | 10.82 | 14.99 |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | 4.14 | 11.49 | 14.99 |
| bouts | 9 | 7 | 0 | 1.41 | 1.74 | 14.99 |

**A limp body does not always come to rest.** In six rows of seven some body still moves on the
watch's last step. The Warrior with the club shoved forward has a hand at 7.6 m/s in the first
second, a foot at 6.1 in the next, 0.26 in the third and under 0.01 after. The skeleton with
nothing shoved forward turns its left hand at 0.15 to 0.21 m/s (3 to 5 rad/s) every second from
the seventh to the fifteenth while its centre of mass stays within a millimetre: a light segment
at the end of a slack joint, kept going by the solver. What in the solver does it is not read.

## Stages

The riser (`stagedRise`, `src/core/mind/rise/staged.ts`) plays a recipe (`Recipe`, `RISE`,
`src/core/mind/rise/stages.ts`): it lies slack until still, reads how it lies, and plays stages.
On its back or a side they are that lie's roll, poses that turn it onto its front, after which it
lies slack and reads again; on its front they are the rise: poses and bearing stages to knees and
hands, a kneel-up, a step to a half kneel, and a lunge onto both feet, where the stance has it.

**Stand readings** (every table here but the battery's): Node, the core world with the arena's
solids, Rapier, 120 Hz; the body empty-handed, held stiff in its reference pose, shoved as the
battery shoves and held stiff 1.5 s more (`toppled`, `research/core-rise-trials.mjs`), then the
riser has it. No assist.

```powershell
node research/core-rise-poses.mjs --model workshop-fighter --lie front [--stages '<Stage[] JSON>']
```

**Battery sweeps** (one number changed at a time, the rest the game's): the Warrior's 128 shoves
with each loadout, each watched 40 s, at `0b9a7b56` ([Staged](#staged)):

```powershell
node research/core-rise.mjs --workers 30 --watch 40 --shoves 128 --only workshop-fighter --falls --mind '{"kind":"fighter","tactics":{"kind":"seek","guard":"pose","aim":"head","range":"close"},"locomotion":{"kind":"stance-walk"},"guard":{"kind":"cover-guard"},"blow":{"kind":"recipe-strike"},"kick":null,"support":null,"subs":[{"kind":"staged-rise"}]}'
```

A cell is how many falls rose and how many are up at the end; in brackets, the falls up at the end
that the game's numbers leave down and those the game's has up that the change leaves down. One
empty-handed shove and seven with the club do not fell the body, leaving 127 and 121. The game's
row reads 112, 110 and 94, 97. A few falls each way is within what these falls tell apart.

### A posture is written from each freedom's own zero

Joint angles are measured from a body's reference pose, and those differ (the humans' arms out and
down, the skeleton's elbows at a right angle). Each freedom's reference angle from the anatomical
position is in its spec (`DofSpec.bind`), and a stage's posture (`Posture`) is written from that
zero, so one posture is the same shape on all three bodies. The reference pose's angles, rad:

| The reference pose's | Warrior | Rogue | skeleton |
|---|---|---|---|
| elbow flexion | 0.81 | 0.73 | 1.62 |
| shoulder abduction | 0.72 | 0.74 | 0.00 |
| shoulder flexion | 0.03 | -0.04 | -0.09 |
| hip flexion | 0.11 | 0.03 | 0.00 |
| knee flexion | 0.11 | 0.14 | 0.00 |
| ankle dorsiflexion | 0.03 | 0.07 | 0.00 |

Written from the reference pose, the humans' folded elbow would be past the skeleton's stop; from
the zero the Warrior's and the skeleton's ranges are the same, so a recipe that fits one fits the
other (`stageFaults`).

### The player's numbers

Set, not swept, unless a sweep is given.

- **Still**: the centre of mass under 0.1 m/s (`SLOW`) for 0.5 s (`STILL_SECONDS`). The centre of
  mass, not the segments, since a limp hand can turn for as long as it is watched ([Lying](#lying)).
- **How it lies** (`lieOf`): the pelvis's forward against up. Over 0.5 (`LIE_UP`) it is on its
  back, under -0.5 on its front, between on the side its left is under.
- **The pose drive**: each freedom is asked the speed that closes its error in 0.2 s
  (`POSE_SECONDS`), no faster than 3 rad/s (`POSE_SPEED`), at full activation. The joint servo
  (`servo`, `src/core/control/servo.ts`) takes the root as held and knows no contact, which a body
  pressing off the ground is not. Fallen forward, at the end of the bare `prop`
  ([The pose stages](#the-pose-stages)), the pelvis's and upper trunk's heights, m:

  | Drive | Warrior | Rogue | skeleton |
  |---|---|---|---|
  | lying, before any | 0.17, 0.14 | 0.14, 0.12 | 0.10, 0.10 |
  | the speeds | 0.43, 0.46 | 0.38, 0.23 | 0.40, 0.42 |
  | the servo, 0.1 s | 0.30, 0.15 | 0.32, 0.11 | 0.31, 0.12 |
  | the servo, 0.2 s | 0.21, 0.15 | 0.20, 0.14 | 0.22, 0.12 |

- **A stage's time** is counted to the nearest step.
- **A limb is down** within 0.03 m of the ground (`DOWN`), and only then bears; a foot props its
  shin when a corner of its sole is that near. It must tell apart a hand toppled stiff (far end at
  0.000 m, near end 0.033 m up on the Warrior, 0.067 on the skeleton), a hand on knees and hands
  (both ends within 0.002 m), and knees lying flat after `fold` (0.094 m up on the Warrior, 0.10
  the Rogue, 0.054 the skeleton), so a body on its front is not on its knees.
- **A bearing stage is done** when every limb it bears on is down, those it leaves are let go, the
  centre of mass is within 0.05 m of its aim (`NEAR`) and slower than `SLOW`, and the pelvis within
  0.15 rad of its pitch (`TURNED`). When `fours` is done the Warrior's centre of mass is 0.049 m
  from its place: `NEAR` ends it ([What a bearing stage is done by](#what-a-bearing-stage-is-done-by)).
- **A limb a stage leaves** bears 0.01 (`LEFT`) against the stage's own limbs, whose shares sum to
  1, until the centre of mass is within their outline (`withinSupport`). On the Warrior on its
  knees and hands, leaving its right shin: at 0.01 the shin is let go after 0.21 s; at 0.2 and 1,
  not within the stage's 2 s.

### The pose stages

Both sides alike; a freedom a stage does not name goes to its zero. From the anatomical zero, rad:

| Stage | Posture | Seconds |
|---|---|---|
| `fold` | `FOLD`: shoulder flexion 0.9, shoulder abduction 0.7, elbow flexion 2.4, ankle dorsiflexion -0.85 | 1 |
| `tuck` | `TUCK`: as `FOLD`, and hip flexion 2.1, knee flexion 2.5, lumbar flexion 0.7, thoracic flexion 0.3 | 2 |
| `prop` | `PROP`: as `TUCK`, but shoulder flexion 1.3, elbow flexion 1.0, lumbar flexion 0.4, and shoulder internal rotation -0.4, wrist flexion -1.2, ankle dorsiflexion 0.38 | 1.5 |

`fold` points the feet so the shins lie flat and asks the arms folded (lying on them, they fold as
`tuck` lifts the body off them). `tuck` draws the knees under. `prop` reaches the arms ahead and
straight, hands palm down, and tucks the toes under, so each shin is propped on its foot.

Fallen forward, at each stage's last step, the heights of the centre of mass and of the pelvis's,
upper trunk's and head's centres of mass, m:

| | Warrior | Rogue | skeleton |
|---|---|---|---|
| lying | 0.14, 0.17, 0.14, 0.10 | 0.12, 0.14, 0.12, 0.08 | 0.10, 0.10, 0.10, 0.09 |
| `fold` | 0.16, 0.17, 0.15, 0.11 | 0.14, 0.16, 0.14, 0.09 | 0.11, 0.10, 0.10, 0.10 |
| `tuck` | 0.26, 0.41, 0.23, 0.11 | 0.23, 0.37, 0.16, 0.07 | 0.24, 0.37, 0.25, 0.12 |
| `prop` | 0.33, 0.42, 0.44, 0.39 | 0.26, 0.39, 0.26, 0.11 | 0.31, 0.40, 0.41, 0.39 |
| `fours` | 0.33, 0.45, 0.45, 0.37 | 0.15, 0.15, 0.10, 0.08: given up, on its back | 0.33, 0.43, 0.44, 0.39 |

**The Rogue's arms do not raise its chest**: at `prop`'s end its hands are beside its knees, its
shoulders 0.6 rad short. Its shoulder flexors peak at 32 N m and elbow extensors at 25, the
Warrior's at 67 and 57, for 57.6 kg against 79.0: per kilogram, 0.66 and 0.60 of the Warrior's.

**The bare `prop`** (as `TUCK`, but shoulder flexion 1.3, elbow flexion 1.0, lumbar flexion 0.4,
thoracic flexion 0, hands as they fall, feet pointed) ends the Warrior at 0.34, 0.43, 0.46, 0.48,
the Rogue at 0.25, 0.38, 0.23, 0.10 and the skeleton at 0.32, 0.40, 0.42, 0.46. Read with it:

- twelve other recipes on the Rogue (no `fold`, arms nearer the trunk, shoulders less flexed,
  elbows straighter or more bent, trunk straight or arched, `prop` for 3 s, hips opened to 1.9,
  1.7, 1.3 and 0.6 rad) end its chest 0.12 to 0.23 m up. Opened hips lower the pelvis and lift
  nothing; on the Warrior and the skeleton, hips at 1.3 rad end the chest at 0.50 and 0.49 m;
- without `fold` the Warrior's chest ends at 0.22 m: arms asked to fold while the knees draw under
  do not get under the shoulders;
- arms 0.3 rad from the trunk in place of 0.7 read the same on the humans to the centimetre;
- a body toppled stiff to a side is on its front or back by the time its stiffness ends: a side is
  a lie a fall passes through.

### The limbs

What a bearing stage may bear on (`Recipe.limbs`, made by `riseLimbs`,
`src/core/mind/rise/limbs.ts`). Both sides alike:

| Limb | Kind | Bears on | Its task is taken by |
|---|---|---|---|
| `shin.<side>` | propped | the shank from its knee end's point to where its foot stands on its toes, a sole of no width; unpropped, the knee's point alone | the hip's three freedoms and the knee's flexion |
| `hand.<side>` | end | the hand's capsule where it touches: under its lower end, or under its middle when both ends are down | the shoulder's three freedoms |
| `foot.<side>` | foot | its sole, as a stance stands on it (`bearingSole`, `src/core/control/support.ts`): flat, or on its front edge once its heel is up | every freedom from the hip down |

A limb's other freedoms are asked toward the stage's posture; the trunk is both arms' stem in the
bearing solve (`bearing.ts`). A stage may hold the body over where a propped foot stands
(`overProp`) in place of its patch's middle. A limb borne on that is not down is brought straight
down, and bears from the step it is. Among the splits of the ground's wrench that hold the body,
the riser takes the one its muscles carry with least effort (`makeBearing`'s `effort`).

The freedoms that take a shin's or hand's point task are drawn toward the posture, within what the
task leaves them, at 0.1 s (`TAKES_SECONDS`), so a hip carrying a knee keeps the posture's turn
while the knee's point holds. A foot's chain is not drawn. On the Warrior on knees and hands each
shin is propped (bearing 0.41 m from the knee back) and each hand lies flat; the skeleton's feet do
not prop its shins, which bear at the knee alone.

| `TAKES_SECONDS` | empty, of 127 | club, of 121 | the worst asked, weights, empty and club |
|---|---|---|---|
| none drawn | 113, 114 (+12 -8) | 89, 96 (+10 -11) | 0.9, 0.8 |
| 0.05 | 88, 74 (+8 -44) | 87, 82 (+9 -24) | 6.8, 4.6 |
| **0.1** | 112, 110 | 94, 97 | 5.2, 0.8 |
| 0.2 | 111, 112 (+9 -7) | 100, 100 (+11 -8) | 0.9, 2.8 |

0.05 s loses a third of the empty-handed falls; 0.1 s to none drawn read alike.

### The bearing stage

`fours`, the first bearing stage: on knees and hands.

| | |
|---|---|
| bears on | each shin 0.33, each hand 0.17 |
| leaves | nothing |
| pelvis pitched forward | 1.3 rad from upright |
| height | none asked |
| posture | `FOURS`: lumbar flexion 0.3, thoracic flexion 0.2, shoulder flexion 1.9, shoulder abduction 0.3, shoulder internal rotation -0.4, elbow flexion 0.3, wrist flexion -0.8, hip flexion 1.9, knee flexion 2.4, ankle dorsiflexion 0.38 |
| time constant of its aims | 0.4 s |
| limit | 5 s |

The shares say both where the centre of mass is held (a third of the way from the shins' middles
to the hands) and how the ground's wrench is split. Fallen forward:

| | Warrior | Rogue | skeleton |
|---|---|---|---|
| `fours` ends | done after 1.62 s | given up at 5 s | done after 1.44 s |
| centre of mass from its place, m | 0.049 | 0.22 | 0.050 |
| asked beyond its patches, mean, of its weight | 0 | 0.24 | 0 |
| the fastest segment in `fours`, m/s | 0.50 | 3.44 | 0.78 |

The Rogue comes to `fours` with its chest down and hands beside its knees, is asked what its limbs
cannot give, and ends on its back. Swept one number at a time, the game's row first ("done" with
the seconds, "-" given up; the Rogue gives up in every row):

| Changed | Warrior | skeleton |
|---|---|---|
| **none** | done 1.62 | done 1.44 |
| shin, hand 0.45, 0.05 | - (0.20 m off) | done 1.04 |
| shin, hand 0.40, 0.10 | - (0.11 m off) | - (short of its pitch) |
| shin, hand 0.30, 0.20 | done 1.40 | done 1.80 |
| shin, hand 0.25, 0.25 | done 1.02 | done 3.98 |
| pitch 1.1 rad | done 1.66 | done 1.63 |
| pitch 1.5 rad | done 0.73 | done 1.48 |
| time constant 0.2 s | done 0.89 | done 0.90 |
| time constant 0.6 s | - (0.057 m off) | done 2.35 |

With the shins bearing four fifths or more the Warrior's knees reach their stop (2.57 rad) 0.11 m
short. A steeper pitch and a shorter time constant finish sooner on a stiff topple, and were not
read on the battery.

### What a bearing stage is done by

Each term, on a body brought to knees and hands and put under one stage more.

**Slow.** `fours` again, which the body is at: unknocked, done at its first step. Knocked as it
begins by an impulse giving the whole body the speed named, it is done after (Warrior, skeleton)
9 and 25 steps at 0.2 m/s across, 13 and 56 at 0.3, 144 and 75 at 0.5; 20 and 105 at 0.3 forward,
104 and 33 at 0.3 backward.

**At its height.** `fours` asked 0.27, 0.25 or 0.22 of standing height (3 s at most): the
Warrior stays 0.33 m up, still, and is given up, since its shins leave it no lower; at 0.4 it
stays at 0.34 m. The skeleton is given up at the three lower heights and done after 12 steps at
0.4.

**Its left limbs let go.** A stage bearing on the shins (0.4 each) and right hand (0.2), leaving
the left hand, pelvis at 0.9 rad, releases the Warrior's hand after 1.6833 s on Rapier and 1.8917 s
on the coordinate-limit profile. Release needs the weight actually inside the retained supports
([Recovery transfer](recovery-transfer.md)). A stage that leaves nothing is done at its place
alone: `fours` at 1.4 rad, shins 0.38 each, hands 0.12, is done on the skeleton after 17 steps.

### The abort

A rise whose trunk has been off the ground and comes back down has gone down. Once every segment of
the trunk (`Recipe.trunk`: lower, middle and upper trunk and head) has been more than 0.1 m
(`RAISED`) up in an attempt, one of them back within `DOWN` ends it; the riser lies slack and
begins again from the body as it is.

| `RAISED`, m | empty, of 127 | club, of 121 |
|---|---|---|
| no abort | 110, 110 (+2 -2) | 94, 95 (+7 -9) |
| 0.05 | 4, 4 (+0 -106) | 6, 6 (+0 -91) |
| **0.1** | 112, 110 | 94, 97 |
| 0.2 | 111, 110 (+1 -1) | 96, 97 (+7 -7) |

At 0.05 m the attempts end in `tuck`; no abort and 0.2 m read as 0.1.

### The kneel-up

From knees and hands to tall on the knees, by poses alone: sit back on the heels with the hands
off, raise the trunk, bring the forearms in, straighten the hips. Both sides alike; from the
anatomical zero, rad:

| Stage | Posture | Seconds |
|---|---|---|
| `sit` | `SIT`: lumbar flexion -0.2, shoulder flexion 0.6, shoulder abduction 0.2, wrist flexion -1, hip flexion 2, knee flexion 2.55, ankle dorsiflexion -0.4 | 1 |
| `kneel 0` to `kneel 2` | three even steps from `SIT` to `KNEEL`: as `SIT`, but neck flexion -0.29, thoracic flexion 0.12, lumbar flexion 0.18, hip flexion 0.4 | 0.25 each |
| `arms`, `hold` | `KNEEL_ARMS`: as `KNEEL`, and shoulder flexion -0.09, shoulder abduction 0.28, shoulder internal rotation 0.54, elbow flexion 1.17, wrist flexion -0.04 | 0.3, then 1 |
| `tall 0` to `tall 2`, `tall` | three even steps from `KNEEL_ARMS` to `TALL`, then `TALL` held: shoulder abduction 0.28, shoulder internal rotation 0.54, elbow flexion 0.3, wrist flexion -0.04, hip flexion 0.25, knee flexion 2.2, ankle dorsiflexion 0.389 (its stop) | 0.5 each, then 1 |

Every number but `SIT`'s ankle was set by hand on the stand.

**The ankle.** Sat back on knees and toes, the centre of mass is over the knees, the front edge of
the support. With the toes tucked (0.389) the body pitched forward about its knees in some forward
topples and went down on its face out of `arms` or `hold`; slower raises went down sooner. By the
statics (`statics`, `recordOf`, `research/core-posture-trials.mjs`, row `kneel`; a rough reading)
the centre of mass at `sit` is 0.006 m inside the support with the toes tucked and 0.025 at -0.4.
On the battery:

| `SIT`'s ankle, rad | empty, of 127 | club, of 121 |
|---|---|---|
| 0.389 | 94, 95 (+7 -22) | 27, 30 (+2 -69) |
| 0 | 104, 105 (+8 -13) | 43, 46 (+4 -55) |
| -0.2 | 109, 108 (+9 -11) | 79, 78 (+5 -24) |
| **-0.4** | 112, 110 | 94, 97 |
| -0.45 | 98, 91 (+6 -25) | 98, 101 (+8 -4) |
| -0.85 | 35, 36 (+3 -77) | 105, 103 (+11 -5) |

Read again on 128 other falls (every shove turned half a step, `--turn 1.40625`; 125 fell with
each loadout):

| `SIT`'s ankle, rad | empty, of 125 | club, of 125 |
|---|---|---|
| -0.3 | 108, 109 (+6 -8) | 96, 94 (+3 -12) |
| -0.35 | 114, 110 (+6 -7) | 97, 94 (+4 -13) |
| **-0.4** | 114, 111 | 102, 103 |
| -0.45 | 107, 103 (+4 -12) | 111, 107 (+13 -9) |

-0.4 is best or level empty-handed on both sets; -0.45 suits the club and costs the empty hands
seven or eight falls. The club rises more often the further the toes are let out; why is not
read.

Shoved 350 degrees, the Warrior ends `tall` with its centre of mass 0.55 m up and its head 1.15;
the skeleton, toppled straight forward, 0.48 and 1.02. A body tall on its knees reads as on a side,
its pelvis's forward level.

### The step

From tall on the knees to a half kneel: the weight onto the right knee, the left knee lifted and
swung through, the left foot down ahead on its toes; then two bearing stages on the right shin and
the left foot. From the anatomical zero, rad:

| Stage | Posture | Seconds | Drive |
|---|---|---|---|
| `shift` | `SHIFT`: as `TALL`, and lumbar lateral flexion right 0.05, left hip abduction 0.15, right hip abduction -0.15 | 0.6 | the pose drive |
| `lift` | `LIFT`: as `SHIFT`, and lumbar flexion -0.2, left hip flexion 0.35, left hip abduction 0.17, left knee flexion 2.56, left ankle dorsiflexion -0.85 | 0.35 | `QUICK` |
| `swing` | `SWING_THROUGH`: as `LIFT`, but left hip flexion 1.8, left hip abduction 0.1 | 0.42 | `QUICK` |
| `reach` | `REACH`: as `SWING_THROUGH`, but left hip abduction 0.56, left knee flexion 2, left ankle inversion 0.56 | 0.25 | `QUICK` |

The poses were set by hand on the stand. `QUICK` asks each freedom the speed that closes its error
in 0.1 s, no faster than 6 rad/s: a knee swung through slowly leaves the body on one knee longer.

| `QUICK` | empty, of 127 | club, of 121 |
|---|---|---|
| the pose drive | 1, 2 (+0 -108) | 55, 51 (+1 -47) |
| 4 rad/s, 0.15 s | 45, 55 (+3 -58) | 94, 95 (+4 -6) |
| 5 rad/s, 0.12 s | 98, 100 (+7 -17) | 96, 95 (+4 -6) |
| **6 rad/s, 0.1 s** | 112, 110 | 94, 97 |

**Toes first.** The left foot comes down pointed, as `LIFT` left it, and bears on its toes through
`half kneel` (`bearingSole`'s front edge), the ankle near its stop (-0.874). Turned up to land on
its sole (a 0.12 s `flip` stage, the ankle dorsiflexed 0.38), the foot with the club came down flat
in 10 of 16 topples read 0.2 s into `half kneel`, and none of those reached `even`; toes first, all
16 land on the toes and 14 reach `even`. Empty-handed it lands on its toes either way.

| The step | empty, of 127 | club, of 121 |
|---|---|---|
| `flip` | 110, 109 (+7 -8) | 24, 28 (+1 -70) |
| `swing` 0.3 s | 100, 102 (+7 -15) | 77, 79 (+1 -19) |
| **`swing` 0.42 s** | 112, 110 | 94, 97 |
| `swing` 0.55 s | 92, 92 (+7 -25) | 87, 89 (+7 -15) |
| `reach`'s left ankle -0.55 | 105, 99 (+4 -15) | 93, 90 (+2 -9) |
| `reach`'s left ankle -0.2 | 102, 100 (+2 -12) | 93, 92 (+1 -6) |

The bearing stages:

| | `half kneel` | `onto the toes` |
|---|---|---|
| bears on | the right shin 0.65, the left foot 0.35 | the right shin 0.4, the left foot 0.6 |
| held over | the middle of the shin's patch | where the right foot stands on its toes (`overProp`) |
| height, pitch | none asked | none asked |
| posture | `HALF_KNEEL` | `HALF_KNEEL` |
| time constant, limit | `BEAR_SECONDS`, `BEAR_LIMIT` | the same |

`HALF_KNEEL` is the statics' answer for the posture audit's row `half kneel` (the right knee and
its tucked toes, the left sole: `ROWS`, `research/core-posture-trials.mjs`), from a search longer
than [postures.md](postures.md)'s whose script is not kept; angles rounded to 0.01 rad, stops
whole (right knee 2.567, right ankle 0.389). Read again, snapped, it holds at 0.034 of the body's
strength, 0.13 m inside its support. The left ankle is asked -0.55 rad, not the answer's 0.389:
asked 0.389 it ends the stage 1.26 rad short in three of four topples, and on the battery 94
empty-handed falls are up at the end against 110 (club 88 against 97). At -0.55 the statics hold
the posture at 0.146.

| `onto the toes`, shin and foot | empty, of 127 | club, of 121 |
|---|---|---|
| 0.5, 0.5 | 26, 13 (+1 -98) | 37, 29 (+2 -70) |
| **0.4, 0.6** | 112, 110 | 94, 97 |

`BEAR_SECONDS`, 0.35 s, is the time constant of every bearing stage from the half kneel up;
`BEAR_LIMIT`, 4 s, the longest any may take before the attempt is given up (at 3 s every fall
reads the same):

| `BEAR_SECONDS`, s | empty, of 127 | club, of 121 | the worst asked, weights, empty and club |
|---|---|---|---|
| 0.25 | 99, 86 (+7 -31) | 62, 65 (+1 -33) | 7.5, 0.8 |
| 0.3 | 114, 106 (+5 -9) | 88, 87 (+1 -11) | 7.8, 3.5 |
| 0.325 | 115, 111 (+7 -6) | 93, 90 (+1 -8) | 12.2, 3.0 |
| **0.35** | 112, 110 | 94, 97 | 5.2, 0.8 |
| 0.375 | 96, 94 (+5 -21) | 93, 94 (+0 -3) | 3.7, 3.4 |
| 0.4 | 90, 90 (+5 -25) | 87, 88 (+0 -9) | 9.3, 1.0 |
| 0.6 | 6, 3 (+0 -107) | 6, 6 (+4 -95) | 0.5, 1.1 |

### The lunge

From the half kneel onto both feet: four bearing stages on the left foot and the right ball, each
holding the centre of mass at a part of the body's built standing height (1.0145 m for the
Warrior), then the weight even.

| Stage | Height, of standing | Left foot's share | Posture |
|---|---|---|---|
| `lunge 0` | 0.59 | 0.6 | `LUNGE[0]` |
| `lunge 1` | 0.69 | 0.67 | `LUNGE[1]` |
| `lunge 2` | 0.79 | 0.79 | `LUNGE[2]` |
| `lunge 3` | 0.89 | 0.75 | `LUNGE[3]` |
| `even` | 0.89 | 0.5 | `LUNGE[3]` |

Each rung of `LUNGE` is the statics' answer for the audit's row `lunge` at a centre of mass 0.6,
0.7, 0.8 and 0.9 m up, the feet held to the half kneel's placement, each rung started from the one
below (the script is not kept). A rung's height is its answer's over the Warrior's standing one;
its share, from `lunge 1` up, is where its answer's centre of mass stands from the right ball to
the left sole (0.668, 0.787, 0.747). `lunge 0` keeps `onto the toes`'s share: at its answer's
0.34, 78 empty-handed falls are up at the end against 110 (club 77 against 97). The rounded
postures, read again by the statics:

| Rung | Share of strength | Inside its support, m | Left sole, right ball, N |
|---|---|---|---|
| `lunge 0` | 0.34 | 0.047 | 285, 490 |
| `lunge 1` | 0.41 | 0.067 | 559, 216 |
| `lunge 2` | 0.51 | 0.045 | 639, 136 |
| `lunge 3` | 0.29 | 0.076 | 554, 221 |

Shoved 350 degrees, the Warrior's centre of mass is 0.57 m up at the end of `half kneel`, 0.65 at
`lunge 1`, 0.84 at `lunge 3` and 0.88 at `even`. Standing as built it is 1.01 m up, and the stance
holds it 0.03 m lower (`STANCE_LOWER`).

### The handover

After `even` the rise is over; if the body is up, its host's stance has it, and the locomotion
skill is resumed (`Skill.resume`) facing the way the pelvis faces (read from its left-to-right
axis, whatever its pitch). Two numbers carry the body into the stance:

- **The asked height** rises from where the centre of mass is to the stance's by a smoothstep over
  1.3 s (`RISING_SECONDS`). Asked its full height at once, the stance drives the knees straight
  under a centre of mass not yet over the feet.
- **Squaring**: the foot nearer the centre of mass stays; the other steps to its own side, across
  the heading at the built standing width, as far ahead as it is, unless it is within 0.1 m of that
  place (`SQUARE_NEAR`).

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

Neither changes whether a body rises, only whether it stays up: a rising height is worth ten falls
of 127, its length from 0.65 to 2.6 s none these falls tell; squaring is worth three or four.

### The roll

A body on its back plays `RISE.roll.back`: four poses that turn it over its right side onto its
front. `near` is the side that goes under, `far` the side that comes over (`rollingOver`). From
the anatomical zero, rad:

| Stage | Posture | Seconds |
|---|---|---|
| `wind` | `WIND`: far hip flexion 1.2, far hip abduction 0.54, near hip flexion 0.2, near shoulder flexion 2.8 | 0.5 |
| `swing` | `SWING`: far hip flexion 0.8, far hip internal rotation 0.6, near hip abduction 0.2, lumbar flexion 0.8, far shoulder flexion 1.4, near shoulder flexion 1.2, near shoulder abduction 2 | 1 |
| `over` | `OVER`: far hip flexion 1.2, far hip abduction 0.54, near shoulder flexion 2.8 | 0.5 |
| `flat` | `FLAT`: near shoulder flexion 2.8, far shoulder internal rotation -0.8, far elbow flexion 2.1 | 1 |

`wind` raises the far leg out and lays the near arm overhead; `swing` throws the far leg and arm
across with the pelvis curled, turning the body onto its near side; `over` lays the trunk straight
with the far leg ahead and the body goes on over; `flat` lays the legs straight and sets the far
hand beside the chest, so the rise finds the body square on its front. On a side the body plays
`over` and `flat` over the side under it (`RISE.roll.left`, `RISE.roll.right`).

**Where it came from**: a seeded random search (script not kept) of 2,400 sequences of two to four
poses over 23 freedoms, played on the Warrior toppled backward: 13 ended on the front. Of the best
sixteen, three turned the Rogue too; the best turned it only from where its first playing left it,
so its second pose is played first (`wind`). Each freedom was then dropped while the twelve falls
below still ended on the front, the angles rounded, and `flat` added.

**Each number's reading**: twelve falls (both humans, club and empty, toppled backward and 20
degrees to each side) all end on the front at the first playing, no segment over 3.61 m/s; and the
Warrior's `fours` is done at the first attempt in fourteen more (toppled 150 to 210 degrees, club
and empty). Taken away one at a time, every number costs one count or the other:

- none turns without `swing`'s far hip flexion, far hip internal rotation or lumbar flexion,
  `over`'s near shoulder flexion, or the `wind` or `swing` stage;
- without `wind`'s far hip or one of `swing`'s other freedoms 4 to 10 of 12 turn; without `swing`'s
  near shoulder flexion none of 14 rises, without its far shoulder flexion 4; without `over`'s far
  hip flexion 6 turn and 2 rise, and without the `over` stage 8 turn;
- `wind`'s near hip flexion (11 of 14 rise), its near shoulder flexion (12) and `over`'s far hip
  abduction (12) are kept on the rise's count alone, which fourteen falls hold loosely;
- `flat` is the rise's: without it every body turns and 7 of 14 rise; without its near shoulder or
  far elbow flexion none rises, without its far shoulder's turn 8.

A stage's seconds, the rest the game's (on the front, of
12; for `flat`, also the Warrior's `fours` done, of 14):

| Seconds | `wind` | `swing` | `over` | `flat` |
|---|---|---|---|---|
| 0.25 | 7 | 0 | 12 | 12 |
| 0.5 | **12** | 3 | **12** | 12; 13 |
| 0.75 | 12 | 12 | 12 | 12; 12 |
| 1 | 12 | **12** | 12 | **12; 14** |
| 1.5 | 12 | 9 | 12 | 12; 14 |

`swing` for 1.5 s flings a segment at 6.86 m/s. Mirrored over the left, the roll ends 9 of the
twelve on the front. **The skeleton is not turned**: on the battery's shoves (each watched 30 s),
of the falls first read on the back, the next reading is the front in 9 of 11 and 7 of 11 for the
Warrior (empty, club), 11 of 14 and 8 of 11 for the Rogue, and 0 of 11 and 1 of 10 for the
skeleton.

### Where the rise stops

The Warrior stands up with either loadout: of its 127 empty-handed falls 112 rise and 110 are up
at the end; with the club 94 of 121 rise and 97 are up ([Staged](#staged)). The falls left down end
their last attempt at no one stage.

- **The kneel-up does not hold every forward topple.** Shoved 330, 340, 345, 350, 355, 0, 5, 10
  and 15 degrees, the Warrior plays to `even` in its first attempt at all but 355 and 5, where it
  goes down on its front out of `tall 0` and `hold`. At 355 the body has rocked onto its knees by
  `hold`, shins off the ground and the centre of mass over the knees (at 350 the shins lie flat and
  the centre is 0.24 m behind them): the hips straighten with the centre of mass 0.4 cm behind the
  knees at the end of `sit`. Asked the arms back in the kneel-up, those two play to `even` and the
  other seven go down out of `arms` or `hold`.
- **The Rogue rises from 6 of its 32 falls, the skeleton from 1.** The Rogue's arms do not raise its
  chest ([The pose stages](#the-pose-stages)): fallen forward it gives up at `fours`; without
  `fours` its trunk stays down and the kneel-up lowers its pelvis to 0.22 m. The skeleton goes down
  in the half kneel (0.47 m up at the end of `reach`, 0.33 at the end of `half kneel`), and its
  roll does not turn it.

What the Warrior's body allows on each way from knees and hands, held still with no controller, is
in [postures.md](postures.md#the-verdict-by-route).

## Staged

A fighter whose body, once down, is the staged riser's, playing `RISE`: the roll, and the rise to
its feet. No assist. The battery's harness ([Battery](#battery)), 10 workers, each fall watched
40 s; at `1f354189` (the hands' measured hulls, a held item upright in the guard, `guardPosture`,
[human-and-strikes.md](human-and-strikes.md#guard)).

```powershell
node research/core-rise.mjs --workers 10 --watch 40 --falls --mind '{"kind":"fighter","tactics":{"kind":"seek","guard":"pose","aim":"head","range":"close"},"locomotion":{"kind":"stance-walk"},"guard":{"kind":"cover-guard"},"blow":{"kind":"recipe-strike"},"kick":null,"support":null,"subs":[{"kind":"staged-rise"}]}'
```

**The bar**, set and not swept: each human with each loadout risen in at least three falls of four;
no way of lying under half; at least half the bouts' falls risen; the skeleton reported, not held
to it; no row's median peak over its row of [Driven](#driven). **It is missed by every row.**

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | up at the end |
|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 16 | 8 | 25.37 | 4.93 | 0.4 | 8 |
| workshop-fighter, empty, shoved | 16 | 16 | 11 | 22.32 | 4.50 | 2.0 | 10 |
| workshop-rogue, club, shoved | 16 | 16 | 1 | 23.58 | 6.26 | 0.4 | 2 |
| workshop-rogue, empty, shoved | 16 | 16 | 2 | 29.49 | 5.83 | 0.0 | 0 |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | - | 5.22 | 0.0 | 0 |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | - | 4.96 | 0.0 | 0 |
| bouts | 9 | 4 | 1 | 24.79 | 6.98 | 0.3 | 1 |

Nothing is flung: median peaks of 4.5 to 7.0 m/s against the driven body's 10 to 15. With the club
the Warrior rises from none of its 3 falls on its front or left. Of the 4 bouts' falls, 1 rises
(the Warrior against the skeleton, from its back, in 24.8 s).

**The Warrior on 128 shoves a loadout** (the sweeps' battery, at `0b9a7b56`, the hands capsules):

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | up at the end |
|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 128 | 121 | 94 | 25.30 | 4.75 | 0.8 | 97 |
| workshop-fighter, empty, shoved | 128 | 127 | 112 | 22.58 | 4.09 | 5.2 | 110 |

- Every way of lying rises at half or more: empty-handed from its back 72 of 80, front 24 of 27,
  left 8 of 10, right 8 of 10; with the club 59 of 74, 26 of 35, 7 of 8 and 2 of 4.
- The falls it does not rise from end their last attempt anywhere from `prop` to `lunge 3`; the
  most at one stage are 5 of 15 empty-handed at `half kneel` and 6 of 27 with the club at
  `lunge 1`.
- On the 16-shove battery the Rogue's last attempt ends at `fours` in 10 of 32, in the lunge in 7
  and at `hold` in 5; the skeleton begins no stage of the rise in 18 of its 19 falls on the back,
  and of 6 on its front, 3 end at `tuck` and 2 at the half kneel.

What a rising body costs a step is in `play.md#bodies-in-the-step`.

## Step-up on the owner's target

Every humanoid stands up by Stand up with `step-up`, in the Arena and the Crypt. On
[the owner's target](#the-owners-target) (Node stand, Rapier, 120 Hz, Balance 0, Grit 0, 30 s cap,
`npm run evaluate -- rising-target`, at `7f893332` with the held shove given again):

| Body | Loadout | Stood, of 16 | Median, s |
|---|---|---:|---:|
| Warrior | empty | 14 | 15.6 |
| Warrior | club | 15 | 14.9 |
| Rogue | empty | 12 | 16.6 |
| Rogue | club | 4 | the cap |

45 of 64; none within 6 s, and the 4 s median is not met (16.2 s).

- **The run's leg strength is what the rise loses**: with the legs' torques at their measured peaks
  and the run's speed kept, the same settings stood 46 of 64 against 40 (at `627ecc3a`), but the
  gait battery falls in 249 of its 300 trials.
- **The time is the route's, not the muscles'**: the median of the stood falls' phases is brace
  0.7 s, settle 0.3, roll 4.0, rise 7.6, steady 0.9, then verification 1.8. Searched at twice the Warrior's strength, or 1.5 times the
  Rogue's, the route stood as often and no faster, so a joint-torque surge (Grit) cannot shorten
  it: its stages wait on balance.
- On 52 shoves that felled the skeleton (of 96), step-up stands 9; its roll from back to front is
  what fails.
- On the stand-up screen's sixteen falls step-up completes 11, the fastest in 14.8 s.
- On the earlier legs: the Rogue's search stands 10 of its 16 training falls (first attempts, a
  24 s cap) and 15 of the target's 32, most failures at `even`; "Rise, then steady" stands 6, 8, 0
  and 1, medians 29.5 s and over, and none of the skeleton's shoves.

## Tried and not kept

- **`dynamic-rise`**, a recovery sub-mind in the editor's `When down` slot (removed; at
  `54f3fba1`, `node research/dynamic-rise.mjs --workers 2`, `rapier-coordinate`, adapter 10):
  the Warrior and the Rogue, empty and with the club, 16 falls each, 0 verified handovers within
  6 s in every group. Trials reach orientation, acquisition, placement and transfer, none extension
  and standing; root assist zero, peak effort above the muscle bound 0.000038933 N m.
- **Searched and learned stand-ups** (on the earlier legs and the old screen's saved falls; all
  with standing and walking verified, unchanged muscles and no assist): an optimised compliant-sole
  recipe, one development success in 15.5583 s; physical search and feedback, 6.975 s on one saved
  fall, transferring to three fresh starts in 7.075 to 7.775 s and failing ten others; side falls
  in 5.775 to 8.6333 s; a library chosen from observed posture and motion completes seven of ten
  trained side falls (two within 6 s) and three of the screen's sixteen, none within 6 s; settling
  search reaches Warrior/club in 6.0333 s, and four nearby perturbations fail
  ([stand-up planning](../analysis/2026-10-11-stand-up-planning.md#settling-aware-physical-search)).
- **A twisted front read as a side** (`LIE_UP` -0.9 for the front): over 30 s the Warrior reaches
  knees and hands in 16 of 16 empty and 10 of 15 club falls, against 15 and 12; no difference.
- **`swing`'s near hip flexed 1 rad**, as the roll's search left it: the same falls turn and rise,
  the fastest segment 5.44 m/s against 3.61, median peaks 4.2 to 5.1 m/s against 3.3 to 4.1.
- **Two hand-written rolls** (a knee drawn up and its foot pushing the pelvis over; the far leg
  and arm swung across): the Warrior stays on its back at every playing.
- **Earlier hands and guard** on the 16-shove battery (risen: the Warrior with the club, empty;
  the Rogue with the club, empty): capsule hands at `8c59943b`, 13 of 15, 13 of 16; 2, 4. The
  measured hulls with the club's haft leaning back over the head, at `83c3540c`: 9 of 14, 11 of
  16; 0, 2. The hulls cost the rise; the upright guard of [Staged](#staged) moves only the club's
  rows, within a row's spread.
