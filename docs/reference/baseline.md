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
| stand-up | stood, of the target's 32 Warrior falls, shoved at `FELLING` | 0 (flat-footed: 32, median 9.4 s) |
| fight | score against the Duellist and Vanguard, 36 bouts | 0.61 (Duellist 0.44, Vanguard 0.78) |

## What is used

- The subject: the `kinetic` preset, its character's toes on.
- The opponents (`OPPONENTS`): the `duellist` and `vanguard-warrior` presets, never Kinetic's own.
- The stand-up: Kinetic's whole mind on the lone-body bed (it takes no Lab script), the target's
  directions and loadouts shoved at `FELLING` (237 N s, twice the target's shove on the 79 kg
  Warrior) and stood by the fight's down rule (`src/evaluation/fall.ts`). The target's own shove
  fells Kinetic standing in 1 of 32 falls on toes and 7 flat-footed; twice it fells 28 and 32. On
  toes every game riser stands none, so the reading is 0 until Kinetic's rise stands them
  ([Recovery](../plans/2026-10-23-recovery.md)). Flat-footed (the preset without its character,
  the plain straight punch, since the learned one is set for toes alone) Kinetic's Stand up
  stands all 32: the reading a change to the rise is paired on.

## Measurement

Node, core world, 120 Hz, at `c43aa358` (the stand-up at `c07fc4e0`): walk, punch and fight on
`rapier-coordinate`, stand-up on `rapier` (the falls fix it); reaction time 0.15 s, bout seed 0.
The records:

| Competence | Record |
| --- | --- |
| walk | `assets/evaluations/baseline/2026-10-28-c43aa358-b68a3e72.jsonl` |
| punch | `assets/evaluations/baseline/2026-10-28-c43aa358-7537bf1f.jsonl` |
| stand-up | `assets/evaluations/baseline/2026-10-29-c07fc4e0-eba212a9.jsonl` |
| stand-up, flat-footed | `assets/evaluations/baseline/2026-10-29-c07fc4e0-d77dc2cd.jsonl` |
| fight | `assets/evaluations/baseline/2026-10-28-c43aa358-05ee4b28.jsonl` |

The fights are the standard match's loadouts Kinetic can strike with (empty hands, the club, the
sword) at gaps 3, 4 and 5 m, on each side; with a buckler it strikes with nothing the body has, so
those 24 are dropped. By opponent and side: the Duellist 5 of 9 on the left, 3 of 9 on the right;
Vanguard 7 of 9 each side. The walk falls in both turns about 1 s after turning at 1.9 m/s, and
from a run it is still moving 4 s after the stop is asked. The whole command takes about 5 minutes
on 12 workers, the fights 4 of them.

## Tried and not kept

- **Kinetic's sub-minds on the rising bed's host**, the stand verified: it reads no rise that is
  not a sub-mind, so the stand-up reads the whole mind on the lone-body bed.
- **The target's own shove on the lone-body bed**: it fells Kinetic standing in 1 of 32 falls on
  toes.
- **The best riser on toes**: step-up, the staged route and a stand-up with every technique each
  stand 0 of the 32 on toes; on the game's flat feet the staged route and every technique stand
  30 of 32 (medians 12.4 s empty-handed, 16.0 s with the club).
