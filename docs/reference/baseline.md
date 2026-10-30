# The baseline

Option Mind's reference record: what the reference mind does on the toed Warrior, read by the baseline
evaluation (`npm run evaluate -- baseline option`, `src/evaluation/baseline/`), so a later change
reads what it touches by the same command and pairs it with `npm run compare`.

## Summary

| Competence | Reading | Option Mind |
| --- | --- | --- |
| walk | on its feet, of 39 trials | 37 (both turns fall) |
| walk | walks on pace (0.8 to 1.25 along, under a quarter across), of 8 | 8 |
| walk | stopped at the end, of 11 walks, runs and turns | 8 (the run and both turns not) |
| walk | top speed over a second, run and turns, median | 1.87 m/s |
| walk | shoves held, standing 30 to 60 N s and after a walk 20 N s, of 28 | 28 |
| punch | landed at the bar, of 128 still and walk trials | 74 (0.58) |
| punch | admitted, of 128 | 96 |
| punch | fell, of 128 | 0 |
| stand-up | stood, of the target's 32 Warrior falls, all made | 0 |
| fight | score against the Duellist and Vanguard, 60 bouts | 0.62 (Duellist 0.53, Vanguard 0.70) |

## What is used

- The subject: the `option` preset, its character's toes on.
- The opponents (`OPPONENTS`): the `duellist` and `vanguard-warrior` presets, never Option Mind's own.
- The stand-up: Option Mind's whole mind on the fall bed every mind is read on
  (`src/evaluation/fall.ts`): the target's directions and loadouts, shoved by the target's impulse
  and again while it holds the shove, its stand verified. Every one of the 32 falls is made. On
  toes Option Mind stands none, so the reading is 0 until its rise stands them
  ([Recovery](../plans/2026-10-23-recovery.md)). Option Mind stands on toes: a flat-footed reading
  is not taken.

## Measurement

Node, core world, 120 Hz, at `c43aa358` (the punch again at `3e6e204c`, the same trials with the target's sensed phase; the stand-up at `35faee00`, the fall bed; the fight at `d6200840`, options selected as a set, covers taking the blow predicted to reach the head, a covering face held between the foe's weapon and the body, the goals made from the skills and the gaits among them, a running option kept by its cost of letting go alone, the club blow at the head): walk, punch and fight on
`rapier-coordinate`, stand-up on `rapier` (the falls fix it); reaction time 0.15 s, bout seed 0.
The records:

| Competence | Record |
| --- | --- |
| walk | `assets/evaluations/baseline/2026-10-28-c43aa358-b68a3e72.jsonl` |
| punch | `assets/evaluations/baseline/2026-10-29-3e6e204c-1be9aa1c.jsonl` |
| stand-up | `assets/evaluations/baseline/2026-10-29-35faee00-1e9bfc4d.jsonl` |
| fight | `assets/evaluations/baseline/2026-10-30-d6200840-c9c6450d.jsonl` |

The fights are the standard match's loadouts (empty hands, the club, the buckler and club, the
sword, the buckler and sword) at gaps 3, 4 and 5 m, on each side, none dropped. By loadout, of 6
bouts each against the Duellist and Vanguard: empty-handed 1.00 and 0.33, the club 0.33 and 1.00,
the buckler and club 0.50 and 0.83, the sword 0.33 and 0.50, the buckler and sword 0.50 and 0.83.
Holding the buckler and the club it throws the club blow in each of the 11 bouts read, 1 to 9 ended a bout; more
of its asks stall short of the blow's window than end. The score is coarse here: 6 bouts a cell,
and many bouts end within 0.06 of even. The walk falls in both turns about 1 s after turning at 1.9 m/s, and
from a run it is still moving 4 s after the stop is asked. The whole command takes about 5 minutes
on 12 workers, the fights 4 of them.

## Tried and not kept

- **The best riser on toes** (on the lone bed at `0e158ffb`, shoved at 237 N s, read by the
  fight's down rule): step-up, the staged route and a stand-up with every technique each
  stand 0 of the 32 on toes; on the game's flat feet the staged route and every technique stand
  30 of 32 (medians 12.4 s empty-handed, 16.0 s with the club).
