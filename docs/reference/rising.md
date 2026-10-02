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

A second table has a line for each way a model's shoved bodies lay a second after the fall
(`lieOf`, [Stages](#stages)), over both loadouts: how many, how many of those rose, and the
furthest stage of the game's rise each reached (`none` if its riser began none; the count is of
the body's last fall within the watch). Under a mind with no riser the last column is empty.

## Driven

A fighter that hands its body to nobody: a body that is down is driven on by its stance, which
bears on soles that are not under it. Every character's balance is 0, so no assist answers the
ask.

```powershell
node research/core-rise.mjs --mind '{"kind":"fighter","subs":[]}'
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
This is the record of the recipe's numbers and the player's.

Harness, for every figure of this section but the battery's: Node, the core world
(`src/core/world.ts`) with the arena's solids, Rapier, 120 Hz; the body with nothing in its
hands, held stiff in its reference pose, shoved as the battery shoves and held stiff 1.5 s more
(`toppled`, `research/core-rise-trials.mjs`), so that it lands in one piece the way it was
shoved; then the riser has it. No assist: every balance is 0.

```powershell
node research/core-rise-poses.mjs --model workshop-fighter --lie front [--stages '<PoseStage[] JSON>']
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

Each is set, not swept.

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
  hard stop reverses within a step. Both read on the game's stages, fallen
  forward, at the end of `prop`, the heights of the pelvis's and the upper trunk's centres of
  mass, m:

  | Drive | Warrior | Rogue | skeleton |
  |---|---|---|---|
  | lying, before any | 0.17, 0.14 | 0.14, 0.12 | 0.10, 0.10 |
  | the speeds | 0.43, 0.46 | 0.38, 0.23 | 0.40, 0.42 |
  | the servo, 0.1 s | 0.30, 0.15 | 0.32, 0.11 | 0.31, 0.12 |
  | the servo, 0.2 s | 0.21, 0.15 | 0.20, 0.14 | 0.22, 0.12 |

  The servo draws the knees half under and props nothing; at 0.1 s it leaves the Warrior on its
  side.
- **A stage's time** is counted to the nearest step.

### The pose stages

Both sides alike; a freedom a stage does not name goes to its zero. From the anatomical zero, rad:

| Stage | Posture | Seconds |
|---|---|---|
| `fold` | shoulder flexion 0.9, shoulder abduction 0.7, elbow flexion 2.4, ankle dorsiflexion -0.85 | 1 |
| `tuck` | as `fold`, and hip flexion 2.1, knee flexion 2.5, lumbar flexion 0.7, thoracic flexion 0.3 | 2 |
| `prop` | as `tuck`, but shoulder flexion 1.3, elbow flexion 1.0, lumbar flexion 0.4, thoracic flexion 0 | 1.5 |

`fold`'s posture is `FOLD`, which the later stages keep but for what they name anew, and the
hips and knees of `tuck` and `prop` are `KNEES`.

`fold` points the feet, so the shins lie flat, and asks the arms folded; lying on them a body
cannot fold them (the humans' elbows and the skeleton's shoulders end 1.7 rad short), and they
fold as `tuck` lifts it off them.
`tuck` draws the knees under: the pelvis comes up over the shins. `prop` reaches the arms ahead
and straightens them.

Fallen forward, at each stage's last step, the heights of the centre of mass and of the
pelvis's, the upper trunk's and the head's centres of mass, m:

| | Warrior | Rogue | skeleton |
|---|---|---|---|
| lying | 0.14, 0.17, 0.14, 0.10 | 0.12, 0.14, 0.12, 0.08 | 0.10, 0.10, 0.10, 0.09 |
| `fold` | 0.16, 0.17, 0.15, 0.11 | 0.14, 0.16, 0.14, 0.09 | 0.11, 0.10, 0.10, 0.10 |
| `tuck` | 0.26, 0.41, 0.23, 0.11 | 0.23, 0.37, 0.16, 0.07 | 0.24, 0.37, 0.25, 0.12 |
| `prop` | 0.34, 0.43, 0.46, 0.48 | 0.25, 0.38, 0.23, 0.10 | 0.32, 0.40, 0.42, 0.46 |

Every body gets its pelvis over its shins. The Warrior and the skeleton prop their trunks; the
**Rogue's arms do not raise its chest**: its shoulders end 0.5 to 0.7 rad short of the posture.
Its shoulder flexors peak at 32 N m and its elbow extensors at 25, the Warrior's at 67 and 57,
for 57.6 kg against 79.0: per kilogram, 0.66 and 0.60 of the Warrior's. Twelve other recipes
were read on it (no `fold`; the arms nearer the trunk; the shoulders less flexed; the elbows
straighter and more bent; the trunk straight and arched; `prop` for 3 s; the hips opened to 1.9,
1.7, 1.3 and 0.6 rad): its chest ended 0.12 to 0.23 m up in every one. Opening its hips lowers
its pelvis (to 0.31 m at 1.3 rad) and lifts nothing, since its trunk's weight is ahead of its
knees and its arms do not carry it. On the Warrior and the skeleton the hips at 1.3 rad end the
chest at 0.50 and 0.49 m, with the pelvis at 0.45 and 0.42.

What else was read:

- Without `fold` (`tuck` for 2 s, then `prop`) the Warrior's chest ends at 0.22 m and its head at
  0.11: the arms asked to fold while the knees draw under do not get under the shoulders.
- With the arms asked 0.3 rad from the trunk in place of 0.7 (`shoulder abduction`), the
  readings are the Warrior's and the Rogue's to the centimetre, and the skeleton's chest 0.45.
- A body toppled stiff to a side lies on that side at the first step it is down, and is on its
  front or its back by the time its stiffness ends. A side is a lie a fall passes through.

### The battery, with the pose stages alone

```powershell
node research/core-rise.mjs --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}]}'
```

Harness: the battery's ([Battery](#battery)), 30 workers. The rise is `fold`, `tuck`, `prop`,
and no roll.

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | median s it last moved | the longest, s |
|---|---|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 15 | 0 | - | 3.13 | 0.0 | 3.06 | 14.99 |
| workshop-fighter, empty, shoved | 16 | 16 | 0 | - | 2.72 | 0.0 | 3.01 | 14.43 |
| workshop-rogue, club, shoved | 16 | 16 | 0 | - | 1.99 | 0.0 | 5.70 | 14.99 |
| workshop-rogue, empty, shoved | 16 | 16 | 0 | - | 2.09 | 0.0 | 5.54 | 14.99 |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | - | 3.10 | 0.0 | 13.18 | 14.99 |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | - | 4.14 | 0.0 | 12.45 | 14.99 |
| bouts | 9 | 7 | 0 | - | 2.02 | 0.0 | 14.99 | 14.99 |

| shoved, as it lay | fell | rose | the furthest stage reached |
|---|---|---|---|
| crypt-skeleton, on its back | 21 | 0 | none 20, prop 1 |
| crypt-skeleton, on its front | 5 | 0 | none 1, prop 4 |
| crypt-skeleton, on its left | 3 | 0 | none 3 |
| crypt-skeleton, on its right | 3 | 0 | none 3 |
| workshop-fighter, on its back | 21 | 0 | none 21 |
| workshop-fighter, on its front | 7 | 0 | none 1, prop 6 |
| workshop-fighter, on its left | 1 | 0 | prop 1 |
| workshop-fighter, on its right | 2 | 0 | none 2 |
| workshop-rogue, on its back | 27 | 0 | none 27 |
| workshop-rogue, on its front | 4 | 0 | prop 4 |
| workshop-rogue, on its left | 1 | 0 | none 1 |

None rises: the stages end propped, and nothing stands a body up from there. **Of 95 shoved
falls 69 end on the back**, 16 on the front and 10 on a side: a body that fights a shove turns
as it goes down, and shoved forward it is as likely to land on its back. A body on its back plays
nothing, since no roll is written. Nothing is flung: the median peak is 2.0 to 4.1 m/s, the
lying body's 1.4 to 4.1.
