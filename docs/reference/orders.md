# Orders

The measurements behind what a body does with an order to walk one way while it faces another
(`fighterTactics`, `src/core/mind/fighter.ts`).

## The rule

`STRAFE`: a body ordered to face where it is not walking walks at `share` of its fastest walk
(0.5) until it has turned to within `turned` of that facing (0.3 rad), and from then at the share
plus the rest times the cosine of the angle between its heading and its walk, so straight ahead
is the whole walk and across or backward is the share. A body with no facing ordered walks
forward at its fastest walk and turns to its walk.

Harness: Node stand (`tests/harness/core-stand.mjs`), Rapier, 120 Hz; each of the core's bodies
alone on a ground, the wooden club in its right hand, under `fighterTactics` given one order for
the whole of an 8 s walk; eight world bearings 45 degrees apart, the body built facing +z; four
facings: its walk (none ordered), and a far point ahead (+z), a quarter turn to its right (+x)
and behind (-z). A fall is the stance's (`SkillReport.fallen`), and a walk that fell is left out
of its row's distances. 384 walks.

```powershell
node research/orders-walk.mjs --workers 14 --shares 1,0.7,0.5,0.4,0.3
```

| Share | Body | Facing | Falls of 8 | Fell: bearing, deg, at s | Along, m: least to most | Across, m: most | Off its facing, rad: most |
|---|---|---|---|---|---|---|---|
|  | workshop-fighter | the walk | 1 | -135 at 4.3 | 1.98 to 3.79 | 0.91 | 0.05 |
| 1 | workshop-fighter | ahead | 1 | -90 at 3.7 | 3.73 to 4.58 | 0.38 | 0.17 |
| 1 | workshop-fighter | a quarter turn | 5 | 0 at 7.1, 90 at 2.3, 180 at 3.6, -135 at 2.7, -45 at 5.2 | 4.37 to 4.56 | 0.39 | 0.25 |
| 1 | workshop-fighter | a half turn | 7 | 0 at 6.3, 45 at 4.0, 90 at 2.5, 135 at 3.0, -135 at 3.1, -90 at 2.3, -45 at 3.8 | 4.24 to 4.24 | 0.46 | 0.03 |
|  | workshop-rogue | the walk | 0 |  | 2.07 to 3.01 | 0.72 | 0.15 |
| 1 | workshop-rogue | ahead | 1 | 180 at 5.1 | 2.59 to 3.40 | 0.22 | 0.11 |
| 1 | workshop-rogue | a quarter turn | 1 | -90 at 5.3 | 2.76 to 3.43 | 0.19 | 0.18 |
| 1 | workshop-rogue | a half turn | 4 | 45 at 4.9, 90 at 3.1, -135 at 3.3, -90 at 3.1 | 3.01 to 3.44 | 0.39 | 0.63 |
|  | crypt-skeleton | the walk | 0 |  | 0.87 to 1.32 | 0.36 | 0.05 |
| 1 | crypt-skeleton | ahead | 0 |  | 0.88 to 1.26 | 0.38 | 0.10 |
| 1 | crypt-skeleton | a quarter turn | 0 |  | 0.81 to 1.31 | 0.13 | 0.17 |
| 1 | crypt-skeleton | a half turn | 0 |  | 0.89 to 1.27 | 0.51 | 0.14 |
| 0.7 | workshop-fighter | ahead | 0 |  | 2.52 to 4.22 | 0.15 | 0.06 |
| 0.7 | workshop-fighter | a quarter turn | 0 |  | 2.68 to 4.04 | 0.28 | 0.12 |
| 0.7 | workshop-fighter | a half turn | 5 | 90 at 3.9, 135 at 3.3, 180 at 4.0, -135 at 3.2, -90 at 3.9 | 2.65 to 3.09 | 0.05 | 0.07 |
| 0.7 | workshop-rogue | ahead | 0 |  | 1.82 to 3.09 | 0.25 | 0.10 |
| 0.7 | workshop-rogue | a quarter turn | 0 |  | 1.87 to 2.89 | 0.50 | 0.18 |
| 0.7 | workshop-rogue | a half turn | 6 | 0 at 2.8, 45 at 5.3, 90 at 3.3, -135 at 3.8, -90 at 3.0, -45 at 2.6 | 2.72 to 2.96 | 0.35 | 0.26 |
| 0.7 | crypt-skeleton | ahead | 0 |  | 0.42 to 1.27 | 0.36 | 0.11 |
| 0.7 | crypt-skeleton | a quarter turn | 0 |  | 0.53 to 0.99 | 0.14 | 0.15 |
| 0.7 | crypt-skeleton | a half turn | 0 |  | 0.37 to 1.17 | 0.48 | 0.16 |
| 0.5 | workshop-fighter | ahead | 0 |  | 1.76 to 4.05 | 0.15 | 0.10 |
| 0.5 | workshop-fighter | a quarter turn | 0 |  | 1.80 to 3.74 | 0.21 | 0.09 |
| 0.5 | workshop-fighter | a half turn | 1 | 180 at 3.4 | 2.00 to 3.71 | 0.16 | 0.11 |
| 0.5 | workshop-rogue | ahead | 0 |  | 1.27 to 3.02 | 0.20 | 0.10 |
| 0.5 | workshop-rogue | a quarter turn | 0 |  | 1.26 to 2.68 | 0.12 | 0.14 |
| 0.5 | workshop-rogue | a half turn | 1 | -90 at 3.4 | 1.38 to 2.97 | 0.50 | 0.15 |
| 0.5 | crypt-skeleton | ahead | 0 |  | 0.19 to 1.25 | 0.36 | 0.12 |
| 0.5 | crypt-skeleton | a quarter turn | 0 |  | 0.33 to 1.01 | 0.22 | 0.14 |
| 0.5 | crypt-skeleton | a half turn | 0 |  | 0.06 to 1.10 | 0.40 | 0.15 |
| 0.4 | workshop-fighter | ahead | 0 |  | 1.44 to 4.03 | 0.15 | 0.06 |
| 0.4 | workshop-fighter | a quarter turn | 0 |  | 1.40 to 3.59 | 0.21 | 0.07 |
| 0.4 | workshop-fighter | a half turn | 1 | 180 at 4.5 | 1.53 to 3.44 | 0.28 | 0.10 |
| 0.4 | workshop-rogue | ahead | 0 |  | 1.03 to 3.02 | 0.22 | 0.10 |
| 0.4 | workshop-rogue | a quarter turn | 0 |  | 1.00 to 2.59 | 0.13 | 0.13 |
| 0.4 | workshop-rogue | a half turn | 1 | 180 at 4.3 | 1.04 to 2.46 | 0.18 | 0.12 |
| 0.4 | crypt-skeleton | ahead | 0 |  | 0.12 to 1.28 | 0.38 | 0.11 |
| 0.4 | crypt-skeleton | a quarter turn | 0 |  | 0.27 to 0.98 | 0.21 | 0.13 |
| 0.4 | crypt-skeleton | a half turn | 0 |  | -0.03 to 1.08 | 0.38 | 0.15 |
| 0.3 | workshop-fighter | ahead | 0 |  | 1.05 to 3.88 | 0.16 | 0.05 |
| 0.3 | workshop-fighter | a quarter turn | 0 |  | 1.00 to 3.43 | 0.19 | 0.07 |
| 0.3 | workshop-fighter | a half turn | 0 |  | 1.11 to 3.46 | 0.46 | 0.07 |
| 0.3 | workshop-rogue | ahead | 0 |  | 0.76 to 3.02 | 0.20 | 0.10 |
| 0.3 | workshop-rogue | a quarter turn | 0 |  | 0.72 to 2.56 | 0.12 | 0.13 |
| 0.3 | workshop-rogue | a half turn | 1 | 180 at 3.6 | 0.82 to 2.39 | 0.27 | 0.10 |
| 0.3 | crypt-skeleton | ahead | 0 |  | 0.08 to 1.26 | 0.37 | 0.09 |
| 0.3 | crypt-skeleton | a quarter turn | 0 |  | 0.17 to 0.99 | 0.21 | 0.14 |
| 0.3 | crypt-skeleton | a half turn | 0 |  | -0.04 to 1.01 | 0.39 | 0.15 |

