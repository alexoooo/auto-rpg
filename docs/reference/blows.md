# Blows

What a blow does, measured: the lab's targets (`src/lab/targets.ts`), and the table every change
to the blow rule or the strike skill is read against.

## Targets

A target is a place in the air; its body is a dummy (`dummySpec`): one ball, the attacker's
head's mass and its head capsule's radius, named `head`, with the attacker's hit points in it.
The Warrior's is 5.48 kg and 9.1 cm in radius, the Rogue's 3.85 kg and 7.2 cm. It is read by
`watchBlows` (`src/core/rules/blows.ts`), the rule a fight wounds by, on a side of its own.

**How it is held** (`hangDummy`). By a force equal to its weight through each step and nothing
else, so it stays where it hangs and gives way to a blow as a head on no neck does. A fist of
1 kg (one ball, `tests/lab-targets.test.mjs`) sent level at 6 m/s into a dummy hung 10 s before,
under gravity, read by `watchBlows` (Node, Rapier, 120 Hz; the Rogue's by the same fixture on its
dummy):

| The dummy is of | drift in 10 s, mm | closing, m/s | masses met, kg | energy, J | the fist after, m/s | the dummy after, m/s |
|---|---|---|---|---|---|---|
| the Warrior | 0 | 5.99 | 1.00, 5.48 | 15.1 | 0.93 | 0.92 |
| the Rogue | 0 | 5.99 | 1.00, 3.85 | 14.2 | 1.24 | 1.24 |

The fist's 6 N s is in the two of them after. A force lasts one step, and a hook added while the
world steps first runs in the next, so the step a dummy is hung in has its force from `hangDummy`
itself: without it a dummy hung from a mind's watch falls for one step and sinks at 0.08 m/s
from then on.

