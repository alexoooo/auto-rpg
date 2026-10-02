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

**What is read** (`TargetReading`). The first blow on the dummy; the nearest any shape of the
hand's body came to the dummy's surface from the strike's beginning to `TARGET_WATCH` after its
pushes end (`SegmentBody.gapTo`: a fist, a club or anything else the hand's body is made of);
and the strike thrown, with its fist's peak speed and where the head stood from the recipe's
place. The Warrior's club at a target 1.3 m under the head's height passes 0.28 m off by its
swell and 0.72 m by its knuckles. A body that goes down closes the reading as it stands
(`fell`).

## Baseline

`node research/core-targets.mjs --each`: the Routine's ten targets of seeds 1, 2 and 3
(`drawTargets`: the control, then high, middle and low in turn), each target on a run of its own,
the walk out to it included. With a hand empty the hands strike in turn; with the club in the
right hand that hand strikes at every target. Node core stand, Rapier, 120 Hz, no assist, the
arena's rules (138.26 J a hit point). No run fell, and no target went unhung or unread.

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

What it says of the strike skill as it stands, which reads a target's place across the ground
and not its height:

- **A fist lands where its recipe was searched to land and near it.** The Warrior's and the
  Rogue's strike the control, at 7.5 J and 6.0 J; nothing low is struck by a fist of either. The
  Rogue's high targets are all touched, at half the control's damage in the mean.
- **The club's swing comes down through the middle.** The Warrior's strikes every high target
  and 5 of 9 in the middle, the control at 100.1 J and 17.3 m/s of closing.
- **A recipe searched on another body misses on this one.** The Rogue and the skeleton have no
  club blow of their own and throw the Warrior's: the Rogue's passes 0.6 to 0.9 m off, the
  skeleton's 0.2 to 0.3 m. The skeleton's fist, the Warrior's too, passes the control by 18 cm.

### A loop of ten

`node research/core-targets.mjs --list`: the same targets, the ten of a seed struck at in turn
on one run, as the page runs them. Same harness. A body that falls lies where it fell, and the
targets after are unread.

| Body | Held | Runs that looped, of 3 | Targets read, of 30 | Hit | Where the others fell |
|---|---|---|---|---|---|
| Warrior | empty | 2 | 23 | 8 | closing on its third target, its second blow landed |
| Warrior | club | 1 | 24 | 9 | closing on its fifth target; setting its feet for its ninth |
| Rogue | empty | 3 | 30 | 14 | - |
| Rogue | club | 0 | 13 | 0 | setting its feet for its fourth or fifth target |
| Skeleton | empty | 0 | 8 | 0 | at its second target, or closing on its third |
| Skeleton | club | 0 | 6 | 0 | setting its feet for its second target |

- **The borrowed strikes put their bodies down whether or not they land.** The Rogue with the
  club and the skeleton land nothing here and fall within five targets.
- **The Warrior falls stepping to a target after a blow of its own has landed.** Seed 1, empty
  hands (one run, read once): its left straight lands on the second target at 13.0 J; in the half
  second after, a recovering step sets its left foot about 0.2 m from its right; the third target
  is about 0.2 m to its right, and the strike skill closing on it carries the trunk out over the
  right foot, which does not step. How often, over loops, and against the same strikes thrown at
  targets with no dummy hung: [lab.md](lab.md#routine-gait).
