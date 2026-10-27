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
- **The fresh falls** (`--protocol fresh`): the same bodies and loadouts shoved halfway between
  the target's directions, 11.25 degrees past each (`FRESH_OFFSET`), read against the same gates,
  their cardinals the four directions just past each. No edge, timing or route is tuned on them:
  they show whether a gain on the target is fitted to its 64 falls.
- **A recovery** is timed to verified standing, from the riser's takeover, through landing,
  orientation and retries. A fall not stood counts at the cap.
- **The bar** (`risingReport`'s gates): every direction present once in each group; at least 15 of
  16 within 6 s in each body and loadout group, and 61 of 64 overall; every cardinal direction
  within 6 s; a failure-inclusive median of at most 4 s.
- **Against people** ([competencies](competencies.md#targets)): young adults rising from the floor
  at a comfortable rate take a mean 1.4 to 2.6 s by starting position, and from the back a third
  less asked for speed; healthy older adults take 2.4 to 5.5 s (Alexander et al. 1997). College-age
  adults asked for speed stand from four prone holds in about 2 s or less
  ([Resisting arrest](https://research.bond.edu.au/en/publications/resisting-arrest-analysis-of-different-prone-body-positions-on-ti/),
  Bond University, the abstract). Their clock runs from a cued start at rest to a switch 0.9 m up;
  the target's also holds the landing and settling after the fall and the steadying to a verified,
  quiet stance (on step-up's stood falls a median 1.1 s before the rise and 2.7 after it, [where the rise
  stops](#where-the-rise-stops)). A young
  adult's comfortable rise leaves 1.4 to 2.6 s of the 4 s median for those, and the 6 s a fall is
  above the older adults' slowest mean.
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

**The Warrior with the club shoved 270 degrees slides; it is not driven** (`felled` and `lie`,
`research/core-rise-trials.mjs`, at `febe37a5`): it lies on its left side with the club hand
against its head and the ground, nearly still from the sixth second (every segment under
0.03 m/s), and from the thirteenth its club arm moves again at up to 0.18 m/s. Its potential
energy falls throughout, 166.60 J at 6 s to 166.27 at 15, and its kinetic energy read each second
stays under 0.04 J: the slack arm slides down its head onto the ground. The one rise in it,
0.03 J at the seventh second with every segment under 0.03 m/s, is the contacts' correction
pushing overlapping shapes apart.

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

**At rest short of its aims** (`Recipe.progress`'s `restSeconds` and `restWiden`, set from
`StepUpTuning.rest`): a stage whose limbs are down and let go, whose body is as slow as the stage
asks, and whose centre of mass and pelvis are within twice the stage's tolerances for 0.3 s is done
too. The Rogue's weaker arms and legs leave its lunge and `fours` still a few centimetres or a
few tenths of a radian short, where the stage waited out its limit and the attempt began again;
at rest it hands on in 25 of its 32 target falls, in `onto the toes` and each lunge rung. The
Rogue's alone, on 128 falls (the target's sixteen directions and three offsets of 5.625 degrees,
`research/rising-step-search.mjs --score`, 30 s cap, at `b1c34096`):

| Rest | empty, of 64 | club, of 64 | stood either way, median s |
|---|---|---|---|
| none | 44 | 30 | 15.71 |
| **0.3 s within twice** | 47 | 33 | 15.41 |

Paired, 10 falls stood only with it and 4 only without. Within four times its tolerances the
Rogue stands 9 of the target's 32; for the Warrior, twice its tolerances stood 9 of its 32 target
falls against 29, so the Warrior has no rest.

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
axis, whatever its pitch), its feet where the rise left them. **The asked height** rises from
where the centre of mass is to the stance's by a smoothstep over 1.3 s (`RISING_SECONDS`). Asked
its full height at once, the stance drives the knees straight under a centre of mass not yet over
the feet.

| | empty, of 127 | club, of 121 |
|---|---|---|
| `RISING_SECONDS` none (the full height at once) | 96, 87 (+1 -11) | 8, 7 (+1 -2) |
| `RISING_SECONDS` 0.65 | 96, 97 (+0 -0) | 8, 9 (+1 -0) |
| **`RISING_SECONDS` 1.3** | 96, 97 | 8, 8 |
| `RISING_SECONDS` 2.6 | 96, 97 (+0 -0) | 8, 9 (+1 -0) |

It does not change whether a body rises, only whether it stays up: a rising height is worth ten
falls of 127, its length from 0.65 to 2.6 s none these falls tell.

**The feet are not squared.** A resumed stance whose feet stood apart from its built width
stepped the farther foot beside the other first; on the target, that step after the hand-back,
and the head swaying after it, kept the verification waiting a median 2.0 s for every segment
under 0.1 m/s, against 0.2 s without (the Warrior empty-handed shoved forward). Without it the
target stands the same 45 falls, each group's median 0.8 to 1.3 s sooner (15.5 s overall,
against 16.2), and none falls in the verification's standing and walk (at `4f15009e`). On the
staged rise's earlier battery the step kept 3 or 4 more of 127 up over a 40 s watch
(`SQUARE_NEAR` 0.1, at `1f354189`); the braced walk shoved under orders falls as before (the
Rogue 5 of 200, the Warrior 1).

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
across with the pelvis curled, turning the body onto its near side, and is held past its time
until the pelvis's axis toward the far side points 0.6 up, at most three times its time
(`PoseStage.hold`); `over` lays the trunk straight
with the far leg ahead and the body goes on over; `flat` lays the legs straight and sets the far
hand beside the chest, so the rise finds the body square on its front. On a side the body plays
`over` and `flat` over the side under it (`RISE.roll.left`, `RISE.roll.right`); a body rolled from
its back that comes onto its other side goes on over that one, by that side's stages
(`PoseStage.over`).

**The hold and the other side**, on the owner's target (`step-up`, at `0b718b02`): the Warrior's
first roll from its back left it on its back in 10 of its 32 falls, and the same roll played again
turned it. Its searched `swing` (0.87 s) left the pelvis turned 0.29 or less toward the near side
in those falls, against 0.42 to 0.57 in the rolls that turned; `over` then carried it to about 45
degrees and it fell back. A `wind` of 0.3 or 1.5 s, or the body still before it rolls, leaves as
many falls rolled twice; with the longer `wind` most first swings throw the body onto its far side.

| `swing` | rolled twice, Warrior, of 32 | target: Warrior stood, median s (club; empty) | offset 11.25 degrees: the same |
|---|---|---|---|
| its time | 10 | 15, 13.6; 14, 14.5 | 16, 14.2; 15, 12.7 |
| held to 0.45, at most 3 times | 4 | | |
| **held to 0.6, at most 3 times, and the other side gone on over** | 2 | 16, 12.5; 14, 12.7 | 16, 12.4; 16, 12.7 |

The Rogue's figures are the same with and without it.

**The side, by body** (`StepUpTuning.over`): the Rogue rolls from its back over its left side, so
its right hand, which holds the club, is the far one and comes over rather than going under; the
Warrior rolls over its right. Rolled over the left, the Warrior stands 12 of its 16 target falls
with the club against 16, and 15 empty-handed against 14. Paired on 256 Rogue falls (sixteen directions at each of eight offsets,
0 to 19.6875 degrees by 2.8125, `research/rising-step-search.mjs --score`, 30 s cap, at
`14ccd6d1`):

| Rogue's roll | club, of 128 | median s | empty, of 128 | median s |
|---|---|---:|---|---:|
| over the right | 71 | 26.2 | 96 | 15.7 |
| **over the left** | 87 | 17.2 | 94 | 15.8 |

With the club 30 falls stand only over the left and 14 only over the right; empty-handed, 11 and
13. Read at the start of the rise, a Rogue that begins it leaning (the pelvis's or the chest's
forward above -0.85) reaches `fours` square in 3 of 36 rises with the club, against 74 of 82 that
begin square, and the club then props it: at the end of a roll its hand is held 0.4 m up on the
club's end planted beyond the head.

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

**On the owner's target** (`step-up`, the 64 falls, at `0792d310`; each stage's start read from
the rise's state as it plays): of the 45 stood falls, the median seconds from takeover through
each part of the route, each part summed over its stages:

| Part | Stages | Median, s | 90th percentile |
|---|---|---:|---:|
| brace and settle | | 1.1 | 2.4 |
| the roll | wind, swing, over, flat | 4.0 | 4.8 |
| down onto hands and knees | fold, tuck, prop, fours | 1.6 | 2.4 |
| the kneel-up | sit, kneel 0 to 2, arms, hold, tall 0 to 2, tall | 3.2 | 3.2 |
| the step through | shift, lift, swing, reach | 0.9 | 0.9 |
| the lunge | half kneel, onto the toes, lunge 0 to 3, even | 2.2 | 2.3 |
| steadied and verified | | 2.7 | 2.9 |
| in all | | 15.6 | 17.1 |

`sit` alone takes 1.5 s, `onto the toes` 0.7 and `lunge 3` 0.6. Of the 19 falls not stood, 16
are the Rogue's (12 with the club); 6 reach the steadying and fall from it, and the rest end
their attempts anywhere from the roll to `onto the toes`.

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
`npm run evaluate -- rising-target`, at `0d5300fe` with the Rogue's roll over its left side,
[the roll](#the-roll), and a retry after a failed attempt rolling over the other side):

| Body | Loadout | Stood, of 16 | Median, s |
|---|---|---:|---:|
| Warrior | empty | 15 | 12.7 |
| Warrior | club | 16 | 12.5 |
| Rogue | empty | 13 | 15.5 |
| Rogue | club | 9 | 20.7 |

53 of 64; none within 6 s, and the 4 s median is not met (15.1 s). Without the other side's retry
it stood 52.

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

## The budget

Of the target's 4 s median, the body is first slow 0.6 s after takeover, and step-up's hand-back
from the end of its rise to verified standing takes 1.7 s: about 1.7 s is left for the rise. The
stance alone from the squat takes 2.1 to 3.4 s to verified standing. Back and side falls (53 of 64)
all go through the roll; front falls stand least.

`node research/rising-budget.mjs` (Node stand, core world, Rapier, 120 Hz, at `8e3df885`): the
target's 64 falls under Stand up with step-up alone, the same falls and readings as the target's
record (`assets/evaluations/rising-target/2026-10-26-8e3df885-3f63197b.jsonl`, every fall's verified
time equal), probed each step. The lie is the reading's when the body is first slow (centre of mass
under 0.5 m/s and trunk spin under 1 rad/s, the brace's own test). Times are from takeover:
landed, the first reading of a lie; slow; the brace, to the first edge begun; the hand-back, from
the end of the rise's last stage to verified standing (`STAND_CHECK`), on stood falls. Medians; a
fall not stood counts at the 30 s cap.

| Group | Back | Side | Front | Stood | Landed, s | Slow, s | Brace, s | Hand-back, s | Median, s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Warrior, empty | 8 | 6 | 2 | 14 of 16 | 0.36 | 0.60 | 0.59 | 1.71 | 12.20 |
| Warrior, club | 9 | 5 | 2 | 14 of 16 | 0.35 | 0.57 | 0.57 | 1.55 | 12.77 |
| Rogue, empty | 4 | 8 | 4 | 11 of 16 | 0.29 | 0.63 | 0.62 | 1.77 | 18.91 |
| Rogue, club | 6 | 7 | 3 | 12 of 16 | 0.24 | 0.58 | 0.57 | 1.81 | 16.10 |
| all | 27 | 26 | 11 | 51 of 64 | 0.27 | 0.59 | 0.58 | 1.71 | 15.36 |

| Lie | Falls | Stood | Median, s |
|---|---:|---:|---:|
| back | 27 | 24 | 14.37 |
| side | 26 | 22 | 15.80 |
| front | 11 | 5 | 30.00 |

- **Before the rise**: the body lands 0.27 s after takeover and is slow at 0.59 s (90th percentile
  1.06); 7 of 64 braces run to their 1 s limit (`BRACE_LIMIT`). An edge that begins in motion can
  gain at most the 0.3 s between landing and slow.
- **After the rise**: 1.42 to 2.32 s over the 51 stood falls, the standing check's 0.5 s of quiet
  included.
- **The stance from the squat** (the Warrior's stored `squat`, its angles put on each body, placed
  seeds 1 to 8, the stance alone): the Warrior stands from all 12 of its placed draws but one, 95 %
  of standing height in 0.55 s, verified in 2.33 to 2.48 s (median by loadout; 2.07 to 3.36 in
  all). Past standing height the trunk pitches forward (its up axis at 0.84 of vertical 1 s in, on
  seed 4) and is upright and still about 1.6 s in; then the 0.5 s quiet. The Rogue in the Warrior's
  squat stands from 1 of its 9 placed draws.
- **The allowance**: a median fall has 4 s less 0.6 s, about 3.4 s from first slow to verified
  standing. Ended at step-up's lunge, about 1.7 s of that is the rise's; handed to the stance in a
  squat, at most about 1.3 s.

## A fast route

The body gets off the ground fast: closed-loop phases rise from the back to a crouch on the feet in
1.55 s and from hands and knees in 1.48 s, and stand to verified standing in 4.89 and 3.68 s from
rest. The slow part is from the crouch to quiet standing, 2.2 to 3.3 s, the stance's settling
([the budget](#the-budget)). With a hand-back near 1 s, the rise from the back would come within
the target's allowance of about 3.4 s. Neither witness is robust: the push-off stands from its own
start only, the rock-up from 3 of 4.

`node research/rise-witness.mjs --move <move>` (Node stand, core world, Rapier, 120 Hz, the
Warrior empty-handed, calm, no assist; on `58f10e91`'s core): from one placed start (the first seed
its placement accepts), four phases, then Stand up's steady (`standUp`) until ready 0.1 s; verified
by the stand check's quiet (`STAND_CHECK`) and held 1 s (2 s on replay). A phase is a pose of the
pose drive (open-loop) or plant-up's bearing solve on the limbs given weight shares, aiming the
centre of mass at a place and a velocity and the pelvis at a pitch (closed-loop); each searches the
trunk's flexion and each limb's main freedoms, mirrored, and its own settings, including a
duration that may be none. Diagonal CMA-ES, 100 generations of 16; short of verified, a trial scores
its best reading held 0.1 s of the soles' share of weight, height, uprightness and stillness,
multiplied (1 standing still). The open-loop searches had a 5 s cap, the closed-loop ones 8 s.

| Move | Start | Phases | Best | Wall |
|---|---|---|---|---:|
| squat-up, control | squat (seed 2) | pose, pose, pose, pose; none long | verified 2.00 s (the start's 2.24 s, the stance alone) | 2.2 min |
| push-off | hands and knees | pose ×4 | held reading 0.13, none verified | 4.0 min |
| rock-up | back | pose ×4 | held reading 0.13, none verified | 5.5 min |
| squat-up-bear, control | squat (seed 2) | bear ×2, held 0.2 s | held reading 0.50, none verified | 5.4 min |
| push-off-bear | hands and knees | bear ×4 | **verified 3.68 s** (generation 38; first verified, 7) | 6.4 min |
| rock-up-bear | back | pose ×2, bear ×2 | **verified 4.89 s** (generation 75; first verified, 26) | 7.2 min |

The witnesses (`assets/research/rise-witness/`, `node research/rise-witness.mjs --replay <file>`)
replayed, held 2 s; the time each is first read on its feet and standing:

| Witness | Seed | Crouch, s | Standing, s | Hand-over, s | Verified, s | Next starts (seeds 2 to 4) |
|---|---:|---:|---:|---:|---:|---|
| push-off-bear | 1 | 1.48 | 2.49 | 1.47 | 3.68 | none stands |
| rock-up-bear | 1 | 1.55 | 3.80 | 2.69 | 4.89 | 6.99, none, 6.52 |

The push-off's phases bear on the shins and hands with the centre of mass driven toward the feet at
1.3 to 1.4 m/s, then mostly on the feet; the rock-up tucks and swings by pose (1.33 s), then bears on the
feet and shins. Both are single candidates: each search's median stays under 0.2.

The existing closed-loop techniques, alone from placed starts (`techniqueTrial`, seeds 1 to 6, 8 s
cap): `plant-up` from hands and knees stands the Warrior from none of 6 (3 fail in `plant` within
1.2 s, 3 stall there at about 2 s; the Rogue has no hands-and-knees start) and from the squat none
of seeds 2 to 5 (each goes over onto its back in `rise`); `sit-up` then `post-up` from the back
stands none of 6 on either body (the sit-up stalls in its curl or times out short of sitting).

- **The placed squat is lost if the stance takes it 0.05 s late.** Held by the pose drive first
  (seeds 2 and 4): 0.008 s, verified 2.51 and 3.63 s; 0.025 s, 2.79 s and none; 0.05 s or more,
  neither. Stand up's steady from the first step verifies seeds 2 and 4 (2.24, 2.98 s) and not 3.
- **The controls cannot improve a rise they are given.** The open-loop control trimmed its start to
  2.00 s in its first generation and found nothing better in 99 more; the closed-loop one, its bear
  phases held, never verified and never found the start's own escape (every phase of no duration),
  which no small step reaches. A search here finds isolated witnesses; one that finds none does not
  show that none exists.
- **A body flung by the solver reads as standing for a step**: the command stance driving a body
  on its side launched it to 0.9 of standing height with 8 to 10 body weights on one foot. A reading
  counts only held 0.1 s.
- **What it does not say**: the Rogue, a start on a side, the target's falls (a witness is from a
  placed start at rest), or a witness with width.

## The hand-back from a crouch

Stand up's steady stands a crouched body to verified standing in 2 s at best, and 1 s is below what
the body can do. Its stance climbs to standing height in 0.6 to 1.1 s, but violently: the pelvis
pitches, the arms whip and the feet step to catch the body, and the settling after takes as long
again before the 0.5 s of quiet. No setting tried takes off more than about 0.5 s. A climb on the
stance (the weight shifted ahead, the height on a minimum-jerk path, the trunk and arms leaned and
let go) searched over the witnesses' hand-overs reads 2.0 to 3.4 s and has no width: a rounding of
its settings changes which starts stand. Without the catch steps, or on planted feet, the body
falls from the rock-up. A faster hand-back needs a controller that arrives at standing still with no catch step; no
controller here does ([a climb on the stance](#a-climb-on-the-stance)).

`node research/crouch-steady.mjs` (Node stand, core world, Rapier, 120 Hz, calm, no assist; on
`5458a251`'s core): the Warrior's stored squat placed on each body, the first 8 seeds its
placement accepts; Stand up's steady as `standUp` runs it (its own motor, the locomotion resumed,
the stance's goal), handed back once `standReady` holds 0.1 s, the host's stance after; verified
by the stand check (`STAND_CHECK`), 5 s cap. Each grid of 8 runs in 3 to 10 s.

| Body | Loadout | The steady: stood, median | Posture eased over 0.5 s |
|---|---|---|---|
| Warrior | empty | 6 of 8, 2.85 s | 8 of 8, 2.54 s |
| Warrior | club | 7 of 8, 3.11 s | 8 of 8, 2.63 s |
| Rogue | empty | 2 of 8, 2.97 s | 3 of 8, 2.33 s |
| Rogue | club | 1 of 8, 3.40 s | 2 of 8, 2.70 s |

The steady's variants (`--variant`), the Warrior empty-handed:

| Variant | Stood | Median, s |
|---|---:|---:|
| the steady | 6 of 8 | 2.85 |
| the posture eased from the crouch's angles to the guard's over 0.5 s (`ease`) | 8 of 8 | 2.54 |
| eased, the centre of mass asked 6 cm ahead of the feet's middle for 0.5 s (`ahead`) | 8 of 8 | 2.52 |
| searched: the stance's time constants, track and ankle spare, the servo's constant, the ease (`--search`, 40 generations of 12, 4.3 min) | 8 of 8 | mean 2.34 |
| the search's best at three places | 7 of 8 | 2.44 |
| the pelvis's turn at 0.3 s, not 0.15 | 6 of 8 | 2.83 |
| no catch steps (`tuning.recovery` null) | 0 of 8 | – |
| the supported root pose on the combat fold's schedule (`fold`; over 0.6, 1 and 2 s, response 0.2 to 0.5 s) | 0 of 8 | – |
| the supported root pose, every other joint held at the crouch's angle (`lift`, pitch ±0.45 rad) | 0 of 8 | – |
| no stance: a minimum-jerk posture path, the hips and ankles fed the centre of mass's lead (`climb`) | 0 of 8 | – |

The witnesses ([a fast route](#a-fast-route)) replayed with the steady changed
(`node research/rise-witness.mjs --replay <file> --steady <json>`, held 1 s); verified, from rest:

| Witness | Hand-over, s | The steady | Posture eased over 0.5 s |
|---|---:|---|---|
| push-off-bear | 1.47 | 3.68; seeds 2 to 4 none | 4.93; none |
| rock-up-bear | 2.69 | 4.89, 6.99, none, 6.52 | 5.38, 6.85, none, 5.32 |

- **Where the time goes** (seed 2, the steady): 95 % of standing height at 0.59 s; at 0.2 s the
  pelvis is at 0.54 of upright and the arms move at 4.4 m/s (the guard asked at once, from the
  squat's arms, at the servo's 0.1 s); a catch step at 0.35 to 0.45 s; every segment under
  0.1 m/s at 1.75 s, the hands last; verified at 2.23 s. On every seed the last condition met is a
  segment's speed (head, hands or forearms), at 1.7 to 2.65 s.
- **The squat is on its stops**: the knees at 2.44 of 2.46 rad, ankle dorsiflexion and inversion at
  their stops, thoracic flexion at its stop, the arms abducted 2.42 rad. Its centre of mass is
  6.5 cm behind the feet's middle. Without its catch steps the stance takes every seed over
  backward: the pelvis is held upright as the knees extend, and the centre of mass goes back.
- **The height ramp is not followed** from a crouch: the ankle's floor (`STANCE_ANKLE_SPARE`) lifts
  the plan at the height's constant, the body at full height by 0.7 s against `RISING_SECONDS`' 1.3.
- **The supported root pose loses its pitch** from the squat: asked 0.45 or 0.9 rad either way, the
  pelvis is upright within 0.25 s while the pose asks the ground for 2 to 15 m/s² forward, which
  the soles do not give (a shortfall of 200 to 2300 N), and the body goes over backward.
- **From the witnesses' hand-overs** the steady takes 2.2 s at best. The rock-up hands over low (0.43
  of standing height, the pelvis at 0.47 of upright); the stance climbs in 0.9 s with the arms at
  up to 5 m/s and the feet stepping, then settles 0.8 s before the quiet. Eased, neither is faster.

### A climb on the stance

`node research/climb-search.mjs` (Node stand, core world, Rapier, 120 Hz, calm, no assist; the
Warrior empty-handed): the steady of `research/climb.mjs`, timed from its start to verified
standing, 5 s cap, from the first 4 seeds the squat's placement accepts and the witnesses'
hand-overs (push-off-bear seed 1, the one whose hand-over is on its feet; rock-up-bear seeds 1 to
4). The climb (`ramp`): for `delay` s the height held, the centre of mass asked `d` ahead of the
feet's middle, the trunk's flexion and the shoulders' raised; then the height to standing over `T`
s on a minimum-jerk path as the lead and the lean are let go, the posture from the hand-over's angles
to the guard's over `Tp` s. Seconds from the steady's start; – not verified:

| The steady | Squat 2, 3, 4, 5 | Push-off 1 | Rock-up 1, 2, 3, 4 | Witness starts' mean, a failure at 6 |
|---|---|---:|---|---:|
| the game's | 2.24, –, 2.98, 3.15 | 2.22 | 2.20, 4.30, –, 3.83 | 3.71 |
| the posture eased over 0.5 s (`ease`) | 2.55, 2.64, 2.98, 2.53 | 3.20 | 3.09, –, –, 2.36 | 4.13 |
| the search's best (below) | –, –, 2.66, – | 2.01 | 2.93, 2.52, –, 2.97 | 3.29 |
| its settings rounded to 3 decimals | –, –, 2.81, – | 2.03 | –, 2.89, 3.36, 2.89 | 3.43 |
| `T` 1 s, `d` 0.02 m, no ankle floor; track 0.12, across 0.2, height 0.05, turn 0.12 s; servo 0.06 s | | 2.51 | 2.69, 3.24, 3.35, 3.07 | 2.97 |
| no catch steps (`tuning.recovery` null) | | 2.22 | –, 2.36, –, – | 4.52 |
| planted feet: the supported root pose (`lift`, `fold`; 0.8 to 1.2 s, pitch 0 to 0.5) | | 2.44 to 2.79 | – but one 3.23 | 4.78 to 5.36 |

The search: diagonal CMA-ES over the climb's `T`, `delay`, `d`, `lean`, `reach` and `Tp`, the
stance's time constants, track and ankle spare, and the servo's constant, 10 generations of 12 on
the witness starts, 7.4 min. Its best: `T` 0.4, `delay` 0.21, `d` 0.014 m, `lean` 0.30,
`reach` 0.40, `Tp` 0.55 s; across 0.19, height 0.13, turn 0.16 s; track 0.17 s; no ankle floor;
servo 0.25 s. Its mean over the witness starts, as searched, 2.56 s.

- **The catch steps start at the hand-over.** From the squat (seed 2) the stance begins a step
  0.03 s in, the centre of mass 6.4 cm behind the feet's middle; from the rock-up (seed 1) at its
  first step, the centre of mass at 0.30 m over the soles, the pelvis at 0.49 of upright, the
  soles 700 to 1300 N short of what it asks. The climbs traced take 3 to 6 catch steps. Without
  them the body falls, so a climb on the stance keeps them, and the settling after them.
- **The ankle's floor lifts the body** ahead of a held height: asked to hold 0.49 m, the squat is
  at 0.79 m by 0.3 s. With the floor off (`ankleSpare` null) the height holds, and with no catch
  steps the centre of mass still goes back 13 cm in 0.3 s.
- **Holding the body past ready** (`keep` 0.5 s, the faster constants' row): the five stand at a
  mean of 3.27 s against 2.97 handed back at ready.
- **1 s is the floor itself.** Verified standing holds 0.5 s of quiet after the body arrives still.
  The rock-up's hand-over is 0.67 m under standing; on a minimum-jerk path whose braking stays
  within gravity (the soles cannot pull) the climb takes at least √(5.77 × 0.67 / 9.81) = 0.63 s,
  the squat's 0.45 m at least 0.52 s: 1.0 to 1.1 s to verified with no settling at all.

### A planned climb

From a crouch quiet on both flat feet, Stand up's steady climbs on one planned path (`CLIMB`,
`standUp`, `src/core/mind/ground/stand-up.ts`) and stands the body in 1.36 to 1.91 s, a median of
1.46 s; the stance's steady takes 2.17 to 2.89 s from the same crouches. The climb begins once the
body is quiet on both feet (`quietOnFeet`, `src/core/mind/ground/reading.ts`: both soles flat and
bearing, slow, the centre of mass inside the soles' inset outline) and lower than 0.9 of standing
height. Over 0.6 s the centre of mass goes from where it is, at its speed, to standing height over
the feet's middle at rest (a quintic), the pelvis from its pitch to upright, the posture from the
crouch's angles to the guard's (minimum jerk), the feet planted (`StanceGoal.pose`, followed at
0.08 s); then the stance's goal at standing height. No rise hands over in such a crouch yet: the
research climb with the same entry (`path` with `gate`) begins from none of the starts of
[a climb on the stance](#a-climb-on-the-stance), and their times are the stance's steady's.

`node research/fold-rise.mjs` (Node stand, core world, Rapier, 120 Hz, calm, no assist): the body
built standing, held 1.5 s, lowered over 2 s into the combat fold (`COMBAT_FOLD`: `depth` of its
0.5 m lowering, pitch and spine's flexion, on planted feet) and held 1 s; seconds from the steady's
start to verified standing (`STAND_CHECK`). With `--core` the game's Stand up (step-up its
technique) takes the body; without, `research/climb.mjs`'s steady (`--variant '{}'`: the stance's
steady as `standUp` runs it):

| Body | Loadout | Folded to, of standing height (depth 0.5, 0.75, 1) | The stance's steady | Stand up with the climb |
|---|---|---|---|---|
| Warrior | empty | 0.77, 0.71, 0.70 | 2.23, 2.17, 2.35 | 1.36, 1.40, 1.42 |
| Warrior | club | 0.76, 0.70, 0.69 | 2.73, 2.30, 2.84 | 1.38, 1.44, 1.69 |
| Rogue | empty | 0.74, 0.64, 0.63 | 2.67, 2.62, 2.84 | 1.36, 1.47, 1.52 |
| Rogue | club | 0.74, 0.63, 0.62 | 2.55, 2.89, 2.88 | 1.60, 1.77, 1.91 |

The climb's time and response (`research/climb.mjs`'s `path` with `gate`, the same 12 folds):

| Climb, s | Response, s | Fastest | Slowest | Median |
|---:|---:|---:|---:|---:|
| 0.5 | 0.1 | 1.37 | 2.23 | 1.55 |
| 0.6 | 0.06 | 1.24 | 3.51 | 1.63 |
| 0.6 | 0.08 | 1.36 | 1.87 | 1.46 |
| 0.6 | 0.1 | 1.46 | 2.58 | 1.56 |
| 0.7 | 0.05 | 1.28 | 2.44 | 1.81 |
| 0.7 | 0.06 | 1.33 | 2.00 | 1.54 |
| 0.7 | 0.08 | 1.42 | 1.78 | 1.50 |
| 0.7 | 0.1 | 1.51 | 2.38 | 1.60 |
| 0.7 | 0.12 | 1.60 | 2.73 | 1.72 |
| 0.8 | 0.06 | 1.38 | 2.11 | 1.67 |

- **Where the climb cannot begin.** The witnesses hand over on their toes: the rock-up's hips at
  their extension stop, the knees fully bent, the pelvis 1.06 to 1.30 rad back, each foot's sole
  turned toes-down (its up 0.55 to -0.27 of vertical); the push-off's feet off the ground. The
  placed squat is flat but on its stops, its centre of mass 8.5 cm behind the feet's middle; held
  where it is on planted feet (`path` with `stay`, `keepPitch` and its own height) it goes over
  backward in 0.8 s, the soles 200 N short at once and 3900 N by 0.45 s. On the game's solver no
  flat squat from 0.45 to 0.80 m is held by its joints' motors either
  ([the stand hold](postures.md#the-stand-hold-node-core-world-rapier-at-the-solver-named)).
- **From the combat fold without the climb** the game's Stand up braces (the fold reads as down
  and, moving, as between), the brace folds the legs, and the body goes onto its back.
- **The fingerprint** (`scripts/fingerprint.mjs`) moves no pose: no fight or run of the game
  reaches a crouch the climb begins from.

## The staged route

Step-up's route as five techniques, each an edge of Stand up's graph
(`src/core/mind/ground/staged-edges.ts`), stands the same falls of the owner's target as step-up,
within a placebo's spread. Each edge's entry reads the raw position and the body's motion
(`stagedEntry`), so a part hands over to the next as soon as the next admits the body, moving or
not. Stand up lists them in route order, then step-up for what they do not take (sitting, between,
a part failed twice): `STAGED_ROUTE`, `npm run evaluate -- rising-target staged`.

| Technique | From, to | Entry | Plays of step-up's route |
|---|---|---|---|
| `staged-roll` | back, either side; front | still | the roll at once (the retry over the other side), lying slack until its front is read still |
| `staged-down` | front; fours | still | `fold` to `sit` |
| `staged-kneel-up` | fours; kneeling | moving | `kneel 0` to `tall`; from `sit` on a body not yet sat back (`SAT_BACK`) |
| `staged-step-through` | kneeling; half-kneel | moving | `shift` to `onto the toes` |
| `staged-lunge` | half-kneel; standing | moving | `lunge 0` to `even`, then step-up's climb and steadying (`stanceSteady`) |

- **The entries** (`Part.entry`): `moving`, the centre of mass under 1 m/s and the pelvis turning
  under 2 rad/s (`HAND_OVER`); `still`, under the speed the body's step-up lies still at before it
  reads its lie (`STEP_UP`'s `settle`: the Warrior 0.372 m/s, the Rogue 0.060), turning under
  2 rad/s. The roll and down begin still: begun moving, the roll takes longer and down fails more
  often ([tried and not kept](#tried-and-not-kept)).
- **The cuts are where the postures are read** (`CUTS`). On step-up's route over the target's 64
  falls, the position read at a stage's end: hands and knees at the end of `sit` 64 times of 81, and
  at the end of the `fours` stage 34 of 108 (that stage bears on the toes, the knees light);
  kneeling at the end of `tall` 64 of 69; half kneeling at the end of `onto the toes` 55 of 59, and
  at the end of `half kneel` 30 of 63.
- **A body on its hands and knees not yet sat back begins the kneel-up at `sit`** (`SAT_BACK`:
  `GroundReading.upright` under 0.22). Down hands over sat back on the heels, the trunk at about
  0.56 to 0.61 for the Warrior and 0.30 to 0.33 for the Rogue; placed on its hands and knees the
  Warrior's reads about 0.09 to 0.15, and begun at `kneel 0` it falls on its face 8 times of 8, from
  `sit` it kneels 8 of 8 ([the Rise drill](#the-rise-drill)). On the target one fall of 64 changes
  (the Rogue with the club at 292.5°: stood at 25.5 s, now down), every group within the placebo's
  spread (49 to 54 of 64 over four runs, as before).
- **A part plays the route on from its first stage** and hands over at the first cut where its
  posture has been read, slow enough for the part begun there, for 0.1 s (`REACHED_SECONDS`) from
  that stage's start until the next cut's begins; read at none, it plays on to standing.
- **Stand up braces only a body no edge takes** (`standUp`): a tumbling body (`tumbling`) is begun
  on an edge whose entry reads motion (`TechniquePart.moving`) where one admits it, and braced
  otherwise. Short of an admitting edge it chooses nothing until the position has been read
  (`GroundReading.settled`), and, where it lists an edge that reads motion, holds a body still
  landing with no support or one such an edge is begun from but is too fast for (`awaits`,
  `graph.ts`), for no longer than a brace. On the target, 33 of 254 parts begun are begun on a
  tumbling body, 25 of them rolls still turning; 32 falls begin on the roll and 31 on step-up, most
  of those lying between positions with the trunk off the ground.
- **Placed starts chain through the parts** (`research/rising-bed.mjs --starts placed`, empty-handed,
  seeds 1 and 2): the Warrior stands 12 of 12 (half kneeling and squatting on seed 1 are rejected
  placements), the Rogue 6 of 8, as many as when step-up took every placed start; before Stand up
  waited for the position, a placed body read between positions as it dropped onto the ground and
  step-up took it.
- **Half kneeling is read on a foot ahead and upright** (`groundReading`, `reading.ts`): one shin
  and the other foot bear, the sole flat, or the foot ahead of that knee the way the pelvis faces
  and the trunk as upright as a kneel's (`KNEEL_UP`). The step's half kneel bears on the ball of the
  foot (`HALF_KNEEL`'s ankle -0.55 rad) and was read nowhere on the route; without the foot ahead,
  the `shift` read as half kneeling 61 times of 69, the back foot on its toes behind the knee.
- **The fingerprint** (`scripts/fingerprint.mjs`) moves one case, `data: learned-rise`, whose Stand
  up now waits for the position before its first choice; step-up's target is the same fall by fall.

`npm run evaluate -- rising-target` (Node, core world, Rapier, 120 Hz), four runs each: the code
as it is and the pose drive's `POSE_SECONDS` 0.2 s times 1 + 1e-9, 1 + 2e-9 and 1 - 1e-9, a
placebo that moves no mechanism. Step-up and the parts handing over at rest are read at
`2c946c86`:

| Group | Step-up: stood, of 16 | Median, s | At rest: stood | Median, s | In motion: stood | Median, s |
|---|---|---|---|---|---|---|
| Warrior, club | 13 to 16 | 12.8 to 15.6 | 13 to 16 | 12.8 to 14.5 | 13 to 15 | 12.3 to 13.8 |
| Warrior, empty | 14, 15 | 11.9 to 12.4 | 14 to 16 | 12.2 to 12.5 | 13 to 16 | 12.4 to 12.7 |
| Rogue, club | 8 to 12 | 16.1 to 25.7 | 8 to 12 | 16.4 to 28.6 | 8 to 11 | 16.5 to 25.6 |
| Rogue, empty | 11 to 15 | 15.6 to 18.9 | 10 to 13 | 15.9 to 17.5 | 11 to 14 | 15.6 to 18.9 |
| All, of 64 | 50 to 54 | | 49 to 54 | | 49 to 54 | |

The Warrior empty-handed is at the edge of the spread (13 of 16 once, the median 0.2 s later). A
roll takes a mean 3.2 s against 4.0 s at rest; the Rogue's down fails 63 times of 167 against 12 of
38.

## The Rise drill

Each edge of the staged route played alone on a body, begun once its entry admits the body, and
read by whether it takes the body to its posture and how fast: `npm run evaluate -- rise`
(`src/evaluation/rise/`, on techniques in turn, `src/evaluation/technique.ts`; Node, core world,
Rapier, 120 Hz). The Warrior and the Rogue empty-handed, six seeds each. A technique waits up to
2 s for its entry, runs up to 16 s, and one that stands the body is watched 2 s on its feet
(`TECHNIQUE_LIMITS`). Its summary is each edge's profile: begun, done, the median time, by body and
by the speed it was begun at. An edge that ends not done leaves the body slack until it comes to
rest (settled and under 0.1 m/s, for up to 2 s), and the trial reads the position it rests in.

- **Rung `placed`**: from each position the edge is begun from, placed there at rest. A seed moves
  each joint by up to 0.02 of its range (`TECHNIQUE_SPREAD`): at the Lab's 0.1 most kneeling
  starts are refused or fail, and at 0.03 the Warrior's step-through is done 2 of 4 and the Rogue's
  lunge 2 of 4. Kneeling, and the Rogue's hands and knees and half kneeling,
  are the route's own poses where down, kneel-up and step-through hand over
  (`research/route-postures.mjs`, `assets/research/posture-holds.json`), the hips and shoulders
  opened until six seeds of eight place clear; the Warrior's hands and knees and half kneeling are
  the Lab's. No staged edge is begun sitting, so no sitting start is drilled.
- **Rung `moving`**: the route's edges up to the one drilled, from the nearest begun lying, placed
  there (down from back or a side after the roll, the rest from the front after down); the roll
  after a shove from standing toward six directions. An edge is entered as the route hands the
  body over; a trial whose edge is never begun is no reading of it.
- **The reel cannot be watched**: the Ratings reel plays bout cases, and a technique case is
  shown as not opened.

Placed, at the commit the record names (begun, done of those begun, the median time to done):

| Edge | Warrior | Time, s | Rogue | Time, s |
|---|---|---|---|---|
| Roll | 18, 18 | 2.60 | 18, 18 | 4.38 |
| Down | 6, 6 | 2.98 | 6, 6 | 2.63 |
| Kneel-up | 6, 6 | 3.17 | 6, 0 | |
| Step-through | 5, 4 | 1.70 | 6, 5 | 1.50 |
| Lunge | 2, 2 | 2.50 | 6, 3 | 2.25 |

Moving:

| Edge | Warrior | Time, s | Rogue | Time, s | Speed begun at, m/s |
|---|---|---|---|---|---|
| Roll | 3, 3 | 2.71 | 5, 5 | 4.40 | 0.02 to 0.34 |
| Down | 6, 6 | 2.72 | 6, 6 | 2.63 | 0.01 to 0.32 |
| Kneel-up | 5, 5 | 1.68 | 6, 6 | 1.98 | 0.01 to 0.23 |
| Step-through | 5, 5 | 1.75 | 6, 6 | 1.52 | 0.05 to 0.10 |
| Lunge | 5, 4 | 2.08 | 4, 3 | 2.22 | 0.07 to 0.10 |

- **The Rogue's kneel-up rides the sit's swing back**: from down it kneels 6 of 6; placed sat back
  at rest, the same pose, its trunk goes forward over the knees through `kneel 1` and it falls on its
  face 6 of 6; begun at `sit` from that pose, it kneels 3 of 7.
- **The Warrior's lunge is drilled placed on two seeds**: the Lab's half kneel overlaps itself
  (the trunk and the left thigh) and four seeds of six find no clear draw at the drill's spread.
- **The route's edges are entered nearly still**: no moving entry above 0.34 m/s; the down's and
  the step-through's slow hand-overs leave the next edge a body under 0.1 m/s.

## Tried and not kept

- **The fours cut at the end of the `fours` stage** (down from `fold` to the bearing stage, the
  kneel-up from `sit`): the Warrior kneels from any hands and knees, but on the target 44 to 52 of
  64 over four runs, the Rogue empty-handed 8 to 11 of 16 against 11 to 14; the Rogue's down handed
  over mid-sit kneels 0 of 8 from the front, against 6 of 8.

- **The staged route's roll and down begun moving** (`HAND_OVER`, every part `moving`), on the
  target: at 1 m/s and 2 rad/s, 52 of 64, down failing 29 of 76 against 22 of 70 at rest and the
  Rogue empty-handed 19.8 s at the median; at 0.5 m/s and 1 rad/s, 46 to 51 of 64 over four runs,
  the Rogue with the club 6 to 10 of 16. Down begun still and the roll moving at 1 m/s: 51 to 53, the
  Warrior empty-handed 12.6 to 13.1 s at the median in all four, its roll a mean 3.05 s against 2.72.
- **The staged roll and down from a body lying low between positions** (its lie theirs, under
  step-up's `LOW`): 46 falls begin on the roll and 11 on down, 49 to 52 of 64 over four runs, the
  Rogue empty-handed 17.1 to 26.3 s at the median; the Rogue's down failed 110 of 253 times.
- **Parts that end at their own last stage**, played on there until their posture is read (at most
  1 s) and failed if it is not: 44, 51 and 44 of 64 (the code, and `POSE_SECONDS` times 1 + 1e-9 and
  1 + 2e-9), the Rogue 7 or 8
  of 16 with the club and 9 to 12 empty-handed. It passes a cut unread a quarter of the time, where
  step-up goes on and mostly stands. Played on, the `fours` stage pitched it forward in the kneel
  that followed, and the tall kneel's pose let it sway over.

- **A pelvis pitch in the stance's own climb** (a goal's pitch about the heading's right, the
  pelvis's turn aimed at it, searched from -0.3 to 0.9 rad, from 0 or from the hand-over's pitch let
  go): the search above set it to 0.001 rad, and by hand (0.3 to 0.9 rad) the fastest start stood
  was 2.01 s, as without it ([a climb on the stance](#a-climb-on-the-stance)).
- **The skeleton's trunk from its art** (at `39954c37`, `research/rising-step-search.mjs --score`,
  the skeleton's 32 target falls, 30 s cap, its step-up settings as searched on the box trunk): each
  trunk segment the hull of the art's ribcage, lumbar and pelvis vertices, rounded at the back where
  the bind's boxes are flat. Step-up stands 1 of 32 against 7 with the boxes. On its back the box
  trunk lies flat through the whole roll; the rounded one tips about 38 degrees onto the far side
  before the roll and holds there through `swing`, its poses reached.
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
- **A faster route on the same stages** (`step-up`, the owner's target, at `b1c34096` and
  `cb523f2f`): pose stages ended once every freedom is within 0.1 rad of its posture and the body
  slower than 0.15 m/s change nothing from `fold` to `tall` (each clock is about the time its
  posture takes) and break the step through (the Warrior empty-handed 0 of 16); the whole rise
  played 1.3 times faster (`RiseSteer.clock`) stands 18 of 64, 1.6 times none; the pose drive at
  4.5 rad/s in 0.15 s (`POSE_SPEED`, `POSE_SECONDS`) stands 39, at 6 rad/s in 0.1 s none. The
  stages wait on balance.
- **Shorter stages, searched by hand**: the Rogue's `swing` at 0.9 or 1.2 of its time (against
  1.605) stands 82 and 77 of its 128 falls against 83; the Warrior's `sit`, `kneel 1` and
  `tall 1` at 1, 0.8 and 0.5 stand 60 of its 64 against 62, 0.9 s sooner. The Warrior settled to
  0.1 or 0.05 m/s before it reads its lie stands 26 and 24 of its 32 target falls against 29.
- **The contact sequence** (`CONTACT_RISE`) as the target's riser: none of 64 stands.
- **The bear route** from hands and knees: onto hands and toes, hands and feet, a squat with the
  hands down, then the hands let go. As built (`research/core-posture.mjs --variants built`,
  at `cb523f2f`) hands and toes, hands and feet and the squat at 0.70 m are held (margins 0.50,
  0.54 and 0.13 m), and the stance stands the body from the squat in 0.12 s; the squat with the
  hands let go is held at no height of 0.5 to 0.8 m (the centre of mass 3 to 17 cm ahead of the
  soles). Played after `fours` (the shins lowered onto the toes, then a bearing stage on hands and
  feet), the knees do not leave the ground: the centre of mass stays 0.30 m up against the 0.43
  to 0.52 m asked until the stage's limit, since the shank would tip forward past the ankle's
  dorsiflexion stop (0.39 rad) over a foot that is one box, with no toes to bend.
- **The ankle at its weight-bearing range** (43.25 degrees, the goniometer's mean of the
  weight-bearing lunge in Konor et al. 2012, Int J Sports Phys Ther 7(3):279-287, Table 2, against
  Moromizato's passive 22.3; at `c8201ab9`): step-up on the target stands 51 of 64 against 52, none
  within 6 s. After `fours`, on the Warrior toppled forward (the harness of
  `research/core-rise-poses.mjs`), each shorter route's first bearing stage: on the hands and feet,
  a quarter each, the legs straighten into a plank, the feet sliding back to 0.96 m from the hands
  and the centre of mass held 0.32 m up against 0.46 asked; on the feet 0.4 each and the hands
  0.1, the knees stay down and the centre of mass goes toward the hands (0.49 to 0.66 m from the
  ankles); on the shins held over the toes (`overProp`) and the hands, the knees fold to their stop
  (2.57 rad) with the centre of mass 0.44 m from the ankles. As Stand up's route, none of the 64
  falls passes its first stage after `fours`. A shin's task holds its knee on the ground, so
  rocking back onto the feet is a movement the bearing stages do not make, whatever the ankle
  allows.
- **For the Rogue's lean** (`step-up`, the Rogue with the club over its left side, 64 falls:
  the target's sixteen directions at four offsets of 5.625 degrees, against 40 stood, at
  `14ccd6d1`): a body read on its front but leaning (the pelvis's forward above -0.9 or -0.8)
  first rolled on over that side stands 9 of the target's 16 either way, since `flat` lays it back
  onto the side it rolled from; `flat` with the far leg kept ahead, as `over` has it, 1 of 16;
  `flat` with the club arm straight, 30, and straight and out to its side, 28 (more rises begin
  square, more end at `fours`); the club hand's wrist turned -1.6 to 1.4 rad through the roll and
  down onto hands and knees, 36 to 43; `fours` given up 0.3 or 1 s in once the body is off its
  front, 41 and 40; the rise without `prop` and `fours`, none of the target's 16 (it goes down in
  the half kneel).
- **The Rogue's settings searched for the club alone** (`research/rising-step-search.mjs --models
  workshop-rogue --held club --directions 8 --offset 11.25 --cap 14 --sigma .08`, 14 generations
  of 24 candidates, at `1a4cfa67`; scored with `--score`, 30 s cap): the best stands 10 of the
  target's 16 against 9, and 11 of the sixteen 5.625 degrees round against 11, medians 26.9 and
  22.7 s against 19.9 and 16.6. Settings by loadout buy nothing the falls tell.
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
