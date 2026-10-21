# Orders

What a body does with an order to walk one way while it faces another (`recipeTactics`,
`src/core/mind/recipe-tactics.ts`), behind `STRAFE` (`src/core/mind/ordered.ts`).

## The rule

`STRAFE`: a body ordered to face where it is not walking walks at `share` of its fastest walk (0.5)
until it has turned to within `turned` of that facing (0.3 rad), and from then at the share plus the
rest times the cosine of the angle between its heading and its walk, so straight ahead is the whole
walk and across or backward is the share. A body with no facing ordered walks forward at its
fastest walk and turns to its walk.

The share is 0.5 because below it nothing more is gained: at 0.5 no body falls facing ahead or a
quarter turn off, and one walk of each human falls on the half turn; at 0.4 and 0.3 the half turn
still drops 2 and 1. `turned` was not swept: 0.3 rad is the value the rule was first read at.

## Measurement

Node stand (`tests/harness/core-stand.mjs`), Rapier, 120 Hz; each body alone on a ground, the
wooden club in its right hand, under `recipeTactics` given one order for an 8 s walk; eight world
bearings 45 degrees apart, the body built facing +z; four facings: its walk (none ordered), a far
point ahead (+z), a quarter turn to its right (+x) and behind (-z). A fall is the stance's
(`SkillReport.fallen`). 384 walks.

```powershell
node research/orders-walk.mjs --workers 14 --shares 1,0.7,0.5,0.4,0.3
```

Falls of 8 walks, Warrior, Rogue and skeleton:

| Share | Facing ahead | A quarter turn | A half turn |
|---|---|---|---|
| none ordered (the walk) | 1, 0, 0 | | |
| 1 | 1, 1, 0 | 5, 1, 0 | 7, 4, 0 |
| 0.7 | 0, 0, 0 | 0, 0, 0 | 5, 6, 0 |
| **0.5** | 0, 0, 0 | 0, 0, 0 | 1, 1, 0 |
| 0.4 | 0, 0, 0 | 0, 0, 0 | 1, 1, 0 |
| 0.3 | 0, 0, 0 | 0, 0, 0 | 0, 1, 0 |

The rows were read at fastest walks of 0.7, 0.5 and 0.2 m/s (the envelope measured unarmed, walking
forward); as a fight plays each body they are 0.5, 0.4 and 0.4 (`assets/core/stance-envelope.json`).

- **What still drops a body is a half turn made while it walks.** Turning on the spot is not
  something the stance does ([locomotion](locomotion.md)).
- **The walk with no facing ordered**, every walk a side makes for itself, dropped the Warrior once
  in 8, walking at -135 degrees: it turns more than a quarter while it walks.
- **Off its facing**: at 0.5 every body holds within 0.15 rad of its facing; at the whole pace the
  Rogue's half turn strays 0.63.
- **The skeleton barely moves on some bearings**: its least distance in 8 s is 0.19 m facing ahead
  and 0.06 m on the half turn, at half of 0.2 m/s.
