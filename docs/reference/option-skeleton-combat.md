# The independent Skeleton's combat

The independent `option-skeleton` is below the owner's greater-than-90% target against every
Arena entrant. Its initial mixed panel wins 6 of 16. A low front kick changes the Reptile pair
from two losses to one win and one loss, while both fights leave the Skeleton down for most of
the bout. The [campaign](../plans/2026-10-30-option-skeleton.md) defines the work and final field.

## What is used

- The 15 kg Skeleton, empty-handed, flat feet and Balance 0, at default attributes.
- Its independent controller, private chooser and options under `src/core/entrants/option-skeleton/`.
- The game's verdict and cap, reaction delay 0.15 s, seed 0; both sides on the open stage at 4 m.
- The tournament's eight-member default panel for the initial reading. It is a development
  screen, not the complete Arena field, and omits Vanguard.

## Measurement

Node core bout world, `rapier-coordinate`, 120 Hz. Each figure below names its code.

| Reading | Result |
| --- | --- |
| Initial panel at `0bd473d1` | 6 wins, 10 losses, no draws |
| Reptile pair at `0bd473d1` | 2 losses, final life margins -0.8095 and -0.8098 |
| Reptile pair with low kick at `b19f628e` | 1 win, 1 loss; life margins +0.0653 and -0.0973 |
| Time down in the low-kick pair | 97.7 of 116.1 s on the left; 89.1 of 108.5 s on the right |

The initial panel's [record](../../assets/evaluations/tournament/2026-10-30-0bd473d1-6ae8eb13.jsonl)
keeps every recipe, trace digest and verdict. The short screens and the low-kick pair are kept
locally in `research/runs/option-skeleton-combat/screens.jsonl`, with recipes, per-second
diagnostics, blows, digests and wall times. The pair takes 25.3 s on two worker threads.

A 30 s diagnostic at `0bd473d1` shows no attempted action against the Reptile. Against the
Rogue with sword and buckler, the Skeleton is down by 11 s, and step-up times out after 16 s.
The low-kick pair remains below the target and qualifies no skill rung.

The starting isolation check, a ten-second empty-handed Skeleton duel against Duellist, has
the same pose digest for the reference and the independent controller: `0958ea8067b2cb32`.
The standard fingerprint also records the new entrant at `0bd473d1`.

The fights could not be watched: Chrome's development connection is unavailable, the browser
access host is unavailable, and native browser launch reports that app approval timed out.

## Tried and not kept

No rejected combat implementation is retained in the runtime package.
