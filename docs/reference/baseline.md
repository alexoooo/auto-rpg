# The baseline

Kinetic's reference record: what the reference mind does on the toed Warrior, read by the baseline
evaluation (`npm run evaluate -- baseline kinetic`, `src/evaluation/baseline/`), so a later change
reads what it touches by the same command and pairs it with `npm run compare`.

## Summary

| Competence | Reading | Kinetic |
| --- | --- | --- |
| walk | on its feet, of 39 trials | 37 (both turns fall) |
| walk | walks on pace (0.8 to 1.25 along, under a quarter across), of 8 | 8 |
| walk | stopped at the end, of 11 walks, runs and turns | 8 (the run and both turns not) |
| walk | top speed over a second, run and turns, median | 1.87 m/s |
| walk | shoves held, standing 30 to 60 N s and after a walk 20 N s, of 28 | 28 |
| punch | landed at the bar, of 128 still and walk trials | 74 (0.58) |
| punch | admitted, of 128 | 96 |
| punch | fell, of 128 | 0 |
| stand-up | stood, of the target's 32 Warrior falls | 0 |
| fight | score against the Duellist and Vanguard, 36 bouts | 0.61 (Duellist 0.44, Vanguard 0.78) |

## What is used

- The subject: the `kinetic` preset, its character's toes on.
- The opponents (`OPPONENTS`): the `duellist` and `vanguard-warrior` presets, never Kinetic's own.
- The stand-up: Kinetic's own sub-minds (step-up) on the rising bed's host. On toes every game
  riser stands none of the 32 falls, so the reading is 0 until Kinetic's rise stands them
  ([Recovery](../plans/2026-10-23-recovery.md)).

## Measurement

Node, core world, 120 Hz, at `c43aa358`: walk, punch and fight on `rapier-coordinate`, stand-up on
`rapier` (the falls fix it); reaction time 0.15 s, bout seed 0. The records:

| Competence | Record |
| --- | --- |
| walk | `assets/evaluations/baseline/2026-10-28-c43aa358-b68a3e72.jsonl` |
| punch | `assets/evaluations/baseline/2026-10-28-c43aa358-7537bf1f.jsonl` |
| stand-up | `assets/evaluations/baseline/2026-10-28-c43aa358-1ed3036e.jsonl` |
| fight | `assets/evaluations/baseline/2026-10-28-c43aa358-05ee4b28.jsonl` |

The fights are the standard match's loadouts Kinetic can strike with (empty hands, the club, the
sword) at gaps 3, 4 and 5 m, on each side; with a buckler it strikes with nothing the body has, so
those 24 are dropped. By opponent and side: the Duellist 5 of 9 on the left, 3 of 9 on the right;
Vanguard 7 of 9 each side. The walk falls in both turns about 1 s after turning at 1.9 m/s, and
from a run it is still moving 4 s after the stop is asked. The whole command takes about 5 minutes
on 12 workers, the fights 4 of them.

## Tried and not kept

- **Kinetic's whole mind as the riser**: the target's falls verify the stand on the stand bed,
  which drives a mind that takes the Lab's script; Kinetic does not, so the stand-up reads its
  sub-minds on the bed's host.
- **The best riser on toes**: step-up, the staged route and a stand-up with every technique each
  stand 0 of the 32 on toes; on the game's flat feet the staged route and every technique stand
  30 of 32 (medians 12.4 s empty-handed, 16.0 s with the club).
