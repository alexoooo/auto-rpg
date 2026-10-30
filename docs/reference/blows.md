# Blows

What a blow does, measured: the lab's targets (`src/lab/targets.ts`), the placed blow (`PLACED`),
the searched repertoire (`assets/core/strikes.json`), the cover and threat (`GUARD_COVER`,
`THREAT`), the steered blow (`STEER`) and the club's best blow (`CLUB_BEST`). Unless a section
says otherwise a figure is Node, Rapier, 120 Hz, no assist, the arena's rulebook: the core stand
for a throw, the core world for an arena bout (each side's balance its character's). The rows
behind each summary are in this file's git history.

## Targets

A target is a place in the air; its body is a dummy (`dummySpec`): one ball, named `head`, of
the attacker's head's mass and head capsule's radius (the Warrior's 5.48 kg and 9.1 cm, the
Rogue's 3.85 kg and 7.2 cm), with the attacker's hit points in it. `watchBlows`
(`src/core/rules/blows.ts`), the rule a fight wounds by, reads it on a side of its own.

**How it is held** (`hangDummy`): by a force equal to its weight each step and nothing else, so
it gives way to a blow as a head on no neck does. A 1 kg fist sent level at 6 m/s into a dummy
hung 10 s (`tests/lab-targets.test.mjs@2a1b29ac`):

| The dummy is of | drift in 10 s, mm | closing, m/s | masses met, kg | energy, J | fist after, m/s | dummy after, m/s |
|---|---|---|---|---|---|---|
| the Warrior | 0 | 5.99 | 1.00, 5.48 | 15.1 | 0.93 | 0.92 |
| the Rogue | 0 | 5.99 | 1.00, 3.85 | 14.2 | 1.24 | 1.24 |

A hook added while the world steps first runs in the next step, so `hangDummy` gives the force
of the step it hangs in itself; without it a dummy hung from a mind's watch sinks at 0.08 m/s.

