# Empty-handed Option Mind on the Skeleton

`option-skeleton` wins the six-bout empty-handed match against the Skeleton's Duellist at
`0c079314`. The margins are small and every bout ends by health drain. Its punch touches the
trunk and returns, but all six Strike trials are weak against the drill's human punch bar.
This is a usable Arena preset, not an accepted punch rung or a recovery qualification.

## What is used

- The current 15 kg Skeleton, empty hands, flat feet and Balance 0 on both sides.
- Option Mind's valued chooser, guard and footwork; the unlearned `straight-punch` on either hand,
  at the trunk's opening, with `STRAIGHT_PUNCH` settings; `step-up` as its ground option.
- `npm run match -- option-skeleton duellist --protocol skeleton-unarmed`: both minds on the
  Skeleton, the open stage at 3, 4 and 5 m, each mind on each side.
- `npm run evaluate -- strike option-skeleton/straight-punch --protocol skeleton`: the still
  drill's standing Warrior, each hand at the trunk from 0.8, 1 and 1.2 m.

## Measurement

Node core world, `rapier-coordinate`, 120 Hz, reaction time 0.15 s, seed 0, code `0c079314`.
The match takes 73 s with four workers and the six Strike cases 10 s with two; the runs overlap.

| Reading | Result |
| --- | --- |
| Match | 6 wins, no draws or losses; digest `56ac39b5d74cdaf1`, protocol `41d1413a261f7a43` |
| Match life margin, mean | 0.028 of full life |
| Strike admitted / trunk contact / completed return | 6 / 6 / 6 of 6 |
| Strike met the human punch bar | 0 of 6; all weak |
| Strike fell / life lost to contact | 0 of 6 / 0 |
| Driven fist speed, median over the last 0.1 m before contact | 8.08 m/s |
| Effective striking mass, median | 0.223 kg |
| Contact energy, median | 2.14 J |

Records: [match](../../assets/evaluations/match/2026-10-30-0c079314-18e4f8e8.jsonl),
[Strike](../../assets/evaluations/strike/2026-10-30-0c079314-85bf3d0a.jsonl).
The [Strike subject](http://localhost:5180/?play=ratings&evaluation=strike&subject=option-skeleton/straight-punch&version=424da17dac59d222)
keeps the failed trials visible; no rung is accepted.

## Tried and not kept

Small Node core screens on the same engine and rate, Balance 0, at a standing Warrior 1 m away:

| Alternative | Reason not kept |
| --- | --- |
| Reach 0.95 | Both hands miss, the fist at least 0.10 m short of its aim at the nearest point |
| Reach 0.9, drive cap 0.4 s | Both hands still miss |
| Point-driven fist with less trunk turn and lean | Both hands contact, with less energy; a 20 s Skeleton exchange gives up the original stroke's advantage, so it is not the preset |
| Head as the asked mark | Both hands touch the Skeleton target's trunk instead |

The screen's rows are kept locally in `research/runs/option-skeleton-screen/probes.jsonl`.
