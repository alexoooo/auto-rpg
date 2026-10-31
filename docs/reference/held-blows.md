# Held blows

The toed Warrior's club blow, sword cut and sword thrust (`src/core/skills/strikes/held-blow.ts`)
read against the held blow's bar: 64.8 J of the rules' energy, met with the item's face (the club
blunt, the cut its edge, the thrust its point), at the mark asked, the striker up
([Club and sword](../plans/2026-10-31-club-and-sword.md#the-bar), `BAR.held`,
`src/evaluation/strike/read.ts`). The club's searched schedule lands at the bar at its own
places at both rates, 70 to 86 J; the cut and the thrust do not reach it.

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
  Warrior's only. The club's is its searched schedule (below), admitted standing 1.04 m from the
  target (`reach` 0.73 of its 0.90 m arm, shoulder to swell; `band` 0.03 m, `aside` 0.17 m); the
  cut's and the thrust's are the punch's schedule set by hand. No network yet. A steer reads the
  layout `assets/core/<kind>.layout.json`: the punch's inputs and outputs and the striking wrist's
  three channels.
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

### The blades it would replace

`BLADE_STRIKE`'s thrust (the Duellist's, `duellist/thrust@buckler,sword`), on the same still rung
at 9906c33a: 0 of 128 landed, 8 met the mark, median 0.18 J. Neither held sword blow lands either,
so the Duellist keeps it.

## Tried and not kept

- **Faster or stronger arms for the club** (above): no faster at the target, so not kept.
- **A club met with the palm** (`BLUNT_FACING` the item's z, either way): from the guard it met
  the target's guard, 15.5 J at best, unsearched.
- **The club at the head** (the high mark): refused, the head above the arm's height band.
- **The cut drawn back** (`--chamber`, from the cut's best): 4.23 at 17 generations, under the
  cut's 4.93.
- **The thrust drawn back nearer the target** (`--chamber --chamber-range 0.3,0.75`, from the
  thrust's best): 4.76 at 33 generations, under the thrust's 5.57.
