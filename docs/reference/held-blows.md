# Held blows

The toed Warrior's club blow, sword cut and sword thrust (`src/core/skills/strikes/held-blow.ts`)
read against the held blow's bar: 64.8 J of the rules' energy, the cut 18.5 m/s at the blade's far
end instead ([section 3](human-strike-reference.md#3-one-handed-sword-cut)), the thrust 4.6 m/s of
its point's closing speed ([section 3a](human-strike-reference.md#3a-one-handed-thrust-a-persons-stab)),
met with the item's face (the club blunt, the cut its edge, the thrust its point), at the mark
asked, the striker up
([the bars](../plans/2026-11-01-option-mind-everywhere.md#the-bars), `BAR.held`,
`src/evaluation/strike/read.ts`). The club, steered, lands 272 and 277 of 300 held-out trials
at 120 and 480 Hz (91 and 92 %), but 3 fell at 480 Hz, and the bar has none fall: it is not yet
at the bar. The cut and the thrust do not reach it.

## What is used

- **The blow**: the straight punch's whole-body drive (`straightPunchExecutor`) thrown with the
  face of what the hand holds (`StrikingFace`, `faceOf`). The club's face is its swell (`aim`)
  meeting the target along the hand's length (`BLUNT_FACING`, the item's x); the sword's cut is
  its `edge.right` point along the edge's direction, its thrust its `tip` along the blade. The
  arm's contact pose is solved with two points of the hand (`solveReach`): the striking point on
  the line from the shoulder, and a point `FACE_LEVER` (0.3 m) behind it against its facing, so the
  face meets the target along that line. A held face's arm is solved from its guard each step, so
  a chamber that draws the arm back (a negative `chamber`) leaves one contact pose to drive at.
- **The records**: `assets/core/club-blow.json`, `sword-cut.json`, `sword-thrust.json`, the toed
  Warrior's only. The club's is its searched schedule (below) and the network trained on it
  ([steered](#the-club-steered)), admitted as it was trained (`reach` 0.6 of its 0.90 m arm,
  shoulder to swell, `band` 0.25 m, `aside` 0.3 m); the cut's and the thrust's are the punch's
  schedule set by hand, with no network. A steer reads the layout `assets/core/<kind>.layout.json`:
  the punch's inputs and outputs and the striking wrist's three channels.
- **What the drill reads**: a held blow lands only where the rules read its contact with the
  mechanism its part meets with (`ExecutorPart.meets`, `StrikeHit.faced`); a blow met otherwise is
  `weak`, whatever its energy.

## Measurement

`research/punch-drill.mjs --blow <kind>`: Option Mind's held blow on the Strike drill's still
rung, the Warrior's right hand holding the item and the left the buckler, square on, at the middle
mark; its schedule and gap searched by CMA-ES, each candidate a trial at 120 and at 480 Hz scored
by the worse (`barScore`: landed 9 and up; else up to 8, half the share of the bar's energy, half
for meeting with the face). With `--free`, a channel scheduled under a quarter of its effort is
pushed at the contact pose instead (`FREE`); with `--brake`, the brake is searched; with
`--chamber`, the chamber and the stand there. Node, the bout world, Rapier, at 190dd88b.

### The club

| Search | Generations | Best score | Its blow at 120 Hz, at 480 Hz |
| --- | ---: | ---: | --- |
| from the punch's trunk and legs, the arm free (`--free --brake`) | 60 | 6.86 | 27 J and 47 J |
| again from it | 15 | 6.94 | 47.6 J at 11.0 m/s and 49.6 J at 10.9 m/s |
| drawn back (`--chamber`, the arm solved from its guard) | 50 | 9.00 | **landed**, 79.9 J at 14.0 m/s; **landed**, 70.5 J at 13.7 m/s |
| again over gaps 1, 1.04 and 1.08 m (`--spread`), scored by their mean | 4 | 9.10 | **landed** at all six, 70 to 86 J, 13.9 to 15.3 m/s, 0.47 to 0.48 s after the action begins |

The schedule is `research/environments/club-blow.json`'s (the gap's mean, 1.04 m). Before it was
drawn back the club met the target still gaining speed, 0.7 m from where its guard holds it:
the same schedule on arms turning 1.2 times as fast (`UPPER_SPEED_IN_USE` 3.0) or with the
forearm and wrist twice as strong met the target no faster (11.0 m/s), and searches on either
body (50 and 45 generations from the second row's start) reached 6.44 and 7.31. The path is the
limit, not the muscles: drawn back, the swell meets the target at 14 m/s, and the body's numbers
are as they were. The best before it was a knife's edge: 47.6 J at a gap of 1.0469 m, 19.9 J at
1.047.

**Held out**, the schedule alone (`research/punch-policy-check.mjs --policy none`, seed 5001, 40
trials a rate, gaps 0.79 to 1.29 m and 0.15 m across the body to 0.3 m to the hand's side, Option
Mind's club blow alone): 2 landed at 120 Hz and 1 at 480, 2 falls at each. It lands at its own
places; a steer has to take it elsewhere.

### The club steered

PPO (`research/run-train.py`) on `research/environments/club-blow.json`: the searched schedule
steered by a network, Option Mind's club blow alone, the Warrior holding the club and the buckler,
the still rung's target 0.94 to 1.14 m away and 0.15 m across the body to 0.3 m to the club's
side, at 120 and 480 Hz. Node, the bout world, Rapier; 8 to 24 workers of 4, 8.5 M decisions in
about 10 h, then 1.05 M more from its 8.5 M network with a narrower spread (`--log-std -1.6`) and a
slower rate (`--lr 1e-4`) in 2.2 h, 8 workers of 4.

| Network | Held out (seed 6001, 100 a rate): 120 Hz | 480 Hz |
| --- | --- | --- |
| none, the schedule alone (seed 5001, 40, gaps 0.79 to 1.29 m) | 2 of 40, 2 fell | 1 of 40, 2 fell |
| 5.2 M decisions | 73, 2 fell | 91 |
| 6.2 M | 85, 1 fell | 85 |
| 7.1 M | 86, none fell | 88, 1 fell |
| 8.5 M | 88, none fell | 90 |
| 8.5 M, again (seed 7001, 200 a rate) | 174 of 200, 6 fell | 188 of 200 |
| 8.5 M and 1.05 M narrower, the record's | **89**, none fell | **90**, 1 fell |
| the same (seed 7001, 200 a rate) | **183 of 200**, none fell | **187 of 200**, 2 fell |
| the same, 1.5 M narrower | 87, 2 fell | 96 |

Landed blows meet at a median 15 to 16 m/s; the misses are weak blows spread over the places, the
nearest and farthest most. The window is the one it was trained in: a narrower one (`band` and
`aside` 0.15 m, or `reach` 0.73) admits the same places but moves the body before the blow, and
lands 72 and 62 (77 and 68). From 7 M decisions on it stays between 84 and 96 at either rate, a
fall in about a hundred trials at one rate or the other; the misses gather at the far side, 1.12 m
and beyond.

### The club up the ladder

The Strike drill (`npm run evaluate -- strike option/club-blow@buckler,club`), the steered club at
5a8f6a6c; Node, the bout world, Rapier, 120 Hz. Counted over the trials it threw (the Rogue, the
left hand and the high mark are refused):

| Rung | Landed of thrown | Fell | Where it misses |
| --- | ---: | ---: | --- |
| still (0) | 11 of 15 | 0 | 0.7 m, nearer than it was trained, and 1.2 and 1.3 m to the side, weak |
| moving (1) | 4 of 17 | 0 | weak or elsewhere at every pace and heading |
| stepping (2) | 0 of 1 | 0 | out of its window at 0.8 and 1.2 m |
| guarding (3) | 3 of 3 | 0 | |
| punching (4) | 3 of 3 | 0 | |
| walk (5) | 9 of 29 | 0 | thrown still walking (1 of 16; settled, 8 of 13) |
| fight | 0 of 4 | 1 | fell, guarded, missed |

Trained on (`research/environments/club-ladder.json`: the still rung from 0.6 m and the walk in,
PPO from the steered club's network), it gained nothing in 0.5 M decisions: nearer than 0.85 m
the club passes the target (`missed`), and every blow after the walk in misses it (16 of 16, 2
fell), as at the start.

Its profile (`assets/core/strike-profiles.json`) is read from the still, stepping, guarding,
punching and letting-go records (`assets/evaluations/strike/2026-10-31-5a8f6a6c-*.jsonl`), so
Option Mind prices the club by them.

### The cut

The cut's edge meets the target with little mass behind it: the best of 41 generations
(`--free --brake`, from the club's start) met the upper trunk with the edge at 10.2 m/s closing
and 0.40 kg, 20.1 J at 120 Hz and 15.0 J at 480. At 0.40 kg the bar asks 18 m/s closing at the
edge (`edge.right`, 0.36 m up the blade): a lay person's saber tip moves 13 to 15 m/s, a fencer's
17.5 to 19.5 ([human strike reference](human-strike-reference.md#3-one-handed-sword-cut)). The
rules' energy at the edge, not the body, keeps the cut from the bar: the one energy for every held
blow (the plan's decision, the owner's to reverse) asks of the short sword's edge what a person's
cut does not give.

### The thrust

The thrust meets with the arm behind its point, 4.4 to 4.8 kg, but slowly: the best of 80
generations drawn back (`--chamber`, the point set on the line before the drive) met the middle
trunk point first at 3.5 m/s closing, 25.4 J at 120 Hz and 27.6 J at 480. Without the chamber
(20 generations) the point came down across the target, 7.7 to 9.8 m/s but 1.2 to 1.9 m/s
closing. The grip lays the blade square to the hand's length, so the arm holds it along the line
only with the wrist near its stops.

Steered, it gains nothing: PPO from scratch on `research/environments/sword-thrust.json` (the best
schedule, the target 1.16 to 1.36 m away, 120 Hz alone at first and 480 Hz mixed in over 1.5 M
decisions) met every held-out trial weak after 1 M decisions, a median 16 J at 120 Hz and 17 J at
480, 32 J at most (30 a rate, seed 6001), no higher than at 0.5 M; at 1.5 M, 17 and 18 J, 36 J at
most, its training score flat from 0.4 M to 2 M.

### The blades it would replace

`BLADE_STRIKE`'s thrust (the Duellist's, `duellist/thrust@buckler,sword`), on the same still rung
at 9906c33a: 0 of 128 landed, 8 met the mark, median 0.18 J. Neither held sword blow lands either,
so the Duellist keeps it.

The sword's held blows as Option Mind holds them now (their hand-set records), on the Strike
drill's still rung at 76f1c94f (`assets/evaluations/strike/2026-10-31-76f1c94f-*.jsonl`): the cut
threw 7 and landed none (one weak, the rest guarded or elsewhere); the thrust threw 10 and landed
none.

## Tried and not kept

- **The toed Rogue's club blow**: its schedule searched from the Warrior's on the still rung
  (`research/punch-drill.mjs --blow club-blow`, gaps 0.9 to 1.1 m) lands 2 of 24 unsteered, most
  blows weak at 15 to 37 J against its scaled bar's 33.5. Steered by PPO on the Warrior's
  environment (`research/environments/club-blow.json`) with the Rogue in his place: from the
  Warrior's network, whole or with its outputs scaled by a quarter, it lands none (score -0.5);
  from scratch, 5.4 M decisions, its training score rose from 1.2 to 5 and the share meeting the
  bar stayed at 2 to 9 %, no better than unsteered. No record; Option Mind leaves the club blow out
  on the Rogue.
- **Faster or stronger arms for the club** (above): no faster at the target, so not kept.
- **A club met with the palm** (`BLUNT_FACING` the item's z, either way): from the guard it met
  the target's guard, 15.5 J at best, unsearched.
- **The club at the head** (the high mark): refused, the head above the arm's height band.
- **The cut drawn back** (`--chamber`, from the cut's best): 4.23 at 17 generations, under the
  cut's 4.93.
- **The thrust drawn back nearer the target** (`--chamber --chamber-range 0.3,0.75`, from the
  thrust's best): 4.76 at 33 generations, under the thrust's 5.57.
