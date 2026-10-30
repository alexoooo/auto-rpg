# Skeleton combat measurements

These records cover development screens, not the greater-than-90% target against every Arena
opponent. The 11/16 panel belongs to `c5ce647b`, which includes a blade-specific lead valuation.
It cannot qualify a revision without that rule. The [campaign](../plans/2026-10-30-option-skeleton.md)
defines the target; the [roadmap](../roadmap.md) holds its status.

## Conditions

Node core bout world, `rapier-coordinate`, 120 Hz; 15 kg empty-handed Skeleton, flat feet,
Balance 0 and default attributes. Reaction delay is 0.15 s, seed 0. The mixed panel is eight
opponents, each played on both sides at 4 m on the open stage, with the Arena's verdict and cap.
It omits Vanguard and most legal loadouts.

## Records

| Code | Reading | Evidence |
| --- | --- | --- |
| `0c079314` | 6/6 wins against empty-handed Skeleton Duellist; all end by health drain | [Match](../../assets/evaluations/match/2026-10-30-0c079314-18e4f8e8.jsonl) |
| `0c079314` | 6/6 trunk contacts and completed returns; 0/6 meet the human punch bar | [Strike](../../assets/evaluations/strike/2026-10-30-0c079314-85bf3d0a.jsonl) |
| `0bd473d1` | Mixed panel: 6 wins, 10 losses; mean life margin -0.096 | [Panel](../../assets/evaluations/tournament/2026-10-30-0bd473d1-6ae8eb13.jsonl) |
| `7a4014ab` | Mixed panel: 9 wins, 7 losses; mean life margin +0.014 | [Panel](../../assets/evaluations/tournament/2026-10-30-7a4014ab-23ee982f.jsonl) |
| `c5ce647b` | Mixed panel: 11 wins, 5 losses; mean life margin +0.017 | [Panel](../../assets/evaluations/tournament/2026-10-30-c5ce647b-5c996c27.jsonl) |
| `c62d0d62` | 2 wins against Vanguard's empty-handed Skeleton; mean life margin +0.026 | [Pair](../../assets/evaluations/skeleton-combat/2026-10-30-c62d0d62-0bd6da30.jsonl) |

The initial match uses empty-handed Skeletons at 3, 4 and 5 m, swapping sides. The Strike
recipe uses a standing Warrior's trunk at 0.8, 1 and 1.2 m, each hand once. The Vanguard record
contains an enumeration of 246 opponents across 11 presets at its version; only that pair is
played. None of these small deterministic grids estimates performance across fresh conditions.

`npm run compare` verifies the shared context of the initial and `7a4014ab` panels. Comparing
`7a4014ab` with `c5ce647b` is descriptive: intervening evaluation tooling changes fail its
shared-context check. The physical recipes and opponents match, and all ten non-blade bouts
retain exact pose digests and readings. The two added wins have life margins +0.0000249
against Rogue sword-and-buckler on the left and +0.0021186 in the Skeleton sword duel on the
right. Both guard and lead valuation change, so these records do not isolate the guard's effect.

## Local screens

Recipes, traces, per-second diagnostics and search rows remain in the ignored
`research/runs/option-skeleton-combat/` directory. Its `recovery/` and `exchange/` folders keep
the corresponding harnesses and logs.

| Question | Reading and decision |
| --- | --- |
| Recovery value against a foe with no modeled hand attack | The original value is zero. Counting lost own offence restores a positive cost; the Reptile pair wins twice at `7a4014ab` but remains down for 92.3 and 96.2 s. This fixes valuation, not recovery. |
| Private roll and rise | Six of eight placed starts stand, four of six reserved starts do; actual Rogue falls still fail. The experimental implementation is not retained. |
| Raised guard | A 16-candidate, 83.7 s search finds two positive 20 s Rogue exchanges. Applying the guard and early lead protection universally wins only 8/16 panel bouts. |
| Further adaptive guard search | Best of 32 candidates, 320.8 s, wins only one of four full sword confirmations. Rejected. |
| Raised construction pose | Lowering it against non-blades still regresses non-blade fights; 9/16 panel wins. Rejected. |
| Punch and leg-kick proxies | Short-range punch settings lose three of four full confirmations; leg-directed kicks stall or lose the short exchanges. Rejected. |

## Viewing

The `c5ce647b` recorded failures are inspected in the browser: at 10 s against the Rogue the
Skeleton is down while the Rogue stays clear; at 20 s in the Skeleton sword duel both bodies
are down and struggling to rise. Health readings match the Node records at those times.
The baseline Rogue approach and fall are also inspected. These are partial failure-reel
inspections, not complete-bout viewing or skill qualification. No rung is accepted.
