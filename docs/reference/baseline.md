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
| fight | score against the Duellist and Vanguard, 36 bouts | 0.68 (Duellist 0.72, Vanguard 0.64) |

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

Node, core world, 120 Hz, at `c43aa358` (the punch again at `3e6e204c`, the same trials with the target's sensed phase; the stand-up at `35faee00`, the fall bed; the fight at `cc339f53`, options selected as a set, covers taking the blow predicted to reach the head, the goals made from the skills and the gaits among them, a running option kept by its cost of letting go alone): walk, punch and fight on
`rapier-coordinate`, stand-up on `rapier` (the falls fix it); reaction time 0.15 s, bout seed 0.
The records:

| Competence | Record |
| --- | --- |
| walk | `assets/evaluations/baseline/2026-10-28-c43aa358-b68a3e72.jsonl` |
| punch | `assets/evaluations/baseline/2026-10-29-3e6e204c-1be9aa1c.jsonl` |
| stand-up | `assets/evaluations/baseline/2026-10-29-35faee00-1e9bfc4d.jsonl` |
| fight | `assets/evaluations/baseline/2026-10-29-cc339f53-da3510a2.jsonl` |

The fights are the standard match's loadouts Option Mind can strike with (empty hands, the club, the
sword) at gaps 3, 4 and 5 m, on each side; with a buckler it strikes with nothing the body has, so
those 24 are dropped. By opponent and side: the Duellist 6 of 9 on the left, 7 of 9 on the right;
Vanguard 6 of 9 on the left, 5 of 9 and a draw on the right. The score is coarse here: many bouts
end within 0.06 of even. Paired bout by bout with `ddba3991` (0.64, the covers taking the blow
already closing on the head), the score moved +0.042 (95 % −0.111 to 0.194) and the life margin
+0.026 (−0.039 to 0.084), 0.064 to 0.089. The walk falls in both turns about 1 s after turning at 1.9 m/s, and
from a run it is still moving 4 s after the stop is asked. The whole command takes about 5 minutes
on 12 workers, the fights 4 of them.

## Tried and not kept

- **The best riser on toes** (on the lone bed at `0e158ffb`, shoved at 237 N s, read by the
  fight's down rule): step-up, the staged route and a stand-up with every technique each
  stand 0 of the 32 on toes; on the game's flat feet the staged route and every technique stand
  30 of 32 (medians 12.4 s empty-handed, 16.0 s with the club).
