# Blows

What a blow does, measured: the lab's dummy (`hangDummy`, `src/lab/targets.ts`), the club's best
blow (`CLUB_BEST`), and the cover and threat (`GUARD_COVER`, `THREAT`). Unless a section says
otherwise a figure is Node, Rapier, 120 Hz, no assist, the arena's rulebook: the core stand for a
throw, the core world for an arena bout (each side's balance its character's). The rows behind
each summary are in this file's git history; the records of the searched and placed strikes
(`src/core/skills/strike.ts@bca8fc87`) are this file at `bca8fc87`.

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

## The club's best blow

`CLUB_BEST` (`src/core/rules/rulebook.ts`, `core-club-unit`): the Warrior's strongest one-handed
blow with the wooden club, searched again built in the guard.
`node research/core-strike-search.mjs@bca8fc87 --model workshop-fighter --held "wooden club" --band high --seed 12 --hz 960 --generations 30 --population 96 --replay 120,480,960,1920,3840 --sigma 0.2 --from <file>`,
going on from the blow of `research/core-club-unit.json@7601bd36` as `encodeHeld` writes it (27
minutes on 28 threads); its best read again by `node research/core-club-unit.mjs@bca8fc87 <its output>
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

## Cover

A cover (`GUARD_COVER`, `src/core/skills/guard/guard.ts`) is what a guarding hand does once told what
threatens which place of its body: the point it covers with goes `out` m from the place guarded
toward the threat, by a hand goal given `seconds` to reach it, which follows the two as they
move. An empty hand covers with its knuckles; a club with its swell (`ItemSpec.cover`, the
swell's two ends), their middle where a single point would go and their line square to the
threat's, the way nearest how the club lies.

**`GUARD_COVER` is `out` 0.3 m and `seconds` 0.15 s**, from [Reach](#reach).

### Reach

`node research/core-guard-reach.mjs@bca8fc87 --covers '<covers>'`, `--model workshop-rogue` for the
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

A threat (`THREAT`, `src/core/perception/threat.ts`) is a foe's striking point (its knuckles, or the
swell of the club it holds) within `within` m of a body's head and closing on it at over
`closing` m/s; the one closing fastest is what a covering hand is told to cover against.

**`THREAT` is within 1.5 m, closing at over 2 m/s**: of the [threat sweep](#threat-sweep) it
costs the least (falls 0.37 to 0.39, wins 0.47); within 2 m reads the same to the band of 512
pairs, and nothing read there earns a change.

### How late a cover is

`node research/core-guard-late.mjs@bca8fc87`, and with `--threat '{"within":2.5,"closing":-100}'`: arena
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

`node research/core-guard.mjs@bca8fc87 --bouts 32 --from 1000 --held club --variants '<threats>'`, saved in
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

`node research/core-guard.mjs@bca8fc87 --bouts 32`: arena bouts (`research/bout.mjs`), clubs and bare
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
- **Fighters go on in the pose** (the cover behaviour's `guard: "pose"`, `FIGHTING`); covering
  is a config's (`guard: "cover"`). Why it does not save the head:
  [How late a cover is](#how-late-a-cover-is).

### Covering, searched

The same command on the searched repertoire's tree: the first set's 32 gaps, cells and
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

## Steered

The record behind `skeleton-limbs-clear` (`src/core/sources.ts`). The searched strike
(`src/core/skills/strike.ts@bca8fc87`) turned its stance's heading after a target that moved
across it once its blow was committed (`STEER`, up to 0.3 rad). With the skeleton's thighs and
upper arms built clear of each other its pelvis turns under the chamber: turned, its club blow at a
head keeps 0.98 to 1.04 of what it does at its place with the target 6 or 12 cm across, where
unturned it keeps 0.05 to 0.68 (`node research/strike-robustness.mjs@bca8fc87 --seen --offsets
0.06,0.12 --hz 120`, four throws a cell). Searched again with its limbs clear, each of its cells
nets as much or more (the club at a head 0.735 HP where 0.660, at a trunk 1.112 where 1.075), and
in 63 bouts each (`node research/strike-bouts.mjs@bca8fc87 --gaps 2.5,3,3.5,4,4.5,5,5.5 --held
club,empty`) its club does 10.47 HP in 36 throws where 8.87 in 50, and is down after none where
four.
