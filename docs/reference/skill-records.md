# Skills tuned per body

Each body's row of each skill tuned per body (`SkillRecord`, `src/core/skills/framework/records.ts`)
and the run that wrote it. A row's `made` says the same in one sentence; this record holds the
searches' readings.

## What is used

| Skill | Body | Row |
| --- | --- | --- |
| Straight punch | toed Warrior | searched and trained ([learned punch](learned-punch.md)) |
| Front kick | toed Warrior | `KICK_PATH`, qualified on the flat-footed Warrior's stand ([front kicks](front-kicks.md#execution-settings)) |
| Front kick | toed Skeleton | searched on the kicking rung: lands on nothing ([below](#the-skeletons-front-kick)) |
| Stomp | toed Warrior | the Strike drill's stomping rung ([stomp settings](front-kicks.md#stomp-settings)) |
| Path strike | toed Warrior | `ATTACK_PATH`, the flat-footed Warrior's search cells ([combat strikes](combat-strikes.md#trajectory-settings)) |
| Blade cut, blade thrust | toed Warrior | `BLADE_STRIKE`, set by hand with the short sword's actions and read by the blade task |
| Club blow | toed Warrior | searched on the Strike drill's still rung ([held blows](held-blows.md#the-club)) |
| Sword cut, sword thrust | toed Warrior | the straight punch's schedule, set by hand ([held blows](held-blows.md)) |
| Blade cut, blade thrust | toed Rogue, toed Skeleton | searched on the blade task ([below](#the-blades)) |
| Vanguard's punch | toed Warrior, Rogue, Skeleton | each calibration's strokes for its own body ([Vanguard](vanguard.md#body-motor-profiles)) |

No other body has a row: the path strike, the stomp, the straight punch and the held blows are the
Warrior's alone, and the front kick no Rogue's.

## Measurement

`research/skill-search.mjs`: diagonal CMA over the settings that shape the motion, the rest held at
the start's, from the settings the body threw before it had a row of its own (the Warrior's; the
Skeleton's front kick, the Warrior's with the stomp's stroke). Node, the bout world, Rapier, 120 Hz,
default attributes. A candidate scores the mean of its trials; the start and the best are then
played on fresh trials from other gaps, and the best is kept only where it scores above the start
there with no more falls. Search files: `research/runs/skill-search/` (ignored).

### The blades

The blade task's striker (sword and buckler, Behaviours' tactics, its one blow with the right
hand) at a standing Warrior's high and middle marks, 12 s each and on until the swing returns.
Searched: `chamberSeconds`, `swingSeconds`, `returnSeconds` (0.2 to 0.8 s), `contactSpeed` (0.3 to
3 m/s), `windup` (0.05 to 0.35 m), `through` (0 to 0.15 m); 10 generations of 16 candidates, 6
trials each (gaps 1.2, 1.4, 1.6 m). A trial scores the wound its cuts dealt, HP (`bladeSummary`),
-0.5 where the striker was felled. Confirmed on 6 fresh trials (1.3, 1.5, 1.7 m).

| Skill, body | Wall time | First generation, median | Best, searched | Start, fresh (falls) | Best, fresh (falls) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cut, Rogue | 533 s | 0.03 | 0.220 | 0.002 (0) | 0.054 (0) |
| Cut, Skeleton | 483 s | -0.08 | 0.075 | 0.000 (0) | 0.046 (0) |
| Thrust, Rogue | 365 s | 0.26 | 2.481 | 0.476 (0) | 1.442 (0) |
| Thrust, Skeleton | 385 s | -0.06 | 0.176 | -0.010 (1) | 0.211 (1) |

Every best is kept. Each swings shorter (0.21 to 0.33 s, from 0.45) from a longer windup (0.28 to
0.35 m, from 0.18); the Rogue's cut and thrust windups sit at the searched range's top, 0.35 m. The
cut stays weak on both bodies, 0.05 HP a trial; the Rogue's thrust is the strong blow.

### The Skeleton's front kick

The Strike drill's `kicking` rung: Option Mind's low kick thrown by the Skeleton with each foot at
the middle of a Warrior, a Skeleton and a Reptile lying limp. Searched: `contactSpeed` (1.5 to
9 m/s), `swingSeconds` (0.2 to 0.5 s), `lift` (0.2 to 0.6 m), `windup` (0 to 0.2 m), `alongNear`
(0.1 to 0.5 m), `alongFar` (0.4 to 0.9 m), `returnNear` (0.04 to 0.15 m); 10 generations of 16, 12
trials each (gaps 0.8, 1.2 m), 1321 s. A trial scores the drill's bar (`barScore`: -3 a fall, -1
nothing on the mark, 9 landed) and 5 a hit point dealt. Confirmed on 18 fresh trials (0.9, 1,
1.1 m).

No candidate landed. The start fell in 11 of 18 fresh trials (-2.22); the best fell in 1 and
never came into its window in 16 (-1.11), and is kept by the rule. The Skeleton's low kick has no
setting that lands at a body lying limp; what it brings against a low foe standing, the Reptile it
was added for, the rung does not read.

## Tried and not kept

- **The kicking rung at a target standing in guard**: every one of the Skeleton's front kicks at a
  standing Warrior's or Skeleton's middle was refused, the target outside the leg's height band (a
  standing trunk is above the hip). The rung's targets lie limp instead.