The rows were read at fastest walks of 0.7, 0.5 and 0.2 m/s, the envelope measured unarmed and
walking forward; measured as a fight plays each body they are 0.5, 0.4 and 0.4
(`assets/core/stance-envelope.json`).

- **At the whole pace** the Warrior falls on 1, 5 and 7 of 8 walks facing ahead, a quarter turn
  and a half turn off, and the Rogue on 1, 1 and 4; the skeleton, at 0.2 m/s, on none.
- **At 0.7** neither human falls facing ahead or a quarter turn off, and 5 and 6 of 8 fall on the
  half turn.
- **At 0.5** none falls facing ahead or a quarter turn off, and one walk of each human falls on
  the half turn: 2 of 72. At 0.4 and 0.3 the half turn still drops 2 and 1, so below a half
  nothing more is gained, and the share is 0.5.
- **What still drops a body is a half turn made while it walks.** Turning on the spot is not
  something the stance does (`docs/roadmap.md`, Body and motor control).
- **The walk with no facing ordered**, which is every walk a side makes for itself, dropped the
  Warrior once in 8, walking at -135 degrees: it turns more than a quarter while it walks.
- **The skeleton barely moves on some bearings**: its least distance in 8 s is 0.19 m facing ahead
  and 0.06 m on the half turn, at half of 0.2 m/s.

`turned` was not swept: 0.3 rad is the value the rule was first read at.
