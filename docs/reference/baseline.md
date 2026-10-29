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
| stand-up | stood, of the target's 32 Warrior falls, all made | 0 (flat-footed: 31, median 12.2 s) |
| fight | score against the Duellist and Vanguard, 36 bouts | 0.61 (Duellist 0.44, Vanguard 0.78) |

## What is used

- The subject: the `kinetic` preset, its character's toes on.
- The opponents (`OPPONENTS`): the `duellist` and `vanguard-warrior` presets, never Kinetic's own.
- The stand-up: Kinetic's whole mind on the fall bed every mind is read on
  (`src/evaluation/fall.ts`): the target's directions and loadouts, shoved by the target's impulse
  and again while it holds the shove, its stand verified. Every one of the 32 falls is made. On
  toes Kinetic stands none, so the reading is 0 until its rise stands them
  ([Recovery](../plans/2026-10-23-recovery.md)). Flat-footed (the preset without its character,
  the plain straight punch, since the learned one is set for toes alone) Kinetic's rise, its
  ground options over the game's stand-up's techniques, stands 31 (16 empty-handed, median
  11.9 s; 15 with the club, 13.1 s), as the game's Stand up (`step-up`) on its puncher host does,
  31 at medians 11.9 and 13.1 s: the reading a change to the rise is paired on.

## Measurement

Node, core world, 120 Hz, at `c43aa358` (the punch again at `3e6e204c`, the same trials with the target's sensed phase; the stand-up at `35faee00`, the fall bed): walk, punch and fight on
`rapier-coordinate`, stand-up on `rapier` (the falls fix it); reaction time 0.15 s, bout seed 0.
The records:

| Competence | Record |
| --- | --- |
| walk | `assets/evaluations/baseline/2026-10-28-c43aa358-b68a3e72.jsonl` |
| punch | `assets/evaluations/baseline/2026-10-29-3e6e204c-1be9aa1c.jsonl` |
| stand-up | `assets/evaluations/baseline/2026-10-29-35faee00-1e9bfc4d.jsonl` |
| stand-up, flat-footed | `assets/evaluations/baseline/2026-10-29-35faee00-24ddc3ca.jsonl` |
| stand-up, step-up | `assets/evaluations/baseline/2026-10-29-35faee00-09ec36b3.jsonl` |
| fight | `assets/evaluations/baseline/2026-10-28-c43aa358-05ee4b28.jsonl` |

The fights are the standard match's loadouts Kinetic can strike with (empty hands, the club, the
sword) at gaps 3, 4 and 5 m, on each side; with a buckler it strikes with nothing the body has, so
those 24 are dropped. By opponent and side: the Duellist 5 of 9 on the left, 3 of 9 on the right;
Vanguard 7 of 9 each side. The walk falls in both turns about 1 s after turning at 1.9 m/s, and
from a run it is still moving 4 s after the stop is asked. The whole command takes about 5 minutes
on 12 workers, the fights 4 of them.

## Tried and not kept

- **The best riser on toes** (on the lone bed at `0e158ffb`, shoved at 237 N s, read by the
  fight's down rule): step-up, the staged route and a stand-up with every technique each
  stand 0 of the 32 on toes; on the game's flat feet the staged route and every technique stand
  30 of 32 (medians 12.4 s empty-handed, 16.0 s with the club).
