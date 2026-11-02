# Skills tuned per body

Each body's row of each skill tuned per body (`SkillRecord`, `src/core/skills/framework/records.ts`)
and the run that wrote it. A row's `made` says the same in one sentence; this record holds the
searches' readings.

## What is used

| Skill | Body | Row |
| --- | --- | --- |
| Straight punch | toed Warrior | searched and trained ([learned punch](learned-punch.md)) |
| Stomp | toed Warrior | the Strike drill's stomping rung ([stomp settings](front-kicks.md#stomp-settings)) |
| Stomp | toed Rogue | searched on the stomping rung from the Warrior's, scaled by stature |
| Stomp | toed Skeleton | the Warrior's, scaled by stature: a seed, not searched; lands on nothing |
| Path strike | toed Warrior | `ATTACK_PATH`, the flat-footed Warrior's search cells ([combat strikes](combat-strikes.md#trajectory-settings)) |
| Blade cut, blade thrust | toed Warrior | `BLADE_STRIKE`, set by hand with the short sword's actions and read by the blade task |
| Club blow | toed Warrior | searched on the Strike drill's still rung, steered by PPO ([held blows](held-blows.md#the-club-steered)) |
| Sword cut, sword thrust | toed Warrior | the straight punch's schedule, set by hand ([held blows](held-blows.md)) |
| Blade cut, blade thrust | toed Rogue, toed Skeleton | searched on the blade task ([below](#the-blades)) |

No other body has a row: the path strike, the straight punch and the held blows are the Warrior's
alone.

## Measurement

`research/skill-search.mjs`: diagonal CMA over the settings that shape the motion, the rest held at
the start's, from the settings the body threw before it had a row of its own (the Warrior's). Node,
the bout world, Rapier, 120 Hz, default attributes. A candidate scores the mean of its trials; the start and the best are then
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