**When it is hung** (`readTarget`): as its strike begins (the strike skill first holds the hand's
chamber or its pushes), and only where its place is clear of the body by `TARGET_CLEAR`
([lab.md](lab.md#targets)), or as soon after as it is, up to the end of the pushes. A dummy made
inside the Warrior's chest is thrown out by the solver and fells the body (0, 5 and 15 cm ahead
of the chest's middle). A target the body fills to the end of the pushes has no dummy, and its
reading says so (`hung`).

**What is read** (`TargetReading`): the blow that took the most from the dummy, where any part
of the attacker touching it closing is a blow; the nearest any shape of the hand's body came to
its surface from the strike's start to `TARGET_WATCH` after its pushes (`SegmentBody.gapTo`);
the strike thrown, its fist's peak speed and where the head stood from the recipe's place. The
Warrior's club placed at a target 1.3 m under the head's height passes 0.53 m off. A body that
goes down closes the reading as it stands (`fell`).

## Baseline

`node research/core-targets.mjs --each`: the Routine's ten targets of seeds 1, 2 and 3
(`drawTargets`: the control, then high, middle and low in turn), each on a run of its own, the
walk out included; empty hands strike in turn, a club in the right hand strikes every target.
Read at `b72e4ebe`, on the repertoire of that tree, at 100 J a hit point. No run fell and no
target went unread. The control is one target read three times; the rest are 9 a stratum:
counts, not rates.

| Body | Held | Hit, of 3 / 9 / 9 / 9 (control, high, middle, low) | Mean HP, same order | Missed by, cm, same order |
|---|---|---|---|---|
| Warrior | empty | 3 / 9 / 6 / 0 | 0.029, 0.032, 0.014, - | -, -, 4.8, 23.9 |
| Warrior | club | 3 / 9 / 5 / 0 | 1.001, 0.827, 0.140, - | -, -, 1.1, 13.6 |
| Rogue | empty | 3 / 9 / 7 / 0 | 0.023, 0.013, 0.003, - | -, -, 5.5, 23.1 |
| Rogue | club | 0 / 0 / 0 / 1 | -, -, -, 0.022 | 68.5, 61.0, 62.8, 94.7 |
| Skeleton | empty | 0 / 0 / 4 / 1 | -, -, 0.002, 0.004 | 18.3, 12.8, 2.9, 16.2 |
| Skeleton | club | 0 / 0 / 0 / 0 | - | 28.4, 23.8, 22.9, 21.6 |

- **A fist lands where its recipe was searched to land, and near it**; nothing low is struck.
- **The club's swing comes down through the middle**: the Warrior's control at 100.1 J, one hit
  point, at 17.3 m/s closing.
- **A recipe searched on another body misses on this one**: the Rogue and the skeleton threw the
  Warrior's club blow and passed 0.6 to 0.9 m and 0.2 to 0.3 m off.
- **Where a blow has no striker** ([wounds.md](wounds.md#shares)) a fist does a head 0.38 of the
  blow, the hand taking 0.62, and a forearm or upper arm that reaches a target is a blow: the
  Rogue's middle targets are touched 7 of 9 times where its fist struck none. A club is rigid
  and its rows do not change.

### A loop of ten

`node research/core-targets.mjs --list`: the ten targets of a seed struck at in turn on one run,
as the page runs them. A body that falls lies where it fell, and the targets after are unread.
On the trees of [Baseline](#baseline), [Placed](#the-battery-placed) and
[Searched](#the-battery-searched):

| Body | Held | Runs looped, of 3: baseline / placed / searched | Targets read, of 30 | Hit |
|---|---|---|---|---|
| Warrior | empty | 2 / 3 / 2 | 23 / 30 / 28 | 8 / 24 / 21 |
| Warrior | club | 1 / 1 / 1 | 24 / 23 / 23 | 9 / 12 / 14 |
| Rogue | empty | 3 / 3 / 3 | 30 / 30 / 30 | 14 / 21 / 21 |
| Rogue | club | 0 / 1 / 0 | 13 / 20 / 12 | 0 / 1 / 6 |
| Skeleton | empty | 0 / 1 / 3 | 8 / 16 / 30 | 0 / 5 / 19 |
| Skeleton | club | 0 / 0 / 0 | 6 / 6 / 16 | 0 / 0 / 8 |

- **The falls are walking and setting the feet**, closing on a target or setting the feet for
  it, not the blow. A club blow that lands turns the body that threw it.
- **The Warrior falls stepping to a target after a blow of its own landed** (baseline, seed 1,
  empty hands): a recovering step sets its left foot 0.2 m from its right, and the strike skill
  closing on a target 0.2 m to its right carries the trunk out over the right foot. How often:
  [lab.md](lab.md#routine-gait).

## Placed

A placed blow (`PLACED`, `src/core/skills/strike.ts`) is what a hand throws at a target no
recipe of its own holds: the point it strikes with (its knuckles, or its club's swell) is
carried by a hand goal along the line from where it is to `through` m beyond the target, in
`seconds`, the body standing with the target `stretch` of the arm's straight length from the
shoulder. Which heights a recipe holds is its window's
([human-and-strikes.md](human-and-strikes.md#windows)).

**`PLACED` is stretch 1, 0.4 s and 0.15 m through.** The stretch is the sweep's: at 1 the fists
hit every middle target with half the crowding of 0.8. The time is a choice the table does not
make: 0.4 s is the shortest the club follows, between the fists' most hits and their hardest.
The distance through is the middle of three that read alike. One setting serves fist and club.

The tables of this section were read at `80e5cec9`, on that tree's repertoire
(`assets/core/strikes.json@80e5cec9`: the Warrior's straight and club blow and the Rogue's
straight, each with a window in height alone and thrown by any body).

### Sweep

`node research/core-placed.mjs --workers 26`: the [Baseline](#baseline) battery at each stretch,
time and distance through, given in place of `PLACED`, reading the placed blows alone (73 of the
90 targets with the hands empty, 32 with the club). Crowded is a target whose place the body
filled, so that no dummy was hung. One battery a cell: two or three hits between cells are no
difference. The fists, over the nine cells of each stretch:

| Stretch | Hit, of 73 | Crowded |
|---|---|---|
| 0.8 | 30 to 37 | 27 to 34 |
| 0.9 | 41 to 49 | 18 to 21 |
| 1 | 41 to 54 (every middle target in six cells of nine) | 13 to 16 |
| 1.1 | 36 to 51 (every middle target in one) | 10 to 14 |

At stretch 1, by time (fists of 73, club of 32):

| Seconds | Fists hit | closing, m/s | HP a hit | Club hit | HP a hit |
|---|---|---|---|---|---|
| 0.25 | 41 to 43 | 3.5 to 4.1 | 0.004 to 0.005 | 0 to 3 (any stretch) | - |
| 0.4 | 47 to 49 | 2.2 to 2.7 | 0.002 to 0.003 | 4 to 8 | 0.04 to 0.05 |
| 0.6 | 52 to 54 | 1.4 to 1.9 | 0.001 to 0.002 | 9 to 11 | 0.02 to 0.03 |

A shorter time is a harder blow that lands less often; the club's swell does not follow a path
of 0.25 s. The fists close faster the further the path runs on (2.22, 2.46 and 2.68 m/s at 0.1,
0.15 and 0.25 m through) and hit as often; the club's cells do not order by it.

### Against a recipe

`node research/core-placed-versus.mjs`: one body standing as built, its right hand's blow at a
target 1.3 m ahead at heights from 80 cm under its head to 20 cm over, thrown with the hand's
recipe whatever the height, and placed; one throw a cell.

| Body | Held | Recipe lands | Placed lands |
|---|---|---|---|
| Warrior | empty | 5.2 to 10.9 J at 6 to 7.9 m/s, 8 cm under to 10 over; a forearm 6.1 J at 14 under | 0.4 to 0.9 J at 1.7 to 2.9 m/s, 50 under to 20 over; crowded at 80 under |
| Warrior | club | 59 to 113 J, 30 under to 20 over (one throw at 10 over read no blow) | 8.5 to 13.7 J at 5.2 to 6.4 m/s, 50 under to 20 over |
| Rogue | empty | 4.9 to 6.4 J, 4 under to 6 over; 2.6 and 2.9 J at 8 under and 10 over | 0.2 to 0.6 J |
| Rogue | club (the Warrior's recipe) | passes 50 to 87 cm off at every height | 4.8 to 10.4 J, 50 under to 14 over |

- **A placed blow is a tenth of a thrown one.**
- **A fist's window was narrower than its blow.** Those windows were read as the fist's point
  through a sphere of the head's radius with no body at it
  (`docs/reference/human-and-strikes.md@80e5cec9`, Window height); a fist and forearm have a
  size, and the Warrior's straight does 10.9, 10.2 and 6.1 J at 4, 8 and 14 cm under his head,
  where the skill placed 0.4 to 0.7 J. A window is read from the blow's own damage since.
- **Another body's recipe is thrown where a placed blow would land**: a hand throws its own
  body's recipes alone since ([Another body's recipe](#another-bodys-recipe)).

### The battery, placed

`node research/core-targets.mjs --each` on the tree `PLACED` is in, beside [Baseline](#baseline).
No reading was closed by a fall; 23 of the 180 runs fell walking back after their reading
(Warrior 1, Rogue 5, skeleton 17). Of the 180 targets 105 are placed.

| Body | Held | Hit, of 3 / 9 / 9 / 9 | Mean HP | Missed by, cm | Crowded |
|---|---|---|---|---|---|
| Warrior | empty | 3 / 9 / 9 / 1 | 0.029, 0.002, 0.002, 0.002 | -, -, -, 26.6 | 5 |
| Warrior | club | 3 / 9 / 8 / 3 | 1.001, 0.827, 0.108, 0.018 | -, -, 0.0, 32.3 | 0 |
| Rogue | empty | 3 / 9 / 9 / 1 | 0.023, 0.007, 0.001, 0.001 | -, -, -, 30.3 | 6 |
| Rogue | club | 0 / 0 / 1 / 1 | -, -, 0.007, 0.003 | 68.5, 61.0, 61.4, 26.6 | 0 |
| Skeleton | empty | 0 / 3 / 9 / 1 | -, 0.003, 0.004, 0.009 | 18.3, 10.7, -, 20.1 | 5 |
| Skeleton | club | 0 / 0 / 0 / 0 | - | 28.4, 23.8, 24.9, 75.1 | 0 |

- **Every middle target is struck by a fist**, 27 of 27 where 17 were.
- **A straight landed off its height is lighter**: the Warrior's high targets, under his
  straight's window, read 0.002 HP placed where the straight thrown at any height did 0.032.
- **The low targets are in the body's way**: 16 of the fists' 27 are crowded, the body standing
  no nearer than its toes to a place under its hips.
- **A club is placed badly, the skeleton's not at all**: 8 of 32 placed club blows hit (the
  Warrior's 6 of 12, the Rogue's 2 of 10, the skeleton's none of 10, 0.5 to 0.9 m off).

The arm apart from where the body stands (`node research/core-placed-arm.mjs`: the lower trunk
held, the right hand's point given one goal from the guard to a place ahead of the shoulder,
gravity on):

- The Warrior's swell comes within 1 cm of a place at his head's height and 20 cm under it in
  0.4 s, and is 14 and 26 cm from places 50 and 80 cm under, which it reaches given 2 s.
- The skeleton's swell, resting 0.36 m behind its shoulder in the guard, is 32 to 36 cm from three
  of four places given 2 s, and the Rogue's 14 cm from two: the path fails, a straight line of
  the swell through places no pose of the arm reaches ([human-and-strikes.md](human-and-strikes.md#ik)).
- The skeleton's bare arm is slow, not stuck: 6 to 11 cm from each place in 0.4 s, 1 to 3 cm in 2 s.

## Searched

A recipe is searched for a cell: a body, what its right hand holds, and a height band (`BANDS`:
high, where a foe of the body's own build has its head; middle, its upper trunk).
`research/core-strike-search.mjs` is a cross-entropy search over a chamber pose and its time
(none for a fist), a push on each freedom that may push, and how far ahead the target stands.
A candidate is thrown through the strike skill, standing from the guard, at a ball of the band's
part of the thrower's own build hung at the band's height (`evaluateBlow`,
`research/core-blow.mjs`), and scored by what the rule a fight wounds by reads (`scoreOf`): the
hit points the blow does less those it costs its own body; under any hit, a miss by how near it
passed; under any miss, a blow that leaves its body down or not on both feet a second after
(`FELL`), at the target or at nothing. A score is the mean of four throws (one as written, three
perturbed) and one at nothing; 30 generations of 64 at 120 Hz; the best is read again as eight
throws at 120, 480 and 1920 Hz.

### The repertoire

Of a cell's searches the one that nets most on replay at 120 Hz is its recipe
(`research/core-strike-repertoire.mjs`), kept only where it nets more than a placed blow at the
same target (`keeps`) and its window is wide enough for the feet to be set to
([human-and-strikes.md](human-and-strikes.md#a-recipe-the-feet-cannot-be-set-to)); a cell with
no recipe is placed. The asset names the recipes passed over (`passed`) and the cells placed
(`placed`). The repertoire in use, searched for the hip's and the calf's curves (below);
windows along / across / up, cm:

| Body | Held | Band | Net at 120 Hz, HP | Window | Seed |
|---|---|---|---|---|---|
| Warrior | wooden club | high | 1.1117 | -2 to 4 / -2 to 2 / -24 to 8 | 6, jittered up |
| Warrior | wooden club | middle | 0.8978 | -12 to 14 / -4 to 4 / -36 to 0 | 4 |
| Warrior | fist | high | 0.0948 | -14 to 0 / 0 to 8 / -6 to 6 | 5, jittered |
| Warrior | fist | middle | 0.5578 | -6 to 0 / -4 to 4 / -24 to 16 | 2 |
| Rogue | wooden club | high | 0.3933 | -4 to 2 / -4 to 2 / -12 to 10 | 1 |
| Rogue | wooden club | middle | 0.5373 | -4 to 8 / -4 to 6 / 0 to 0 | 2 |
| Rogue | fist | high | placed | - | - |
| Rogue | fist | middle | 0.3036 | -2 to 2 / -6 to 2 / -24 to 8 | 1 |
| skeleton | wooden club | high | 0.8214 | -6 to 4 / -6 to 2 / -16 to 10 | 5, jittered |
| skeleton | wooden club | middle | 1.1888 | -8 to 10 / -8 to 4 / -24 to 26 | 4 |
| skeleton | fist | high | 0.1274 | -2 to 4 / -6 to 0 / -6 to 8 | 3 |
| skeleton | fist | middle | 0.7016 | -2 to 2 / -6 to 2 / -20 to 18 | 3 |

The asset also holds the short sword's recipes, whose windows keep 0.5 along and across.

### The searches

Each tree the body or its guard changed on, the cells were searched again from their recipes at
spreads 0.2, 0.4 and 0.6 (and still, `--still`, where the recipe was searched still), and the
best chosen as above. Net at 120 Hz on replay, HP, of each cell's recipe:

| Body | Held | Band | First, leaning guard | Searched still | Upright guard | Built in the guard | Hip and calf curves |
|---|---|---|---|---|---|---|---|
| Warrior | club | high | 1.107 | - | 1.012 | 1.101 | 1.112 |
| Warrior | club | middle | 1.417 | 1.25 | 1.154 | 1.163 | 0.898 |
| Warrior | fist | high | 0.022 | 0.024 | - | 0.029 | 0.095 |
| Warrior | fist | middle | 0.507 | - | - | 0.582 | 0.558 |
| Rogue | club | high | 0.433 | - | 0.397 | 0.402 | 0.393 |
| Rogue | club | middle | 0.528 | 0.50 | 0.502 | 0.424 | 0.537 |
| Rogue | fist | high | 0.007 | - | - | 0.010 | placed |
| Rogue | fist | middle | 0.225 | - | - | 0.260 | 0.304 |
| skeleton | club | high | 0.735 | - | 0.800 | 0.787 | 0.821 |
| skeleton | club | middle | 1.112 | - | 1.271 | 1.301 | 1.189 |
| skeleton | fist | high | 0.034 | - | - | 0.036 | 0.127 |
| skeleton | fist | middle | 0.674 | - | - | 0.683 | 0.702 |

The first 36 searches went on from `assets/core/strikes.json@80e5cec9` (the skeleton's twelve
again once its limbs were built clear, `eb1865a1`, from `@f25369bf`): 9600 throws a search, 4 to
10 minutes on 24 worker threads, 4 h 5 min in all. What they found:

- **A fist at a head nets about nothing.** A head is stiffer than a hand
  ([wounds.md](wounds.md#shares)), and each of the nine searches costs its hand 0.8 to 0.9 of
  what it does the head: they net 0.000 to 0.034 HP. The hardest cost their hands more than the
  hands hold (the Warrior's does a head 0.121 HP and its own hand 0.099, which holds 0.088).
- **At an upper trunk the same hands net 0.12 to 0.67 HP**, a tenth coming back on them.
- **A blow found at 120 Hz is another blow at a finer step.** The Rogue's club at a trunk (seed
  1) nets 0.500 HP at 120 Hz, 0.058 at 480 and 0.185 at 1920; its fist at a trunk (seed 2) lands
  8 of 8 at 120 Hz and none finer. The other fists at a trunk net 0.55 to 0.82 as much at 480.
- **Seven stand at nothing at 120 Hz and fall at a finer step**; a search throws at nothing at
  its own rate alone.

**The skeleton searched again**, its thighs and upper arms clear (`skeleton-limbs-clear`): each
cell nets as much or more (club at a head 0.735 where 0.660, at a trunk 1.112 where 1.075; fist
0.034 where 0.026, and 0.674 where 0.646), and its club at a head follows a target 12 cm across
([Steered](#steered)). In 63 bouts each (`node research/strike-bouts.mjs --gaps
2.5,3,3.5,4,4.5,5,5.5 --held club,empty`) its club does 10.47 HP in 36 throws where 8.87 in 50,
and is down after none where four; bare-handed it throws half as often.

### Searched from the upright guard

A body that holds an item holds `guardPosture`, the item upright at the wrist
([human-and-strikes.md](human-and-strikes.md#guard)); a recipe is open loop, and a chamber
reached from another guard is not reached the same way in its time. Each club cell was searched
again from `assets/core/strikes.json@b2829b66` (21 searches of 2.5 to 5 minutes on 28 threads);
the fists hold `GUARD` and kept their recipes.

- The humans' clubs net a little less (table above), the skeleton's more.
- Thrown at nothing every recipe stands at 120 Hz; the Warrior's at a head stands at 480 Hz as
  well, where its leaning-guard recipe fell.
- The Rogue's club at a trunk took three searches more (seeds 4 to 6), since none of the first
  three had a window the feet can be set to. Its recipe nets 0.280 HP at 480 Hz, 0.56 of its
  120 Hz net; seed 4, searched still, converges and stands, but a recipe is what nets most at the
  game's rate.

### Searched built in the guard

A fighter is built in the guard its mind holds (`Controller.builtIn`: `guardPosture`, or the
fists' `GUARD`) at the height its reference pose gives (`standingHeight`), 7 to 11 mm over the
guard's, so an open-loop recipe lands otherwise. Every cell was searched again from
`assets/core/strikes.json@7601bd36` (`research/core-strike-repertoire.mjs --write --from-at
--spare`, windows by `research/core-strike-window.mjs --write --spare`; 36 searches of 2 to 8
minutes on 28 threads).

- Ten of the twelve recipes net more at 120 Hz (table above).
- Thrown at nothing every recipe stands at every rate, and the Rogue's club at a trunk converges
  (0.424, 0.476, 0.491 HP at 120, 480, 1920 Hz). The fists at a trunk converge worst: the
  Warrior's nets 0.388 at 480 Hz and 0.293 at 1920.

### The club's best blow

`CLUB_BEST` (`src/core/rules/rulebook.ts`, `core-club-unit`): the Warrior's strongest one-handed
blow with the wooden club, searched again built in the guard.
`node research/core-strike-search.mjs --model workshop-fighter --held "wooden club" --band high --seed 12 --hz 960 --generations 30 --population 96 --replay 120,480,960,1920,3840 --sigma 0.2 --from <file>`,
going on from the blow of `research/core-club-unit.json@7601bd36` as `encodeHeld` writes it (27
minutes on 28 threads); its best read again by `node research/core-club-unit.mjs <its output>
--write`, which writes `research/core-club-unit.json`. Built in its guard, a head hung at its
place; each rate's mean is of eight throws' energies, the first as written.

| Rate, Hz | Mean, J | Throws, J | Landed | Stood | Closing, m/s | Club side, kg | Head side, kg |
|---|---|---|---|---|---|---|---|
| 120 | 87.85 | 0, 122.66, 6.70, 117.88, 122.86, 111.16, 90.64, 130.92 | 7 | 6 | the first misses | | |
| 480 | 137.81 | 138.98, 137.52, 138.80, 133.66, 140.40, 136.51, 137.43, 139.18 | 8 | 8 | 20.595 | 0.745 | 5.471 |
| 960 | 138.02 | 138.94, 137.60, 138.96, 138.18, 137.23, 136.71, 137.62, 138.88 | 8 | 8 | 20.499 | 0.752 | 5.480 |
| 1920 | 138.23 | 139.04, 138.09, 138.92, 137.61, 136.94, 138.70, 138.71, 137.81 | 8 | 8 | 20.420 | 0.759 | 5.482 |
| 3840 | 138.97 | 139.06, 138.90, 139.34, 138.47, 138.64, 138.68, 139.30, 139.40 | 8 | 8 | 20.252 | 0.774 | 5.480 |

- **`CLUB_BEST` is 138.23 J, 1.38 hit points**, the 1920 Hz reading; from 480 Hz up the readings
  agree to 1 %. The unit is 100 J (`owner-damage-unit`), so no blow's hit points move with it.
- It is read at the mark of the blow before it (133.75 J), closing at 20.4 m/s at 1920 Hz: built
  in the guard it lands 4.5 J harder at the same speed, with 34 g more of the club side behind it.
- **At the game's rate it is another blow**: at 120 Hz two throws of eight do 7 J or less and
  two leave the Warrior down.

### Searched again for the hip's and the calf's curves

The humans' and the skeleton's hip extension and flexion and ankle plantar flexion take Thelen's
curvature, their unloaded speeds fitted to Anderson 2007's two points (`speed.ts`), so the
recipes of `assets/core/strikes.json@95c3cad2` are thrown otherwise. Every cell was searched
again from its recipe at its seed and spread; clubs that came back below their recipes went on
at spread 0.2 (seed 4); cells whose windows came back narrower than the feet are set to went on
with each trial's target within 3 cm along and across (seed 5); and the Warrior's club at a
head, whose window held 8 cm under its place, with the target within 15 cm up as well (seed 6).
Each recipe's `found` gives its searches; the result is [the repertoire](#the-repertoire).

- **The fists gain and the clubs lose**: every fist at a head nets three to four times what it
  did, but the Rogue's, which no search gave a window the feet can be set to, is placed.
- **A window searched for**: the Warrior's club at a head, jittered up, nets 1.112 HP and holds
  24 cm under its place where it held 8, so it meets a skeleton's head with its recipe again: 85
  to 109 J at 1.6 to 2 m, where the placed blow did 8.

### Searched still

`--still` throws each trial at nothing as well, each step the stance takes there costing
`STEPPED`, 10 HP. Read on the Warrior's and the Rogue's cells, each from its recipe (the Rogue's
fists not searched); a best is kept where at 120 Hz it steps less at nothing than its recipe,
does 0.8 of its recipe at its place or more, and has a window the feet can be set to. Steps at
nothing over 16 throws:

| Body | Held | Band | Done at its place, still / recipe | Steps at 120 Hz, recipe / still | at 480 Hz | Kept |
|---|---|---|---|---|---|---|
| Warrior | club | high | 0.90 | 47 / 8 | 94 / 0 | no: its window lies nearer than its place |
| Warrior | club | middle | 0.96 | 13 / 7 | 21 / 2 | yes |
| Rogue | club | high | 0.88 | 3 / 12 | 61 / 2 | no: steps more at 120 Hz, window along half |
| Rogue | club | middle | 0.94 | 44 / 6 | 26 / 22 | yes |
| Warrior | fist | high | 1.08 | 21 / 0 | 26 / 0 | yes |
| Warrior | fist | middle | 1.17 | 1 / 0 | 6 / 0 | no: window along 0 cm |

### The toed Warrior's club blow

Option Mind's club blow (`club-blow`) on the toed Warrior holding the buckler and the club,
searched on the Strike drill's still rung (`research/club-drill.mjs`: each candidate thrown by
the mind through the recipe strike at the rung's 16 places, the bar's score; Node, the bout world,
Rapier). The head alone is kept:

| Band | Searched | Still rung, 120 Hz | 480 Hz | Held out (gaps 0.65 to 1.25, 0.1 across), 120 / 480 Hz | Kept |
|---|---|---|---|---|---|
| high | at 120 Hz | 15 of 16, 68 to 105 J | 14 of 16 | 5 of 7 / 6 of 7 | yes |
| middle | at 120 Hz | 11 of 16, 74 to 144 J | 0 of 16, 6 to 14 m/s where 12 to 19 | | no: lands through 120 Hz's error |
| middle | each place at its worse rate | 4 of 16 at both | | | no |

None fell. The high blow's misses glance off the head at 14 to 65 J; its blow comes 1.2 s after
the action begins. The flat-footed Warrior's middle recipe, thrown the same way, lands 2 of 8 at
120 Hz and none at 480.

### Another body's recipe

A hand throws its own body's recipes and no other's (`recipesFor`). A recipe is a table of one
body's muscles' pushes timed for that body's lengths, and thrown by another it passes its target:
the Rogue throwing the Warrior's club blow passes 0.5 to 0.7 m off at every height, where its
placed blow lands 4.8 to 10.4 J ([Against a recipe](#against-a-recipe)). On the targets' battery,
bare-handed, a hand given the other body's recipes after its own hits 4 of the Rogue's 9 middle
targets where its own alone, placing the rest, hits all 9.

### On a standing body

`node research/core-blow-standing.mjs`: the same blows at a foe ordered to stand, bare-handed,
the body ordered at its head or upper trunk from 2, 2.5 and 3 m; 72 bouts, nobody down.

- **The head is in a middle blow's way.** The Warrior's club blow at a trunk lands on either foe's
  head, 0.69 and 1.14 HP; several fists at a Rogue's trunk land on its head too.
- **A club blow does a standing body 0.3 to 1.1 HP and costs nothing** where its club lands. The
  skeleton's club blow at a head lands its hand, not its club: 6 to 24 J, 0.08 to 0.13 HP to the
  foe and 0.04 to 0.10 to itself.
- **A fist costs its thrower about what it does a standing body** (0.12 against 0.17 HP, the
  Warrior's at a Rogue's head).
- **A height at a window's edge reads either side of it**: a standing head sways 7 mm from stand
  to stand. The skill chooses a blow by the head as it stands once for a point attacked
  (`strikeSkill`, `src/core/skills/strike.ts@aa0f76d7`); choosing at every stand, it threw neither.
- **Two windows that overlap in height keep the blow chosen**: the skill keeps a recipe at a
  stand while its window holds the target's height (`holdsAt`). Choosing again, the Warrior at a
  skeleton's head walked between its two club blows' places and never chambered; holding, it
  chambers 1.5 s after its feet are set.

### The battery, searched

`node research/core-targets.mjs --each` on the tree the searched repertoire is in, beside
[The battery, placed](#the-battery-placed). 6 of 180 runs fell walking back after their reading,
where 23 did.

| Body | Held | Hit, of 3 / 9 / 9 / 9 | Mean HP | Missed by, cm | Crowded |
|---|---|---|---|---|---|
| Warrior | empty | 3 / 9 / 9 / 1 | 0.026, 0.078, 0.080, 0.003 | -, -, -, 25.9 | 5 |
| Warrior | club | 3 / 9 / 8 / 2 | 1.027, 0.908, 0.520, 0.031 | -, -, 0.0, 27.4 | 0 |
| Rogue | empty | 3 / 9 / 9 / 1 | 0.041, 0.048, 0.006, 0.001 | -, -, -, 30.1 | 6 |
| Rogue | club | 3 / 8 / 9 / 2 | 0.013, 0.376, 0.221, 0.012 | -, 2.5, -, 32.4 | 0 |
| Skeleton | empty | 3 / 8 / 9 / 2 | 0.090, 0.047, 0.031, 0.007 | -, 4.7, -, 15.6 | 5 |
| Skeleton | club | 3 / 9 / 4 / 0 | 0.460, 0.325, 0.565, - | -, -, 55.3, 76.2 | 0 |

- **100 of the 108 high and middle targets are struck, where 66 were, and every control.**
- **A recipe is thrown at 95 of the 180**: every control, 48 of 54 high targets, 29 of 54 middle
  ones, no low one. The rest are placed.
- **The blows are harder**: the Warrior's fists 0.078 HP at a high target where 0.002 placed;
  the Rogue's club strikes 17 of 18 where it struck 1.
- **The skeleton's club misses the lower middle targets**: its window at a trunk is 43 to 11 cm
  under its head, and five of its middle targets hang lower and are placed.

## Cover

A cover (`GUARD_COVER`, `src/core/skills/guard.ts`) is what a guarding hand does once told what
threatens which place of its body: the point it covers with goes `out` m from the place guarded
toward the threat, by a hand goal given `seconds` to reach it, which follows the two as they
move. An empty hand covers with its knuckles; a club with its swell (`ItemSpec.cover`, the
swell's two ends), their middle where a single point would go and their line square to the
threat's, the way nearest how the club lies.

**`GUARD_COVER` is `out` 0.3 m and `seconds` 0.15 s**, from [Reach](#reach).

### Reach

`node research/core-guard-reach.mjs --covers '<covers>'`, `--model workshop-rogue` for the
Rogue: a body stood 1.5 s in the guard is given a cover of a threat still 0.8 m from its head
(ahead, to its left, to its right, above, low), its left hand empty and its right holding the
club, each on a run of its own. Off is how far the knuckles and the swell's middle are from the
place asked; off square, the swell's line from square at 1 s. No run fell. At 0.3 m and 0.15 s:

| Body | Threat | Knuckles off, cm: 0.15 / 0.3 / 0.6 / 1 s | Swell off, cm: same times | Off square, rad | Same end up |
|---|---|---|---|---|---|
| Warrior | ahead | 3.8 / 2.2 / 0.1 / 0.3 | 16.7 / 20.8 / 3.5 / 0.4 | 0.01 | yes |
| Warrior | its left | 11.9 / 8.0 / 1.9 / 0.4 | 13.7 / 6.7 / 3.1 / 3.4 | 0.21 | yes |
| Warrior | its right | 46.4 / 40.8 / 27.0 / 24.9 | 42.0 / 38.4 / 15.7 / 15.0 | 0.29 | yes |
| Warrior | above | 26.5 / 13.0 / 2.3 / 1.3 | 7.8 / 6.9 / 0.9 / 0.0 | 0.00 | yes |
| Warrior | low | 0.7 / 0.3 / 0.2 / 0.2 | 30.9 / 22.5 / 10.1 / 1.2 | 0.01 | yes |
| Rogue | ahead | 7.7 / 4.6 / 0.5 / 0.0 | 21.5 / 20.3 / 50.3 / 83.1 | 0.71 | no |
| Rogue | its left | 21.5 / 17.2 / 3.2 / 0.4 | 16.0 / 14.8 / 7.3 / 27.8 | 0.38 | no |
| Rogue | its right | 48.8 / 36.6 / 30.4 / 25.8 | 50.9 / 64.9 / 98.1 / 37.5 | 0.34 | yes |
| Rogue | above | 32.8 / 17.0 / 1.8 / 1.0 | 24.9 / 15.5 / 12.6 / 46.9 | 0.20 | no |
| Rogue | low | 4.4 / 3.8 / 3.4 / 3.4 | 29.4 / 28.1 / 42.1 / 14.5 | 0.45 | no |

- **A bare hand is before the face in 0.3 s, and at its own side or overhead in 0.6.**
- **A hand does not cover across the body**: a threat on the far side is 25 to 46 cm from the
  knuckles at every setting. The other side is the other hand's.
- **`out` 0.3**: at 0.2 the knuckles stop 2.8 cm short of a place ahead, where the face is; at
  0.4 the hand is 14.7 cm from a place at its side at 0.3 s where it is 8.0.
- **`seconds` 0.15**: at 0.1 the arm is asked more than it gives and is later (18.1 cm from a
  place ahead at 0.15 s), and a low threat turns the club end over end; at 0.25 and 0.4 a threat
  at its left turns it over. At 0.15 the same end stays up for every threat.
- **The club is slower than the hand, and the Rogue's does not come to its place.**

### A club's line

`--club skill|up|middle`: the swell's two ends laid square the way nearest how the club lies
(the skill's), the way nearest the body's up, or its middle alone as one point.

- **How the line is laid is not what fails.** Laid by the body's up, the Rogue's swell comes to
  4.3 cm of a place ahead at 1 s where the skill's is 83 cm off, and the Warrior's is 52.8 cm off
  at 0.3 s where the skill's is 20.8: each way suits one body.
- **The middle alone comes to a place ahead on both bodies, and no sooner**, its line 0.3 to
  1.1 rad off square at either side.
- What the three share is the hand goal, taken to places by the arm's solve, which a heavy item
  at the end of the Rogue's arm does not follow ([human-and-strikes.md](human-and-strikes.md#ik)).
  The skill's line stays.

## Threat

A threat (`THREAT`, `src/core/mind/threat.ts`) is a foe's striking point (its knuckles, or the
swell of the club it holds) within `within` m of a body's head and closing on it at over
`closing` m/s; the one closing fastest is what a covering hand is told to cover against.

**`THREAT` is within 1.5 m, closing at over 2 m/s**: of the [threat sweep](#threat-sweep) it
costs the least (falls 0.37 to 0.39, wins 0.47); within 2 m reads the same to the band of 512
pairs, and nothing read there earns a change.

### How late a cover is

`node research/core-guard-late.mjs`, and with `--threat '{"within":2.5,"closing":-100}'`: arena
bouts with a club in every right hand, the Warrior and the Rogue in each pair, gaps 3 to 5 m,
each side covering in turn, the senses 0 steps old. For each blow a covering head met: how long
its mind had seen a threat, and how far the knuckles and swell were from their places the step
before.

- **The threat set is seen 0.14 to 0.16 s before the blow, and the cover is not there**: the
  knuckles are 24 to 63 cm from their place and the swell 25 to 88 cm, where a bare hand needs
  0.3 s and a swell 0.6 ([Reach](#reach)). A threat is seen in 0.2 to 1.7 % of a bout's steps.
- **Seen sooner, the cover is still not there**: within 2.5 m at any speed a threat is seen in
  66 to 78 % of the steps and 5.5 to 13.7 s before the blow, and the knuckles are 17 to 40 cm and
  the swell 23 to 75 cm off. A strike has one of the covering side's hands in 54 to 75 % of its
  steps, and the place a cover asks for moves with the foe's swing.

### Threat sweep

`node research/core-guard.mjs --bouts 32 --from 1000 --held club --variants '<threats>'`, saved in
two parts and read as one: 5376 arena bouts, clubs, the Warrior and the Rogue in each ordered
pair, the senses 0 and 24 steps old, 32 gaps from 3.06 to 4.99 m; a control with both sides in
the pose, and each side covering in turn under each threat. Pooled over both delays (512 pairs a
row); the pose's head lost 0.122 HP a bout and fell in 0.37 of its bouts. "Any" closing is
`closing: -100`; d is Cohen's d of the head's saving, paired by gap; the bar is
[the guard battery's](#guard-battery), per cell of sixteen.

| Within, m | Closing over, m/s | Head HP, cover | d | Fell, cover | Won, cover | Cells over d 0.2 | with no more falls | Least d |
|---|---|---|---|---|---|---|---|---|
| 1.5 | 2 | 0.110 | 0.06 | 0.39 | 0.47 | 4 | 1 | -0.26 |
| 1.5 | 0 | 0.126 | -0.02 | 0.39 | 0.46 | 1 | 0 | -0.52 |
| 1.5 | any | 0.126 | -0.02 | 0.49 | 0.36 | 2 | 1 | -0.31 |
| 2 | 2 | 0.109 | 0.07 | 0.39 | 0.48 | 3 | 0 | -0.27 |
| 2 | 0 | 0.102 | 0.06 | 0.44 | 0.43 | 5 | 1 | -0.41 |
| 2 | any | 0.101 | 0.06 | 0.49 | 0.39 | 4 | 0 | -0.35 |
| 2.5 | 0 | 0.106 | 0.04 | 0.46 | 0.43 | 6 | 0 | -0.49 |
| 2.5 | any | 0.097 | 0.07 | 0.54 | 0.35 | 5 | 1 | -0.35 |
| 3 | any | 0.078 | 0.14 | 0.55 | 0.35 | 4 | 0 | -0.22 |
| 1 | any | 0.107 | 0.05 | 0.54 | 0.32 | 5 | 1 | -0.40 |

- **No threat meets the bar**: at most 6 cells of 16, at most 1 of them with no more falls, and
  every threat has a cell where covering costs the head at d of -0.22 or worse.
- **A wider threat saves somewhat more of the head and costs falls and wins**: 3 m at any speed
  saves the most and falls in 0.55 of its bouts.
- **With the senses 24 steps old only the widest saves anything** (d 0.08; every other -0.10 to 0.00).

## Guard battery

`node research/core-guard.mjs --bouts 32`: arena bouts (`research/bout.mjs`), clubs and bare
hands, the Warrior and the Rogue in each ordered pair, the senses 0 and 24 steps old, 32 gaps
from 3.03 to 4.99 m by the golden ratio's sequence (a gap stands for a seed). At each gap one bout
has both sides in the pose, the control, and one each side covering (`guard: "cover"`, `THREAT`,
`GUARD_COVER`) against the pose; a cell pairs the covering bout with the control at the same gap.
1536 bouts in 1608 s on 14 workers, on the repertoire of `assets/core/strikes.json@80e5cec9`.

**The bar**: covering loses fewer hit points to the head in every cell, at d over 0.2, on two
sets of gaps, with no more falls.

| Set | Held | Delay | Pairs | Head HP, pose / cover | d | All HP d | Fell, pose / cover | Won, cover |
|---|---|---|---|---|---|---|---|---|
| first | club | 0 | 256 | 0.140 / 0.161 | -0.10 | -0.12 | 0.36 / 0.35 | 0.48 |
| first | club | 24 | 256 | 0.100 / 0.093 | 0.06 | 0.05 | 0.38 / 0.39 | 0.50 |
| first | empty | 0 | 256 | 0.017 / 0.018 | -0.08 | -0.04 | 0.37 / 0.36 | 0.49 |
| first | empty | 24 | 256 | 0.015 / 0.015 | 0.01 | 0.02 | 0.37 / 0.40 | 0.47 |
| first | every | every | 1024 | 0.068 / 0.072 | -0.03 | -0.04 | 0.37 / 0.38 | 0.48 |
| fresh (`--from 1000`) | club | 0 | 256 | 0.159 / 0.133 | 0.11 | 0.12 | 0.34 / 0.34 | 0.50 |
| fresh | club | 24 | 256 | 0.084 / 0.087 | -0.02 | 0.09 | 0.39 / 0.44 | 0.44 |
| fresh | club | every | 512 | 0.122 / 0.110 | 0.06 | 0.11 | 0.37 / 0.39 | 0.47 |

- **The bar is missed on both sets**: covering saves the head at d over 0.2 in 1 of 32 cells (0
  with no more falls, the least -0.43), and on the fresh clubs in 4 of 16 (1, -0.26).
- **A cell of 32 gaps is noise**: the Warrior against the covering Rogue, clubs, nothing
  delayed, reads d -0.43 on the first gaps and 0.32 on the fresh ones. The sets of 384 gaps the
  bar was written for were not played, since no pooled row comes near 0.2.
- **Fewer blows meet the head, and it loses no less**: in the Warriors' mirror with clubs the
  covering head meets 0.50 and 0.53 blows a bout where it met 0.75 and 0.97.
- **Bare-handed there is nothing to save**: a head loses 0.000 to 0.098 HP a bout either way.
- **Fighters go on in the pose** (`RECIPE_FIGHTER.tactics.guard`); the cover is a config's
  (`&guard=cover` on the arena's address). Why it does not save the head:
  [How late a cover is](#how-late-a-cover-is).

### Covering, searched

The same command on the tree the searched repertoire is in: the first set's 32 gaps, cells and
bar; 1536 bouts in 1015 s on 28 workers.

| Held | Delay | Pairs | Head HP, pose / cover | d | All HP d | Fell, pose / cover | Won, cover |
|---|---|---|---|---|---|---|---|
| club | 0 | 256 | 0.092 / 0.073 | 0.13 | 0.14 | 0.40 / 0.36 | 0.53 |
| club | 24 | 256 | 0.106 / 0.115 | -0.10 | -0.02 | 0.36 / 0.40 | 0.45 |
| empty | 0 | 256 | 0.046 / 0.040 | 0.08 | 0.17 | 0.38 / 0.44 | 0.49 |
| empty | 24 | 256 | 0.047 / 0.044 | 0.06 | 0.04 | 0.39 / 0.40 | 0.50 |
| every | every | 1024 | 0.073 / 0.068 | 0.05 | 0.09 | 0.38 / 0.40 | 0.49 |

- **The bar is missed as it was**: d over 0.2 in 9 cells of 32, 5 of them with no more falls,
  the least -0.36.
- **The cover is as late**: of 15 blows that met a covering head, 12 had a threat seen 0.13 to
  0.19 s before and 3 none; the knuckles were 29 to 60 cm from their place and the swell 13 to 81.
- **Against a Warrior that stands, the club blow is met by the pose's club and by the cover's
  head.** `firstBlow` (`tests/core-guard.test.mjs@2a1b29ac`), ten gaps from 2.5 to 5 m: in the pose the
  first blow lands on the standing Warrior's club at every gap, 40 to 52 J; covering, from 3.5 to
  4.25 m, on its head, 89 to 112 J.

## Aim

A fighter aims at its foe's head (`FighterMindConfig.aim`, `"head"`,
`src/core/mind/config.ts@352fbe24`), or at the part its right hand's recipes net most on
(`"pays"`: `netsOf`). Under `"pays"` every body, with a fist or the club, aims at the upper
trunk: its recipes there net 1.112 to 1.417 HP with the club where 0.433 to 1.107 at a head, and
0.225 to 0.674 with a fist where 0.007 to 0.034.

`node research/core-aim.mjs --bouts 32`, and `--from 32` for a second set, `--load` to read both:
each thing held and ordered pair of the three bodies, one bout with both sides at the head and one
with each side in turn at what pays, 1728 bouts a set. A row is the side aiming at what pays: its
margin gained (its bar less its foe's) over the bout at the same gap, d, and what it won, fell in
and took off its foe, at the head / at what pays.

| Gaps | Held | Gained | d | Won | Fell | Foe's HP lost |
|---|---|---|---|---|---|---|
| first 32 | club | 0.019 | 0.13 | 0.50 / 0.45 | 0.34 / 0.35 | 0.311 / 0.381 |
| first 32 | fist | 0.017 | 0.24 | 0.50 / 0.46 | 0.37 / 0.46 | 0.350 / 0.400 |
| second 32 | club | 0.013 | 0.09 | 0.50 / 0.48 | 0.31 / 0.32 | 0.317 / 0.367 |
| second 32 | fist | 0.016 | 0.25 | 0.50 / 0.47 | 0.38 / 0.45 | 0.324 / 0.441 |
| all 64 | either | 0.016 | 0.14 | 0.50 / 0.47 | 0.35 / 0.39 | 0.325 / 0.397 |

- **Aiming at what pays gains margin and wins fewer bouts**, and falls more. 13 of 36 cells are
  over d 0.2 in both sets; the Warrior with the club on the left of a Warrior is under -0.2 in
  both (-0.47, -0.32).
- **Where a body that aims at a trunk falls, margin and wins disagree most**: the bare Rogue on
  the right of a Warrior gains 0.13 of margin, d 1.25, falls in 0.92 of its bouts where 0.08,
  and wins 0.03 where 0.14.
- **Six cells say nothing**: with a bare Warrior on the right the bout is its fall at 2.9 s
  ([bouts.md](bouts.md#searched-blows)).
- **64 gaps a cell is a pilot**: a cell's d has a standard error near 0.13; 384 gaps a cell
  would take about 4 h a set, and were not played.

`RECIPE_FIGHTER.tactics.aim` is `"head"`. Where a fighter aims, a bare fist at a head included,
is its mind's choice, not a rule (the owner, 2026-10-24).

## Robustness

Where each recipe misses and what it does to its own body when it meets nothing.
`node research/strike-robustness.mjs`: each throw as its search threw it (`evaluateBlow`), four
throws a reading, watched 3 s after the pushes. Off its place, the target moved along the heading
or across it, unseen: what a body whose feet stood that far off throws.

- **Across the heading is where a recipe misses**: 12 cm across, the club blows at a head keep
  0.17 or less of what they do at their place, those at a trunk 0.34 to 0.51 ([Steered](#steered),
  "none" rows). Along it the clubs' arcs forgive more: 6 cm either way keeps 0.77 to 1.08.
- **A fist loses either way**: 12 cm along toward the body keeps 0.09 to 0.50, 12 across 0.00
  to 0.92.
- **An off blow can put its thrower down**: the Warrior's club at a head 12 cm across, its fist at
  a trunk 12 cm along, two of four.

**At nothing** (`balanceTrace`, `research/core-blow.mjs`: the stance's steps, `recoveryStep`;
the capture point against the soles' outline drawn in by `SUPPORT_INSET`; the soles' shortfall):

- **A blow at nothing makes its stance step at 120 Hz**: the capture point leaves the inner
  outline a quarter to a half second after the pushes begin, in the follow-through. Ten of the
  twelve recipes step in one throw of four or more.
- **The step is back and to the thrower's right**: the Warrior's club at a head runs the capture
  point 50 cm back and 41 cm right; a fist 4 to 11 cm back.
- **The soles fall short of what the stance asks** by 0.18 to 0.68 of the body's weight and 90
  to 880 N m at 120 Hz.
- **It falls at 120 Hz in one recipe**, the Rogue's club at a trunk (two perturbed throws of
  four); at 480 Hz in the three high clubs, the Warrior's running its capture point 2 m back.

**In bouts** (`node research/strike-bouts.mjs --held club,empty`): every pair at gaps 3, 4 and
5 m, each side the fighter. An attempt runs from the skill taking an attack to its blow thrown,
dropped or cut; it is committed at its chamber, or its pushes where it has none; a throw landed
where the thrower's hand or what it holds took hit points from the foe up to 0.25 s after.

| | Club | Empty |
|---|---|---|
| Bouts, s of bout | 27, 431 | 27, 1137 |
| A side's time: approach, place, settle | 10.8, 29.9, 21.3 % | 6.2, 43.3, 33.0 % |
| A side's time: chamber, swing | 3.6, 3.0 % | 0.0, 6.3 % |
| Set-up, attempt to commit, median | 4.44 s | 4.05 s |
| Committed with the foe's head in the window at the commit | 17 of 57 | 33 of 227 |
| the same as the pushes began | 10 of 57 | 33 of 227 |
| The point held from the foe's head at the commit, median | 11.4 cm | 10.9 cm |
| Committed throws landed: Warrior, Rogue, skeleton | 21 of 25, 27 of 29, 12 of 12 | 27 of 88, 119 of 132, 77 of 98 |
| on the head | 16, 16, 10 | 12, 48, 39 |
| the thrower stepped to catch itself | 11, 8, 6 | 46, 27, 40 |
| the thrower down within 2 s of the commit | 0, 2, 0 | 0, 2, 0 |

- **A throw is thrown at where the head was**: the tactics hold the point they attack until the
  head is `APPROACH.reach`, 25 cm, from it (`recipeTactics`), so the throw is at a point a median
  11 cm from the head, more than a window's width. Aiming at the head as it is makes no more land
  ([Tried and not kept](#tried-and-not-kept)).
- **A thrower steps to catch itself after more than a third of its throws**, and is down after 4
  of 384.
- **Setting up is most of a bout**: placing the feet and standing are half a club side's time and
  three quarters of a bare one's.

### Steered

A recipe follows its target across (`STEER`, `src/core/skills/strike.ts`): from the commit to the
end of its pushes the stance's heading is turned by as much as the target's bearing has turned
since the commit, read from where the feet's middle stood then, up to 0.3 rad either way; and the
fighter aims at the foe's head itself once a blow is committed (`recipeTactics`).

**On the stand.** `node research/strike-robustness.mjs --seen --offsets 0.06,0.12 --hz 120`, and
`--steer 0` for none: the target moved once the blow is committed, as a head that moved under it.
A cell is the mean done as a share of the done at its place, unturned → turned; where fewer than
four landed, how many did and how many left the thrower down.

| Held | Body | Band | At its place, HP | Across -12 | -6 | +6 | +12 | Along -12 | +12 |
|---|---|---|---|---|---|---|---|---|---|
| club | Warrior | high | 1.02 | 0.17 (3/4, 1 fell) → 0.56 (3/4, 1 fell) | 0.61 → 0.57 | 0.49 → 1.01 | 0.09 (2/4) → 0.91 | 0.73 → 0.77 | 0.91 → 0.71 (3/4) |
| club | Warrior | middle | 1.37 | 0.34 (3/4) → 0.95 | 0.84 → 0.91 | 0.72 → 1.02 | 0.42 → 0.99 | 0.86 → 0.89 | 0.74 → 0.76 |
| club | Rogue | high | 0.42 | 0.02 (1/4) → 0.77 | 0.46 → 0.74 | 0.84 → 0.80 | 0.09 → 0.46 | 0.87 → 0.89 | 0.24 → 0.06 (3/4) |
| club | Rogue | middle | 0.54 | 0.35 → 0.89 | 0.81 → 0.98 | 0.86 → 0.87 | 0.47 → 0.83 | 0.79 → 0.83 | 0.78 → 0.41 |
| club | skeleton | high | 0.79 | 0.05 → 0.98 | 0.62 → 1.04 | 0.68 → 1.02 | 0.14 (2/4, 1 fell) → 1.02 | 0.58 → 0.55 | 0.72 (3/4, 1 fell) → 0.74 |
| club | skeleton | middle | 1.12 | 0.31 → 0.99 | 0.52 → 1.00 | 0.76 → 0.98 | 0.36 → 0.93 | 0.92 → 0.88 | 0.53 → 0.54 |
| fist | Warrior | high | 0.12 | 0.61 → 0.80 | 0.91 → 0.84 | 1.07 → 1.06 | 0.92 → 1.15 | 0.50 → 0.49 | 0.54 → 0.45 |
| fist | Warrior | middle | 0.53 | 0.60 → 1.04 | 1.12 → 1.13 | 0.54 → 0.81 | 0.18 → 0.73 | 0.21 (2/4, 2 fell) → 0.21 | 0.41 → 0.40 |
| fist | Rogue | high | 0.05 | 0.00 (0/4) → 0.59 | 0.48 → 0.82 | 0.95 → 1.04 | 0.30 → 1.02 | 0.49 → 0.50 | 0.72 → 0.96 |
| fist | Rogue | middle | 0.31 | 0.45 → 0.70 | 0.84 → 0.77 | 0.56 → 0.71 | 0.10 → 0.47 | 0.34 → 0.38 | 0.10 → 0.12 |
| fist | skeleton | high | 0.18 | 0.24 (3/4) → 1.21 | 0.72 → 1.13 | 0.68 → 1.01 | 0.07 (2/4) → 0.98 | 0.11 → 0.11 | 1.21 → 1.18 |
| fist | skeleton | middle | 0.70 | 0.43 → 0.56 | 0.86 → 0.64 | 1.05 → 0.92 | 0.39 → 1.11 | 0.10 (3/4, 1 fell) → 0.13 (3/4, 1 fell) | 0.54 → 0.53 |

- **Across, a turned blow keeps what it does**: 12 cm across the clubs keep 0.46 to 1.02 where
  unturned 0.02 to 0.47, the fists 0.47 to 1.21 where 0.00 to 0.92; at its place every recipe
  reads as it did, to the bit. The skeleton's club at a head keeps 0.98 to 1.04 turned, its thighs
  clear of each other (`skeleton-limbs-clear`), so its pelvis turns under the chamber.
- **Along, the turn changes little**, and three clubs keep less 12 cm beyond their place.
- **No throw is put down by its turn**: the Rogue's recipes moved 12, 18 and 24 cm across stand
  turned, eight throws a cell.
- **The limit, 0.3 rad**: at 0.15 every club keeps as much at 12 cm, and the fists less (the
  Rogue's at a head 0.14 where 0.53); at 18 and 24 cm the Rogue's club at a trunk keeps less, and
  its fist at a trunk lands none of four at 24 cm left where at 0.3 it lands four. Read on a turn
  taken from the feet's middle as it stood each step, not at the commit.

**In bouts.** `node research/strike-bouts.mjs --gaps 2.5,3,3.5,4,4.5,5,5.5 --held club,empty`, 63
bouts each, read at `3667afc3` (the skeleton's thighs not yet clear). The placebo holds the turn
under 0.001 rad, which turns nothing and moves every bout.

| Held | Turn | Bout s | Committed | Landed | On the head | HP a minute | Thrower down | not struck first |
|---|---|---|---|---|---|---|---|---|
| club | none | 992 | 150 | 139 (93 %) | 95 (63 %) | 2.53 | 9 | 2 |
| club | placebo | 948 | 145 | 133 (92 %) | 90 (62 %) | 2.64 | 10 | 8 |
| club | 0.3 rad | 890 | 137 | 129 (94 %) | 87 (64 %) | 2.71 | 15 | 3 |
| empty | none | 2947 | 782 | 517 (66 %) | 232 (30 %) | 0.14 | 8 | 0 |
| empty | placebo | 2634 | 612 | 462 (75 %) | 240 (39 %) | 0.14 | 9 | 2 |
| empty | 0.3 rad | 2197 | 541 | 359 (66 %) | 186 (34 %) | 0.12 | 14 | 5 |

- **In bouts the turn shows nothing a placebo does not.** At the commit the foe's head is a median
  7 cm short of the window along and as far either way across (the middle 80 %: 19 cm short to 7
  beyond, 9 cm either way), so the turn takes up half of what the feet leave.
- **The bare Rogue goes down unstruck after more throws** turned (4 of 12 downs, against none of
  7 unturned); on the stand its turned fists stand in every throw. Not explained.

### Up

`node research/strike-robustness.mjs --ways up --offsets 0.04,0.08,0.12` and `--offsets
0.14,0.18,0.22`: the target moved up or down, unseen; a share of the done at its place, and how
many of four landed where fewer did.

| Held | Body | Band | Window up, cm | At its place, HP | -18 | -14 | -8 | -4 | +4 | +8 | +14 | +18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | Warrior | high | -6 to 12 | 1.02 | 0.95 | 0.88 | 0.99 (3/4, 1 fell) | 1.01 | 0.87 | 0.75 | 0.72 (3/4) | 0.82 |
| club | Warrior | middle | -30 to 26 | 1.37 | 0.68 | 0.82 | 0.96 | 0.97 | 0.99 | 0.96 | 0.90 | 0.70 |
| club | Rogue | high | -8 to 8 | 0.42 | 0.31 | 0.48 | 0.81 | 0.95 | 1.02 | 0.79 | 0.50 (3/4) | 0.14 (2/4) |
| club | Rogue | middle | -40 to 24 | 0.54 | 0.85 | 0.85 | 0.91 | 0.98 | 1.00 | 0.98 | 0.93 | 0.85 |
| club | skeleton | high | -14 to 26 | 0.67 | 0.43 | 0.52 | 0.69 | 0.76 | 1.03 | 0.90 | 0.87 | 0.81 |
| club | skeleton | middle | -18 to 14 | 1.08 | 0.54 | 0.85 | 0.88 | 0.85 | 0.99 | 0.91 | 0.54 | 0.67 |
| fist | Warrior | high | 0 to 8 | 0.12 | 0.00 (1/4) | 0.17 (3/4) | 0.58 | 0.92 | 1.00 | 0.67 | 0.25 | 0.00 (1/4) |
| fist | Warrior | middle | -36 to 20 | 0.53 | 1.09 | 1.13 | 1.11 | 0.79 | 0.81 | 1.00 | 0.85 | 0.66 |
| fist | Rogue | high | -12 to 6 | 0.05 | 0.20 | 0.40 | 0.80 | 0.80 | 1.40 | 1.40 | 0.40 | 0.20 |
| fist | Rogue | middle | -14 to 20 | 0.31 | 0.48 | 0.52 | 0.77 | 0.77 | 0.68 | 0.90 | 0.81 | 0.61 |
| fist | skeleton | high | -28 to 18 | 0.18 | 0.83 | 0.78 | 0.89 | 0.89 | 0.83 | 1.11 | 1.11 | 0.94 |
| fist | skeleton | middle | -14 to 24 | 0.54 | 0.61 | 0.76 | 1.20 | 1.15 | 1.17 | 0.93 | 0.89 | 0.80 |

**What a bout asks up.** A head stands still up and down while a fight sets its feet: at the
commits of the 126 bouts of [Steered](#steered), unturned, the foe's head stood at 1.582 to 1.603
m for the Warrior, 1.443 to 1.462 for the Rogue and 1.407 to 1.422 for the skeleton (the middle
80 %). The offset up is the matchup's: the Warrior's blow at the Rogue's head is 14 cm under its
place and at the skeleton's 18 cm, and between the Rogue and the skeleton 4 cm.

- **Up, the clubs at a head miss little in the matchups that ask it**; the Rogue's at the
  Warrior's head is the one loss, 0.50, one of four missing.
- **The fists at a head lose more and do least.**
- **The offset is known at the commit and does not move under the blow**: it asks for the recipe
  aimed for it, not steered after it.

## In a fight

**The Duellist throws its recipes after 0.25 s stood still, at a target up to 12 cm along and
20 cm across outside a recipe's window, from where it stands** (`DUELLIST_STRIKE`,
`src/core/mind/config.ts`; the recipe strike's `stand` and `slack`, `recipeExecutor`,
`src/core/skills/strike.ts`). Set for the result: the owner's Crypt ends by a mind that kills
(2026-10-24), and with 1.5 s stood (`STAND`) and no slack nothing died. The other recipe fighters
keep `STAND` and the windows as searched.

Why nothing died: in a Crypt fight a club side spent most of its attack setting its feet and
standing (the hero of seed 10, 60 s: 12.8 s placing and 12.0 standing over 4 swings), and a target
stood still 1.5 s had left a window 2 to 6 cm deep and 4 cm wide, so the feet were set again until
the 6 s preparation deadline. The slack is beyond what [Robustness](#robustness) read on the stand
(a club keeps 0.77 to 1.08 of its blow 6 cm along, and steered 0.46 to 1.02 at 12 cm across).

**In the Crypt.** `crypt-clear`'s standard protocol (levels 10 and 25, two trials each, the mob and
independent foes, 180 s; the level-clearer leading), every humanoid on both sides under the mind
read; Node, `rapier-coordinate`, 120 Hz, at `b1471856`; the last row is
`npm run evaluate -- crypt-clear` at `3ea295de` to the run (`assets/evaluations/crypt-clear/2026-10-24-3ea295de-e459f9c8.jsonl`):

| The Duellist's recipe strike | Foes killed, of 128 | Levels cleared, of 8 | Party members lost |
|---|---|---|---|
| as searched: 1.5 s stood, no slack | 1 | 0 | 1 |
| 0.25 s, slack 6 cm along and 12 across | 7 | 1 | 4 |
| **0.25 s, slack 12 cm along and 20 across** | 8 | 2 | 1 |

**In the Arena.** `npm run match -- <the change> duellist` (protocol `5bc0cd3b51527a1a`, match
`e7b03e082ac20a1a`, at `b1471856`): the change scores 0.767 (0.692 to 0.833) over 120 bouts, 92 won,
28 lost; 36 of its wins are fatal and 8 severed, against 2 and 1 of its losses. It loses the Rogue
against the Warrior (13 of 30) and sword and buckler (13 of 24).

## Tried and not kept

- **Aiming afresh** (the tactics' point following the head while the skill stands, so a throw
  commits only with the head in its window; waits of 0 to 2 s before setting the feet again):
  club HP a minute 1.06 to 1.99 where 2.49, bare 0.07 to 0.09 where 0.15; the feet are set again
  three to five times as often. A club throw committed in the window has left it by the pushes
  (the head moves 5 to 7 cm in the chamber), and bare, more land but fewer are recipes.
- **A jittered search** (the Warrior's club at a head, `--jitter 0.08,0.08,0`, each trial's
  target within 8 cm, seen once committed): its best nets 0.82 HP at 120 Hz and 0.01 and 0.02 at
  480 and 1920, where the recipe keeps 1.11, 1.12 and 0.86 and, steered, lands all sixteen
  jittered targets at 1.06 HP to the best's 0.97. A score averaged over offsets that move every
  generation rewards what the noise favours.
- **Leaning the blow** (`StanceGoal.centre` 4 cm ahead, back, right or left from commit to the
  end of the pushes): done 0.39 to 0.47 HP where 0.50, and more steps at 120 Hz in each.
- **A braked follow-through** (0.2 to 0.6 s, brake 0.1 to 0.3 s): more steps at every setting
  than the guard taking the arm back as the pushes end.
- **Thrown from where it stands** (no feet set when the window already holds the target): the
  approach ends within `APPROACH.reach` of a window 4 to 26 cm wide, so it seldom applies;
  landed of committed club 0.87 where 0.90, empty 0.65 where 0.60, set-up unchanged.
- **Wider threats** ([Threat sweep](#threat-sweep)) and **aiming at what pays** ([Aim](#aim)).
- **In the Crypt, beside [In a fight](#in-a-fight)**, the same 8 runs each: the feet stopped as
  soon as the target stands within the slack, 7 foes killed and 2 levels cleared; with that, no
  stand at all, 6 and 2; with that, the head and the thrust alone, 5 and 1. None reads apart from
  the 8 and 2 it was set at.
- **A wider slack** (the recipe strike's 20 cm along and 35 across, every humanoid on both sides; at
  `93ea707d`, the same 8 runs, where the slack set kills 6, clears 2 and loses none): 8 killed,
  1 cleared, none lost, the party dealing 5.4 of the foes' pools to 3.2 taken (4.7 to 4.4); at 30
  and 50 cm, 8 killed, none cleared, 3 lost. In the Arena it scores 0.408 (0.333 to 0.483) against
  the Duellist over the standard match's 120 bouts (protocol `5bc0cd3b51527a1a`, match
  `1bd6771c5075dcce`).
- **A party that never gives up a fight** (the level-clearer's `POLICY.stall` past the run; at
  `93ea707d`, the same 8 runs): 7 killed, none cleared, 1 lost. Over those runs at `93ea707d`
  the leader pushes on past its foes for 36 to 135 s of 180, since a fight with none falling in
  20 s stays given up while any foe is near; more time fighting does not kill more, since the
  party of three starts 9 to 13 strikes in 90 s and about half end at the preparation deadline,
  setting the feet again as the target leaves the window.