**When it is hung** (`readTarget`). As its strike begins: when the strike skill first holds the
hand's chamber or its pushes. Until then a target is a place and no body, so nothing stands in
the way of the walk to it or of a hand coming up into its guard. It is hung only where its place
is clear of every shape of the body by `TARGET_CLEAR` ([lab.md](lab.md#targets)), or as soon
after as it is, up to the end of the strike's pushes: a dummy made in the middle of the
Warrior's chest is thrown out of it by the solver and the body falls, in each of three places
tried (0, 5 and 15 cm ahead of the chest's middle; Node core stand, Rapier, 120 Hz). A target
whose place the body fills to the end of the pushes has no dummy, and its reading says so
(`hung`).

**What is read** (`TargetReading`). The blow that took the most from the dummy: any part of the
attacker that touches it closing has met it in a blow, and an arm that brushes it on the fist's
way is not the one its strike is read by. With it, the nearest any shape of the
hand's body came to the dummy's surface from the strike's beginning to `TARGET_WATCH` after its
pushes end (`SegmentBody.gapTo`: a fist, a club or anything else the hand's body is made of);
and the strike thrown, with its fist's peak speed and where the head stood from the recipe's
place. The Warrior's club, placed at a target 1.3 m under the head's height, passes 0.53 m off
(`tests/lab-targets.test.mjs`). A body that goes down closes the reading as it stands
(`fell`).

## Baseline

`node research/core-targets.mjs --each`: the Routine's ten targets of seeds 1, 2 and 3
(`drawTargets`: the control, then high, middle and low in turn), each target on a run of its own,
the walk out to it included. With a hand empty the hands strike in turn; with the club in the
right hand that hand strikes at every target. Node core stand, Rapier, 120 Hz, no assist, the
arena's rules with a hit point at 138.26 J (the same [at 100 J](#at-100-j)). No run fell, and
no target went unhung or unread. Read at `b72e4ebe`, where a blow was a hand's landing, with
what it holds, and what it landed on took the whole of it; the rows the rule's two sides change
are in [the table after](#shared).

| Body | Held | Stratum | Targets | Hit | Damage, HP: mean | least | Missed by, cm: mean |
|---|---|---|---|---|---|---|---|
| Warrior | empty | control | 3 | 3 | 0.055 | 0.055 | - |
| Warrior | empty | high | 9 | 5 | 0.067 | 0.020 | 1.8 |
| Warrior | empty | middle | 9 | 4 | 0.016 | 0.008 | 3.8 |
| Warrior | empty | low | 9 | 0 | - | - | 23.9 |
| Warrior | club | control | 3 | 3 | 0.724 | 0.724 | - |
| Warrior | club | high | 9 | 9 | 0.598 | 0.004 | - |
| Warrior | club | middle | 9 | 5 | 0.102 | 0.028 | 1.1 |
| Warrior | club | low | 9 | 0 | - | - | 13.6 |
| Rogue | empty | control | 3 | 3 | 0.043 | 0.043 | - |
| Rogue | empty | high | 9 | 9 | 0.021 | 0.001 | - |
| Rogue | empty | middle | 9 | 0 | - | - | 5.5 |
| Rogue | empty | low | 9 | 0 | - | - | 23.1 |
| Rogue | club | control | 3 | 0 | - | - | 68.5 |
| Rogue | club | high | 9 | 0 | - | - | 61.0 |
| Rogue | club | middle | 9 | 0 | - | - | 62.8 |
| Rogue | club | low | 9 | 1 | 0.016 | 0.016 | 94.7 |
| Skeleton | empty | control | 3 | 0 | - | - | 18.3 |
| Skeleton | empty | high | 9 | 0 | - | - | 12.8 |
| Skeleton | empty | middle | 9 | 4 | 0.005 | 0.001 | 2.9 |
| Skeleton | empty | low | 9 | 1 | 0.007 | 0.007 | 16.2 |
| Skeleton | club | control | 3 | 0 | - | - | 28.4 |
| Skeleton | club | high | 9 | 0 | - | - | 23.8 |
| Skeleton | club | middle | 9 | 0 | - | - | 22.9 |
| Skeleton | club | low | 9 | 0 | - | - | 21.6 |

The control is one target, the same in every seed: its three are one reading three times. The
other rows are 27 targets a body and thing held, 9 a stratum: counts, and no rates.

What it says of the strike skill as it was there, which read a target's place across the ground
and not its height:

- **A fist lands where its recipe was searched to land and near it.** The Warrior's and the
  Rogue's strike the control, at 7.5 J and 6.0 J; nothing low is struck by a fist of either. The
  Rogue's high targets are all touched, at half the control's damage in the mean.
- **The club's swing comes down through the middle.** The Warrior's strikes every high target
  and 5 of 9 in the middle, the control at 100.1 J and 17.3 m/s of closing.
- **A recipe searched on another body misses on this one.** The Rogue and the skeleton have no
  club blow of their own and throw the Warrior's: the Rogue's passes 0.6 to 0.9 m off, the
  skeleton's 0.2 to 0.3 m. The skeleton's fist, the Warrior's too, passes the control by 18 cm.

### Shared

The same command where a blow has no striker and its two surfaces share it
([wounds.md](wounds.md#shares)), each target read by the blow that took the most from it. The
club's twelve rows are the first table's to the digit: a club is rigid and takes none of its
blow. The empty hands':

| Body | Stratum | Targets | Hit: a hand's blow, whole | any touch, shared | Damage, HP: mean, whole | shared | least, whole | shared |
|---|---|---|---|---|---|---|---|---|
| Warrior | control | 3 | 3 | 3 | 0.055 | 0.021 | 0.055 | 0.021 |
| Warrior | high | 9 | 5 | 9 | 0.067 | 0.023 | 0.020 | 0.008 |
| Warrior | middle | 9 | 4 | 6 | 0.016 | 0.010 | 0.008 | 0.003 |
| Warrior | low | 9 | 0 | 0 | - | - | - | - |
| Rogue | control | 3 | 3 | 3 | 0.043 | 0.016 | 0.043 | 0.016 |
| Rogue | high | 9 | 9 | 9 | 0.021 | 0.010 | 0.001 | 0.002 |
| Rogue | middle | 9 | 0 | 7 | - | 0.002 | - | 0.000 |
| Rogue | low | 9 | 0 | 0 | - | - | - | - |
| Skeleton | control | 3 | 0 | 0 | - | - | - | - |
| Skeleton | high | 9 | 0 | 0 | - | - | - | - |
| Skeleton | middle | 9 | 4 | 4 | 0.005 | 0.002 | 0.001 | 0.001 |
| Skeleton | low | 9 | 1 | 1 | 0.007 | 0.003 | 0.007 | 0.003 |

- **A fist does a head 0.38 of what it did.** The blow's energy is the same, 7.5 J at the
  Warrior's control; the head takes its share by compliance and the hand the rest, 0.62.
- **A forearm or an upper arm that reaches a target is a blow.** The Warrior's high targets are
  all struck where five were, and the Rogue's middle ones seven of nine where none were: the
  fist passes them and the arm behind it does not. Those blows are slight, 0.002 HP in the
  Rogue's mean.
- No missed target is nearer or farther: the strikes are the same strikes.

### At 100 J

The same command at 100 J a hit point ([wounds.md](wounds.md#unit)), where the two tables above
are at 138.26 J: the same strikes and the same blows, each worth 1.38 times the hit points. It
is the table [the placed blow](#the-battery-placed) is read against.

| Body | Held | Stratum | Targets | Hit | Damage, HP: mean | least | Missed by, cm: mean |
|---|---|---|---|---|---|---|---|
| Warrior | empty | control | 3 | 3 | 0.029 | 0.029 | - |
| Warrior | empty | high | 9 | 9 | 0.032 | 0.011 | - |
| Warrior | empty | middle | 9 | 6 | 0.014 | 0.004 | 4.8 |
| Warrior | empty | low | 9 | 0 | - | - | 23.9 |
| Warrior | club | control | 3 | 3 | 1.001 | 1.001 | - |
| Warrior | club | high | 9 | 9 | 0.827 | 0.006 | - |
| Warrior | club | middle | 9 | 5 | 0.140 | 0.039 | 1.1 |
| Warrior | club | low | 9 | 0 | - | - | 13.6 |
| Rogue | empty | control | 3 | 3 | 0.023 | 0.023 | - |
| Rogue | empty | high | 9 | 9 | 0.013 | 0.003 | - |
| Rogue | empty | middle | 9 | 7 | 0.003 | 0.000 | 5.5 |
| Rogue | empty | low | 9 | 0 | - | - | 23.1 |
| Rogue | club | control | 3 | 0 | - | - | 68.5 |
| Rogue | club | high | 9 | 0 | - | - | 61.0 |
| Rogue | club | middle | 9 | 0 | - | - | 62.8 |
| Rogue | club | low | 9 | 1 | 0.022 | 0.022 | 94.7 |
| Skeleton | empty | control | 3 | 0 | - | - | 18.3 |
| Skeleton | empty | high | 9 | 0 | - | - | 12.8 |
| Skeleton | empty | middle | 9 | 4 | 0.002 | 0.001 | 2.9 |
| Skeleton | empty | low | 9 | 1 | 0.004 | 0.004 | 16.2 |
| Skeleton | club | control | 3 | 0 | - | - | 28.4 |
| Skeleton | club | high | 9 | 0 | - | - | 23.8 |
| Skeleton | club | middle | 9 | 0 | - | - | 22.9 |
| Skeleton | club | low | 9 | 0 | - | - | 21.6 |

The Warrior's club at the control, 100.1 J, is one hit point.

### A loop of ten

`node research/core-targets.mjs --list`: the same targets, the ten of a seed struck at in turn
on one run, as the page runs them. Same harness. A body that falls lies where it fell, and the
targets after are unread.

| Body | Held | Runs that looped, of 3 | Targets read, of 30 | Hit by a hand's blow | by any touch | Where the others fell |
|---|---|---|---|---|---|---|
| Warrior | empty | 2 | 23 | 8 | 13 | closing on its third target, its second blow landed |
| Warrior | club | 1 | 24 | 9 | 9 | closing on its fifth target; setting its feet for its ninth |
| Rogue | empty | 3 | 30 | 14 | 21 | - |
| Rogue | club | 0 | 13 | 0 | 0 | setting its feet for its fourth or fifth target |
| Skeleton | empty | 0 | 8 | 0 | 0 | at its second target, or closing on its third |
| Skeleton | club | 0 | 6 | 0 | 0 | setting its feet for its second target |

The runs are the same runs under both rules, to the second each fell or looped at: a dummy's
wound moves nothing. What differs is which touches are blows ([Shared](#shared)).

- **The borrowed strikes put their bodies down whether or not they land.** The Rogue with the
  club and the skeleton land nothing here and fall within five targets.
- **The Warrior falls stepping to a target after a blow of its own has landed.** Seed 1, empty
  hands (one run, read once): its left straight lands on the second target at 13.0 J; in the half
  second after, a recovering step sets its left foot about 0.2 m from its right; the third target
  is about 0.2 m to its right, and the strike skill closing on it carries the trunk out over the
  right foot, which does not step. How often, over loops, and against the same strikes thrown at
  targets with no dummy hung: [lab.md](lab.md#routine-gait).

## Placed

A placed blow (`PLACED`, `src/core/skills/strike.ts`) is what a hand throws at a target no recipe
of its own lands at: the point it strikes with (its knuckles, or its club's swell) is carried by
a hand goal along the line from where it is to `through` m beyond the target, in `seconds`, the
body standing with the target `stretch` of the arm's straight length from the shoulder. The
heights a recipe lands at are its window's
([human-and-strikes.md](human-and-strikes.md#window-height)).

### Sweep

`node research/core-placed.mjs --workers 26`: the battery of [At 100 J](#at-100-j) (three
bodies, the Routine's ten targets of seeds 1, 2 and 3, each on a run of its own; Node core
stand, Rapier, 120 Hz, no assist, the arena's rules) at each stretch, time and distance through,
given to the skills in place of `PLACED`. A cell reads its placed blows alone: 73 of the 90
targets with the hands empty and 32 of the 90 with the club, whose recipe's window holds every
high target and all but 5 of the middle ones. Damage a blow is over every placed blow, a miss
being none; a hit's is over the hits. Crowded is a target whose place the body filled to the end
of its blow, so that no dummy was hung.

| Held | Stretch | Seconds | Through, m | Placed | Hit | of the high | middle | low | Damage, HP: a blow | a hit | Closing, m/s | Missed by, cm | Crowded | Fell | Unread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| empty | 0.8 | 0.25 | 0.1 | 73 | 30 | 8 of 19 | 22 of 27 | 0 of 27 | 0.0020 | 0.0048 | 2.99 | 21.8 | 32 | 0 | 0 |
| empty | 0.8 | 0.25 | 0.15 | 73 | 30 | 7 of 19 | 23 of 27 | 0 of 27 | 0.0021 | 0.0050 | 3.11 | 24.3 | 33 | 0 | 0 |
| empty | 0.8 | 0.25 | 0.25 | 73 | 31 | 8 of 19 | 22 of 27 | 1 of 27 | 0.0041 | 0.0097 | 3.73 | 23.0 | 29 | 0 | 0 |
| empty | 0.8 | 0.4 | 0.1 | 73 | 33 | 9 of 19 | 23 of 27 | 1 of 27 | 0.0008 | 0.0018 | 2.12 | 26.2 | 33 | 0 | 0 |
| empty | 0.8 | 0.4 | 0.15 | 73 | 32 | 8 of 19 | 23 of 27 | 1 of 27 | 0.0013 | 0.0029 | 2.31 | 25.7 | 34 | 0 | 0 |
| empty | 0.8 | 0.4 | 0.25 | 73 | 35 | 12 of 19 | 23 of 27 | 0 of 27 | 0.0016 | 0.0034 | 2.48 | 23.9 | 31 | 0 | 0 |
| empty | 0.8 | 0.6 | 0.1 | 73 | 36 | 9 of 19 | 23 of 27 | 4 of 27 | 0.0003 | 0.0006 | 1.37 | 26.2 | 31 | 0 | 0 |
| empty | 0.8 | 0.6 | 0.15 | 73 | 34 | 9 of 19 | 23 of 27 | 2 of 27 | 0.0004 | 0.0008 | 1.54 | 29.0 | 33 | 0 | 0 |
| empty | 0.8 | 0.6 | 0.25 | 73 | 37 | 12 of 19 | 23 of 27 | 2 of 27 | 0.0006 | 0.0013 | 1.74 | 19.9 | 27 | 0 | 0 |
| empty | 0.9 | 0.25 | 0.1 | 73 | 42 | 17 of 19 | 25 of 27 | 0 of 27 | 0.0028 | 0.0049 | 3.04 | 19.9 | 19 | 0 | 0 |
| empty | 0.9 | 0.25 | 0.15 | 73 | 42 | 17 of 19 | 25 of 27 | 0 of 27 | 0.0036 | 0.0062 | 3.21 | 22.7 | 20 | 0 | 0 |
| empty | 0.9 | 0.25 | 0.25 | 73 | 41 | 17 of 19 | 23 of 27 | 1 of 27 | 0.0033 | 0.0058 | 3.53 | 22.9 | 18 | 0 | 0 |
| empty | 0.9 | 0.4 | 0.1 | 73 | 46 | 19 of 19 | 25 of 27 | 2 of 27 | 0.0010 | 0.0016 | 1.91 | 26.2 | 20 | 0 | 0 |
| empty | 0.9 | 0.4 | 0.15 | 73 | 45 | 18 of 19 | 25 of 27 | 2 of 27 | 0.0015 | 0.0025 | 2.28 | 25.8 | 21 | 0 | 0 |
| empty | 0.9 | 0.4 | 0.25 | 73 | 44 | 18 of 19 | 25 of 27 | 1 of 27 | 0.0018 | 0.0030 | 2.49 | 21.5 | 21 | 0 | 0 |
| empty | 0.9 | 0.6 | 0.1 | 73 | 49 | 19 of 19 | 25 of 27 | 5 of 27 | 0.0005 | 0.0007 | 1.34 | 26.2 | 18 | 0 | 0 |
| empty | 0.9 | 0.6 | 0.15 | 73 | 47 | 19 of 19 | 25 of 27 | 3 of 27 | 0.0007 | 0.0012 | 1.56 | 29.0 | 20 | 0 | 0 |
| empty | 0.9 | 0.6 | 0.25 | 73 | 46 | 18 of 19 | 25 of 27 | 3 of 27 | 0.0008 | 0.0013 | 1.71 | 19.9 | 18 | 0 | 0 |
| empty | 1 | 0.25 | 0.1 | 73 | 43 | 15 of 19 | 25 of 27 | 3 of 27 | 0.0026 | 0.0044 | 3.53 | 16.6 | 14 | 0 | 0 |
| empty | 1 | 0.25 | 0.15 | 73 | 43 | 15 of 19 | 25 of 27 | 3 of 27 | 0.0030 | 0.0052 | 3.89 | 17.9 | 15 | 0 | 0 |
| empty | 1 | 0.25 | 0.25 | 73 | 41 | 15 of 19 | 23 of 27 | 3 of 27 | 0.0030 | 0.0054 | 4.14 | 17.8 | 13 | 0 | 0 |
| empty | 1 | 0.4 | 0.1 | 73 | 49 | 18 of 19 | 27 of 27 | 4 of 27 | 0.0013 | 0.0020 | 2.22 | 20.7 | 15 | 0 | 0 |
| empty | 1 | 0.4 | 0.15 | 73 | 47 | 17 of 19 | 27 of 27 | 3 of 27 | 0.0015 | 0.0024 | 2.46 | 20.2 | 16 | 0 | 0 |
| empty | 1 | 0.4 | 0.25 | 73 | 48 | 17 of 19 | 27 of 27 | 4 of 27 | 0.0019 | 0.0028 | 2.68 | 19.0 | 16 | 0 | 0 |
| empty | 1 | 0.6 | 0.1 | 73 | 54 | 19 of 19 | 27 of 27 | 8 of 27 | 0.0007 | 0.0010 | 1.43 | 26.2 | 13 | 0 | 0 |
| empty | 1 | 0.6 | 0.15 | 73 | 52 | 19 of 19 | 27 of 27 | 6 of 27 | 0.0010 | 0.0014 | 1.62 | 29.0 | 15 | 0 | 0 |
| empty | 1 | 0.6 | 0.25 | 73 | 52 | 19 of 19 | 27 of 27 | 6 of 27 | 0.0011 | 0.0016 | 1.87 | 22.2 | 13 | 0 | 0 |
| empty | 1.1 | 0.25 | 0.1 | 73 | 43 | 14 of 19 | 26 of 27 | 3 of 27 | 0.0034 | 0.0058 | 3.92 | 17.9 | 13 | 0 | 0 |
| empty | 1.1 | 0.25 | 0.15 | 73 | 41 | 15 of 19 | 22 of 27 | 4 of 27 | 0.0034 | 0.0060 | 3.98 | 16.7 | 13 | 0 | 0 |
| empty | 1.1 | 0.25 | 0.25 | 73 | 36 | 12 of 19 | 20 of 27 | 4 of 27 | 0.0036 | 0.0073 | 4.29 | 16.7 | 11 | 0 | 0 |
| empty | 1.1 | 0.4 | 0.1 | 73 | 47 | 17 of 19 | 25 of 27 | 5 of 27 | 0.0013 | 0.0020 | 2.18 | 15.2 | 12 | 0 | 0 |
| empty | 1.1 | 0.4 | 0.15 | 73 | 46 | 15 of 19 | 26 of 27 | 5 of 27 | 0.0015 | 0.0023 | 2.41 | 15.6 | 14 | 0 | 0 |
| empty | 1.1 | 0.4 | 0.25 | 73 | 49 | 18 of 19 | 26 of 27 | 5 of 27 | 0.0018 | 0.0027 | 2.51 | 17.4 | 14 | 0 | 0 |
| empty | 1.1 | 0.6 | 0.1 | 73 | 51 | 19 of 19 | 25 of 27 | 7 of 27 | 0.0010 | 0.0014 | 1.61 | 15.6 | 11 | 0 | 0 |
| empty | 1.1 | 0.6 | 0.15 | 73 | 47 | 19 of 19 | 24 of 27 | 4 of 27 | 0.0007 | 0.0011 | 1.68 | 14.5 | 13 | 0 | 0 |
| empty | 1.1 | 0.6 | 0.25 | 73 | 50 | 18 of 19 | 27 of 27 | 5 of 27 | 0.0010 | 0.0015 | 1.95 | 14.5 | 10 | 0 | 0 |

| Held | Stretch | Seconds | Through, m | Placed | Hit | of the high | middle | low | Damage, HP: a blow | a hit | Closing, m/s | Missed by, cm | Crowded | Fell | Unread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | 0.8 | 0.25 | 0.1 | 32 | 2 | 0 of 0 | 0 of 5 | 2 of 27 | 0.0000 | 0.0001 | 0.11 | 48.7 | 4 | 0 | 1 |
| club | 0.8 | 0.25 | 0.15 | 32 | 3 | 0 of 0 | 0 of 5 | 3 of 27 | 0.0000 | 0.0001 | 0.12 | 49.0 | 3 | 0 | 1 |
| club | 0.8 | 0.25 | 0.25 | 32 | 2 | 0 of 0 | 0 of 5 | 2 of 27 | 0.0000 | 0.0002 | 0.15 | 48.8 | 3 | 0 | 1 |
| club | 0.8 | 0.4 | 0.1 | 32 | 11 | 0 of 0 | 4 of 5 | 7 of 27 | 0.0074 | 0.0216 | 1.57 | 45.2 | 0 | 0 | 1 |
| club | 0.8 | 0.4 | 0.15 | 32 | 10 | 0 of 0 | 3 of 5 | 7 of 27 | 0.0102 | 0.0327 | 1.91 | 39.5 | 0 | 0 | 1 |
| club | 0.8 | 0.4 | 0.25 | 32 | 9 | 0 of 0 | 3 of 5 | 6 of 27 | 0.0051 | 0.0182 | 1.46 | 39.9 | 2 | 0 | 1 |
| club | 0.8 | 0.6 | 0.1 | 32 | 10 | 0 of 0 | 4 of 5 | 6 of 27 | 0.0053 | 0.0171 | 1.70 | 35.4 | 3 | 0 | 1 |
| club | 0.8 | 0.6 | 0.15 | 32 | 12 | 0 of 0 | 4 of 5 | 8 of 27 | 0.0065 | 0.0173 | 1.57 | 30.3 | 0 | 0 | 1 |
| club | 0.8 | 0.6 | 0.25 | 32 | 15 | 0 of 0 | 4 of 5 | 11 of 27 | 0.0071 | 0.0152 | 1.26 | 31.3 | 0 | 0 | 1 |
| club | 0.9 | 0.25 | 0.1 | 32 | 0 | 0 of 0 | 0 of 5 | 0 of 27 | 0.0000 | - | - | 51.9 | 0 | 0 | 0 |
| club | 0.9 | 0.25 | 0.15 | 32 | 0 | 0 of 0 | 0 of 5 | 0 of 27 | 0.0000 | - | - | 50.6 | 0 | 0 | 0 |
| club | 0.9 | 0.25 | 0.25 | 32 | 0 | 0 of 0 | 0 of 5 | 0 of 27 | 0.0000 | - | - | 49.0 | 0 | 0 | 0 |
| club | 0.9 | 0.4 | 0.1 | 32 | 4 | 0 of 0 | 3 of 5 | 1 of 27 | 0.0078 | 0.0625 | 4.19 | 42.7 | 0 | 0 | 0 |
| club | 0.9 | 0.4 | 0.15 | 32 | 6 | 0 of 0 | 4 of 5 | 2 of 27 | 0.0083 | 0.0444 | 3.19 | 43.7 | 0 | 0 | 0 |
| club | 0.9 | 0.4 | 0.25 | 32 | 7 | 0 of 0 | 4 of 5 | 3 of 27 | 0.0117 | 0.0534 | 3.26 | 48.5 | 0 | 0 | 0 |
| club | 0.9 | 0.6 | 0.1 | 32 | 9 | 0 of 0 | 3 of 5 | 6 of 27 | 0.0051 | 0.0180 | 1.97 | 32.6 | 0 | 0 | 0 |
| club | 0.9 | 0.6 | 0.15 | 32 | 9 | 0 of 0 | 4 of 5 | 5 of 27 | 0.0100 | 0.0354 | 2.82 | 35.0 | 0 | 0 | 0 |
| club | 0.9 | 0.6 | 0.25 | 32 | 9 | 0 of 0 | 4 of 5 | 5 of 27 | 0.0088 | 0.0313 | 2.54 | 31.9 | 0 | 0 | 0 |
| club | 1 | 0.25 | 0.1 | 32 | 1 | 0 of 0 | 0 of 5 | 1 of 27 | 0.0001 | 0.0047 | 1.25 | 55.7 | 0 | 0 | 0 |
| club | 1 | 0.25 | 0.15 | 32 | 0 | 0 of 0 | 0 of 5 | 0 of 27 | 0.0000 | - | - | 55.2 | 0 | 0 | 0 |
| club | 1 | 0.25 | 0.25 | 32 | 3 | 0 of 0 | 1 of 5 | 2 of 27 | 0.0044 | 0.0467 | 3.60 | 58.5 | 0 | 0 | 0 |
| club | 1 | 0.4 | 0.1 | 32 | 7 | 0 of 0 | 3 of 5 | 4 of 27 | 0.0103 | 0.0473 | 3.63 | 48.4 | 0 | 0 | 0 |
| club | 1 | 0.4 | 0.15 | 32 | 8 | 0 of 0 | 4 of 5 | 4 of 27 | 0.0101 | 0.0405 | 2.95 | 47.3 | 0 | 0 | 0 |
| club | 1 | 0.4 | 0.25 | 32 | 4 | 0 of 0 | 3 of 5 | 1 of 27 | 0.0063 | 0.0502 | 3.61 | 42.9 | 0 | 0 | 0 |
| club | 1 | 0.6 | 0.1 | 32 | 11 | 0 of 0 | 4 of 5 | 7 of 27 | 0.0063 | 0.0184 | 2.20 | 46.8 | 0 | 0 | 0 |
| club | 1 | 0.6 | 0.15 | 32 | 9 | 0 of 0 | 4 of 5 | 5 of 27 | 0.0082 | 0.0290 | 2.68 | 33.7 | 0 | 0 | 0 |
| club | 1 | 0.6 | 0.25 | 32 | 10 | 0 of 0 | 3 of 5 | 7 of 27 | 0.0104 | 0.0332 | 2.70 | 37.4 | 0 | 0 | 0 |
| club | 1.1 | 0.25 | 0.1 | 32 | 0 | 0 of 0 | 0 of 5 | 0 of 27 | 0.0000 | - | - | 55.0 | 0 | 0 | 0 |
| club | 1.1 | 0.25 | 0.15 | 32 | 0 | 0 of 0 | 0 of 5 | 0 of 27 | 0.0000 | - | - | 53.7 | 0 | 0 | 0 |
| club | 1.1 | 0.25 | 0.25 | 32 | 0 | 0 of 0 | 0 of 5 | 0 of 27 | 0.0000 | - | - | 52.9 | 0 | 0 | 0 |
| club | 1.1 | 0.4 | 0.1 | 32 | 8 | 0 of 0 | 4 of 5 | 4 of 27 | 0.0149 | 0.0596 | 3.57 | 50.3 | 0 | 0 | 0 |
| club | 1.1 | 0.4 | 0.15 | 32 | 5 | 0 of 0 | 3 of 5 | 2 of 27 | 0.0125 | 0.0799 | 4.06 | 46.8 | 0 | 0 | 0 |
| club | 1.1 | 0.4 | 0.25 | 32 | 5 | 0 of 0 | 3 of 5 | 2 of 27 | 0.0054 | 0.0347 | 3.07 | 47.6 | 0 | 0 | 0 |
| club | 1.1 | 0.6 | 0.1 | 32 | 10 | 0 of 0 | 3 of 5 | 7 of 27 | 0.0089 | 0.0286 | 2.77 | 42.6 | 0 | 0 | 0 |
| club | 1.1 | 0.6 | 0.15 | 32 | 11 | 0 of 0 | 3 of 5 | 8 of 27 | 0.0123 | 0.0358 | 2.97 | 41.3 | 0 | 0 | 0 |
| club | 1.1 | 0.6 | 0.25 | 32 | 9 | 0 of 0 | 3 of 5 | 6 of 27 | 0.0155 | 0.0550 | 3.76 | 38.0 | 0 | 0 | 0 |

One battery a cell: counts, and no rates, and two or three hits between cells are not a
difference.

- **Stretch.** At 0.8 of the arm the body stands in its target's place: 27 to 34 of the fists'
  73 targets are crowded, 18 to 21 at 0.9, 13 to 16 at 1 and 10 to 14 at 1.1. The fists hit 30
  to 37 at 0.8, 41 to 49 at 0.9, 41 to 54 at 1 and 36 to 51 at 1.1; every middle target is hit
  in six of the nine cells at 1, and in one of the nine at 1.1.
- **Seconds.** The fists at stretch 1: in 0.25 s 41 to 43 hit, closing at 3.5 to 4.1 m/s for
  0.004 to 0.005 HP a hit; in 0.4 s 47 to 49, at 2.2 to 2.7 m/s for 0.002 to 0.003; in 0.6 s
  52 to 54, at 1.4 to 1.9 m/s for 0.001 to 0.002. A shorter time is a harder blow that lands
  less often. The club's swell does not follow a path of 0.25 s: 0 to 3 of 32 hit at any
  stretch. At stretch 1 it hits 4 to 8 in 0.4 s, for 0.04 to 0.05 HP a hit, and 9 to 11 in
  0.6 s, for 0.02 to 0.03.
- **Through.** The fists close faster the further the path runs on, at 2.22, 2.46 and 2.68 m/s
  at stretch 1 and 0.4 s, and hit as often. The club's cells do not order by it.

`PLACED` is stretch 1, 0.4 s and 0.15 m through. The stretch is the table's: at 1 the fists hit
every middle target, and the places crowded are half those at 0.8. The time is a choice the
table does not make: 0.4 s is the shortest the club follows, and lies between the fists' most
hits and their hardest. The distance through is the middle of three that read alike. One
setting serves a fist and a club; one for each was not tried.

### Against a recipe

`node research/core-placed-versus.mjs`: one body standing as built, its right hand's blow at a
target 1.3 m ahead and so far over its standing head, thrown both ways: with the hand's recipe
whatever the height, and placed. The fourth column is which of the two the skill itself throws
there, by the recipe's window. Node core stand, Rapier, 120 Hz, no assist, the arena's rules;
one throw a cell.

| Body | Held | Up, cm | The skill throws | Recipe: HP | J | m/s | by | nearest, cm | Placed: HP | J | m/s | by | nearest, cm |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty | 20 | placed | 0.000 | 0.0 | - | - | 1.8 | 0.003 | 0.9 | 2.34 | hand.right | 0.0 |
| Warrior | empty | 14 | placed | 0.010 | 2.7 | 6.38 | hand.right | 0.0 | 0.002 | 0.6 | 2.12 | hand.right | 0.0 |
| Warrior | empty | 10 | recipe | 0.019 | 5.2 | 7.55 | hand.right | 0.0 | 0.003 | 0.8 | 1.93 | hand.right | 0.0 |
| Warrior | empty | 6 | recipe | 0.028 | 7.4 | 7.90 | hand.right | 0.0 | 0.003 | 0.8 | 1.88 | hand.right | 0.0 |
| Warrior | empty | 0 | recipe | 0.033 | 8.8 | 7.06 | hand.right | 0.0 | 0.003 | 0.7 | 1.77 | hand.right | 0.0 |
| Warrior | empty | -4 | placed | 0.041 | 10.9 | 7.07 | hand.right | 0.0 | 0.003 | 0.7 | 1.69 | hand.right | 0.0 |
| Warrior | empty | -8 | placed | 0.039 | 10.2 | 6.30 | hand.right | 0.0 | 0.002 | 0.5 | 1.81 | hand.right | 0.0 |
| Warrior | empty | -14 | placed | 0.034 | 6.1 | 3.61 | forearm.right | 0.2 | 0.002 | 0.4 | 1.90 | hand.right | 0.0 |
| Warrior | empty | -20 | placed | 0.009 | 1.6 | 1.98 | forearm.right | 2.8 | 0.001 | 0.4 | 1.96 | hand.right | 0.0 |
| Warrior | empty | -30 | placed | 0.000 | 0.0 | - | - | 5.5 | 0.002 | 0.4 | 2.32 | hand.right | 0.0 |
| Warrior | empty | -50 | placed | 0.016 | 2.9 | 2.58 | forearm.right | 0.1 | 0.002 | 0.6 | 2.85 | hand.right | 0.0 |
| Warrior | empty | -80 | placed | 0.000 | 0.0 | - | - | 5.2 | 0.000 | 0.0 | - | crowded | 0.0 |
| Warrior | club | 20 | recipe | 0.666 | 66.6 | 13.92 | wooden club | 0.0 | 0.085 | 8.5 | 5.17 | wooden club | 0.0 |
| Warrior | club | 14 | recipe | 0.971 | 97.1 | 18.03 | wooden club | 0.2 | 0.097 | 9.7 | 5.49 | wooden club | 0.0 |
| Warrior | club | 10 | recipe | 0.000 | 0.0 | - | - | 0.0 | 0.108 | 10.8 | 5.77 | wooden club | 0.0 |
| Warrior | club | 6 | recipe | 1.052 | 105.2 | 17.90 | wooden club | 0.0 | 0.114 | 11.4 | 5.91 | wooden club | 0.0 |
| Warrior | club | 0 | recipe | 1.129 | 112.9 | 17.54 | wooden club | 0.0 | 0.122 | 12.2 | 6.07 | wooden club | 0.0 |
| Warrior | club | -4 | recipe | 1.127 | 112.7 | 16.87 | wooden club | 0.0 | 0.128 | 12.8 | 6.18 | wooden club | 0.0 |
| Warrior | club | -8 | recipe | 1.102 | 110.2 | 16.15 | wooden club | 0.0 | 0.132 | 13.2 | 6.25 | wooden club | 0.0 |
| Warrior | club | -14 | recipe | 0.902 | 90.2 | 14.19 | wooden club | 0.0 | 0.137 | 13.7 | 6.35 | wooden club | 0.0 |
| Warrior | club | -20 | recipe | 0.990 | 99.0 | 14.43 | wooden club | 0.0 | 0.121 | 12.1 | 5.80 | wooden club | 0.0 |
| Warrior | club | -30 | recipe | 0.587 | 58.7 | 10.10 | wooden club | 0.0 | 0.110 | 11.0 | 5.50 | wooden club | 0.0 |
| Warrior | club | -50 | recipe | 0.111 | 11.1 | 5.59 | wooden club | 0.0 | 0.133 | 13.3 | 5.98 | wooden club | 0.0 |
| Warrior | club | -80 | placed | 0.000 | 0.0 | - | - | 3.9 | 0.017 | 1.7 | 1.89 | wooden club | 0.3 |
| Rogue | empty | 20 | placed | 0.001 | 0.4 | 2.12 | hand.right | 0.0 | 0.002 | 0.6 | 2.56 | hand.right | 0.0 |
| Rogue | empty | 14 | placed | 0.005 | 1.4 | 6.73 | hand.right | 0.0 | 0.002 | 0.4 | 2.30 | hand.right | 0.0 |
| Rogue | empty | 10 | placed | 0.011 | 2.9 | 7.73 | hand.right | 0.0 | 0.001 | 0.4 | 2.12 | hand.right | 0.0 |
| Rogue | empty | 6 | recipe | 0.019 | 4.9 | 6.76 | hand.right | 0.0 | 0.001 | 0.2 | 1.98 | hand.right | 0.1 |
| Rogue | empty | 0 | recipe | 0.024 | 6.4 | 5.24 | hand.right | 0.0 | 0.001 | 0.3 | 1.80 | hand.right | 0.0 |
| Rogue | empty | -4 | recipe | 0.023 | 6.0 | 5.04 | hand.right | 0.0 | 0.001 | 0.4 | 1.72 | hand.right | 0.0 |
| Rogue | empty | -8 | placed | 0.010 | 2.6 | 3.07 | hand.right | 0.0 | 0.001 | 0.3 | 1.69 | hand.right | 0.0 |
| Rogue | empty | -14 | placed | 0.004 | 0.8 | 0.90 | forearm.right | 0.0 | 0.001 | 0.3 | 1.65 | hand.right | 0.0 |
| Rogue | empty | -20 | placed | 0.007 | 1.9 | 3.53 | hand.right | 0.0 | 0.001 | 0.2 | 1.72 | hand.right | 0.0 |
| Rogue | empty | -30 | placed | 0.005 | 0.9 | 1.08 | upperArm.right | 0.9 | 0.001 | 0.2 | 1.94 | hand.right | 0.0 |
| Rogue | empty | -50 | placed | 0.001 | 0.1 | 0.46 | forearm.right | 7.9 | 0.001 | 0.2 | 2.38 | hand.right | 0.0 |
| Rogue | empty | -80 | placed | 0.000 | 0.0 | - | - | 13.9 | 0.000 | 0.0 | - | crowded | 3.4 |
| Rogue | club | 20 | recipe | 0.000 | 0.0 | - | - | 50.4 | 0.000 | 0.0 | - | - | 5.4 |
| Rogue | club | 14 | recipe | 0.000 | 0.0 | - | - | 52.2 | 0.048 | 4.8 | 3.80 | wooden club | 0.0 |
| Rogue | club | 10 | recipe | 0.000 | 0.0 | - | - | 53.5 | 0.057 | 5.7 | 3.97 | wooden club | 0.0 |
| Rogue | club | 6 | recipe | 0.000 | 0.0 | - | - | 55.0 | 0.050 | 5.0 | 4.07 | wooden club | 0.0 |
| Rogue | club | 0 | recipe | 0.000 | 0.0 | - | - | 57.4 | 0.078 | 7.8 | 5.19 | wooden club | 0.0 |
| Rogue | club | -4 | recipe | 0.000 | 0.0 | - | - | 59.2 | 0.104 | 10.4 | 5.81 | wooden club | 0.0 |
| Rogue | club | -8 | recipe | 0.000 | 0.0 | - | - | 61.1 | 0.100 | 10.0 | 5.13 | wooden club | 0.0 |
| Rogue | club | -14 | recipe | 0.000 | 0.0 | - | - | 64.3 | 0.050 | 5.0 | 3.34 | wooden club | 0.0 |
| Rogue | club | -20 | recipe | 0.000 | 0.0 | - | - | 64.8 | 0.092 | 9.2 | 5.30 | wooden club | 0.0 |
| Rogue | club | -30 | recipe | 0.000 | 0.0 | - | - | 65.7 | 0.060 | 6.0 | 4.34 | wooden club | 0.0 |
| Rogue | club | -50 | recipe | 0.000 | 0.0 | - | - | 71.4 | 0.050 | 5.0 | 4.04 | wooden club | 0.0 |
| Rogue | club | -80 | placed | 0.000 | 0.0 | - | - | 86.8 | 0.000 | 0.0 | - | - | 16.6 |

- **A placed blow is a tenth of a thrown one.** The Warrior's straight lands 5.2 to 10.9 J from
  8 cm under his head to 10 cm over; placed, his fist lands 0.4 to 0.9 J, at 1.7 to 2.9 m/s,
  from 50 cm under to 20 cm over. His club's swing lands 59 to 113 J from 30 cm under to 20 cm
  over, but for one throw at 10 cm over that read no blow; placed, the swell lands 8.5 to
  13.7 J over those heights and at 50 cm under.
- **A fist's window is narrower than its blow.** The window's reading is the fist's point
  through a sphere of the head's radius with no body at it
  ([human-and-strikes.md](human-and-strikes.md#window-height)), which a point that passes a
  radius off misses. A fist and the forearm behind it have a size: a dummy 4, 8 and 14 cm under
  the Warrior's head takes 10.9, 10.2 and 6.1 J of his straight, and there, under his window,
  the skill places 0.4 to 0.7 J. The Rogue's window, 6 cm under to 8 over, is nearer its
  blow's: 4.9 to 6.4 J from 4 cm under to 6 over, 2.6 and 2.9 J at 8 under and 10 over.
- **A recipe borrowed from another body is thrown where a placed blow would land.** The Rogue
  with the club throws the Warrior's swing at every height its window holds, and it passes 0.5
  to 0.7 m off; placed, the Rogue's swell lands 4.8 to 10.4 J from 50 cm under its head to
  14 cm over.

### The battery, placed

`node research/core-targets.mjs --each` on the tree `PLACED` is in, beside
[At 100 J](#at-100-j): same harness. No run fell and no target went unread. It is the table a
change is read against from here.

| Body | Held | Stratum | Targets | Hit: at 100 J | placed | Damage, HP, mean: at 100 J | placed | least, placed | Missed by, cm, mean: at 100 J | placed | Crowded |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty | control | 3 | 3 | 3 | 0.029 | 0.029 | 0.029 | - | - | 0 |
| Warrior | empty | high | 9 | 9 | 9 | 0.032 | 0.002 | 0.001 | - | - | 0 |
| Warrior | empty | middle | 9 | 6 | 9 | 0.014 | 0.002 | 0.002 | 4.8 | - | 0 |
| Warrior | empty | low | 9 | 0 | 1 | - | 0.002 | 0.002 | 23.9 | 26.6 | 5 |
| Warrior | club | control | 3 | 3 | 3 | 1.001 | 1.001 | 1.001 | - | - | 0 |
| Warrior | club | high | 9 | 9 | 9 | 0.827 | 0.827 | 0.006 | - | - | 0 |
| Warrior | club | middle | 9 | 5 | 8 | 0.140 | 0.108 | 0.007 | 1.1 | 0.0 | 0 |
| Warrior | club | low | 9 | 0 | 3 | - | 0.018 | 0.004 | 13.6 | 32.3 | 0 |
| Rogue | empty | control | 3 | 3 | 3 | 0.023 | 0.023 | 0.023 | - | - | 0 |
| Rogue | empty | high | 9 | 9 | 9 | 0.013 | 0.007 | 0.001 | - | - | 0 |
| Rogue | empty | middle | 9 | 7 | 9 | 0.003 | 0.001 | 0.001 | 5.5 | - | 0 |
| Rogue | empty | low | 9 | 0 | 1 | - | 0.001 | 0.001 | 23.1 | 30.3 | 6 |
| Rogue | club | control | 3 | 0 | 0 | - | - | - | 68.5 | 68.5 | 0 |
| Rogue | club | high | 9 | 0 | 0 | - | - | - | 61.0 | 61.0 | 0 |
| Rogue | club | middle | 9 | 0 | 1 | - | 0.007 | 0.007 | 62.8 | 61.4 | 0 |
| Rogue | club | low | 9 | 1 | 1 | 0.022 | 0.003 | 0.003 | 94.7 | 26.6 | 0 |
| Skeleton | empty | control | 3 | 0 | 0 | - | - | - | 18.3 | 18.3 | 0 |
| Skeleton | empty | high | 9 | 0 | 3 | - | 0.003 | 0.002 | 12.8 | 10.7 | 0 |
| Skeleton | empty | middle | 9 | 4 | 9 | 0.002 | 0.004 | 0.002 | 2.9 | - | 0 |
| Skeleton | empty | low | 9 | 1 | 1 | 0.004 | 0.009 | 0.009 | 16.2 | 20.1 | 5 |
| Skeleton | club | control | 3 | 0 | 0 | - | - | - | 28.4 | 28.4 | 0 |
| Skeleton | club | high | 9 | 0 | 0 | - | - | - | 23.8 | 23.8 | 0 |
| Skeleton | club | middle | 9 | 0 | 0 | - | - | - | 22.9 | 24.9 | 0 |
| Skeleton | club | low | 9 | 0 | 0 | - | - | - | 21.6 | 75.1 | 0 |

Of the 180 targets 105 are placed: with the hands empty the Warrior's 27 of 30 and the Rogue's
and the skeleton's 23 each, and with the club 12 of the Warrior's and 10 each of the others'.

- **Every middle target is struck by a fist**, 27 of 27 where 17 were, and 21 of the 27 high
  ones where 18 were, three of them the skeleton's, which struck none.
- **The blows a straight landed off its height are lighter.** The Warrior's nine high targets
  were all struck by his straight, thrown whatever the height, at 0.032 HP in the mean; they
  lie under its window, and placed they are all struck at 0.002. The Rogue's: 0.013, and 0.007.
- **The low targets are in the body's way.** 16 of the fists' 27 are crowded: the body stands
  no nearer than its toes to a place under its hips, and its own leg fills the place. Three are
  hit. The club's low targets are not crowded, and 4 of 27 are hit.
- **A club is placed badly, and the skeleton's not at all.** Of the 32 placed club blows 8 hit:
  the Warrior's 6 of 12, the Rogue's 2 of 10 and the skeleton's none of 10, which pass 0.5 to
  0.9 m off.

The arm apart from where the body stands (`node research/core-placed-arm.mjs`: the lower trunk
held, the right hand's point given one goal from the guard as the skill gives it, to a place
straight ahead of the shoulder; Node core stand, Rapier, 120 Hz, gravity on):

| Body | Held | Point | Ahead of the head, m | Up from it, m | Away as given, m | In 0.4 s: nearest, cm | m/s | In 2 s: nearest, cm | m/s |
|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty | knuckles | 0.55 | 0 | 0.29 | 1.5 | 2.06 | 0.3 | 0.39 |
| Warrior | empty | knuckles | 0.55 | -0.2 | 0.26 | 0.6 | 1.90 | 0.1 | 0.37 |
| Warrior | empty | knuckles | 0.55 | -0.5 | 0.44 | 1.2 | 2.64 | 0.2 | 0.47 |
| Warrior | empty | knuckles | 0.4 | -0.8 | 0.67 | 11.9 | 2.49 | 9.3 | 0.40 |
| Warrior | club | swell | 0.55 | 0 | 0.66 | 1.0 | 2.97 | 0.1 | 0.57 |
| Warrior | club | swell | 0.55 | -0.2 | 0.74 | 0.6 | 3.18 | 0.1 | 0.60 |
| Warrior | club | swell | 0.55 | -0.5 | 0.93 | 13.9 | 2.52 | 0.3 | 0.66 |
| Warrior | club | swell | 0.4 | -0.8 | 1.11 | 25.8 | 0.80 | 2.0 | 0.64 |
| Rogue | empty | knuckles | 0.55 | 0 | 0.32 | 3.9 | 0.60 | 3.6 | 0.27 |
| Rogue | empty | knuckles | 0.55 | -0.2 | 0.26 | 1.6 | 2.07 | 0.3 | 0.47 |
| Rogue | empty | knuckles | 0.55 | -0.5 | 0.41 | 6.5 | 1.38 | 6.5 | 1.10 |
| Rogue | empty | knuckles | 0.4 | -0.8 | 0.63 | 19.9 | 2.16 | 17.9 | 1.49 |
| Rogue | club | swell | 0.55 | 0 | 0.71 | 14.7 | 3.39 | 1.7 | 0.62 |
| Rogue | club | swell | 0.55 | -0.2 | 0.76 | 13.6 | 4.49 | 14.8 | 0.86 |
| Rogue | club | swell | 0.55 | -0.5 | 0.93 | 18.4 | 0.85 | 14.6 | 0.33 |
| Rogue | club | swell | 0.4 | -0.8 | 1.07 | 57.6 | 0.23 | 7.0 | 1.22 |
| Skeleton | empty | knuckles | 0.55 | 0 | 0.44 | 5.8 | 2.00 | 1.4 | 0.51 |
| Skeleton | empty | knuckles | 0.55 | -0.2 | 0.40 | 5.8 | 2.51 | 3.0 | 0.50 |
| Skeleton | empty | knuckles | 0.55 | -0.5 | 0.51 | 8.0 | 1.21 | 3.1 | 0.51 |
| Skeleton | empty | knuckles | 0.4 | -0.8 | 0.66 | 10.9 | 0.47 | 2.6 | 1.86 |
| Skeleton | club | swell | 0.55 | 0 | 0.95 | 22.2 | 1.17 | 3.4 | 0.67 |
| Skeleton | club | swell | 0.55 | -0.2 | 0.92 | 78.5 | 0.61 | 35.8 | 1.84 |
| Skeleton | club | swell | 0.55 | -0.5 | 0.95 | 74.3 | 0.93 | 31.8 | 1.06 |
| Skeleton | club | swell | 0.4 | -0.8 | 0.95 | 64.7 | 0.35 | 35.1 | 1.06 |

The Warrior's swell comes within a centimetre of a place at his head's height and 20 cm under
it in 0.4 s; it is 14 and 26 cm from places 50 and 80 cm under, which it reaches given 2 s:
there the time is short. The skeleton's swell rests 0.36 m behind its shoulder in the guard and
is 32 to 36 cm from three of the four places given 2 s, and the Rogue's 14 cm from two at
either time: there the path is what fails. It is a straight line of the swell from where it
rests to the place, and it runs through places no pose of the arm puts the swell at
([human-and-strikes.md](human-and-strikes.md#ik)); the solve that follows it does not come out
the far side. The skeleton's bare arm is slow, not stuck: 6 to 11 cm from each place in 0.4 s,
1 to 3 cm in 2 s.

### A loop of ten, placed

`node research/core-targets.mjs --list` on the same tree, as [A loop of ten](#a-loop-of-ten):
the ten targets of a seed struck at in turn on one run.

| Body | Held | Runs that looped, of 3 | Targets read, of 30 | Hit | Crowded | The runs |
|---|---|---|---|---|---|---|
| Warrior | empty | 3 | 30 | 24 | 3 | seed 1: looped at 67.8 s; seed 2: looped at 68.6 s; seed 3: looped at 64.9 s |
| Warrior | club | 1 | 23 | 12 | 0 | seed 1: fell (Closing on its target) at 35.9 s; seed 2: looped at 71.4 s; seed 3: fell (Setting its feet) at 44.5 s |
| Rogue | empty | 3 | 30 | 21 | 6 | seed 1: looped at 67.9 s; seed 2: looped at 67.2 s; seed 3: looped at 65.7 s |
| Rogue | club | 1 | 20 | 1 | 0 | seed 1: looped at 76.2 s; seed 2: fell (Setting its feet) at 25.1 s; seed 3: fell (Setting its feet) at 31.0 s |
| Skeleton | empty | 1 | 16 | 5 | 2 | seed 1: fell (Closing on its target) at 20.3 s; seed 2: looped at 86.0 s; seed 3: fell (Closing on its target) at 19.4 s |
| Skeleton | club | 0 | 6 | 0 | 0 | seed 1: fell (Setting its feet) at 17.5 s; seed 2: fell (Setting its feet) at 17.5 s; seed 3: fell (Setting its feet) at 17.5 s |

Beside the loops before: the Warrior bare-handed loops in all three runs where it fell in one,
and 24 of its 30 targets are hit where 13 of 23 were; the Rogue with the club loops once where
it never did, and the skeleton bare-handed once. The skeleton with the club falls setting its
feet for its second target in every run, as it did, and the Warrior with the club in two runs
of three, as it did.

## Cover

A cover (`GUARD_COVER`, `src/core/skills/guard.ts`) is what a guarding hand does once it is told
what threatens which place of its own body: the point it covers with goes `out` m from the place
guarded toward the threat, by a hand goal given `seconds` to reach it, which follows the two as
they move. An empty hand covers with its knuckles. A club covers with its swell
(`ItemSpec.cover`, the swell's two ends): the middle of the two goes where a single point would,
and their line is laid square to the threat's, the way nearest how the club lies.

### Reach

`node research/core-guard-reach.mjs --covers '<the covers below>'`, and `--model workshop-rogue`
for the Rogue's rows: a body that has stood in the guard 1.5 s (Node core stand, Rapier, 120 Hz,
no assist) is given a cover of a threat standing still 0.8 m from its head: ahead, to its left,
to its right, above and ahead, low and ahead. Its left hand is empty and its right holds the
club, each read on a run of its own. Off is how far the left hand's knuckles, and the middle of
the club's swell, are from the place the cover asks for; off square is the angle of the swell's
line from square to the threat's, at 1 s. No run fell.

The Warrior:

| Out, m | Seconds | Threat | Knuckles off, cm: 0.15 s | 0.3 s | 0.6 s | 1 s | Swell off, cm: 0.15 s | 0.3 s | 0.6 s | 1 s | Off square, rad | Same end up |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.2 | 0.15 | ahead | 4.4 | 3.5 | 2.8 | 2.8 | 20.4 | 21.1 | 1.9 | 0.2 | 0.00 | yes |
| 0.2 | 0.15 | its left | 9.1 | 3.0 | 2.2 | 0.3 | 8.6 | 6.3 | 11.1 | 2.2 | 0.23 | yes |
| 0.2 | 0.15 | its right | 41.0 | 36.2 | 30.3 | 26.1 | 39.9 | 61.0 | 54.7 | 42.1 | 0.42 | yes |
| 0.2 | 0.15 | above | 18.0 | 9.5 | 0.8 | 0.6 | 5.8 | 4.7 | 0.4 | 0.0 | 0.00 | yes |
| 0.2 | 0.15 | low | 0.7 | 0.3 | 0.2 | 0.2 | 33.7 | 26.4 | 48.8 | 11.3 | 0.16 | yes |
| 0.3 | 0.15 | ahead | 3.8 | 2.2 | 0.1 | 0.3 | 16.7 | 20.8 | 3.5 | 0.4 | 0.01 | yes |
| 0.3 | 0.15 | its left | 11.9 | 8.0 | 1.9 | 0.4 | 13.7 | 6.7 | 3.1 | 3.4 | 0.21 | yes |
| 0.3 | 0.15 | its right | 46.4 | 40.8 | 27.0 | 24.9 | 42.0 | 38.4 | 15.7 | 15.0 | 0.29 | yes |
| 0.3 | 0.15 | above | 26.5 | 13.0 | 2.3 | 1.3 | 7.8 | 6.9 | 0.9 | 0.0 | 0.00 | yes |
| 0.3 | 0.15 | low | 0.7 | 0.3 | 0.2 | 0.2 | 30.9 | 22.5 | 10.1 | 1.2 | 0.01 | yes |
| 0.4 | 0.15 | ahead | 6.6 | 3.7 | 0.2 | 0.3 | 15.5 | 18.2 | 4.6 | 0.6 | 0.00 | yes |
| 0.4 | 0.15 | its left | 18.2 | 14.7 | 3.6 | 0.5 | 21.1 | 13.8 | 9.2 | 7.1 | 0.33 | yes |
| 0.4 | 0.15 | its right | 55.1 | 36.3 | 32.9 | 31.8 | 54.3 | 41.6 | 28.2 | 11.2 | 0.16 | yes |
| 0.4 | 0.15 | above | 39.9 | 21.2 | 2.5 | 1.9 | 16.6 | 12.3 | 2.6 | 0.7 | 0.06 | yes |
| 0.4 | 0.15 | low | 0.5 | 0.2 | 0.2 | 0.2 | 37.4 | 27.5 | 18.1 | 1.6 | 0.00 | yes |
| 0.3 | 0.1 | ahead | 18.1 | 6.8 | 2.1 | 0.6 | 21.7 | 11.8 | 4.2 | 0.6 | 0.02 | yes |
| 0.3 | 0.1 | its left | 19.7 | 11.9 | 3.5 | 0.4 | 26.2 | 19.8 | 12.8 | 3.1 | 0.34 | yes |
| 0.3 | 0.1 | its right | 45.5 | 36.1 | 23.9 | 7.0 | 43.6 | 44.0 | 50.7 | 23.6 | 0.24 | yes |
| 0.3 | 0.1 | above | 41.8 | 18.1 | 1.6 | 1.1 | 15.8 | 12.4 | 4.7 | 0.5 | 0.01 | yes |
| 0.3 | 0.1 | low | 0.8 | 0.4 | 0.2 | 0.2 | 36.0 | 25.4 | 37.7 | 3.5 | 0.10 | no |
| 0.3 | 0.25 | ahead | 8.1 | 0.3 | 0.2 | 0.3 | 14.3 | 5.6 | 0.8 | 0.0 | 0.00 | yes |
| 0.3 | 0.25 | its left | 15.2 | 3.7 | 0.3 | 0.2 | 10.4 | 15.4 | 20.8 | 24.0 | 0.54 | no |
| 0.3 | 0.25 | its right | 38.4 | 26.0 | 26.8 | 23.1 | 42.4 | 43.4 | 28.1 | 22.2 | 0.11 | yes |
| 0.3 | 0.25 | above | 15.4 | 2.7 | 1.6 | 0.6 | 11.1 | 1.5 | 0.3 | 0.0 | 0.00 | yes |
| 0.3 | 0.25 | low | 6.8 | 0.3 | 0.2 | 0.2 | 25.3 | 24.4 | 7.7 | 0.9 | 0.00 | yes |
| 0.3 | 0.4 | ahead | 16.0 | 2.7 | 0.2 | 0.3 | 29.3 | 4.7 | 0.2 | 0.0 | 0.00 | yes |
| 0.3 | 0.4 | its left | 28.8 | 4.3 | 0.5 | 0.2 | 18.9 | 4.2 | 35.9 | 35.9 | 0.66 | no |
| 0.3 | 0.4 | its right | 44.4 | 27.4 | 25.3 | 27.6 | 43.8 | 39.5 | 51.5 | 24.9 | 0.32 | yes |
| 0.3 | 0.4 | above | 27.8 | 4.7 | 1.2 | 0.6 | 21.3 | 4.4 | 0.4 | 0.0 | 0.00 | yes |
| 0.3 | 0.4 | low | 13.7 | 2.2 | 0.2 | 0.2 | 37.9 | 10.8 | 4.9 | 0.9 | 0.02 | yes |

The Rogue:

| Out, m | Seconds | Threat | Knuckles off, cm: 0.15 s | 0.3 s | 0.6 s | 1 s | Swell off, cm: 0.15 s | 0.3 s | 0.6 s | 1 s | Off square, rad | Same end up |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.3 | 0.15 | ahead | 7.7 | 4.6 | 0.5 | 0.0 | 21.5 | 20.3 | 50.3 | 83.1 | 0.71 | no |
| 0.3 | 0.15 | its left | 21.5 | 17.2 | 3.2 | 0.4 | 16.0 | 14.8 | 7.3 | 27.8 | 0.38 | no |
| 0.3 | 0.15 | its right | 48.8 | 36.6 | 30.4 | 25.8 | 50.9 | 64.9 | 98.1 | 37.5 | 0.34 | yes |
| 0.3 | 0.15 | above | 32.8 | 17.0 | 1.8 | 1.0 | 24.9 | 15.5 | 12.6 | 46.9 | 0.20 | no |
| 0.3 | 0.15 | low | 4.4 | 3.8 | 3.4 | 3.4 | 29.4 | 28.1 | 42.1 | 14.5 | 0.45 | no |

- **A bare hand is before the face in 0.3 s, and at its own side or overhead in 0.6.** The
  Warrior's knuckles at 0.3 m out and 0.15 s are 2.2 cm from a place ahead at 0.3 s, 8.0 cm from
  one to their own side and 13.0 cm from one above; at 0.6 s all three are within 2.3 cm.
- **A hand does not cover across the body.** A threat on the far side is 26 to 41 cm from the
  left hand's knuckles at 0.3 s at every cover tried, and 25 cm at 1 s at the one set: the arm
  does not reach round its own trunk and head in time. The other hand's side is the other
  hand's to cover.
- **`out` is 0.3.** At 0.2 the knuckles stop 2.8 cm short of a place ahead, which is where the
  face is; at 0.4 the hand has further to go, and is 14.7 cm from a place at its side at 0.3 s
  where it is 8.0 at 0.3.
- **`seconds` is 0.15.** At 0.1 the arm is asked for more than it gives and is later: 18.1 cm
  from a place ahead at 0.15 s where it is 3.8, and a low threat turns the club end over end. At
  0.25 and 0.4 a threat at its left turns it over, and it is 24 and 36 cm from its place at 1 s.
  At 0.15 the same end stays up for every threat.
- **The Warrior's club is slower than its hand.** Its swell is 16.7 and 20.8 cm from a place
  ahead at 0.15 and 0.3 s, and 3.5 cm at 0.6 s.
- **The Rogue's club does not come to its place.** Its swell is 50 and 83 cm off at 0.6 and 1 s
  for a threat ahead, and has turned end over end for four threats of five. Its bare hand
  reaches as the Warrior's does: 0.5 cm from a place ahead at 0.6 s.

### A club's line

`node research/core-guard-reach.mjs --model <each> --club skill|up|middle`: the same stand at
the cover set, the club's hand given its goal three ways. The skill's lays the swell's two ends
square to the threat's line the way nearest how the club lies. The other two are the script's,
in the skill's place, with the same middle: the two ends laid square the way nearest the body's
up; and the swell's middle alone as one point, its line left to the posture.

| Body | The swell's goal | Threat | Swell off, cm: 0.15 s | 0.3 s | 0.6 s | 1 s | Off square at 1 s, rad | Same end up |
|---|---|---|---|---|---|---|---|---|
| Warrior | the skill's | ahead | 16.7 | 20.8 | 3.5 | 0.4 | 0.01 | yes |
| Warrior | the skill's | its left | 13.7 | 6.7 | 3.1 | 3.4 | 0.21 | yes |
| Warrior | the skill's | its right | 42.0 | 38.4 | 15.7 | 15.0 | 0.29 | yes |
| Warrior | the skill's | above | 7.8 | 6.9 | 0.9 | 0.0 | 0.00 | yes |
| Warrior | the skill's | low | 30.9 | 22.5 | 10.1 | 1.2 | 0.01 | yes |
| Warrior | by the body's up | ahead | 16.9 | 52.8 | 46.4 | 9.6 | 0.05 | yes |
| Warrior | by the body's up | its left | 17.2 | 9.4 | 9.0 | 5.5 | 0.35 | yes |
| Warrior | by the body's up | its right | 50.9 | 47.3 | 19.1 | 16.1 | 0.29 | yes |
| Warrior | by the body's up | above | 14.0 | 15.7 | 6.1 | 1.5 | 0.05 | yes |
| Warrior | by the body's up | low | 29.4 | 25.4 | 11.9 | 9.5 | 0.39 | yes |
| Warrior | the middle alone | ahead | 16.9 | 20.6 | 3.9 | 0.4 | 0.07 | yes |
| Warrior | the middle alone | its left | 5.9 | 2.8 | 0.4 | 0.0 | 0.79 | yes |
| Warrior | the middle alone | its right | 43.6 | 41.6 | 16.8 | 17.5 | 0.27 | yes |
| Warrior | the middle alone | above | 1.4 | 3.4 | 0.3 | 0.0 | 0.33 | yes |
| Warrior | the middle alone | low | 33.7 | 34.8 | 48.9 | 14.5 | 0.06 | yes |
| Rogue | the skill's | ahead | 21.5 | 20.3 | 50.3 | 83.1 | 0.71 | no |
| Rogue | the skill's | its left | 16.0 | 14.8 | 7.3 | 27.8 | 0.38 | no |
| Rogue | the skill's | its right | 50.9 | 64.9 | 98.1 | 37.5 | 0.34 | yes |
| Rogue | the skill's | above | 24.9 | 15.5 | 12.6 | 46.9 | 0.20 | no |
| Rogue | the skill's | low | 29.4 | 28.1 | 42.1 | 14.5 | 0.45 | no |
| Rogue | by the body's up | ahead | 29.1 | 24.2 | 10.4 | 4.3 | 0.02 | yes |
| Rogue | by the body's up | its left | 9.0 | 7.2 | 11.5 | 11.4 | 0.33 | yes |
| Rogue | by the body's up | its right | 51.0 | 72.7 | 78.5 | 61.8 | 0.36 | yes |
| Rogue | by the body's up | above | 26.6 | 16.8 | 13.7 | 2.0 | 0.13 | yes |
| Rogue | by the body's up | low | 31.7 | 22.0 | 54.1 | 36.2 | 1.07 | no |
| Rogue | the middle alone | ahead | 23.0 | 15.6 | 7.3 | 0.5 | 0.08 | yes |
| Rogue | the middle alone | its left | 7.4 | 6.8 | 26.0 | 34.3 | 1.14 | no |
| Rogue | the middle alone | its right | 51.2 | 65.2 | 62.4 | 45.4 | 0.42 | yes |
| Rogue | the middle alone | above | 19.1 | 18.3 | 3.4 | 0.2 | 0.44 | yes |
| Rogue | the middle alone | low | 29.6 | 22.9 | 20.6 | 6.8 | 0.13 | yes |

- **How the line is laid is not what fails.** Laid by the body's up, the Rogue's swell comes to
  4.3 cm from a place ahead at 1 s where the skill's is 83 cm off, and the Warrior's is 52.8 cm
  off at 0.3 s where the skill's is 20.8: each way of laying it suits one body and not the
  other. Low, the Rogue's turns over under it.
- **The middle alone comes to a place ahead on both bodies, and no sooner.** It is within
  0.5 cm of a place ahead and of one above at 1 s on both, and 15 to 21 cm from the place ahead
  at 0.3 s, as the skill's is. Its line is whatever the posture leaves, 0.3 to 1.1 rad off
  square for a threat at either side, and a threat at the Rogue's left turns its club over
  under it too.
- What the three share is the hand goal: two points of a held club, or one, taken to places by
  the arm's solve, which a heavy item at the end of the Rogue's arm does not follow
  ([human-and-strikes.md](human-and-strikes.md#ik)). The skill's line stays.

## Threat

A threat (`THREAT`, `src/core/mind/threat.ts`) is a foe's striking point (its knuckles, or the
swell of the club it holds) within `within` m of a body's head and closing on it at over
`closing` m/s; of those, the one closing fastest is what a covering hand is told to cover
against. Set: within 1.5 m, closing at over 2 m/s.

### How late a cover is

`node research/core-guard-late.mjs`, and `--threat '{"within":2.5,"closing":-100}'` for the
second table: arena bouts with a club in every right hand, each pair at five gaps, each side
covering in turn. For each blow the covering side's head met: how long its mind had seen a
threat, and how far the left hand's knuckles and the club's swell were from the place the cover
asks for, at the step before the blow.

Node, core world (src/core/world.ts), Rapier, 120 Hz; each side's balance its character's; a club in every right hand; gaps 3, 3.5, 4, 4.5, 5 m; what each side senses 0 steps old.
The covering side's threat: {"within":1.5,"closing":2}; its cover: {"out":0.3,"seconds":0.15}. Three figures are the least, the median and the most.

| Left | Right | Covers | Blows met | By its head | No threat seen | Threat seen, s | Knuckles from the place, cm | Swell from the place, cm | Steps a threat is seen in, % | Steps a strike has a hand in, % |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | left | 30 | 4 | 0 | 0.14, 0.14, 0.14 | 24, 41, 43 | 27, 38, 88 | 1.3 | 74.0 |
| workshop-fighter | workshop-fighter | right | 34 | 2 | 0 | 0.14, 0.16, 0.16 | 25, 39, 39 | 36, 58, 58 | 0.6 | 69.2 |
| workshop-fighter | workshop-rogue | left | 13 | 0 | 0 | - | - | - | 0.2 | 64.8 |
| workshop-fighter | workshop-rogue | right | 17 | 5 | 0 | 0.14, 0.15, 0.15 | 56, 61, 63 | 25, 35, 49 | 1.7 | 54.3 |
| workshop-rogue | workshop-fighter | left | 15 | 4 | 0 | 0.14, 0.15, 0.16 | 39, 56, 58 | 32, 45, 63 | 1.6 | 72.2 |
| workshop-rogue | workshop-fighter | right | 33 | 0 | 0 | - | - | - | 0.5 | 75.4 |
| workshop-rogue | workshop-rogue | left | 4 | 0 | 0 | - | - | - | 1.5 | 74.1 |
| workshop-rogue | workshop-rogue | right | 6 | 0 | 0 | - | - | - | 1.4 | 73.1 |

The covering side's threat: {"within":2.5,"closing":-100}; its cover: {"out":0.3,"seconds":0.15}. Three figures are the least, the median and the most.

| Left | Right | Covers | Blows met | By its head | No threat seen | Threat seen, s | Knuckles from the place, cm | Swell from the place, cm | Steps a threat is seen in, % | Steps a strike has a hand in, % |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | left | 37 | 2 | 0 | 8.57, 8.58, 8.58 | 18, 19, 19 | 29, 31, 31 | 69.4 | 60.0 |
| workshop-fighter | workshop-fighter | right | 37 | 1 | 0 | 8.47, 8.47, 8.47 | 18, 18, 18 | 31, 31, 31 | 78.0 | 71.5 |
| workshop-fighter | workshop-rogue | left | 20 | 0 | 0 | - | - | - | 77.1 | 69.5 |
| workshop-fighter | workshop-rogue | right | 12 | 4 | 0 | 5.54, 5.88, 13.72 | 23, 36, 39 | 32, 70, 75 | 71.0 | 61.1 |
| workshop-rogue | workshop-fighter | left | 35 | 3 | 0 | 5.52, 5.74, 6.91 | 17, 39, 40 | 40, 50, 52 | 77.8 | 70.2 |
| workshop-rogue | workshop-fighter | right | 12 | 0 | 0 | - | - | - | 66.3 | 56.3 |
| workshop-rogue | workshop-rogue | left | 21 | 1 | 0 | 6.38, 6.38, 6.38 | 20, 20, 20 | 23, 23, 23 | 72.8 | 63.1 |
| workshop-rogue | workshop-rogue | right | 3 | 0 | 0 | - | - | - | 72.9 | 63.9 |

- **The threat set is seen 0.14 to 0.16 s before the blow, and the cover is not there.** Every
  blow that met a covering head had a threat seen before it. At the blow the knuckles are 24 to
  63 cm from their place and the swell 25 to 88 cm: a bare hand is at a place before the face
  in 0.3 s and a club's swell in 0.6 ([Reach](#reach)). A threat is seen in 0.2 to 1.7 % of a
  bout's steps.
- **Seen sooner, the cover is still not there.** Within 2.5 m at any closing speed a threat is
  seen in 66 to 78 % of the steps and for 5.5 to 13.7 s before the blow, and the knuckles are
  17 to 40 cm and the swell 23 to 75 cm from their places at the blow. Under either threat a
  strike has one of the covering side's hands in 54 to 75 % of its steps, and the place a cover
  asks for moves with the foe's striking point as it swings.

### Sweep

`node research/core-guard.mjs --bouts 32 --from 1000 --held club --variants '<the threats
below>'`, played in two parts (`--save`) and read as one (`--load`): 5376 arena bouts, Node, core
world, Rapier, 120 Hz, each side's balance its character's, clubs, the Warrior and the Rogue in
each ordered pair, what each side senses 0 and 24 steps old, 32 starting gaps from 3.06 to
4.99 m. One control with both sides in the pose; for each threat, each side covering in turn
under it. The rows pool the eight cells of a delay, and the sixteen of both: the covering
side's hit points lost a bout to blows that met its head, in the pose and covering, what
covering saved and its effect size (Cohen's d of the differences paired by gap); all the hit
points it lost; the share of bouts it fell in, and won (the control's is 0.50). A closing speed
of "any" is `closing: -100`.

| Within, m | Closing over, m/s | Delay, steps | Bouts paired | Head HP, pose | cover | Saved | d | HP, pose | cover | d | Fell, pose | cover | Won, cover |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.5 | 2 | 0 | 256 | 0.159 | 0.133 | 0.026 | 0.11 | 0.273 | 0.238 | 0.12 | 0.34 | 0.34 | 0.50 |
| 1.5 | 2 | 24 | 256 | 0.084 | 0.087 | -0.003 | -0.02 | 0.272 | 0.257 | 0.09 | 0.39 | 0.44 | 0.44 |
| 1.5 | 2 | both | 512 | 0.122 | 0.110 | 0.012 | 0.06 | 0.273 | 0.248 | 0.11 | 0.37 | 0.39 | 0.47 |
| 1.5 | 0 | 0 | 256 | 0.159 | 0.141 | 0.018 | 0.06 | 0.273 | 0.227 | 0.13 | 0.34 | 0.34 | 0.49 |
| 1.5 | 0 | 24 | 256 | 0.084 | 0.111 | -0.027 | -0.10 | 0.272 | 0.274 | -0.01 | 0.39 | 0.44 | 0.43 |
| 1.5 | 0 | both | 512 | 0.122 | 0.126 | -0.004 | -0.02 | 0.273 | 0.250 | 0.06 | 0.37 | 0.39 | 0.46 |
| 1.5 | any | 0 | 256 | 0.159 | 0.142 | 0.017 | 0.06 | 0.273 | 0.235 | 0.10 | 0.34 | 0.50 | 0.33 |
| 1.5 | any | 24 | 256 | 0.084 | 0.111 | -0.027 | -0.09 | 0.272 | 0.281 | -0.02 | 0.39 | 0.49 | 0.38 |
| 1.5 | any | both | 512 | 0.122 | 0.126 | -0.005 | -0.02 | 0.273 | 0.258 | 0.03 | 0.37 | 0.49 | 0.36 |
| 2 | 2 | 0 | 256 | 0.159 | 0.134 | 0.025 | 0.10 | 0.273 | 0.244 | 0.10 | 0.34 | 0.34 | 0.50 |
| 2 | 2 | 24 | 256 | 0.084 | 0.084 | 0.000 | 0.00 | 0.272 | 0.263 | 0.06 | 0.39 | 0.43 | 0.45 |
| 2 | 2 | both | 512 | 0.122 | 0.109 | 0.013 | 0.07 | 0.273 | 0.253 | 0.08 | 0.37 | 0.39 | 0.48 |
| 2 | 0 | 0 | 256 | 0.159 | 0.090 | 0.069 | 0.21 | 0.273 | 0.254 | 0.05 | 0.34 | 0.43 | 0.45 |
| 2 | 0 | 24 | 256 | 0.084 | 0.114 | -0.030 | -0.08 | 0.272 | 0.226 | 0.09 | 0.39 | 0.45 | 0.41 |
| 2 | 0 | both | 512 | 0.122 | 0.102 | 0.020 | 0.06 | 0.273 | 0.240 | 0.07 | 0.37 | 0.44 | 0.43 |
| 2 | any | 0 | 256 | 0.159 | 0.107 | 0.053 | 0.15 | 0.273 | 0.210 | 0.15 | 0.34 | 0.45 | 0.43 |
| 2 | any | 24 | 256 | 0.084 | 0.095 | -0.011 | -0.03 | 0.272 | 0.225 | 0.11 | 0.39 | 0.53 | 0.36 |
| 2 | any | both | 512 | 0.122 | 0.101 | 0.021 | 0.06 | 0.273 | 0.217 | 0.13 | 0.37 | 0.49 | 0.39 |
| 2.5 | 0 | 0 | 256 | 0.159 | 0.102 | 0.057 | 0.15 | 0.273 | 0.221 | 0.12 | 0.34 | 0.45 | 0.44 |
| 2.5 | 0 | 24 | 256 | 0.084 | 0.110 | -0.025 | -0.08 | 0.272 | 0.213 | 0.12 | 0.39 | 0.48 | 0.41 |
| 2.5 | 0 | both | 512 | 0.122 | 0.106 | 0.016 | 0.04 | 0.273 | 0.217 | 0.12 | 0.37 | 0.46 | 0.43 |
| 2.5 | any | 0 | 256 | 0.159 | 0.107 | 0.052 | 0.14 | 0.273 | 0.240 | 0.08 | 0.34 | 0.53 | 0.35 |
| 2.5 | any | 24 | 256 | 0.084 | 0.087 | -0.003 | -0.01 | 0.272 | 0.195 | 0.17 | 0.39 | 0.56 | 0.34 |
| 2.5 | any | both | 512 | 0.122 | 0.097 | 0.024 | 0.07 | 0.273 | 0.218 | 0.12 | 0.37 | 0.54 | 0.35 |
| 3 | any | 0 | 256 | 0.159 | 0.096 | 0.063 | 0.18 | 0.273 | 0.202 | 0.18 | 0.34 | 0.50 | 0.37 |
| 3 | any | 24 | 256 | 0.084 | 0.060 | 0.024 | 0.08 | 0.272 | 0.186 | 0.21 | 0.39 | 0.60 | 0.32 |
| 3 | any | both | 512 | 0.122 | 0.078 | 0.044 | 0.14 | 0.273 | 0.194 | 0.19 | 0.37 | 0.55 | 0.35 |
| 1 | any | 0 | 256 | 0.159 | 0.116 | 0.043 | 0.15 | 0.273 | 0.217 | 0.15 | 0.34 | 0.56 | 0.29 |
| 1 | any | 24 | 256 | 0.084 | 0.098 | -0.014 | -0.05 | 0.272 | 0.250 | 0.06 | 0.39 | 0.53 | 0.34 |
| 1 | any | both | 512 | 0.122 | 0.107 | 0.015 | 0.05 | 0.273 | 0.233 | 0.10 | 0.37 | 0.54 | 0.32 |

The bar ([Guard battery](#guard-battery)) by cell, of sixteen: those where covering saves the
head at d over 0.2, those of them with no more falls, and the least d of any cell.

| Within, m | Closing over, m/s | Cells over 0.2 | With no more falls | Least d |
|---|---|---|---|---|
| 1.5 | 2 | 4 of 16 | 1 | -0.26 |
| 1.5 | 0 | 1 of 16 | 0 | -0.52 |
| 1.5 | any | 2 of 16 | 1 | -0.31 |
| 2 | 2 | 3 of 16 | 0 | -0.27 |
| 2 | 0 | 5 of 16 | 1 | -0.41 |
| 2 | any | 4 of 16 | 0 | -0.35 |
| 2.5 | 0 | 6 of 16 | 0 | -0.49 |
| 2.5 | any | 5 of 16 | 1 | -0.35 |
| 3 | any | 4 of 16 | 0 | -0.22 |
| 1 | any | 5 of 16 | 1 | -0.40 |

- **No threat meets the bar.** The most cells over 0.2 are 6 of 16, at most 1 of them with no
  more falls, and every threat has a cell where covering costs the head at d of -0.22 or worse.
- **A wider threat saves somewhat more of the head, and costs falls and wins.** The widest, 3 m
  at any closing speed, saves the most: 0.122 to 0.078 HP a bout, d 0.14; its side falls in
  0.55 of its bouts where it fell in 0.37, and wins 0.35 of them. With no closing speed asked,
  at every distance, the covering side falls in 0.49 to 0.55 of its bouts and wins 0.32 to
  0.39.
- **With the senses 24 steps old only the widest saves anything.** Its d is 0.08; every other
  threat's is from -0.10 to 0.00.
- **`THREAT` stays.** Within 1.5 m and closing at over 2 m/s costs the least: falls 0.37 to
  0.39, wins 0.47. Within 2 m at the same closing speed reads the same to the band of 512
  pairs; nothing read here earns a change.

## Guard battery

`node research/core-guard.mjs --bouts 32`: arena bouts (`research/bout.mjs`: Node, core world,
Rapier, 120 Hz, each side's balance its character's), clubs and bare hands, the Warrior and the
Rogue in each ordered pair, what each side senses 0 and 24 steps old (the arena's), 32 starting
gaps from 3.03 to 4.99 m by the golden ratio's sequence. A bout has no seed: what stands for one
is its gap. At each gap one bout has both sides in the pose, the control, and one each side
covering (`guard: "cover"`, `THREAT`, `GUARD_COVER`) against the other in the pose. A cell
is what is held, the delay, the pair and the side that covers; its rows pair the covering bout
with the control at the same gap. 1536 bouts in 1608 s on 14 workers.

**The bar.** Covering loses fewer hit points to the head in every cell, at d over 0.2, on two
sets of gaps, with no more falls.

| Held | Delay | Left | Right | Covers | Gaps | Head HP, pose | cover | Saved | d | HP, pose | cover | d | Fell, pose | cover | Won, pose | cover | Seconds, pose | cover |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | 0 | workshop-fighter | workshop-fighter | left | 32 | 0.134 | 0.174 | -0.040 | -0.16 | 0.260 | 0.320 | -0.29 | 0.16 | 0.06 | 0.72 | 0.72 | 8.6 | 9.2 |
| club | 0 | workshop-fighter | workshop-fighter | right | 32 | 0.140 | 0.141 | -0.001 | -0.00 | 0.305 | 0.360 | -0.12 | 0.56 | 0.53 | 0.28 | 0.34 | 8.6 | 8.6 |
| club | 0 | workshop-fighter | workshop-rogue | left | 32 | 0.000 | 0.000 | 0.000 | 0.00 | 0.051 | 0.031 | 0.29 | 0.03 | 0.06 | 0.97 | 0.94 | 13.0 | 12.9 |
| club | 0 | workshop-fighter | workshop-rogue | right | 32 | 0.525 | 0.655 | -0.129 | -0.43 | 0.761 | 0.875 | -0.25 | 0.38 | 0.25 | 0.03 | 0.06 | 13.0 | 11.8 |
| club | 0 | workshop-rogue | workshop-fighter | left | 32 | 0.277 | 0.283 | -0.007 | -0.03 | 0.420 | 0.458 | -0.13 | 0.28 | 0.28 | 0.47 | 0.44 | 9.0 | 8.6 |
| club | 0 | workshop-rogue | workshop-fighter | right | 32 | 0.000 | 0.002 | -0.002 | -0.18 | 0.040 | 0.072 | -0.29 | 0.47 | 0.44 | 0.53 | 0.56 | 9.0 | 10.4 |
| club | 0 | workshop-rogue | workshop-rogue | left | 32 | 0.025 | 0.019 | 0.006 | 0.16 | 0.055 | 0.047 | 0.07 | 0.41 | 0.56 | 0.56 | 0.41 | 16.1 | 18.9 |
| club | 0 | workshop-rogue | workshop-rogue | right | 32 | 0.022 | 0.018 | 0.004 | 0.18 | 0.052 | 0.046 | 0.05 | 0.56 | 0.59 | 0.44 | 0.38 | 16.1 | 15.8 |
| club | 24 | workshop-fighter | workshop-fighter | left | 32 | 0.129 | 0.129 | 0.000 | 0.18 | 0.305 | 0.306 | -0.22 | 0.22 | 0.19 | 0.66 | 0.69 | 7.7 | 8.3 |
| club | 24 | workshop-fighter | workshop-fighter | right | 32 | 0.232 | 0.213 | 0.019 | 0.15 | 0.340 | 0.361 | -0.10 | 0.47 | 0.50 | 0.34 | 0.34 | 7.7 | 8.7 |
| club | 24 | workshop-fighter | workshop-rogue | left | 32 | 0.001 | 0.000 | 0.001 | 0.18 | 0.038 | 0.030 | 0.12 | 0.19 | 0.16 | 0.81 | 0.84 | 13.1 | 12.2 |
| club | 24 | workshop-fighter | workshop-rogue | right | 32 | 0.298 | 0.231 | 0.067 | 0.26 | 0.671 | 0.573 | 0.28 | 0.38 | 0.56 | 0.19 | 0.06 | 13.1 | 11.8 |
| club | 24 | workshop-rogue | workshop-fighter | left | 32 | 0.130 | 0.165 | -0.034 | -0.19 | 0.506 | 0.481 | 0.11 | 0.41 | 0.38 | 0.41 | 0.41 | 11.3 | 9.7 |
| club | 24 | workshop-rogue | workshop-fighter | right | 32 | 0.000 | 0.000 | 0.000 | 0.00 | 0.044 | 0.047 | -0.25 | 0.41 | 0.44 | 0.59 | 0.56 | 11.3 | 9.6 |
| club | 24 | workshop-rogue | workshop-rogue | left | 32 | 0.000 | 0.000 | -0.000 | -0.18 | 0.004 | 0.046 | -0.35 | 0.59 | 0.53 | 0.41 | 0.47 | 16.1 | 16.8 |
| club | 24 | workshop-rogue | workshop-rogue | right | 32 | 0.006 | 0.004 | 0.002 | 0.04 | 0.016 | 0.008 | 0.17 | 0.41 | 0.41 | 0.59 | 0.59 | 16.1 | 15.9 |
| empty | 0 | workshop-fighter | workshop-fighter | left | 32 | 0.002 | 0.001 | 0.001 | 0.20 | 0.014 | 0.009 | 0.25 | 0.00 | 0.06 | 1.00 | 0.94 | 3.7 | 3.5 |
| empty | 0 | workshop-fighter | workshop-fighter | right | 32 | 0.001 | 0.002 | -0.001 | -0.18 | 0.013 | 0.012 | 0.09 | 1.00 | 0.97 | 0.00 | 0.03 | 3.7 | 3.7 |
| empty | 0 | workshop-fighter | workshop-rogue | left | 32 | 0.021 | 0.022 | -0.001 | -0.17 | 0.293 | 0.308 | -0.42 | 0.00 | 0.00 | 1.00 | 1.00 | 116.8 | 116.8 |
| empty | 0 | workshop-fighter | workshop-rogue | right | 32 | 0.094 | 0.098 | -0.004 | -0.14 | 0.346 | 0.366 | -0.25 | 0.03 | 0.00 | 0.00 | 0.00 | 116.8 | 120.0 |
| empty | 0 | workshop-rogue | workshop-fighter | left | 32 | 0.006 | 0.006 | 0.000 | 0.16 | 0.027 | 0.027 | -0.17 | 0.00 | 0.00 | 0.94 | 0.94 | 10.2 | 10.2 |
| empty | 0 | workshop-rogue | workshop-fighter | right | 32 | 0.001 | 0.001 | -0.000 | -0.16 | 0.020 | 0.022 | -0.12 | 0.94 | 0.94 | 0.06 | 0.06 | 10.2 | 10.2 |
| empty | 0 | workshop-rogue | workshop-rogue | left | 32 | 0.003 | 0.005 | -0.002 | -0.20 | 0.229 | 0.224 | 0.03 | 0.50 | 0.53 | 0.50 | 0.44 | 37.7 | 39.8 |
| empty | 0 | workshop-rogue | workshop-rogue | right | 32 | 0.004 | 0.004 | 0.000 | 0.01 | 0.229 | 0.223 | 0.08 | 0.47 | 0.41 | 0.50 | 0.50 | 37.7 | 37.3 |
| empty | 24 | workshop-fighter | workshop-fighter | left | 32 | 0.001 | 0.001 | -0.000 | -0.18 | 0.011 | 0.012 | -0.17 | 0.03 | 0.00 | 0.97 | 1.00 | 3.7 | 3.7 |
| empty | 24 | workshop-fighter | workshop-fighter | right | 32 | 0.000 | 0.001 | -0.001 | -0.18 | 0.011 | 0.009 | 0.22 | 0.97 | 0.97 | 0.03 | 0.03 | 3.7 | 3.6 |
| empty | 24 | workshop-fighter | workshop-rogue | left | 32 | 0.021 | 0.023 | -0.002 | -0.18 | 0.284 | 0.286 | -0.03 | 0.00 | 0.03 | 1.00 | 0.97 | 116.9 | 115.2 |
| empty | 24 | workshop-fighter | workshop-rogue | right | 32 | 0.087 | 0.086 | 0.001 | 0.08 | 0.324 | 0.333 | -0.18 | 0.03 | 0.03 | 0.00 | 0.00 | 116.9 | 116.9 |
| empty | 24 | workshop-rogue | workshop-fighter | left | 32 | 0.003 | 0.003 | -0.000 | -0.18 | 0.013 | 0.011 | 0.18 | 0.00 | 0.00 | 0.97 | 0.97 | 6.6 | 6.6 |
| empty | 24 | workshop-rogue | workshop-fighter | right | 32 | 0.001 | 0.000 | 0.000 | 0.18 | 0.008 | 0.009 | -0.18 | 0.97 | 0.97 | 0.03 | 0.03 | 6.6 | 6.6 |
| empty | 24 | workshop-rogue | workshop-rogue | left | 32 | 0.005 | 0.004 | 0.001 | 0.14 | 0.179 | 0.171 | 0.07 | 0.47 | 0.56 | 0.50 | 0.44 | 27.9 | 26.0 |
| empty | 24 | workshop-rogue | workshop-rogue | right | 32 | 0.003 | 0.002 | 0.001 | 0.19 | 0.169 | 0.159 | 0.08 | 0.50 | 0.66 | 0.50 | 0.34 | 27.9 | 24.2 |
| club | 0 | every | pair | either | 256 | 0.140 | 0.161 | -0.021 | -0.10 | 0.243 | 0.276 | -0.12 | 0.36 | 0.35 | 0.50 | 0.48 | 11.6 | 12.0 |
| club | 24 | every | pair | either | 256 | 0.100 | 0.093 | 0.007 | 0.06 | 0.241 | 0.232 | 0.05 | 0.38 | 0.39 | 0.50 | 0.50 | 12.1 | 11.6 |
| empty | 0 | every | pair | either | 256 | 0.017 | 0.018 | -0.001 | -0.08 | 0.146 | 0.149 | -0.04 | 0.37 | 0.36 | 0.50 | 0.49 | 42.1 | 42.7 |
| empty | 24 | every | pair | either | 256 | 0.015 | 0.015 | 0.000 | 0.01 | 0.125 | 0.124 | 0.02 | 0.37 | 0.40 | 0.50 | 0.47 | 38.8 | 37.8 |
| every | delay | every | pair | either | 1024 | 0.068 | 0.072 | -0.004 | -0.03 | 0.189 | 0.195 | -0.04 | 0.37 | 0.38 | 0.50 | 0.48 | 26.2 | 26.0 |

The blows the covering side met a bout, by the surface it met them with.

| Held | Delay | Left | Right | Covers | head, pose | cover | trunk, pose | cover | arm, pose | cover | item, pose | cover | other, pose | cover |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | 0 | workshop-fighter | workshop-fighter | left | 0.75 | 0.50 | 0.28 | 0.22 | 2.16 | 1.81 | 2.44 | 2.75 | 0.13 | 0.13 |
| club | 0 | workshop-fighter | workshop-fighter | right | 0.97 | 0.53 | 0.22 | 0.34 | 2.34 | 1.78 | 2.06 | 1.38 | 0.16 | 0.25 |
| club | 0 | workshop-fighter | workshop-rogue | left | 0.00 | 0.00 | 0.16 | 0.09 | 0.72 | 0.97 | 2.88 | 2.94 | 0.03 | 0.06 |
| club | 0 | workshop-fighter | workshop-rogue | right | 1.31 | 1.44 | 0.53 | 0.38 | 0.75 | 1.66 | 0.94 | 0.53 | 0.25 | 0.09 |
| club | 0 | workshop-rogue | workshop-fighter | left | 0.50 | 0.56 | 0.19 | 0.25 | 0.38 | 0.69 | 0.53 | 0.31 | 0.09 | 0.16 |
| club | 0 | workshop-rogue | workshop-fighter | right | 0.03 | 0.03 | 0.03 | 0.06 | 0.47 | 0.63 | 1.09 | 1.53 | 0.06 | 0.03 |
| club | 0 | workshop-rogue | workshop-rogue | left | 0.47 | 0.25 | 0.56 | 0.28 | 0.69 | 0.44 | 2.94 | 2.03 | 0.31 | 0.16 |
| club | 0 | workshop-rogue | workshop-rogue | right | 0.63 | 0.47 | 0.78 | 1.25 | 0.97 | 0.97 | 2.25 | 2.06 | 0.34 | 0.47 |
| club | 24 | workshop-fighter | workshop-fighter | left | 0.41 | 0.38 | 0.31 | 0.34 | 1.22 | 0.78 | 1.53 | 1.47 | 0.09 | 0.19 |
| club | 24 | workshop-fighter | workshop-fighter | right | 0.53 | 0.53 | 0.28 | 0.31 | 1.50 | 1.66 | 1.09 | 1.44 | 0.16 | 0.19 |
| club | 24 | workshop-fighter | workshop-rogue | left | 0.25 | 0.00 | 0.09 | 1.16 | 0.63 | 0.81 | 3.28 | 2.34 | 0.03 | 0.28 |
| club | 24 | workshop-fighter | workshop-rogue | right | 0.75 | 0.75 | 0.84 | 0.53 | 1.34 | 0.91 | 0.69 | 0.56 | 0.66 | 0.63 |
| club | 24 | workshop-rogue | workshop-fighter | left | 0.38 | 0.34 | 0.41 | 0.31 | 1.31 | 0.78 | 1.22 | 0.75 | 0.41 | 0.25 |
| club | 24 | workshop-rogue | workshop-fighter | right | 0.00 | 0.00 | 0.25 | 0.22 | 0.34 | 0.41 | 3.03 | 2.16 | 0.09 | 0.19 |
| club | 24 | workshop-rogue | workshop-rogue | left | 0.00 | 0.03 | 0.16 | 0.31 | 0.34 | 0.31 | 2.06 | 1.50 | 0.13 | 0.16 |
| club | 24 | workshop-rogue | workshop-rogue | right | 0.28 | 0.03 | 0.78 | 0.31 | 0.53 | 0.50 | 0.91 | 1.03 | 0.19 | 0.19 |
| empty | 0 | workshop-fighter | workshop-fighter | left | 0.84 | 0.53 | 1.38 | 0.88 | 4.63 | 2.44 | 0.00 | 0.00 | 0.63 | 0.44 |
| empty | 0 | workshop-fighter | workshop-fighter | right | 0.59 | 0.50 | 1.06 | 0.78 | 5.19 | 4.03 | 0.00 | 0.00 | 0.63 | 0.50 |
| empty | 0 | workshop-fighter | workshop-rogue | left | 55.81 | 60.66 | 597.72 | 637.81 | 876.28 | 883.50 | 0.00 | 0.00 | 130.31 | 132.00 |
| empty | 0 | workshop-fighter | workshop-rogue | right | 341.00 | 348.59 | 39.13 | 43.09 | 1241.72 | 1282.88 | 0.00 | 0.00 | 38.28 | 44.88 |
| empty | 0 | workshop-rogue | workshop-fighter | left | 23.94 | 22.59 | 3.47 | 3.25 | 83.75 | 76.91 | 0.00 | 0.00 | 2.28 | 3.09 |
| empty | 0 | workshop-rogue | workshop-fighter | right | 3.25 | 3.69 | 40.56 | 40.25 | 58.94 | 57.19 | 0.00 | 0.00 | 10.69 | 9.41 |
| empty | 0 | workshop-rogue | workshop-rogue | left | 14.59 | 14.91 | 183.06 | 180.56 | 429.69 | 428.41 | 0.00 | 0.00 | 195.94 | 193.41 |
| empty | 0 | workshop-rogue | workshop-rogue | right | 16.78 | 15.72 | 169.16 | 168.50 | 445.13 | 435.03 | 0.00 | 0.00 | 192.22 | 191.03 |
| empty | 24 | workshop-fighter | workshop-fighter | left | 0.22 | 0.31 | 0.50 | 0.59 | 6.50 | 5.09 | 0.00 | 0.00 | 0.78 | 0.75 |
| empty | 24 | workshop-fighter | workshop-fighter | right | 0.41 | 0.38 | 0.50 | 0.84 | 6.69 | 5.19 | 0.00 | 0.00 | 0.41 | 0.72 |
| empty | 24 | workshop-fighter | workshop-rogue | left | 55.28 | 56.00 | 568.69 | 593.50 | 856.91 | 850.97 | 0.00 | 0.00 | 120.09 | 118.13 |
| empty | 24 | workshop-fighter | workshop-rogue | right | 307.03 | 315.50 | 40.19 | 40.25 | 1210.78 | 1224.16 | 0.00 | 0.00 | 42.97 | 35.16 |
| empty | 24 | workshop-rogue | workshop-fighter | left | 10.75 | 8.03 | 1.72 | 1.50 | 42.66 | 37.63 | 0.00 | 0.00 | 0.72 | 1.03 |
| empty | 24 | workshop-rogue | workshop-fighter | right | 1.94 | 1.06 | 20.38 | 16.47 | 27.88 | 27.56 | 0.00 | 0.00 | 5.66 | 5.06 |
| empty | 24 | workshop-rogue | workshop-rogue | left | 10.63 | 6.19 | 112.13 | 93.25 | 249.19 | 232.03 | 0.00 | 0.00 | 108.66 | 106.34 |
| empty | 24 | workshop-rogue | workshop-rogue | right | 7.16 | 3.59 | 101.81 | 80.88 | 263.28 | 213.66 | 0.00 | 0.00 | 108.34 | 95.03 |

The bar: covering saves the head at d over 0.2 in 1 of 32 cells, and in 0 of them with no more falls; the least d is -0.43.

The same with clubs on fresh gaps, the sequence from its 1000th (`--from 1000 --held club`),
3.06 to 4.99 m: the first threat of the [sweep](#sweep-1).

| Held | Delay | Left | Right | Covers | Gaps | Head HP, pose | cover | Saved | d | HP, pose | cover | d | Fell, pose | cover | Won, pose | cover | Seconds, pose | cover |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | 0 | workshop-fighter | workshop-fighter | left | 32 | 0.190 | 0.121 | 0.069 | 0.24 | 0.332 | 0.297 | 0.12 | 0.16 | 0.22 | 0.72 | 0.69 | 9.0 | 9.9 |
| club | 0 | workshop-fighter | workshop-fighter | right | 32 | 0.118 | 0.075 | 0.044 | 0.18 | 0.257 | 0.207 | 0.16 | 0.66 | 0.66 | 0.28 | 0.31 | 9.0 | 9.9 |
| club | 0 | workshop-fighter | workshop-rogue | left | 32 | 0.000 | 0.001 | -0.001 | -0.11 | 0.087 | 0.047 | 0.27 | 0.06 | 0.09 | 0.94 | 0.91 | 14.6 | 12.4 |
| club | 0 | workshop-fighter | workshop-rogue | right | 32 | 0.611 | 0.486 | 0.125 | 0.32 | 0.894 | 0.766 | 0.27 | 0.22 | 0.25 | 0.06 | 0.16 | 14.6 | 12.6 |
| club | 0 | workshop-rogue | workshop-fighter | left | 32 | 0.292 | 0.317 | -0.026 | -0.07 | 0.432 | 0.420 | 0.03 | 0.22 | 0.16 | 0.50 | 0.44 | 10.5 | 9.1 |
| club | 0 | workshop-rogue | workshop-fighter | right | 32 | 0.018 | 0.019 | -0.002 | -0.13 | 0.062 | 0.046 | 0.14 | 0.47 | 0.50 | 0.50 | 0.47 | 10.5 | 11.7 |
| club | 0 | workshop-rogue | workshop-rogue | left | 32 | 0.001 | 0.000 | 0.001 | 0.24 | 0.031 | 0.011 | 0.19 | 0.41 | 0.50 | 0.59 | 0.50 | 14.5 | 14.5 |
| club | 0 | workshop-rogue | workshop-rogue | right | 32 | 0.043 | 0.042 | 0.001 | 0.08 | 0.091 | 0.114 | -0.22 | 0.53 | 0.38 | 0.41 | 0.56 | 14.5 | 15.6 |
| club | 24 | workshop-fighter | workshop-fighter | left | 32 | 0.194 | 0.194 | 0.000 | 0.00 | 0.276 | 0.271 | 0.18 | 0.09 | 0.19 | 0.72 | 0.63 | 10.2 | 9.0 |
| club | 24 | workshop-fighter | workshop-fighter | right | 32 | 0.179 | 0.136 | 0.043 | 0.26 | 0.414 | 0.346 | 0.30 | 0.53 | 0.53 | 0.28 | 0.31 | 10.2 | 7.9 |
| club | 24 | workshop-fighter | workshop-rogue | left | 32 | 0.000 | 0.000 | 0.000 | 0.00 | 0.064 | 0.064 | -0.01 | 0.06 | 0.16 | 0.94 | 0.84 | 13.3 | 14.0 |
| club | 24 | workshop-fighter | workshop-rogue | right | 32 | 0.175 | 0.162 | 0.013 | 0.18 | 0.705 | 0.667 | 0.15 | 0.69 | 0.72 | 0.06 | 0.03 | 13.3 | 11.6 |
| club | 24 | workshop-rogue | workshop-fighter | left | 32 | 0.108 | 0.167 | -0.059 | -0.26 | 0.562 | 0.593 | -0.15 | 0.34 | 0.31 | 0.41 | 0.38 | 10.4 | 9.6 |
| club | 24 | workshop-rogue | workshop-fighter | right | 32 | 0.000 | 0.000 | -0.000 | -0.18 | 0.049 | 0.050 | -0.03 | 0.41 | 0.44 | 0.59 | 0.56 | 10.4 | 9.6 |
| club | 24 | workshop-rogue | workshop-rogue | left | 32 | 0.003 | 0.020 | -0.018 | -0.25 | 0.038 | 0.028 | 0.08 | 0.41 | 0.63 | 0.59 | 0.31 | 17.2 | 14.1 |
| club | 24 | workshop-rogue | workshop-rogue | right | 32 | 0.015 | 0.015 | 0.000 | 0.17 | 0.064 | 0.039 | 0.30 | 0.59 | 0.56 | 0.41 | 0.44 | 17.2 | 14.2 |
| club | 0 | every | pair | either | 256 | 0.159 | 0.133 | 0.026 | 0.11 | 0.273 | 0.238 | 0.12 | 0.34 | 0.34 | 0.50 | 0.50 | 12.1 | 12.0 |
| club | 24 | every | pair | either | 256 | 0.084 | 0.087 | -0.003 | -0.02 | 0.272 | 0.257 | 0.09 | 0.39 | 0.44 | 0.50 | 0.44 | 12.8 | 11.2 |
| every | delay | every | pair | either | 512 | 0.122 | 0.110 | 0.012 | 0.06 | 0.273 | 0.248 | 0.11 | 0.37 | 0.39 | 0.50 | 0.47 | 12.5 | 11.6 |

| Held | Delay | Left | Right | Covers | head, pose | cover | trunk, pose | cover | arm, pose | cover | item, pose | cover | other, pose | cover |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | 0 | workshop-fighter | workshop-fighter | left | 0.97 | 0.66 | 0.31 | 0.41 | 2.66 | 2.81 | 2.16 | 2.03 | 0.22 | 0.09 |
| club | 0 | workshop-fighter | workshop-fighter | right | 0.72 | 0.41 | 0.22 | 0.44 | 2.97 | 1.31 | 2.25 | 2.31 | 0.16 | 0.22 |
| club | 0 | workshop-fighter | workshop-rogue | left | 0.06 | 0.03 | 0.19 | 0.13 | 0.88 | 1.09 | 3.13 | 2.44 | 0.03 | 0.13 |
| club | 0 | workshop-fighter | workshop-rogue | right | 1.13 | 1.06 | 0.63 | 0.38 | 0.94 | 1.94 | 1.25 | 0.97 | 0.34 | 0.34 |
| club | 0 | workshop-rogue | workshop-fighter | left | 0.81 | 0.75 | 0.41 | 0.28 | 0.97 | 0.97 | 1.13 | 0.81 | 0.19 | 0.25 |
| club | 0 | workshop-rogue | workshop-fighter | right | 0.06 | 0.13 | 0.34 | 0.22 | 0.78 | 0.75 | 2.22 | 2.44 | 0.09 | 0.09 |
| club | 0 | workshop-rogue | workshop-rogue | left | 0.16 | 0.00 | 0.41 | 0.09 | 0.34 | 0.66 | 1.94 | 1.66 | 0.13 | 0.19 |
| club | 0 | workshop-rogue | workshop-rogue | right | 0.13 | 0.16 | 0.06 | 0.31 | 1.09 | 0.41 | 1.16 | 0.81 | 0.53 | 0.72 |
| club | 24 | workshop-fighter | workshop-fighter | left | 0.25 | 0.25 | 0.09 | 0.09 | 0.78 | 0.72 | 1.75 | 1.44 | 0.06 | 0.06 |
| club | 24 | workshop-fighter | workshop-fighter | right | 0.69 | 0.50 | 0.41 | 0.28 | 1.16 | 1.13 | 0.53 | 0.53 | 0.16 | 0.13 |
| club | 24 | workshop-fighter | workshop-rogue | left | 0.00 | 0.00 | 0.34 | 0.28 | 1.00 | 0.94 | 2.34 | 2.63 | 0.34 | 0.50 |
| club | 24 | workshop-fighter | workshop-rogue | right | 0.66 | 0.44 | 0.47 | 0.53 | 0.88 | 0.84 | 1.50 | 1.03 | 0.53 | 0.50 |
| club | 24 | workshop-rogue | workshop-fighter | left | 0.34 | 0.38 | 0.50 | 0.41 | 0.53 | 0.34 | 0.78 | 0.72 | 0.44 | 0.31 |
| club | 24 | workshop-rogue | workshop-fighter | right | 0.00 | 0.03 | 0.09 | 0.13 | 0.44 | 0.75 | 1.91 | 1.63 | 0.16 | 0.19 |
| club | 24 | workshop-rogue | workshop-rogue | left | 0.13 | 0.06 | 0.19 | 0.03 | 0.22 | 0.09 | 1.63 | 1.69 | 0.28 | 0.06 |
| club | 24 | workshop-rogue | workshop-rogue | right | 0.16 | 0.19 | 0.34 | 0.31 | 0.75 | 0.81 | 0.94 | 0.72 | 0.25 | 0.31 |

The bar: covering saves the head at d over 0.2 in 4 of 16 cells, and in 1 of them with no more falls; the least d is -0.26.

- **The bar is missed on both sets.** Pooled over every cell the head's d is -0.03 on the
  first gaps (1024 pairs) and 0.06 on the fresh ones (512 pairs, clubs), and all the hit points
  lost read -0.04 and 0.11. The covering side falls in 0.38 and 0.39 of its bouts where the pose
  falls in 0.37, and wins 0.48 and 0.47.
- **A cell of 32 gaps is noise.** The Warrior against the Rogue with the Rogue covering, clubs,
  nothing delayed, reads d -0.43 on the first gaps and 0.32 on the fresh ones. The pooled rows
  are what is read; the sets of 384 gaps the bar was written for were not played, since no
  pooled row on either set comes near 0.2.
- **Fewer blows meet the head, and it loses no less.** In the Warriors' mirror with clubs on
  the first gaps the covering side's head meets 0.50 and 0.53 blows a bout where it met 0.75
  and 0.97, and loses 0.174 and 0.141 HP where it lost 0.134 and 0.140.
- **Bare-handed there is nothing to save.** A head loses 0.000 to 0.098 HP a bout to bare hands
  either way, and the pooled d is -0.08 and 0.01.
- **Fighters go on in the pose** (`FIGHTER.guard`). The cover is a skill a config asks for
  (`&guard=cover` on the arena's address); why it does not save the head is in
  [How late a cover is](#how-late-a-cover-is).
