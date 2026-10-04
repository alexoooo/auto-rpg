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

- **Another body's strikes put a body down whether or not they land.** The Rogue with the
  club and the skeleton, which threw the Warrior's recipes on that tree, land nothing here and
  fall within five targets.
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
heights a recipe is thrown at are its window's
([human-and-strikes.md](human-and-strikes.md#windows)).

The tables of this section were read at `80e5cec9`, on the repertoire of that tree
(`assets/core/strikes.json@80e5cec9`: the Warrior's straight and club blow, the Rogue's
straight, each with a window in height alone, and each thrown by any body whose hand held the
same), and say what a placed blow does. What a hand throws at each target now:
[Searched](#searched).

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
- **A fist's window was narrower than its blow.** The windows of that tree were read as the
  fist's point through a sphere of the head's radius with no body at it
  (`docs/reference/human-and-strikes.md@80e5cec9`, Window height), which a point that passes a
  radius off misses. A fist and the forearm behind it have a size: a dummy 4, 8 and 14 cm under
  the Warrior's head takes 10.9, 10.2 and 6.1 J of his straight, and there, under that window,
  the skill placed 0.4 to 0.7 J. The Rogue's window, 6 cm under to 8 over, was nearer its
  blow's: 4.9 to 6.4 J from 4 cm under to 6 over, 2.6 and 2.9 J at 8 under and 10 over. A
  window is read from the blow's own damage since ([Windows](human-and-strikes.md#windows)).
- **Another body's recipe is thrown where a placed blow would land.** The Rogue with the club
  threw the Warrior's swing at every height its window held, and it passes 0.5 to 0.7 m off;
  placed, the Rogue's swell lands 4.8 to 10.4 J from 50 cm under its head to 14 cm over. A hand
  throws its own body's recipes alone since ([Another body's recipe](#another-bodys-recipe)).

### The battery, placed

`node research/core-targets.mjs --each` on the tree `PLACED` is in, beside
[At 100 J](#at-100-j): same harness. No reading was closed by a fall and no target went unread;
23 of the 180 runs fell walking back from their target after its reading (the Warrior's 1, the
Rogue's 5 and the skeleton's 17). It is the table a change is read against from here.

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

On the repertoire of `assets/core/strikes.json@80e5cec9`, as are [How late a cover
is](#how-late-a-cover-is) and the [sweep](#sweep-1); on the searched one,
[Covering, searched](#covering-searched).

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

## Searched

A recipe is searched for a cell: a body, what its right hand holds, and a height band
(`BANDS`: high, where a foe of the body's own build has its head; middle, its upper trunk).
`research/core-strike-search.mjs` is a cross-entropy search over the strikes a candidate stands
for (a chamber pose and its time, a push on each freedom that may push, and how far ahead the
target stands; a fist's blow has no chamber). A candidate is thrown through the strike skill,
standing from the guard, at a target body: a ball of the band's part, of the thrower's own
build, hung at the band's height (`evaluateBlow`, `research/core-blow.mjs`). Its score is
what the rule a fight wounds by reads (`scoreOf`): the hit points the blow does the target less
those it costs the body that throws it; under any hit, a miss, by how near it passed; and under
any miss, a blow that leaves its body down or not standing on both feet a second after
(`FELL`), whether thrown at the target or at nothing. A candidate's score is its mean over four
throws, one as written and three perturbed, and one more thrown at nothing. 30 generations of
64 candidates, at 120 Hz; the best is read again as the mean of eight throws at 120, 480 and
1920 Hz. Node core stand, Rapier, standing on its feet as built, ground on, no assist; the
arena's rulebook.

Three searches a cell, 36 in all, each going on from a recipe of the repertoire before
(`assets/core/strikes.json@80e5cec9`: the Warrior's club blow and straight, the Rogue's
straight) with a spread of its own, or from nothing. A search is 9600 throws and its replay:
4 to 10 minutes on 24 worker threads of a 16-core desktop, and the 36 took 4 h 5 min one after
another, other measurements sharing the machine. The windows after them are 18,800 throws more,
about 2 h on 8 threads. The skeleton's twelve were searched again once its thighs and upper arms
were built clear of each other (`eb1865a1`), each going on from its own cell's recipe of
`assets/core/strikes.json@f25369bf`, at spreads 0.2, 0.4 and 0.6; its rows are those.

### The searches

What each search's best strike read on replay, the mean of eight throws at each rate: what it
nets, does its target and costs its own body (HP), in how many of the eight it landed and in
how many its body stood a second after, and whether it stands thrown once at nothing.

| Body | Held | Band | Seed | From | Spread | Searched, HP | 120 Hz: net | done | cost | landed | stood | 480 Hz: net | done | cost | landed | stood | 1920 Hz: net | done | cost | landed | stood | At nothing, 120, 480, 1920 Hz | The cell's |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | wooden club | high | 1 | Warrior's, high | 0.2 | 1.181 | 1.107 | 1.107 | 0.000 | 8 | 8 | 1.117 | 1.117 | 0.000 | 8 | 8 | 0.864 | 0.864 | 0.000 | 8 | 8 | stands, falls, stands | yes |
| Warrior | wooden club | high | 2 | Warrior's, high | 0.4 | 1.073 | 1.038 | 1.038 | 0.000 | 8 | 8 | 0.899 | 0.899 | 0.000 | 8 | 8 | 0.903 | 0.903 | 0.000 | 8 | 8 | stands, stands, stands |  |
| Warrior | wooden club | high | 3 | Warrior's, high | 0.6 | 1.063 | 0.720 | 0.720 | 0.000 | 8 | 7 | 1.036 | 1.036 | 0.000 | 8 | 8 | 1.026 | 1.026 | 0.000 | 8 | 8 | stands, stands, stands |  |
| Warrior | wooden club | middle | 1 | Warrior's, high | 0.2 | 1.401 | 1.370 | 1.370 | 0.000 | 8 | 8 | 1.315 | 1.315 | 0.000 | 8 | 8 | 1.320 | 1.320 | 0.000 | 8 | 8 | stands, stands, stands |  |
| Warrior | wooden club | middle | 2 | Warrior's, high | 0.4 | 1.428 | 1.417 | 1.417 | 0.000 | 8 | 8 | 1.315 | 1.315 | 0.000 | 8 | 8 | 1.323 | 1.323 | 0.000 | 8 | 8 | stands, stands, falls | yes |
| Warrior | wooden club | middle | 3 | Warrior's, high | 0.6 | 1.416 | 1.342 | 1.342 | 0.000 | 8 | 8 | 1.353 | 1.353 | 0.000 | 8 | 8 | 1.344 | 1.344 | 0.000 | 8 | 8 | stands, stands, stands |  |
| Warrior | fist | high | 1 | Warrior's, high | 0.3 | 0.009 | 0.005 | 0.028 | 0.023 | 6 | 8 | 0.007 | 0.037 | 0.030 | 7 | 8 | 0.007 | 0.039 | 0.032 | 8 | 8 | stands, stands, stands |  |
| Warrior | fist | high | 2 | Warrior's, high | 0.6 | 0.023 | 0.022 | 0.121 | 0.099 | 8 | 8 | 0.020 | 0.108 | 0.088 | 8 | 8 | 0.021 | 0.112 | 0.092 | 8 | 4 | stands, stands, stands | yes |
| Warrior | fist | high | 3 | nothing | - | 0.001 | 0.001 | 0.004 | 0.003 | 8 | 8 | 0.001 | 0.003 | 0.003 | 8 | 8 | 0.001 | 0.003 | 0.003 | 8 | 8 | stands, stands, stands |  |
| Warrior | fist | middle | 1 | Warrior's, high | 0.3 | 0.472 | 0.352 | 0.390 | 0.038 | 8 | 8 | 0.267 | 0.294 | 0.027 | 8 | 8 | 0.284 | 0.313 | 0.029 | 8 | 8 | stands, stands, stands |  |
| Warrior | fist | middle | 2 | Warrior's, high | 0.6 | 0.550 | 0.507 | 0.567 | 0.060 | 8 | 8 | 0.325 | 0.356 | 0.031 | 8 | 8 | 0.336 | 0.368 | 0.033 | 8 | 8 | stands, stands, stands | yes |
| Warrior | fist | middle | 3 | nothing | - | 0.540 | 0.495 | 0.551 | 0.055 | 8 | 8 | 0.273 | 0.307 | 0.034 | 8 | 8 | 0.302 | 0.340 | 0.038 | 8 | 8 | stands, stands, stands |  |
| Rogue | wooden club | high | 1 | Warrior's, high | 0.2 | 0.467 | 0.433 | 0.433 | 0.000 | 8 | 8 | 0.466 | 0.466 | 0.000 | 8 | 8 | 0.458 | 0.458 | 0.000 | 8 | 8 | stands, falls, falls | yes |
| Rogue | wooden club | high | 2 | Warrior's, high | 0.4 | 0.439 | 0.420 | 0.420 | 0.000 | 8 | 7 | 0.392 | 0.392 | 0.000 | 8 | 8 | 0.357 | 0.357 | 0.000 | 8 | 8 | stands, falls, falls |  |
| Rogue | wooden club | high | 3 | Warrior's, high | 0.6 | 0.310 | 0.293 | 0.293 | 0.000 | 8 | 8 | 0.274 | 0.274 | 0.000 | 8 | 8 | 0.266 | 0.266 | 0.000 | 8 | 8 | stands, stands, stands |  |
| Rogue | wooden club | middle | 1 | Warrior's, high | 0.2 | 0.526 | 0.500 | 0.500 | 0.000 | 8 | 8 | 0.058 | 0.058 | 0.000 | 5 | 8 | 0.185 | 0.185 | 0.000 | 8 | 8 | stands, stands, stands |  |
| Rogue | wooden club | middle | 2 | Warrior's, high | 0.4 | 0.554 | 0.528 | 0.528 | 0.000 | 8 | 8 | 0.563 | 0.563 | 0.000 | 8 | 8 | 0.585 | 0.585 | 0.000 | 8 | 8 | stands, falls, stands | yes |
| Rogue | wooden club | middle | 3 | Warrior's, high | 0.6 | 0.375 | 0.363 | 0.363 | 0.000 | 8 | 8 | 0.364 | 0.364 | 0.000 | 8 | 8 | 0.370 | 0.370 | 0.000 | 8 | 8 | stands, stands, stands |  |
| Rogue | fist | high | 1 | Rogue's, high | 0.3 | 0.007 | 0.007 | 0.047 | 0.041 | 8 | 8 | 0.007 | 0.046 | 0.040 | 8 | 8 | 0.007 | 0.046 | 0.039 | 8 | 8 | stands, stands, stands | yes |
| Rogue | fist | high | 2 | Rogue's, high | 0.6 | 0.013 | 0.006 | 0.068 | 0.062 | 8 | 8 | 0.006 | 0.051 | 0.045 | 8 | 8 | 0.008 | 0.044 | 0.035 | 8 | 8 | stands, stands, stands |  |
| Rogue | fist | high | 3 | nothing | - | 0.002 | 0.002 | 0.010 | 0.008 | 8 | 8 | 0.000 | 0.001 | 0.001 | 8 | 8 | -0.000 | 0.001 | 0.001 | 8 | 8 | stands, stands, stands |  |
| Rogue | fist | middle | 1 | Rogue's, high | 0.3 | 0.304 | 0.225 | 0.252 | 0.027 | 8 | 8 | 0.132 | 0.144 | 0.012 | 8 | 8 | 0.146 | 0.160 | 0.014 | 8 | 8 | stands, stands, stands | yes |
| Rogue | fist | middle | 2 | Rogue's, high | 0.6 | 0.122 | 0.120 | 0.131 | 0.011 | 8 | 8 | 0.000 | 0.000 | 0.000 | 0 | 8 | 0.000 | 0.000 | 0.000 | 0 | 8 | stands, stands, stands |  |
| Rogue | fist | middle | 3 | nothing | - | 0.127 | 0.125 | 0.137 | 0.012 | 8 | 8 | 0.103 | 0.113 | 0.009 | 8 | 8 | 0.070 | 0.077 | 0.006 | 8 | 8 | stands, stands, stands |  |
| skeleton | wooden club | high | 1 | skeleton's, high | 0.2 | 0.798 | 0.735 | 0.735 | 0.000 | 8 | 8 | 0.827 | 0.827 | 0.000 | 8 | 8 | 0.822 | 0.822 | 0.000 | 8 | 8 | stands, stands, stands | yes |
| skeleton | wooden club | high | 2 | skeleton's, high | 0.4 | 0.873 | 0.872 | 0.872 | 0.000 | 8 | 8 | 0.549 | 0.549 | 0.000 | 8 | 3 | 0.566 | 0.566 | 0.000 | 8 | 3 | stands, stands, falls |  |
| skeleton | wooden club | high | 3 | skeleton's, high | 0.6 | 0.721 | 0.670 | 0.670 | 0.000 | 8 | 8 | 0.487 | 0.487 | 0.000 | 8 | 1 | 0.491 | 0.491 | 0.000 | 8 | 1 | stands, falls, stands |  |
| skeleton | wooden club | middle | 1 | skeleton's, middle | 0.2 | 1.095 | 1.061 | 1.061 | 0.000 | 8 | 8 | 1.046 | 1.046 | 0.000 | 8 | 8 | 1.053 | 1.053 | 0.000 | 8 | 8 | stands, stands, stands |  |
| skeleton | wooden club | middle | 2 | skeleton's, middle | 0.4 | 1.087 | 0.958 | 0.958 | 0.000 | 8 | 6 | 1.075 | 1.075 | 0.000 | 8 | 3 | 1.083 | 1.083 | 0.000 | 8 | 5 | stands, stands, stands |  |
| skeleton | wooden club | middle | 3 | skeleton's, middle | 0.6 | 1.119 | 1.112 | 1.112 | 0.000 | 8 | 8 | 1.011 | 1.011 | 0.000 | 8 | 8 | 0.938 | 0.938 | 0.000 | 8 | 8 | stands, stands, stands | yes |
| skeleton | fist | high | 1 | skeleton's, high | 0.2 | 0.036 | 0.034 | 0.183 | 0.149 | 8 | 8 | 0.031 | 0.171 | 0.140 | 8 | 8 | 0.032 | 0.173 | 0.142 | 8 | 8 | stands, stands, stands | yes |
| skeleton | fist | high | 2 | skeleton's, high | 0.4 | 0.031 | 0.010 | 0.143 | 0.133 | 8 | 8 | 0.011 | 0.197 | 0.187 | 8 | 8 | 0.020 | 0.191 | 0.171 | 8 | 8 | stands, stands, stands |  |
| skeleton | fist | high | 3 | skeleton's, high | 0.6 | 0.031 | 0.027 | 0.146 | 0.119 | 8 | 8 | 0.027 | 0.150 | 0.123 | 8 | 8 | 0.026 | 0.152 | 0.126 | 8 | 8 | stands, stands, stands |  |
| skeleton | fist | middle | 1 | skeleton's, middle | 0.2 | 0.774 | 0.674 | 0.754 | 0.079 | 8 | 8 | 0.382 | 0.415 | 0.033 | 8 | 8 | 0.354 | 0.382 | 0.028 | 8 | 8 | stands, stands, stands | yes |
| skeleton | fist | middle | 2 | skeleton's, middle | 0.4 | 0.687 | 0.587 | 0.653 | 0.067 | 8 | 8 | 0.423 | 0.465 | 0.042 | 8 | 8 | 0.416 | 0.456 | 0.041 | 8 | 8 | stands, stands, stands |  |
| skeleton | fist | middle | 3 | skeleton's, middle | 0.6 | 0.658 | 0.580 | 0.647 | 0.067 | 8 | 8 | 0.373 | 0.409 | 0.036 | 8 | 8 | 0.380 | 0.416 | 0.036 | 8 | 8 | stands, stands, stands |  |

- **A fist at a head nets about nothing.** A head is stiffer than a hand
  ([wounds.md](wounds.md#shares)), and every one of the nine searches costs its hand 0.8 to
  0.9 of what it does the head, or all of it: they net 0.000 to 0.034 HP. The hardest of them
  cost their hands more than the hands hold: the Warrior's does a head 0.121 HP and its own
  hand 0.099, and its hand holds 0.088; the skeleton's 0.183 and 0.149.
- **At an upper trunk the same hands net 0.12 to 0.67 HP**, a tenth of what they do coming back
  on them.
- **A blow found at 120 Hz is another blow at a finer step.** The Rogue's club at a trunk,
  seed 1, nets 0.500 HP at 120 Hz, 0.058 at 480 (5 of 8 landing) and 0.185 at 1920; its fist
  at a trunk, seed 2, lands 8 of 8 at 120 Hz and none at 480 or 1920. The other fists at a
  trunk net at 480 Hz 0.55 to 0.82 of what they net at 120.
- **Thrown at nothing, seven stand at 120 Hz and fall at a finer step**: the Warrior's club at a
  head (seed 1) and at a trunk (seed 2), the Rogue's at a head (seeds 1 and 2) and at a trunk
  (seed 2), and the skeleton's at a head (seeds 2 and 3). A search throws at nothing at its own
  rate alone. Four of the seven are their cells' recipes.

### The repertoire

Of a cell's three searches the one that nets most on replay at 120 Hz is its recipe
(`research/core-strike-repertoire.mjs`), kept only where it nets more than a placed blow at the
same target, read by the same evaluator (`keeps`), and where its window is wide enough for the
feet to be set to ([human-and-strikes.md](human-and-strikes.md#a-recipe-the-feet-cannot-be-set-to)).
A cell with no recipe is thrown at by placement.

| Body | Held | Band | Target ahead, m | up, m | Net at 120 Hz, HP | at 480 | at 1920 | The placed blow's net, HP | Window along, cm | across | up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | wooden club | high | 0.932 | 0.000 | 1.107 | 1.117 | 0.864 | 0.118 | -2 to 12 | -4 to 2 | -6 to 12 |
| Warrior | wooden club | middle | 1.071 | -0.240 | 1.249 | 1.349 | 1.370 | 0.165 | -14 to 12 | -6 to 6 | -30 to 26 |
| Warrior | fist | high | 0.372 | 0.000 | 0.024 | 0.024 | 0.024 | -0.002 | -4 to 4 | -10 to 14 | -8 to 10 |
| Warrior | fist | middle | 0.617 | -0.240 | 0.507 | 0.325 | 0.336 | 0.003 | -2 to 2 | -8 to 2 | -36 to 20 |
| Rogue | wooden club | high | 0.938 | 0.000 | 0.433 | 0.466 | 0.458 | 0.116 | -14 to 6 | -2 to 6 | -8 to 8 |
| Rogue | wooden club | middle | 0.850 | -0.231 | 0.503 | 0.380 | 0.434 | 0.119 | -10 to 12 | -6 to 2 | -46 to 26 |
| Rogue | fist | high | 0.437 | 0.000 | 0.007 | 0.007 | 0.007 | -0.001 | -6 to 8 | -2 to 6 | -12 to 6 |
| Rogue | fist | middle | 0.575 | -0.231 | 0.225 | 0.132 | 0.146 | 0.001 | -4 to 2 | -6 to 2 | -14 to 20 |
| skeleton | wooden club | high | 0.819 | 0.000 | 0.735 | 0.827 | 0.822 | 0.000 | -2 to 2 | -4 to 4 | -14 to 20 |
| skeleton | wooden club | middle | 1.060 | -0.248 | 1.112 | 1.011 | 0.938 | 0.000 | -18 to 6 | -2 to 4 | -14 to 14 |
| skeleton | fist | high | 0.530 | 0.000 | 0.034 | 0.031 | 0.032 | 0.000 | -2 to 6 | -4 to 4 | -28 to 18 |
| skeleton | fist | middle | 0.645 | -0.248 | 0.674 | 0.382 | 0.354 | 0.024 | -2 to 6 | 0 to 6 | -28 to 36 |

Every cell has a recipe. The skeleton's club blow at a head is its search of seed 1: seed 2's
nets more (0.872 HP), and leaves the skeleton down in throws about its own place, most at
480 Hz, so its window is narrower than the 4 cm the feet are set to (`assets/core/strikes.json`,
`passed`).

### Another body's recipe

A hand throws its own body's recipes and no other's (`recipesFor`). A recipe is a table of one
body's muscles' pushes, timed for that body's lengths, and thrown by another it passes its
target:

- the Rogue with the club, throwing the Warrior's club blow, passes its targets 0.5 to 0.7 m
  off at every height, where its placed blow lands 4.8 to 10.4 J
  ([Against a recipe](#against-a-recipe));
- on the targets' battery (`node research/core-targets.mjs --each`, the Warrior and the Rogue,
  30 targets each, bare-handed; the repertoire with one throw a stand-off in its windows), with
  each hand given the other body's recipes after its own and with its own alone:

| Body | Stratum | Targets | Hit, with the other's too | with its own alone | Damage, HP, mean: with the other's too | its own alone |
|---|---|---|---|---|---|---|
| Warrior | high | 9 | 8 | 9 | 0.042 | 0.035 |
| Warrior | middle | 9 | 9 | 9 | 0.078 | 0.082 |
| Rogue | high | 9 | 9 | 9 | 0.034 | 0.034 |
| Rogue | middle | 9 | 4 | 9 | 0.013 | 0.006 |

The Rogue's five missed middle targets are thrown at with the Warrior's straight at a trunk,
whose window holds a height the Rogue's own does not; its own hand, placing, strikes all nine.
With the club, each has both its recipes and throws no other's: the rows are the same.

### On a standing body

A search's target is the ball of one part, hung alone. `node research/core-blow-standing.mjs`
throws the same blows at a body: an arena bout in which the foe is ordered to stand,
bare-handed, and the body is ordered to attack its head or its upper trunk, from 2, 2.5 and 3 m
(Node, core world, Rapier, 120 Hz; no assist). A row is the three bouts: how high the point
stood over the attacker's head, how the blow was thrown (one entry where the three agree), the
mean of the hit points the foe and the thrower lost from the order to a second after the blow,
and the hardest blow of the three. Nobody went down in any of the 72.

| Body | Held | Ordered at | Foe | Up, m | Thrown, by gap | Foe lost, HP | Thrower lost, HP | Hardest blow |
|---|---|---|---|---|---|---|---|---|
| Warrior | club | head | Warrior | 0.01 | high recipe | 0.879 | 0.000 | club on head, 104.1 J |
| Warrior | club | head | Rogue | -0.13 | middle recipe | 1.116 | 0.000 | club on head, 124.3 J |
| Warrior | club | upper trunk | Warrior | -0.23 | middle recipe | 0.692 | 0.000 | club on head, 97.8 J |
| Warrior | club | upper trunk | Rogue | -0.36 | middle recipe | 1.144 | 0.000 | club on head, 135.1 J |
| Warrior | fist | head | Warrior | 0.00 | high recipe; not thrown; not thrown | 0.011 | 0.013 | thigh.left on thigh.left, 1.1 J |
| Warrior | fist | head | Rogue | -0.14 | middle recipe | 0.115 | 0.169 | hand.right on head, 25.9 J |
| Warrior | fist | upper trunk | Warrior | -0.24 | middle recipe | 0.277 | 0.078 | forearm.right on upperTrunk, 24.3 J |
| Warrior | fist | upper trunk | Rogue | -0.37 | middle recipe | 0.135 | 0.151 | hand.right on head, 21.9 J |
| Rogue | club | head | Warrior | 0.15 | placed | 0.139 | 0.000 | club on upperTrunk, 12.2 J |
| Rogue | club | head | Rogue | 0.01 | high recipe | 0.384 | 0.000 | club on head, 40.0 J |
| Rogue | club | upper trunk | Warrior | -0.09 | middle recipe | 0.612 | 0.000 | club on upperTrunk, 50.8 J |
| Rogue | club | upper trunk | Rogue | -0.22 | middle recipe | 1.002 | 0.000 | club on upperTrunk, 56.8 J |
| Rogue | fist | head | Warrior | 0.14 | placed | 0.011 | 0.009 | foot.left on foot.left, 0.9 J |
| Rogue | fist | head | Rogue | 0.00 | high recipe | 0.060 | 0.032 | forearm.right on head, 3.8 J |
| Rogue | fist | upper trunk | Warrior | -0.10 | high recipe | 0.031 | 0.010 | forearm.right on upperTrunk, 2.1 J |
| Rogue | fist | upper trunk | Rogue | -0.23 | middle recipe | 0.054 | 0.057 | hand.right on head, 7.3 J |
| skeleton | club | head | Warrior | 0.18 | high recipe | 0.083 | 0.036 | hand.right on upperTrunk, 6.5 J |
| skeleton | club | head | Rogue | 0.04 | high recipe | 0.106 | 0.104 | hand.right on upperArm.left, 23.7 J |
| skeleton | club | upper trunk | Warrior | -0.06 | high recipe | 0.092 | 0.036 | hand.right on upperTrunk, 8.0 J |
| skeleton | club | upper trunk | Rogue | -0.19 | middle recipe | 0.313 | 0.000 | club on head, 32.3 J |
| skeleton | fist | head | Warrior | 0.18 | high recipe | 0.216 | 0.190 | hand.right on head, 21.8 J |
| skeleton | fist | head | Rogue | 0.04 | high recipe | 0.203 | 0.190 | hand.right on head, 31.9 J |
| skeleton | fist | upper trunk | Warrior | -0.06 | high recipe | 0.208 | 0.195 | hand.right on head, 26.4 J |
| skeleton | fist | upper trunk | Rogue | -0.19 | middle recipe | 0.149 | 0.091 | hand.right on head, 10.9 J |

- **The head is in a middle blow's way.** The Warrior's club blow at a trunk lands on the head
  of either foe, 0.69 and 1.14 HP, and its fist's on the Rogue's; the Rogue's and the skeleton's
  fists at a Rogue's trunk land on its head too. The Rogue's club blow at a trunk lands on the
  trunk, or on the arm before it.
- **A club blow does a standing body 0.3 to 1.1 HP and costs nothing**, where its club lands:
  the Warrior's four, the Rogue's at a Rogue's head and at either trunk, the skeleton's at a
  Rogue's trunk. A Warrior's head stands 15 cm over the Rogue's own, over its window, and its
  club is placed there, 0.14 HP.
- **The skeleton's club blow at a head lands its hand and not its club.** A Warrior's head
  (18 cm over its own), a Rogue's (4 cm over) and a Warrior's upper trunk (6 cm under) are in
  its window, and at each the club passes and the hand meets the foe's upper trunk (a
  Warrior's) or upper arm (a Rogue's), at 6 to 24 J: 0.08 to 0.13 HP to the foe and 0.04 to 0.10
  to the skeleton. At the ball of a head hung alone the same blow nets 0.735 HP
  ([The repertoire](#the-repertoire)).
- **A fist costs its thrower about what it does a standing body**: 0.12 against 0.17 HP for
  the Warrior's at a Rogue's head, 0.05 against 0.06 for the Rogue's at a Rogue's trunk, 0.09 to
  0.20 against 0.15 to 0.22 for the skeleton's. The Warrior's at a Warrior's trunk is the one that pays:
  its forearm on the trunk at 24 J, 0.28 HP against 0.08.
- **A fist's place at a head is among a standing foe's feet.** The Warrior's has its target
  0.372 m ahead of the head. Ordered at a standing Warrior's head from 2 m, the bare Warrior
  walks into its foe, sets its feet twice and throws 15 s after the order, a forearm on an
  upper arm at 0.6 J; from 2.5 and 3 m it has not thrown in 20 s. The skeleton's, 0.530 m
  ahead, is thrown at either foe's head from each gap.
- **A height at a window's edge reads either side of it.** The Warrior's fist at a head has
  a window from the head's own height up, and a standing Warrior's head stood 6.3 mm under
  the attacker's to 0.8 mm over from one stand to the next of that bout. The skill chooses a
  blow by the head as it stands once for a point attacked (`strikeSkill`); choosing at every
  stand, it stood for the recipe and for a placed blow in turn and threw neither.

### The battery, searched

`node research/core-targets.mjs --each` on the tree the searched repertoire is in, beside
[The battery, placed](#the-battery-placed): same harness, the same 180 targets. No reading was
closed by a fall and no target went unread; 6 of the 180 runs fell walking back from their
target after its reading (the Warrior's 1, the Rogue's 3 and the skeleton's 2), where 23 did.

| Body | Held | Stratum | Targets | Hit: placed | searched | Damage, HP, mean: placed | searched | least, searched | Missed by, cm, mean: placed | searched | Crowded |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty | control | 3 | 3 | 3 | 0.029 | 0.026 | 0.026 | - | - | 0 |
| Warrior | empty | high | 9 | 9 | 9 | 0.002 | 0.078 | 0.002 | - | - | 0 |
| Warrior | empty | middle | 9 | 9 | 9 | 0.002 | 0.080 | 0.002 | - | - | 0 |
| Warrior | empty | low | 9 | 1 | 1 | 0.002 | 0.003 | 0.003 | 26.6 | 25.9 | 5 |
| Warrior | club | control | 3 | 3 | 3 | 1.001 | 1.027 | 1.027 | - | - | 0 |
| Warrior | club | high | 9 | 9 | 9 | 0.827 | 0.908 | 0.096 | - | - | 0 |
| Warrior | club | middle | 9 | 8 | 8 | 0.108 | 0.520 | 0.058 | 0.0 | 0.0 | 0 |
| Warrior | club | low | 9 | 3 | 2 | 0.018 | 0.031 | 0.015 | 32.3 | 27.4 | 0 |
| Rogue | empty | control | 3 | 3 | 3 | 0.023 | 0.041 | 0.041 | - | - | 0 |
| Rogue | empty | high | 9 | 9 | 9 | 0.007 | 0.048 | 0.002 | - | - | 0 |
| Rogue | empty | middle | 9 | 9 | 9 | 0.001 | 0.006 | 0.001 | - | - | 0 |
| Rogue | empty | low | 9 | 1 | 1 | 0.001 | 0.001 | 0.001 | 30.3 | 30.1 | 6 |
| Rogue | club | control | 3 | 0 | 3 | - | 0.013 | 0.013 | 68.5 | - | 0 |
| Rogue | club | high | 9 | 0 | 8 | - | 0.376 | 0.149 | 61.0 | 2.5 | 0 |
| Rogue | club | middle | 9 | 1 | 9 | 0.007 | 0.221 | 0.005 | 61.4 | - | 0 |
| Rogue | club | low | 9 | 1 | 2 | 0.003 | 0.012 | 0.008 | 26.6 | 32.4 | 0 |
| Skeleton | empty | control | 3 | 0 | 3 | - | 0.090 | 0.090 | 18.3 | - | 0 |
| Skeleton | empty | high | 9 | 3 | 8 | 0.003 | 0.047 | 0.000 | 10.7 | 4.7 | 0 |
| Skeleton | empty | middle | 9 | 9 | 9 | 0.004 | 0.031 | 0.002 | - | - | 0 |
| Skeleton | empty | low | 9 | 1 | 2 | 0.009 | 0.007 | 0.006 | 20.1 | 15.6 | 5 |
| Skeleton | club | control | 3 | 0 | 3 | - | 0.460 | 0.460 | 28.4 | - | 0 |
| Skeleton | club | high | 9 | 0 | 9 | - | 0.325 | 0.225 | 23.8 | - | 0 |
| Skeleton | club | middle | 9 | 0 | 4 | - | 0.565 | 0.184 | 24.9 | 55.3 | 0 |
| Skeleton | club | low | 9 | 0 | 0 | - | - | - | 75.1 | 76.2 | 0 |

- **100 of the 108 high and middle targets are struck, where 66 were, and every control**, 18
  of 18 where 9 were. Each body with each thing held strikes 17 or 18 of its 18 high and
  middle targets, but the skeleton with the club, which strikes 13.
- **The skeleton's club misses the lower middle targets.** Its blow at a trunk has a window
  from 43 to 11 cm under its head; five of its nine middle targets hang 43 to 60 cm under,
  are thrown at by placement, and are passed 39 to 69 cm off, as every placed blow of its club
  is ([The battery, placed](#the-battery-placed)).
- **A recipe is thrown at 95 of the 180**: at every control, at 48 of the 54 high targets (20
  of them with the blow searched at a trunk, whose window holds a head under the body's own),
  at 29 of the 54 middle ones, and at no low one. The rest are placed.
- **The blows are harder.** The Warrior's fists do a high target 0.078 HP in the mean where
  they did 0.002 placed, and a middle one 0.080; its club a middle one 0.520 where it did
  0.108. The Rogue's club, which struck 1 of its 18 placed, strikes 17 at 0.376 and 0.221 HP.
- **The low targets are as they were**: 8 of 54 struck, 16 crowded.

### A loop of ten, searched

`node research/core-targets.mjs --list` on the same tree, as
[A loop of ten, placed](#a-loop-of-ten-placed).

| Body | Held | Runs that looped, of 3 | Targets read, of 30 | Hit | Crowded | The runs |
|---|---|---|---|---|---|---|
| Warrior | empty | 2 | 28 | 21 | 1 | seed 1: looped at 81.3 s; seed 2: fell (Setting its feet) at 52.8 s; seed 3: looped at 72.7 s |
| Warrior | club | 1 | 23 | 14 | 0 | seed 1: fell (Closing on its target) at 59.9 s; seed 2: fell (Closing on its target) at 16.2 s; seed 3: looped at 75.5 s |
| Rogue | empty | 3 | 30 | 21 | 4 | seed 1: looped at 71.2 s; seed 2: looped at 73.3 s; seed 3: looped at 67.0 s |
| Rogue | club | 0 | 12 | 6 | 0 | seed 1: fell (Closing on its target) at 15.6 s; seed 2: fell (Setting its feet) at 18.7 s; seed 3: fell (Setting its feet) at 31.8 s |
| Skeleton | empty | 3 | 30 | 19 | 6 | seed 1: looped at 93.2 s; seed 2: looped at 98.2 s; seed 3: looped at 95.5 s |
| Skeleton | club | 0 | 16 | 8 | 0 | seed 1: fell (Setting its feet) at 48.6 s; seed 2: fell (Setting its feet) at 54.6 s; seed 3: fell (Closing on its target) at 40.2 s |

With the hands empty 8 runs of 9 loop, where 7 did: the skeleton loops in all three where it
looped in one, and the Warrior falls in one, setting its feet for a target. With the club 1 run
of 9 loops, where 2 did: the Rogue falls within its first four targets in every run, the
skeleton in its fifth to seventh where it fell at its second, and the Warrior in two of three,
as it did. A club blow that lands turns the body that threw it, and it falls closing on its next
target or setting its feet for it.

### Covering, searched

`node research/core-guard.mjs --bouts 32` on the tree the searched repertoire is in, as the
first set of the [Guard battery](#guard-battery): the same 32 gaps, cells and bar. 1536 bouts
in 1015 s on 28 workers.

| Held | Delay | Left | Right | Covers | Gaps | Head HP, pose | cover | Saved | d | HP, pose | cover | d | Fell, pose | cover | Won, pose | cover | Seconds, pose | cover |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | 0 | workshop-fighter | workshop-fighter | left | 32 | 0.071 | 0.080 | -0.010 | -0.05 | 0.194 | 0.182 | 0.07 | 0.13 | 0.09 | 0.81 | 0.81 | 8.6 | 8.2 |
| club | 0 | workshop-fighter | workshop-fighter | right | 32 | 0.327 | 0.274 | 0.054 | 0.32 | 0.483 | 0.384 | 0.31 | 0.41 | 0.47 | 0.19 | 0.19 | 8.6 | 8.0 |
| club | 0 | workshop-fighter | workshop-rogue | left | 32 | 0.011 | 0.001 | 0.010 | 0.45 | 0.088 | 0.051 | 0.87 | 0.09 | 0.13 | 0.91 | 0.88 | 12.7 | 12.0 |
| club | 0 | workshop-fighter | workshop-rogue | right | 32 | 0.127 | 0.096 | 0.032 | 0.12 | 0.743 | 0.733 | 0.03 | 0.75 | 0.63 | 0.09 | 0.13 | 12.7 | 12.8 |
| club | 0 | workshop-rogue | workshop-fighter | left | 32 | 0.107 | 0.064 | 0.043 | 0.26 | 0.458 | 0.397 | 0.16 | 0.34 | 0.34 | 0.47 | 0.50 | 9.6 | 10.2 |
| club | 0 | workshop-rogue | workshop-fighter | right | 32 | 0.011 | 0.000 | 0.010 | 0.40 | 0.058 | 0.032 | 0.60 | 0.47 | 0.44 | 0.53 | 0.56 | 9.6 | 8.9 |
| club | 0 | workshop-rogue | workshop-rogue | left | 32 | 0.045 | 0.049 | -0.004 | -0.04 | 0.187 | 0.178 | 0.06 | 0.25 | 0.28 | 0.75 | 0.66 | 11.8 | 11.6 |
| club | 0 | workshop-rogue | workshop-rogue | right | 32 | 0.039 | 0.022 | 0.017 | 0.37 | 0.181 | 0.171 | 0.12 | 0.75 | 0.47 | 0.22 | 0.53 | 11.8 | 11.7 |
| club | 24 | workshop-fighter | workshop-fighter | left | 32 | 0.139 | 0.139 | -0.000 | -0.18 | 0.229 | 0.230 | -0.18 | 0.03 | 0.09 | 0.78 | 0.72 | 7.4 | 7.8 |
| club | 24 | workshop-fighter | workshop-fighter | right | 32 | 0.263 | 0.264 | -0.000 | -0.17 | 0.345 | 0.353 | -0.18 | 0.50 | 0.50 | 0.22 | 0.22 | 7.4 | 7.8 |
| club | 24 | workshop-fighter | workshop-rogue | left | 32 | 0.014 | 0.013 | 0.000 | 0.01 | 0.082 | 0.092 | -0.22 | 0.09 | 0.16 | 0.91 | 0.84 | 12.3 | 12.0 |
| club | 24 | workshop-fighter | workshop-rogue | right | 32 | 0.236 | 0.257 | -0.021 | -0.27 | 0.826 | 0.862 | -0.12 | 0.53 | 0.53 | 0.09 | 0.06 | 12.3 | 13.2 |
| club | 24 | workshop-rogue | workshop-fighter | left | 32 | 0.128 | 0.188 | -0.059 | -0.32 | 0.450 | 0.466 | -0.06 | 0.34 | 0.34 | 0.47 | 0.41 | 8.3 | 8.3 |
| club | 24 | workshop-rogue | workshop-fighter | right | 32 | 0.002 | 0.001 | 0.001 | 0.26 | 0.048 | 0.045 | 0.24 | 0.47 | 0.44 | 0.53 | 0.56 | 8.3 | 7.8 |
| club | 24 | workshop-rogue | workshop-rogue | left | 32 | 0.045 | 0.019 | 0.026 | 0.20 | 0.176 | 0.113 | 0.35 | 0.44 | 0.47 | 0.50 | 0.50 | 12.6 | 11.9 |
| club | 24 | workshop-rogue | workshop-rogue | right | 32 | 0.019 | 0.037 | -0.018 | -0.22 | 0.109 | 0.132 | -0.27 | 0.50 | 0.66 | 0.50 | 0.31 | 12.6 | 12.2 |
| empty | 0 | workshop-fighter | workshop-fighter | left | 32 | 0.010 | 0.001 | 0.010 | 0.18 | 0.044 | 0.012 | 0.18 | 0.00 | 0.00 | 0.97 | 1.00 | 7.2 | 5.2 |
| empty | 0 | workshop-fighter | workshop-fighter | right | 32 | 0.011 | 0.001 | 0.010 | 0.18 | 0.041 | 0.014 | 0.18 | 0.97 | 0.97 | 0.03 | 0.03 | 7.2 | 4.9 |
| empty | 0 | workshop-fighter | workshop-rogue | left | 32 | 0.004 | 0.006 | -0.002 | -0.36 | 0.419 | 0.453 | -0.17 | 0.16 | 0.13 | 0.84 | 0.88 | 58.5 | 63.9 |
| empty | 0 | workshop-fighter | workshop-rogue | right | 32 | 0.248 | 0.201 | 0.047 | 0.30 | 1.043 | 0.726 | 0.57 | 0.03 | 0.41 | 0.16 | 0.09 | 58.5 | 50.1 |
| empty | 0 | workshop-rogue | workshop-fighter | left | 32 | 0.019 | 0.019 | -0.000 | -0.01 | 0.055 | 0.065 | -0.13 | 0.00 | 0.00 | 0.94 | 0.94 | 8.0 | 8.0 |
| empty | 0 | workshop-rogue | workshop-fighter | right | 32 | 0.000 | 0.000 | 0.000 | 0.06 | 0.034 | 0.022 | 0.20 | 0.94 | 0.94 | 0.06 | 0.06 | 8.0 | 6.2 |
| empty | 0 | workshop-rogue | workshop-rogue | left | 32 | 0.039 | 0.048 | -0.009 | -0.14 | 0.328 | 0.321 | 0.02 | 0.44 | 0.63 | 0.56 | 0.38 | 30.3 | 29.1 |
| empty | 0 | workshop-rogue | workshop-rogue | right | 32 | 0.032 | 0.041 | -0.009 | -0.18 | 0.333 | 0.307 | 0.09 | 0.53 | 0.47 | 0.44 | 0.53 | 30.3 | 25.8 |
| empty | 24 | workshop-fighter | workshop-fighter | left | 32 | 0.000 | 0.001 | -0.000 | -0.18 | 0.007 | 0.009 | -0.16 | 0.00 | 0.03 | 1.00 | 0.97 | 4.0 | 4.1 |
| empty | 24 | workshop-fighter | workshop-fighter | right | 32 | 0.000 | 0.000 | -0.000 | -0.18 | 0.007 | 0.012 | -0.18 | 1.00 | 1.00 | 0.00 | 0.00 | 4.0 | 4.3 |
| empty | 24 | workshop-fighter | workshop-rogue | left | 32 | 0.006 | 0.006 | -0.001 | -0.20 | 0.384 | 0.399 | -0.10 | 0.09 | 0.13 | 0.91 | 0.88 | 52.7 | 50.0 |
| empty | 24 | workshop-fighter | workshop-rogue | right | 32 | 0.256 | 0.239 | 0.018 | 0.16 | 0.932 | 0.913 | 0.04 | 0.09 | 0.13 | 0.09 | 0.16 | 52.7 | 63.2 |
| empty | 24 | workshop-rogue | workshop-fighter | left | 32 | 0.005 | 0.006 | -0.001 | -0.18 | 0.039 | 0.046 | -0.18 | 0.00 | 0.00 | 0.97 | 0.97 | 6.6 | 4.8 |
| empty | 24 | workshop-rogue | workshop-fighter | right | 32 | 0.000 | 0.000 | 0.000 | 0.18 | 0.017 | 0.020 | -0.18 | 0.97 | 0.97 | 0.03 | 0.03 | 6.6 | 6.4 |
| empty | 24 | workshop-rogue | workshop-rogue | left | 32 | 0.047 | 0.050 | -0.004 | -0.06 | 0.388 | 0.346 | 0.18 | 0.50 | 0.59 | 0.50 | 0.41 | 28.7 | 27.2 |
| empty | 24 | workshop-rogue | workshop-rogue | right | 32 | 0.062 | 0.049 | 0.012 | 0.20 | 0.387 | 0.339 | 0.25 | 0.50 | 0.38 | 0.50 | 0.63 | 28.7 | 27.2 |
| club | 0 | every | pair | either | 256 | 0.092 | 0.073 | 0.019 | 0.13 | 0.299 | 0.266 | 0.14 | 0.40 | 0.36 | 0.50 | 0.53 | 10.7 | 10.4 |
| club | 24 | every | pair | either | 256 | 0.106 | 0.115 | -0.009 | -0.10 | 0.283 | 0.287 | -0.02 | 0.36 | 0.40 | 0.50 | 0.45 | 10.1 | 10.1 |
| empty | 0 | every | pair | either | 256 | 0.046 | 0.040 | 0.006 | 0.08 | 0.287 | 0.240 | 0.17 | 0.38 | 0.44 | 0.50 | 0.49 | 26.0 | 24.2 |
| empty | 24 | every | pair | either | 256 | 0.047 | 0.044 | 0.003 | 0.06 | 0.270 | 0.261 | 0.04 | 0.39 | 0.40 | 0.50 | 0.50 | 23.0 | 23.4 |
| every | delay | every | pair | either | 1024 | 0.073 | 0.068 | 0.005 | 0.05 | 0.285 | 0.263 | 0.09 | 0.38 | 0.40 | 0.50 | 0.49 | 17.5 | 17.0 |

The bar: covering saves the head at d over 0.2 in 9 of 32 cells, and in 5 of them with no more falls; the least d is -0.36.

`node research/core-guard-late.mjs` on the same tree, as [How late a cover is](#how-late-a-cover-is):

| Left | Right | Covers | Blows met | By its head | No threat seen | Threat seen, s | Knuckles from the place, cm | Swell from the place, cm | Steps a threat is seen in, % | Steps a strike has a hand in, % |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | left | 35 | 2 | 0 | 0.13, 0.14, 0.14 | 43, 48, 48 | 62, 79, 79 | 1.3 | 59.9 |
| workshop-fighter | workshop-fighter | right | 37 | 4 | 1 | 0.13, 0.14, 0.15 | 32, 33, 60 | 13, 25, 81 | 1.8 | 69.8 |
| workshop-fighter | workshop-rogue | left | 33 | 0 | 0 | - | - | - | 1.9 | 65.2 |
| workshop-fighter | workshop-rogue | right | 58 | 3 | 0 | 0.14, 0.14, 0.16 | 29, 33, 47 | 29, 34, 41 | 1.3 | 69.8 |
| workshop-rogue | workshop-fighter | left | 41 | 1 | 0 | 0.14, 0.14, 0.14 | 41, 41, 41 | 31, 31, 31 | 1.0 | 68.1 |
| workshop-rogue | workshop-fighter | right | 37 | 0 | 0 | - | - | - | 1.8 | 56.3 |
| workshop-rogue | workshop-rogue | left | 40 | 2 | 0 | 0.17, 0.18, 0.18 | 31, 44, 44 | 58, 67, 67 | 2.2 | 66.4 |
| workshop-rogue | workshop-rogue | right | 39 | 3 | 2 | 0.19, 0.19, 0.19 | 54, 54, 54 | 69, 69, 69 | 2.5 | 65.1 |

- **The bar is missed as it was.** Pooled over every cell the head's d is 0.05 (1024 pairs),
  where it was -0.03, and all the hit points lost read 0.09. Covering saves the head at d over
  0.2 in 9 cells of 32 where it did in 1, and in 5 of them with no more falls; the least is
  -0.36. With clubs and nothing delayed the pooled d is 0.13, and with what is sensed 24 steps
  old, -0.10.
- **The cover is as late.** Of the 15 blows that met a covering head, 12 had a threat seen
  before them, for 0.13 to 0.19 s, and 3 had none; at the blow the knuckles are 29 to 60 cm
  from their place and the swell 13 to 81 cm.
- **Against a Warrior that stands, the Warrior's club blow is met by the pose's club and by
  the cover's head.** `firstBlow` (`tests/core-guard.test.mjs`: a bout whose right side is
  ordered to stand) with a Warrior on the left, at ten gaps from 2.5 to 5 m: in the pose the
  first blow lands on the standing Warrior's club at every gap, at 40 to 52 J; covering, from
  3.5 to 4.25 m, it lands on its head, at 89 to 112 J. The Rogue's club blow, which the test
  throws from 3, 4 and 5 m, lands first on the head in the pose and on a hand or the club
  covering.
- **Fighters go on in the pose** (`FIGHTER.guard`).

## Aim

A fighter aims at its foe's head (`FighterMindConfig.aim`, `"head"`), or at the part of it
its right hand's recipes net most on (`"pays"`: `netsOf`). Under `"pays"` every body aims at
the upper trunk, with a fist and with the club:

| Held | Body | High, HP | Middle, HP | Aims at |
|---|---|---|---|---|
| club | Warrior | 1.107 | 1.417 | the upper trunk |
| club | Rogue | 0.433 | 0.528 | the upper trunk |
| club | skeleton | 0.735 | 1.112 | the upper trunk |
| fist | Warrior | 0.022 | 0.507 | the upper trunk |
| fist | Rogue | 0.007 | 0.225 | the upper trunk |
| fist | skeleton | 0.034 | 0.674 | the upper trunk |

`node research/core-aim.mjs --bouts 32`: arena bouts (Node, core world, Rapier, 120 Hz, each
side's balance its character's) from 32 starting gaps, 3.03 to 4.99 m, the first set. At each gap, for each
thing held and each ordered pair of bodies, one bout with both sides aiming at the head and
one with each side in turn aiming at what pays: 1728 bouts, 36 cells of 32. A row is the side
that aims at what pays: its margin at the end of a bout (its bar less its foe's), what aiming
at what pays gained of it over the bout at the same gap and that gain's effect size (Cohen's d
of the paired differences), the share of the bouts it won and fell in, and the hit points its
foe lost.

| Held | Left | Right | Aims at what pays | Margin: at the head | at what pays | Gained | d | Won: at the head | at what pays | Fell: at the head | at what pays | Foe's HP lost: at the head | at what pays |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | Warrior | Warrior | left | 0.048 | -0.042 | -0.090 | -0.47 | 0.81 | 0.53 | 0.13 | 0.09 | 0.483 | 0.196 |
| club | Warrior | Warrior | right | -0.048 | -0.051 | -0.003 | -0.02 | 0.19 | 0.25 | 0.41 | 0.44 | 0.194 | 0.176 |
| club | Warrior | Rogue | left | 0.175 | 0.203 | 0.028 | 0.15 | 0.91 | 0.91 | 0.09 | 0.09 | 0.743 | 0.856 |
| club | Warrior | Rogue | right | -0.175 | -0.104 | 0.071 | 0.32 | 0.09 | 0.22 | 0.75 | 0.38 | 0.088 | 0.269 |
| club | Warrior | skeleton | left | 0.127 | 0.133 | 0.006 | 0.03 | 0.91 | 0.78 | 0.06 | 0.19 | 0.833 | 0.866 |
| club | Warrior | skeleton | right | -0.127 | -0.102 | 0.025 | 0.22 | 0.09 | 0.09 | 0.25 | 0.28 | 0.081 | 0.174 |
| club | Rogue | Warrior | left | -0.107 | -0.043 | 0.064 | 0.39 | 0.47 | 0.56 | 0.34 | 0.13 | 0.058 | 0.177 |
| club | Rogue | Warrior | right | 0.107 | 0.118 | 0.011 | 0.07 | 0.53 | 0.59 | 0.47 | 0.41 | 0.458 | 0.477 |
| club | Rogue | Rogue | left | -0.002 | -0.014 | -0.012 | -0.13 | 0.75 | 0.69 | 0.25 | 0.28 | 0.181 | 0.165 |
| club | Rogue | Rogue | right | 0.002 | 0.018 | 0.016 | 0.18 | 0.22 | 0.66 | 0.75 | 0.25 | 0.187 | 0.239 |
| club | Rogue | skeleton | left | 0.051 | 0.039 | -0.013 | -0.16 | 0.31 | 0.31 | 0.66 | 0.47 | 0.380 | 0.499 |
| club | Rogue | skeleton | right | -0.051 | 0.037 | 0.089 | 0.81 | 0.69 | 0.63 | 0.03 | 0.38 | 0.048 | 0.316 |
| club | skeleton | Warrior | left | -0.076 | -0.055 | 0.021 | 0.31 | 0.56 | 0.50 | 0.09 | 0.22 | 0.050 | 0.070 |
| club | skeleton | Warrior | right | 0.076 | 0.067 | -0.009 | -0.11 | 0.44 | 0.47 | 0.56 | 0.53 | 0.499 | 0.453 |
| club | skeleton | Rogue | left | -0.044 | -0.001 | 0.043 | 0.39 | 0.78 | 0.56 | 0.00 | 0.44 | 0.059 | 0.210 |
| club | skeleton | Rogue | right | 0.044 | 0.054 | 0.010 | 0.12 | 0.22 | 0.19 | 0.69 | 0.72 | 0.354 | 0.473 |
| club | skeleton | skeleton | left | 0.009 | 0.063 | 0.054 | 0.32 | 0.53 | 0.13 | 0.28 | 0.56 | 0.480 | 0.740 |
| club | skeleton | skeleton | right | -0.009 | 0.015 | 0.023 | 0.15 | 0.47 | 0.13 | 0.22 | 0.38 | 0.428 | 0.513 |
| fist | Warrior | Warrior | left | -0.001 | 0.001 | 0.001 | 0.16 | 0.97 | 0.97 | 0.00 | 0.03 | 0.041 | 0.026 |
| fist | Warrior | Warrior | right | 0.001 | 0.002 | 0.001 | 0.10 | 0.03 | 0.03 | 0.97 | 0.97 | 0.044 | 0.027 |
| fist | Warrior | Rogue | left | 0.191 | 0.156 | -0.035 | -0.27 | 0.84 | 0.81 | 0.16 | 0.19 | 1.043 | 0.923 |
| fist | Warrior | Rogue | right | -0.191 | -0.036 | 0.155 | 1.55 | 0.16 | 0.06 | 0.03 | 0.91 | 0.419 | 0.254 |
| fist | Warrior | skeleton | left | 0.071 | 0.048 | -0.023 | -0.22 | 0.81 | 0.84 | 0.13 | 0.06 | 1.093 | 0.945 |
| fist | Warrior | skeleton | right | -0.071 | -0.050 | 0.021 | 0.23 | 0.19 | 0.19 | 0.13 | 0.13 | 0.666 | 0.848 |
| fist | Rogue | Warrior | left | -0.008 | -0.000 | 0.008 | 0.25 | 0.94 | 0.94 | 0.00 | 0.06 | 0.034 | 0.010 |
| fist | Rogue | Warrior | right | 0.008 | 0.003 | -0.005 | -0.25 | 0.06 | 0.06 | 0.94 | 0.94 | 0.055 | 0.029 |
| fist | Rogue | Rogue | left | 0.001 | 0.028 | 0.027 | 0.58 | 0.56 | 0.47 | 0.44 | 0.53 | 0.333 | 0.377 |
| fist | Rogue | Rogue | right | -0.001 | 0.011 | 0.012 | 0.34 | 0.44 | 0.31 | 0.53 | 0.69 | 0.328 | 0.260 |
| fist | Rogue | skeleton | left | -0.023 | 0.012 | 0.035 | 0.72 | 0.31 | 0.22 | 0.56 | 0.63 | 0.336 | 0.750 |
| fist | Rogue | skeleton | right | 0.023 | 0.053 | 0.030 | 0.38 | 0.69 | 0.59 | 0.31 | 0.41 | 0.315 | 0.390 |
| fist | skeleton | Warrior | left | 0.000 | 0.001 | 0.001 | 0.18 | 0.97 | 1.00 | 0.03 | 0.00 | 0.016 | 0.030 |
| fist | skeleton | Warrior | right | -0.000 | 0.001 | 0.001 | 0.18 | 0.03 | 0.03 | 0.97 | 0.97 | 0.014 | 0.026 |
| fist | skeleton | Rogue | left | 0.020 | 0.037 | 0.017 | 0.45 | 0.88 | 0.84 | 0.13 | 0.16 | 0.329 | 0.381 |
| fist | skeleton | Rogue | right | -0.020 | 0.008 | 0.028 | 0.60 | 0.13 | 0.00 | 0.78 | 0.84 | 0.368 | 0.679 |
| fist | skeleton | skeleton | left | -0.001 | 0.013 | 0.014 | 0.44 | 0.53 | 0.47 | 0.19 | 0.44 | 0.423 | 0.653 |
| fist | skeleton | skeleton | right | 0.001 | 0.015 | 0.014 | 0.33 | 0.47 | 0.47 | 0.34 | 0.34 | 0.439 | 0.598 |
| club | every | pair | either | 0.000 | 0.019 | 0.019 | 0.13 | 0.50 | 0.45 | 0.34 | 0.35 | 0.311 | 0.381 |
| fist | every | pair | either | -0.000 | 0.017 | 0.017 | 0.24 | 0.50 | 0.46 | 0.37 | 0.46 | 0.350 | 0.400 |
| every | every | pair | either | 0.000 | 0.018 | 0.018 | 0.15 | 0.50 | 0.46 | 0.35 | 0.40 | 0.331 | 0.391 |

- **Aiming at what pays gains 0.018 of margin, d 0.15** over the 1152 pairs: 0.13 with the
  club and 0.24 with a fist. 18 of the 36 cells are over 0.2 and 4 under -0.2; the least is
  the Warrior's with the club on the left of a Warrior, -0.47, where its wins fall from 0.81
  of its bouts to 0.53.
- **It wins fewer bouts.** A side that aims at what pays wins 0.46 of its bouts where it won
  0.50, and falls in 0.40 where it fell in 0.35; its foe loses 0.39 HP where it lost 0.33.
- **Six cells say nothing**: with a bare Warrior on the right the bout is its fall at 2.9 s
  ([bouts.md](bouts.md#searched-blows)), whoever aims where.

`--from 32` plays the same cells from the next 32 gaps, a second set, and `--load` reads the
two sets' records as one of 64:

| Gaps | Held | Gained | d | Won: at the head | at what pays | Fell: at the head | at what pays | Foe's HP lost: at the head | at what pays |
|---|---|---|---|---|---|---|---|---|---|
| the first 32 | club | 0.019 | 0.13 | 0.50 | 0.45 | 0.34 | 0.35 | 0.311 | 0.381 |
| the first 32 | fist | 0.017 | 0.24 | 0.50 | 0.46 | 0.37 | 0.46 | 0.350 | 0.400 |
| the first 32 | either | 0.018 | 0.15 | 0.50 | 0.46 | 0.35 | 0.40 | 0.331 | 0.391 |
| the second 32 | club | 0.013 | 0.09 | 0.50 | 0.48 | 0.31 | 0.32 | 0.317 | 0.367 |
| the second 32 | fist | 0.016 | 0.25 | 0.50 | 0.47 | 0.38 | 0.45 | 0.324 | 0.441 |
| the second 32 | either | 0.015 | 0.13 | 0.50 | 0.47 | 0.35 | 0.38 | 0.320 | 0.404 |
| all 64 | club | 0.016 | 0.11 | 0.50 | 0.47 | 0.32 | 0.33 | 0.314 | 0.374 |
| all 64 | fist | 0.017 | 0.24 | 0.50 | 0.47 | 0.37 | 0.45 | 0.337 | 0.421 |
| all 64 | either | 0.016 | 0.14 | 0.50 | 0.47 | 0.35 | 0.39 | 0.325 | 0.397 |

- **The second set says what the first did**: more margin, by d 0.13 where 0.15, fewer bouts
  won and more fallen in. 13 of the 36 cells are over 0.2 in both sets, and one under -0.2 in
  both: the Warrior's with the club on the left of a Warrior, -0.47 and -0.32. One is over 0.2
  in the first and under -0.2 in the second, the bare skeleton's on the right of a Warrior.
  Read as one set, 15 cells are over 0.2 and 2 under -0.2.
- **The margin and the bouts won disagree most where a body that aims at a trunk falls.** The
  bare Rogue on the right of a Warrior gains 0.13 of margin over the 64 gaps, d 1.25, falls in
  0.92 of its bouts where it fell in 0.08, and wins 0.03 where it won 0.14.
- **64 gaps a cell is a pilot.** A cell's d has a standard error near 0.13. A set of 32 took
  1190 and 1254 s on 26 and 24 worker threads, so 384 gaps a cell are 4 h, and a second set on
  fresh gaps (`--from 384`) 4 h more. They have not been played.

`FIGHTER.aim` is `"head"`.

## Robustness

Where each recipe misses, and what it does to its own body when it meets nothing.
`node research/strike-robustness.mjs` (Node core stand, Rapier, each throw as its search threw it,
`evaluateBlow`; four throws a reading, the first as written and three perturbed as a search's are,
watched 3 s after the pushes).

**Off its place.** The target body moved from the recipe's place along the heading or across it,
at 120 Hz: what a body whose feet stood that far off throws, since the skill aims where the place
is. A cell is the mean done as a share of the done at its place; where fewer than four landed, how
many did and how many left their thrower down.

| Held | Body | Band | At its place, HP | Along -12 | -6 | +6 | +12 | Across -12 | -6 | +6 | +12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| club | Warrior | high | 1.02 | 0.73 | 0.87 | 1.08 | 0.91 | 0.17 (3/4, 1 fell) | 0.61 | 0.49 | 0.09 (2/4) |
| club | Warrior | middle | 1.37 | 0.86 | 0.95 | 0.89 | 0.74 | 0.34 (3/4) | 0.84 | 0.72 | 0.42 |
| club | Rogue | high | 0.42 | 0.87 | 1.02 | 0.93 | 0.24 | 0.02 (1/4) | 0.46 | 0.84 | 0.09 |
| club | Rogue | middle | 0.54 | 0.79 | 0.89 | 1.00 | 0.78 | 0.35 | 0.81 | 0.86 | 0.47 |
| club | skeleton | high | 0.67 | 0.48 | 0.77 | 0.86 | 0.82 | 0.10 | 0.71 | 0.67 (3/4, 1 fell) | 0.00 (1/4) |
| club | skeleton | middle | 1.08 | 0.88 | 1.00 | 0.96 | 0.25 | 0.35 | 0.62 | 0.85 | 0.51 |
| fist | Warrior | high | 0.12 | 0.50 | 0.83 | 0.91 | 0.54 | 0.61 | 0.91 | 1.07 | 0.92 |
| fist | Warrior | middle | 0.53 | 0.21 (2/4, 2 fell) | 0.59 | 0.68 | 0.41 | 0.60 | 1.12 | 0.54 | 0.18 |
| fist | Rogue | high | 0.05 | 0.49 | 0.87 | 1.36 | 0.72 | 0.00 (0/4) | 0.48 | 0.95 | 0.30 |
| fist | Rogue | middle | 0.31 | 0.34 | 0.63 | 0.42 | 0.10 | 0.45 | 0.84 | 0.56 | 0.10 |
| fist | skeleton | high | 0.18 | 0.09 | 0.48 | 1.43 | 1.07 | 0.19 | 0.74 | 0.68 | 0.12 (3/4) |
| fist | skeleton | middle | 0.54 | 0.40 | 1.02 | 0.77 | 0.36 | 0.62 | 1.07 | 0.96 | 0.53 |

- **Across the heading is where a club misses.** Twelve centimetres across, the club blows at a
  head keep 0.17 or less of what they do at their place, and those at a trunk 0.34 to 0.51; six
  across, those at a head keep 0.46 to 0.84. Along the heading the clubs' arcs forgive more: six
  centimetres either way keeps 0.77 to 1.08 of every club blow.
- **A fist blow loses either way**: twelve centimetres along toward the body keeps 0.09 to 0.50 of
  it, and twelve across 0.00 to 0.92.
- **An off blow can put its thrower down**: the Warrior's club at a head, twelve across to the
  left, and its fist at a trunk, twelve along toward it, two of four; the skeleton's club six
  across to the right.

**At nothing.** Each throw traced (`balanceTrace`, `research/core-blow.mjs`): the steps the stance
took to catch the body (`recoveryStep`, `src/core/control/gait.ts`); the most the capture point
ran back, forward, left and right of the soles' middle as the pushes began, cm; the most it lay
past the outline the stance steps from (both soles' corners drawn in by `SUPPORT_INSET`), cm, and
the first time it did, s from the pushes' beginning; the most the soles fell short of what the
stance asked; and the throws that left the body down or not standing.

| Held | Body | Band | Hz | Steps, each throw | Back | Forward | Left | Right | Past the inner outline | Left it at, s | Short, weights | Short, N m | Down |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| club | Warrior | high | 120 | 0, 3, 2, 2 | 50 | 8 | 19 | 41 | 11 | 0.41 | 0.68 | 880 | 0 |
| club | Warrior | high | 480 | 11, 9, 5, 4 | 203 | 3 | 14 | 136 | 33 | 0.36 | 1.22 | 936 | 1 |
| club | Warrior | middle | 120 | 0, 0, 0, 2 | 11 | 6 | 3 | 10 | 4 | 0.44 | 0.55 | 507 | 0 |
| club | Warrior | middle | 480 | 0, 2, 0, 0 | 2 | 19 | 3 | 21 | 9 | 0.58 | 0.38 | 468 | 0 |
| club | Rogue | high | 120 | 0, 0, 0, 2 | 14 | 6 | 22 | 13 | 5 | 1.10 | 0.52 | 401 | 0 |
| club | Rogue | high | 480 | 4, 2, 7, 2 | 2 | 99 | 25 | 11 | 35 | 0.47 | 0.58 | 455 | 2 |
| club | Rogue | middle | 120 | 2, 4, 1, 4 | 21 | 39 | 11 | 125 | 97 | 0.55 | 2.78 | 1099 | 2 |
| club | Rogue | middle | 480 | 3, 2, 3, 0 | 1 | 44 | 28 | 19 | 15 | 0.37 | 0.51 | 412 | 0 |
| club | skeleton | high | 120 | 2, 0, 0, 0 | 13 | 5 | 6 | 20 | 4 | 0.23 | 0.42 | 480 | 0 |
| club | skeleton | high | 480 | 0, 1, 7, 0 | 43 | 4 | 7 | 103 | 54 | 0.23 | 2.79 | 2598 | 1 |
| club | skeleton | middle | 120 | 1, 1, 1, 1 | 9 | 4 | 7 | 7 | 2 | 0.25 | 0.44 | 478 | 0 |
| club | skeleton | middle | 480 | 1, 1, 1, 1 | 8 | 0 | 4 | 5 | 2 | 0.25 | 0.42 | 490 | 0 |
| fist | Warrior | high | 120 | 2, 1, 1, 1 | 11 | 0 | 7 | 15 | 4 | 0.47 | 0.37 | 334 | 0 |
| fist | Warrior | high | 480 | 2, 1, 1, 1 | 9 | 0 | 7 | 13 | 2 | 0.43 | 0.37 | 322 | 0 |
| fist | Warrior | middle | 120 | 1, 0, 0, 0 | 5 | 4 | 6 | 10 | 1 | 0.42 | 0.22 | 225 | 0 |
| fist | Warrior | middle | 480 | 0, 0, 1, 0 | 4 | 5 | 4 | 10 | 1 | 0.49 | 0.19 | 169 | 0 |
| fist | Rogue | high | 120 | 0, 0, 0, 0 | 4 | 1 | 6 | 1 | 0 | never | 0.25 | 137 | 0 |
| fist | Rogue | high | 480 | 0, 0, 0, 0 | 4 | 1 | 7 | 1 | 0 | never | 0.11 | 129 | 0 |
| fist | Rogue | middle | 120 | 0, 0, 0, 0 | 5 | 2 | 1 | 6 | 0 | 0.41 | 0.18 | 90 | 0 |
| fist | Rogue | middle | 480 | 0, 0, 0, 0 | 5 | 2 | 1 | 6 | 0 | never | 0.14 | 89 | 0 |
| fist | skeleton | high | 120 | 2, 2, 2, 2 | 10 | 0 | 1 | 17 | 4 | 0.33 | 0.24 | 180 | 0 |
| fist | skeleton | high | 480 | 1, 2, 1, 2 | 9 | 0 | 2 | 16 | 4 | 0.32 | 0.24 | 219 | 0 |
| fist | skeleton | middle | 120 | 2, 2, 2, 2 | 9 | 1 | 1 | 21 | 7 | 0.35 | 0.23 | 254 | 0 |
| fist | skeleton | middle | 480 | 2, 2, 2, 0 | 10 | 0 | 16 | 1 | 2 | 0.36 | 0.27 | 310 | 0 |

- **What a blow at nothing does at 120 Hz is make its stance step.** The capture point runs past
  the outline drawn in by `SUPPORT_INSET` a quarter to a half second after the pushes begin (the
  Rogue's club at a head, a second), in the follow-through, and the stance steps to catch it. Ten
  of the twelve recipes step in one throw of four or more; the skeleton's at a trunk and its fists
  in every throw. The capture point leaves the soles' own outline in the throws that fall, and by
  1 and 2 cm in two of the Warrior's club blows at a head, which the steps catch.
- **The step is back and to the thrower's right.** The capture point runs behind the soles' middle
  (the Warrior's club at a head, 50 cm) and to the right (41 cm); a fist runs it 4 to 11 cm back.
- **The soles fall short of what the stance asks** in every recipe: by 0.18 to 0.68 of the body's
  weight and 90 to 880 N m at 120 Hz, where it stands.
- **It falls at 120 Hz in one recipe**, the Rogue's club at a trunk, two of four throws, the
  perturbed ones; at 480 Hz in three, the high clubs, where the Warrior's runs its capture point
  2 m back.

**In bouts.** `node research/strike-bouts.mjs --held club,empty` (Node core world, Rapier, 120 Hz,
the arena's rulebook): every pair of bodies at gaps of 3, 4 and 5 m, each side the fighter, read
from its skills' report. An attempt runs from the skill taking an attack up to its blow thrown,
dropped or cut by the verdict; it is committed at its chamber, or its pushes where it has none. A
throw landed where a blow of the thrower's hand or what it holds took hit points from the foe from
the commit to a quarter second after the throw.

| | Club | Empty |
|---|---|---|
| Bouts, s of bout | 27, 431 | 27, 1137 |
| A side's time: approach, place, settle | 10.8, 29.9, 21.3 % | 6.2, 43.3, 33.0 % |
| A side's time: chamber, swing | 3.6, 3.0 % | 0.0, 6.3 % |
| Set-up, from the attempt to its commit, median | 4.44 s | 4.05 s |
| Committed throws with the foe's head in the recipe's window at the commit | 17 of 57 | 33 of 227 |
| the same as the pushes began | 10 of 57 | 33 of 227 |
| The point the tactics held from the foe's head at the commit, median | 11.4 cm | 10.9 cm |
| held more than 10 cm off | 35 of 66 | 178 of 318 |
| Committed throws that landed: Warrior, Rogue, skeleton | 21 of 25, 27 of 29, 12 of 12 | 27 of 88, 119 of 132, 77 of 98 |
| on the head | 16, 16, 10 | 12, 48, 39 |
| the thrower stepped to catch itself | 11, 8, 6 | 46, 27, 40 |
| the thrower down within 2 s of the commit | 0, 2, 0 | 0, 2, 0 |

- **A throw is thrown at where the head was.** The tactics hold the point they attack until the
  foe's head is `APPROACH.reach`, 25 cm, from it (`fighterTactics`), so the skill sets the feet
  for, and throws at, a point a median 11 cm from the head, more than a window's width across.
  The foe's head is in the window at a third of the committed club throws and a seventh of the
  bare ones. Aiming at the head as it is does not make more of them land
  ([aiming afresh](#aiming-afresh)).
- **A thrower steps to catch itself after more than a third of its throws**, as it does at
  nothing; it is down after four of 384.
- **Setting up is most of a bout**: placing the feet and standing are half a club side's time and
  three quarters of a bare one's, and a throw is four seconds in the making.

### Aiming afresh

The same bouts (`node research/strike-bouts.mjs --held club,empty`, Node core world, Rapier,
120 Hz, the arena's rulebook) with the tactics' point following the foe's head while the skill
stands for the blow (`settle`), so a throw is committed only with the head in its window. With
that alone a stand whose head has left the window sets its feet again at once ("wait 0"); the
other rows choose the recipe once a stand and keep standing up to that many seconds for the head
to come back into the window before setting the feet again. Neither change is in the code.

| Held | Aim | Bout s | Committed | Landed | On the head | Done, HP | HP a minute | Feet set again a throw | Thrower down |
|---|---|---|---|---|---|---|---|---|---|
| club | held point | 431 | 66 | 60 (91 %) | 42 (64 %) | 17.94 | 2.49 | 0.30 | 2 |
| club | fresh, wait 0 | 698 | 53 | 49 (92 %) | 29 (55 %) | 12.35 | 1.06 | 1.51 | 7 |
| club | fresh, wait 0.5 | 837 | 78 | 73 (94 %) | 46 (59 %) | 18.29 | 1.31 | 1.56 | 2 |
| club | fresh, wait 1 | 614 | 69 | 66 (96 %) | 42 (61 %) | 20.39 | 1.99 | 1.10 | 2 |
| club | fresh, wait 2 | 610 | 73 | 65 (89 %) | 41 (56 %) | 20.16 | 1.98 | 0.89 | 3 |
| empty | held point | 1137 | 318 | 223 (70 %) | 99 (31 %) | 2.82 | 0.15 | 0.44 | 2 |
| empty | fresh, wait 0 | 1456 | 185 | 170 (92 %) | 113 (61 %) | 1.79 | 0.07 | 1.46 | 2 |
| empty | fresh, wait 0.5 | 1468 | 216 | 180 (83 %) | 113 (52 %) | 2.27 | 0.09 | 1.53 | 5 |
| empty | fresh, wait 1 | 1380 | 205 | 171 (83 %) | 98 (48 %) | 2.08 | 0.09 | 1.01 | 3 |
| empty | fresh, wait 2 | 1369 | 211 | 187 (89 %) | 113 (54 %) | 1.95 | 0.09 | 0.89 | 3 |

- **A club throw committed in the window has left it by the pushes.** The head is in the window
  at every commit, and as the pushes begin at 11 of 41 to 19 of 60 (held point, 10 of 57): the
  head moves a median 5 to 7 cm in the club's chamber. A club throw on the head is 55 to 61 %
  of them (held point, 64 %).
- **Bare, more throws land and fewer recipes are thrown.** On the head rises from 31 % to 48 to
  61 %, but the throws that are recipes fall from 227 of 318 to 74 to 119 of 185 to 216, the rest
  placed blows, which land a tenth of a recipe's energy. The Warrior, with no placed blow, commits
  7 to 19 throws in place of 88: its head is seldom in a window while it stands.
- **The feet are set again three to five times as often, the bouts run longer, and the hit
  points a minute fall** in every variant, club and bare.
- So a point held stale is not what makes a blow in a bout miss: an open-loop throw with a window
  of centimetres cannot follow a head that sways, and the body spends its bout standing for one.

### Steered

A recipe follows its target across (`STEER`, `src/core/skills/strike.ts`): from the commit to the
end of its pushes the stance's heading is turned by as much as the target's bearing has turned
since the commit, read from where the feet's middle stood then, up to 0.3 rad either way; and the
fighter aims at the foe's head itself once a blow is committed (`fighterTactics`).

**On the stand.** `node research/strike-robustness.mjs --seen --offsets 0.06,0.12 --hz 120`, and
with `--steer 0` for none (Node core stand, Rapier, 120 Hz,
each throw as its search threw it, four throws a reading): the target moved from its place, and the
skill told so, once the blow is committed, as a head that moved under the blow. A cell is the mean
done as a share of the done at its place; where fewer than four landed, how many did and how many
left their thrower down. Unturned, a recipe never reads its target after the commit, and its row
is the [off its place](#robustness) table's.

| Held | Body | Band | Turn | At its place, HP | Across -12 | -6 | +6 | +12 | Along -12 | +12 |
|---|---|---|---|---|---|---|---|---|---|---|
| club | Warrior | high | none | 1.02 | 0.17 (3/4, 1 fell) | 0.61 | 0.49 | 0.09 (2/4) | 0.73 | 0.91 |
| club | Warrior | high | 0.3 rad | 1.02 | 0.56 (3/4, 1 fell) | 0.57 | 1.01 | 0.91 | 0.77 | 0.71 (3/4) |
| club | Warrior | middle | none | 1.37 | 0.34 (3/4) | 0.84 | 0.72 | 0.42 | 0.86 | 0.74 |
| club | Warrior | middle | 0.3 rad | 1.37 | 0.95 | 0.91 | 1.02 | 0.99 | 0.89 | 0.76 |
| club | Rogue | high | none | 0.42 | 0.02 (1/4) | 0.46 | 0.84 | 0.09 | 0.87 | 0.24 |
| club | Rogue | high | 0.3 rad | 0.42 | 0.77 | 0.74 | 0.80 | 0.46 | 0.89 | 0.06 (3/4) |
| club | Rogue | middle | none | 0.54 | 0.35 | 0.81 | 0.86 | 0.47 | 0.79 | 0.78 |
| club | Rogue | middle | 0.3 rad | 0.54 | 0.89 | 0.98 | 0.87 | 0.83 | 0.83 | 0.41 |
| club | skeleton | high | none | 0.79 | 0.05 | 0.62 | 0.68 | 0.14 (2/4, 1 fell) | 0.58 | 0.72 (3/4, 1 fell) |
| club | skeleton | high | 0.3 rad | 0.79 | 0.98 | 1.04 | 1.02 | 1.02 | 0.55 | 0.74 |
| club | skeleton | middle | none | 1.12 | 0.31 | 0.52 | 0.76 | 0.36 | 0.92 | 0.53 |
| club | skeleton | middle | 0.3 rad | 1.12 | 0.99 | 1.00 | 0.98 | 0.93 | 0.88 | 0.54 |
| fist | Warrior | high | none | 0.12 | 0.61 | 0.91 | 1.07 | 0.92 | 0.50 | 0.54 |
| fist | Warrior | high | 0.3 rad | 0.12 | 0.80 | 0.84 | 1.06 | 1.15 | 0.49 | 0.45 |
| fist | Warrior | middle | none | 0.53 | 0.60 | 1.12 | 0.54 | 0.18 | 0.21 (2/4, 2 fell) | 0.41 |
| fist | Warrior | middle | 0.3 rad | 0.53 | 1.04 | 1.13 | 0.81 | 0.73 | 0.21 | 0.40 |
| fist | Rogue | high | none | 0.05 | 0.00 (0/4) | 0.48 | 0.95 | 0.30 | 0.49 | 0.72 |
| fist | Rogue | high | 0.3 rad | 0.05 | 0.59 | 0.82 | 1.04 | 1.02 | 0.50 | 0.96 |
| fist | Rogue | middle | none | 0.31 | 0.45 | 0.84 | 0.56 | 0.10 | 0.34 | 0.10 |
| fist | Rogue | middle | 0.3 rad | 0.31 | 0.70 | 0.77 | 0.71 | 0.47 | 0.38 | 0.12 |
| fist | skeleton | high | none | 0.18 | 0.24 (3/4) | 0.72 | 0.68 | 0.07 (2/4) | 0.11 | 1.21 |
| fist | skeleton | high | 0.3 rad | 0.18 | 1.21 | 1.13 | 1.01 | 0.98 | 0.11 | 1.18 |
| fist | skeleton | middle | none | 0.70 | 0.43 | 0.86 | 1.05 | 0.39 | 0.10 (3/4, 1 fell) | 0.54 |
| fist | skeleton | middle | 0.3 rad | 0.70 | 0.56 | 0.64 | 0.92 | 1.11 | 0.13 (3/4, 1 fell) | 0.53 |

- **Across, a turned blow keeps what it does.** Twelve centimetres across, the clubs keep 0.46 to
  1.02 of their done where unturned they kept 0.02 to 0.47, and the fists 0.47 to 1.21 where 0.00
  to 0.92; at its place every recipe reads as it did, to the bit. The skeleton's club at a head
  keeps 0.98 to 1.04 of it turned, its thighs clear of each other (`skeleton-limbs-clear`), so
  its pelvis turns under the chamber.
- **Along, the turn changes little**, and a club twelve centimetres beyond its place keeps less
  turned in three recipes (the Warrior's at a head, 0.91 to 0.71; the Rogue's at a head, 0.24 to
  0.06; its club at a trunk, 0.78 to 0.41).
- **No throw is put down by its turn**: the Rogue's three recipes moved 12, 18 and 24 cm across,
  eight throws a cell, stand turned; unturned its club at a trunk falls in three of four at
  24 cm to the left.
- **The limit**: at 0.15 rad every club keeps as much at twelve centimetres as at 0.3, and the
  fists keep less (the Rogue's at a head, 0.14 where 0.53); at 18 and 24 cm the Rogue's club at a
  trunk keeps less, and its fist at a trunk lands none of four at 24 cm to the left where at 0.3
  it lands four. Read on a turn taken from the feet's middle as it stood each step, not as it
  stood at the commit.

**In bouts.** `node research/strike-bouts.mjs --gaps 2.5,3,3.5,4,4.5,5,5.5 --held club,empty`
(Node core world, Rapier, 120 Hz, the arena's rulebook): 63 bouts each, read at `3667afc3`, the
skeleton's thighs not yet clear and its recipes those searched before. The placebo is the same
bouts with the turn held under 0.001 rad, which turns nothing and moves every bout; struck is a
thrower down within 2 s of its commit that its foe's hand or held item had taken hit points from
since.

| Held | Turn | Bout s | Committed | Landed | On the head | HP a minute | Thrower down | not struck first |
|---|---|---|---|---|---|---|---|---|
| club | none | 992 | 150 | 139 (93 %) | 95 (63 %) | 2.53 | 9 | 2 |
| club | placebo | 948 | 145 | 133 (92 %) | 90 (62 %) | 2.64 | 10 | 8 |
| club | 0.3 rad | 890 | 137 | 129 (94 %) | 87 (64 %) | 2.71 | 15 | 3 |
| empty | none | 2947 | 782 | 517 (66 %) | 232 (30 %) | 0.14 | 8 | 0 |
| empty | placebo | 2634 | 612 | 462 (75 %) | 240 (39 %) | 0.14 | 9 | 2 |
| empty | 0.3 rad | 2197 | 541 | 359 (66 %) | 186 (34 %) | 0.12 | 14 | 5 |

- **In bouts the turn shows nothing a placebo does not.** Every column moves by as much under
  the placebo as under the turn. A club throw landed 93 % of the time unturned; at the commit the
  foe's head is a median 7 cm short of the window along and as far either way across as along
  (the middle 80 %, 19 cm short to 7 beyond, and 9 cm either way), so the turn takes up half of
  what the feet leave.
- **The bare Rogue goes down unstruck after more throws**: none of 7 downs unturned, 1 of 5
  under the placebo, 4 of 12 turned, against the skeleton or another Rogue. Its fists thrown on
  the stand at a head 4 to 16 cm beyond the window and up to 24 cm across, turned, stand in every
  throw. Not explained.

### Up

`node research/strike-robustness.mjs --ways up --offsets 0.04,0.08,0.12` and
`--offsets 0.14,0.18,0.22` (Node core stand, Rapier, 120 Hz, each throw as its search threw it,
four throws a reading): the target moved from its place up or down, unseen, as its own throws
read it; a cell is the mean done as a share of the done at its place, and where fewer than four
landed, how many did.

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

**What a bout asks up.** A blow at a head is placed from the thrower's own head, and a head
stands still up and down while a fight sets its feet: at the commits of the 126 bouts of
[steered](#steered), unturned, the foe's head stood at 1.582 to 1.603 m for the Warrior, 1.443 to
1.462 for the Rogue and 1.407 to 1.422 for the skeleton (the middle 80 %). The offset up is the
matchup's: the Warrior's blow at the Rogue's head is 14 cm under its place and at the skeleton's
18 cm, theirs at its head as far over, and between the Rogue and the skeleton 4 cm.

- **Up, the clubs at a head miss little in the matchups that ask it**: the Warrior's keeps 0.88
  at the Rogue's head and 0.95 at the skeleton's, the skeleton's 0.81 at the Warrior's and about
  all of it at the Rogue's. The Rogue's at the Warrior's head is the one loss, 0.50, with one of
  four missing.
- **The fists at a head lose more, and do least**: the Warrior's lands one of four at the
  skeleton's head, but does 0.12 HP at its place.
- **The offset is known at the commit and does not move under the blow**: what it asks is the
  recipe aimed for it, not steered after it.

### Searched with jitter

`node research/core-strike-search.mjs --held "wooden club" --band high --from workshop-fighter:high --sigma 0.2 --jitter 0.08,0.08,0`
(Node core stand, Rapier, 120 Hz, 30 generations of 64, four trials, seed 1), and the same search
without `--jitter` as its control: the Warrior's club at a head searched from its recipe with
each trial's target within 8 cm of its place along and across, told to the skill once committed
(`--seen`'s steered blow), against a search that throws at the place. The replay reads the best
at its place, eight throws at each rate.

| Search | Mean searched | 120 Hz net | Landed | 480 Hz net | Landed | 1920 Hz net | Landed | Ahead, m |
|---|---|---|---|---|---|---|---|---|
| jittered | 1.004 | 0.82 | 8/8 | 0.01 | 1/8 | 0.02 | 4/8, 4 not standing | 0.951 |
| control | 1.181 | 1.11 | 8/8 | 1.12 | 8/8 | 0.86 | 8/8 | 0.932 |

The control's best is the recipe it started from: thirty generations found nothing better at the
place. Both thrown at the same sixteen targets within 8 cm along and across (the plastic number's
sequence, seen once committed; 120 Hz), the recipe does a mean 1.06 HP and lands all sixteen, the
jittered search's best 0.97 and lands all sixteen.

- **The recipe as it is keeps its blow over the jitter**: steered, it lands every throw within
  8 cm and does 0.81 to 1.20 HP; the search had no window to widen.
- **The jittered search's best is a blow of the one rate**: it does 0.82 at its place at 120 Hz
  and nearly nothing at 480 and 1920, where the recipe keeps 1.12 and 0.86. A score averaged over
  offsets that move every generation rewards what the noise favours, not what converges.
- The 36 searches with jitter are not run.

### Leaning and following through

`node research/strike-robustness.mjs --offsets "" --ways along --hz 120,480` (Node core stand,
Rapier, four throws a reading as in [robustness](#robustness)), on a strike skill that could lean
a recipe or follow it through: the twelve recipes at their place and at nothing, each leaning, or
each followed through, so. A lean set the stance's centre of mass (`StanceGoal.centre`) that far
from the soles' middle, ahead and to the thrower's right along the steered heading, from the
commit to the end of the pushes; a follow-through braked each freedom the recipe moves from the
rate it had (read from its angle a step before), at a time constant of the brake, for its seconds
after the pushes, before the guard took the arm back. Neither is kept. The skeleton's recipes are
those searched on its wider limbs, thrown on its present ones. Done is the mean at the place over
the twelve, HP; steps and falls are over the twelve recipes' 48 throws at nothing at each rate.

| Setting | Done at the place | 120 Hz: throws that stepped | steps | down | 480 Hz: throws that stepped | steps | down |
|---|---|---|---|---|---|---|---|
| as they are | 0.50 | 23 | 40 | 2 | 21 | 65 | 3 |
| lean 4 cm ahead | 0.47 | 24 | 88 | 10 | 26 | 98 | 10 |
| lean 4 cm back | 0.39 | 46 | 119 | 10 | 41 | 79 | 2 |
| lean 4 cm right | 0.42 | 33 | 64 | 4 | 24 | 42 | 1 |
| lean 4 cm left | 0.44 | 20 | 51 | 5 | 22 | 47 | 2 |
| follow 0.2 s, brake 0.2 s | 0.50 | 28 | 67 | 3 | 20 | 66 | 8 |
| follow 0.4 s, brake 0.2 s | 0.50 | 27 | 62 | 1 | 20 | 65 | 10 |
| follow 0.6 s, brake 0.2 s | 0.50 | 27 | 54 | 2 | 20 | 59 | 8 |
| follow 0.3 s, brake 0.1 s | 0.50 | 28 | 62 | 3 | 20 | 60 | 5 |
| follow 0.3 s, brake 0.3 s | 0.50 | 26 | 61 | 4 | 24 | 80 | 11 |

- **No lean the same for every recipe keeps a body on its feet**: each costs a twentieth to a
  fifth of what the blows do, and each steps more at 120 Hz. Leaning right takes a third off the
  steps at 480 Hz and adds half again at 120.
- **A braked follow-through makes a body step more**, at every length and brake tried: the guard
  taking the arm back as the pushes end steps least. Why is not measured.

### Thrown from where it stands

`node research/strike-bouts.mjs --gaps 2.5,3,3.5,4,4.5,5,5.5 --held club,empty` (Node core world,
Rapier, 120 Hz, the arena's rulebook; 63 bouts each way), the strike skill setting the feet at
every recipe's place, and standing where it is when the recipe's window holds the target as the
approach ends.

| | Club, feet set | Club, from where it stands | Empty, feet set | Empty, from where it stands |
|---|---|---|---|---|
| A side's time: approach, place, settle | 10.8, 28.4, 19.5 % | 11.0, 24.7, 20.8 % | 6.4, 44.2, 30.6 % | 6.6, 41.9, 32.0 % |
| Set-up, from the attempt to its commit, median | 4.52 s | 4.60 s | 4.24 s | 4.26 s |
| Committed throws | 146 | 139 | 564 | 573 |
| landed | 132 | 121 | 340 | 370 |
| the thrower down within 2 s of the commit | 16 | 18 | 11 | 6 |

- **Standing where it is takes a few points off placing, and nothing off the set-up.** The
  approach walks to within `APPROACH.reach`, 25 cm, of the place, and a window is 4 to 26 cm wide,
  so it seldom ends with the target in the window; the feet are set as before.
- What is landed of what is committed is the same within the bouts' spread: club 0.90 and 0.87,
  empty 0.60 and 0.65.

### Searched still

`node research/core-strike-search.mjs --held "wooden club" --band high --from workshop-fighter:high --sigma 0.2 --still`
(Node core stand, Rapier, 120 Hz, 30 generations of 64, four trials, seed 1): the Warrior's club
at a head searched from its recipe with each trial thrown at nothing as well, each step the
stance took there costing `STEPPED`, 10 HP, on the mean; its control is the search without
`--still` of [searched with jitter](#searched-with-jitter), whose best is the recipe. The best is
read by `research/core-strike-window.mjs` and `research/strike-robustness.mjs` (`--seen`, and
`--offsets "" --trials 16`) with it in the recipe's place.

| | Searched | Replay 120 / 480 / 1920 Hz net | At its place, 16 throws | Window along, across | Steered across -12 / +12 | Along +6 / +12 |
|---|---|---|---|---|---|---|
| the recipe | 1.181 | 1.11 / 1.12 / 0.86 | 0.93 | -2 to 12, -4 to 2 cm | 0.57 / 0.92 | 1.15 / 0.72 |
| searched still | 0.969 | 0.72 / 0.83 / 0.82 | 0.84 | -12 to 0, -4 to 2 cm | 0.85 / 0.97 | 0.27 / 0.39 |

Thrown at nothing, 16 throws each rate:

| | 120 Hz: throws that stepped | steps | down | capture point back, right | 480 Hz: throws that stepped | steps | down | capture point back, right |
|---|---|---|---|---|---|---|---|---|
| the recipe | 15 | 47 | 2 | 109, 57 cm | 16 | 94 | 6 | 203, 136 cm |
| searched still | 3 | 8 | 0 | 17, 34 cm | 0 | 0 | 0 | 5, 4 cm |

- **A blow searched still keeps its feet**: it steps in three throws of sixteen at 120 Hz and in
  none at 480, where the recipe steps in 31 of the 32 and is down after 8; its capture point runs
  5 cm back at 480 Hz, the recipe's 2 m.
- **It does 0.90 of what the recipe does at its place** on the same sixteen throws, and converges
  with the rate better: 0.83 and 0.82 at 480 and 1920 Hz, the recipe 1.12 and 0.86. Two of the
  replay's eight throws at 120 Hz land little, 0.02 and 0.08.
- **Its window is the recipe's across, and 2 cm narrower along**, set nearer the body: from 12 cm
  nearer than its place to its place.
- **It is not kept**: it does less at its place, and its window lies nearer than its place.

The same search of the Warrior's and the Rogue's other cells, each from its recipe (`--model`,
`--held`, `--band`, `--guard` for a fist, `--from <body>:<band>`; the Rogue's fists were not
searched), read the same way, `--hz 120,480` on the robustness script. A best is kept where at the
game's rate it steps less at nothing than its recipe, does 0.8 of what its recipe does at its
place or more, and has a window the feet can be set to; it is written in its recipe's place
(`research/core-strike-repertoire.mjs`) and its window measured again (`core-strike-window.mjs
--write --only`).

| Body | Held | Band | Searched, recipe / still | Replay 120 / 480 / 1920 Hz net, recipe | still | At its place, 16 throws, recipe / still | At nothing, 120 Hz: steps (throws that stepped, down), recipe | still | 480 Hz, recipe | still | Window along, across, up, recipe | still | Kept |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | wooden club | middle | 1.428 / 1.367 | 1.42 / 1.32 / 1.32 | 1.25 / 1.35 / 1.37 | 1.34 / 1.29 | 13 (6, 0) | 7 (4, 0) | 21 (12, 0) | 2 (1, 0) | -16 to 8, -6 to 4, -30 to 26 | -14 to 12, -6 to 6, -30 to 26 | yes |
| Rogue | wooden club | high | 0.467 / 0.378 | 0.43 / 0.47 / 0.46 | 0.39 / 0.32 / 0.33 | 0.43 / 0.38 | 3 (2, 0) | 12 (7, 0) | 61 (16, 4) | 2 (1, 0) | -14 to 6, -2 to 6, -8 to 8 | -6 to 4, -4 to 4, -14 to 6 | no |
| Rogue | wooden club | middle | 0.554 / 0.494 | 0.53 / 0.56 / 0.59 | 0.50 / 0.38 / 0.43 | 0.52 / 0.49 | 44 (13, 6) | 6 (4, 0) | 26 (13, 0) | 22 (11, 0) | -10 to 10, -6 to 6, -40 to 24 | -10 to 12, -6 to 2, -46 to 26 | yes |
| Warrior | fist | high | 0.023 / 0.025 | 0.023 / 0.020 / 0.021 | 0.024 / 0.024 / 0.024 | 0.12 / 0.13 | 21 (16, 0) | 0 (0, 0) | 26 (16, 0) | 0 (0, 0) | -6 to 2, -2 to 14, 0 to 8 | -4 to 4, -10 to 14, -8 to 10 | yes |
| Warrior | fist | middle | 0.550 / 0.665 | 0.51 / 0.32 / 0.34 | 0.56 / 0.48 / 0.45 | 0.52 / 0.61 | 1 (1, 0) | 0 (0, 0) | 6 (6, 0) | 0 (0, 0) | -2 to 2, -8 to 2, -36 to 20 | 0 to 0, -2 to 4, -38 to 14 | no |

- **Three are kept, and each keeps its feet better at the game's rate**: the Warrior's club at a
  trunk steps 7 times where its recipe stepped 13, the Rogue's club at a trunk 6 where its recipe
  stepped 44 and was down after 6 throws, and the Warrior's fist at a head never where its recipe
  stepped in every throw. Each does 0.94 to 1.08 of what its recipe does at its place, and its
  window is as wide or wider but across the Rogue's club, 8 cm where 12.
- **The Rogue's club at a head is not kept**: it steps more at 120 Hz, 12 where 3, though at
  480 Hz it steps twice where its recipe stepped 61 times and was down after 4; and its window
  along is half its recipe's.
- **The Warrior's fist at a trunk is not kept**: it does more at its place and never steps, but
  its window along is nothing, narrower than the 4 cm the feet are set to.
- **The Rogue's club at a trunk converges with the rate worse than its recipe**: 0.38 at 480 Hz
  where 0.56. Its window holds 0.8 of what it does at 120 and 480 Hz alike.

### The skeleton searched again

With its thighs and upper arms clear (`skeleton-limbs-clear`) the skeleton's recipes were searched
again ([the searches](#the-searches)): each cell's nets as much as it did or more, at 120 Hz 0.735
HP where 0.660 with the club at a head, 1.112 where 1.075 at a trunk, 0.034 where 0.026 with a fist
at a head, and 0.674 where 0.646 at a trunk. On the stand its club at a head now follows a target
twelve centimetres across ([steered](#steered)).

In bouts, `node research/strike-bouts.mjs --gaps 2.5,3,3.5,4,4.5,5,5.5 --held club,empty` (Node
core world, Rapier, 120 Hz, the arena's rulebook), 63 bouts each, the skeleton's attempts, with
the recipes before and after:

| Held | Recipes | Bout s, all | Committed | Landed | On the head | Done, HP | Stepped to catch itself | Down within 2 s | struck first |
|---|---|---|---|---|---|---|---|---|---|
| club | before | 819 | 50 | 42 | 27 | 8.87 | 23 | 4 | 2 |
| club | searched again | 863 | 36 | 30 | 20 | 10.47 | 17 | 0 | 0 |
| empty | before | 2170 | 251 | 132 | 64 | 2.51 | 139 | 2 | 2 |
| empty | searched again | 1506 | 133 | 72 | 41 | 1.80 | 77 | 8 | 6 |

- **With the club it does more in fewer throws** and is not down after one, where it was in four.
- **Bare-handed its bouts are shorter** and it throws half as often; of its eight downs six follow
  a foe's blow.
